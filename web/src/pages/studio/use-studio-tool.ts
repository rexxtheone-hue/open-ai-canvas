import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useGenerationCredits } from "@/hooks/use-generation-credits";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { normalizeAudioFormatForConfig, normalizeAudioSpeedValue, normalizeAudioVoiceForConfig } from "@/lib/audio-generation";
import { normalizeImageParameters } from "@/lib/image-parameters";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue } from "@/lib/model-capabilities";
import { getActiveUserScope } from "@/lib/user-scope";
import { videoModeShouldReset, type VideoMode } from "@/lib/video-modes";
import { creationAttachmentFromAudio, creationAttachmentFromImage, creationAttachmentFromVideo, creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import type { StudioKind, StudioMedia, StudioWork } from "@/services/api/studio";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { registerStudioUpload } from "@/services/api/studio-agents";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import {
    studioBrandAvailable,
    admitStudioAttachments,
    studioBlockReason,
    studioEffectiveVideoMode,
    studioGenerationConfig,
    studioMaxCount,
    studioModelRequirements,
    studioOverflowAttachmentIds,
    studioPreferredModel,
    studioReferenceLimits,
    studioResolvedModel,
    studioSubmission,
    type StudioSpecialtyState,
    type StudioToolState,
} from "./studio-generation";
import { notifyStudioWorksChanged } from "./use-studio-works";
import { useStudioBrandChoice } from "./use-studio-brand";

type StoredToolSettings = Pick<StudioToolState, "model" | "count" | "image" | "video" | "audio">;

function storageKey(tool: string) {
    return `studio.tool.${getActiveUserScope()}.${tool}.v1`;
}

function readStoredSettings(tool: string): Partial<StoredToolSettings> {
    try {
        const raw = window.localStorage.getItem(storageKey(tool));
        return raw ? (JSON.parse(raw) as Partial<StoredToolSettings>) : {};
    } catch {
        return {};
    }
}

function writeStoredSettings(tool: string, state: StudioToolState) {
    try {
        const stored: StoredToolSettings = { model: state.model, count: state.count, image: state.image, video: state.video, audio: state.audio };
        window.localStorage.setItem(storageKey(tool), JSON.stringify(stored));
    } catch {
        // 浏览器存储不可用时只在本次会话生效。
    }
}

function initialState(kind: StudioKind, tool: string): StudioToolState {
    const stored = readStoredSettings(tool);
    return {
        kind,
        tool,
        model: stored.model || "",
        prompt: "",
        attachments: [],
        count: Math.max(1, Number(stored.count) || 1),
        image: { ratio: "1:1", quality: "auto", imageResolution: "auto", imageParameters: "{}", ...stored.image },
        video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: true, ...stored.video, mode: stored.video?.mode },
        audio: { voice: "", format: "mp3", speed: "1", ...stored.audio },
    };
}

/** 作品库的产物转成参考素材，和上传的文件走同一条提交路径。 */
export function studioAttachmentFromMedia(work: StudioWork, media: StudioMedia, index = 0): CreationAttachment {
    const url = media.storageKey ? resolveResourceUrl(media.storageKey, media.url || "") : media.url || "";
    const id = `studio:${work.id}:${index}`;
    const name = `${work.prompt.slice(0, 20) || "作品"}-${index + 1}`;
    if (media.kind === "image") return { id, name, type: media.mimeType || "image/png", dataUrl: url, url, storageKey: media.storageKey, width: media.width, height: media.height, previewUrl: url };
    if (media.kind === "video") return { id, name, type: media.mimeType || "video/mp4", url, storageKey: media.storageKey, width: media.width, height: media.height, durationMs: media.durationMs, previewUrl: url };
    return { id, name, type: media.mimeType || "audio/mpeg", url, storageKey: media.storageKey, durationMs: media.durationMs, previewUrl: url };
}

/** 上传单个素材，返回可直接提交的参考素材；类型不支持时抛出原因。 */
export async function uploadStudioFile(file: File): Promise<CreationAttachment> {
    let attachment: CreationAttachment;
    if (file.type.startsWith("image/")) attachment = creationAttachmentFromImage(file, await uploadImage(file));
    else if (file.type.startsWith("video/")) attachment = creationAttachmentFromVideo(file, await uploadMediaFile(file, "studio-upload"));
    else if (file.type.startsWith("audio/")) attachment = creationAttachmentFromAudio(file, await uploadMediaFile(file, "studio-upload"));
    else throw new Error(`${file.name} 不是图片、视频或音频`);
    // 记进「添加参考」面板的「上传」分页；登记失败不影响这次使用。
    const resourceId = resourceIdFromStorageKey(attachment.storageKey);
    if (resourceId) void registerStudioUpload(resourceId, file.name).then(notifyStudioUploadsChanged).catch(() => undefined);
    return attachment;
}

const UPLOADS_CHANGED = "studio:uploads-changed";

export function notifyStudioUploadsChanged() {
    window.dispatchEvent(new CustomEvent(UPLOADS_CHANGED));
}

export function onStudioUploadsChanged(listener: () => void) {
    window.addEventListener(UPLOADS_CHANGED, listener);
    return () => window.removeEventListener(UPLOADS_CHANGED, listener);
}

export function useStudioTool(kind: StudioKind, tool: string, options: { specialty?: StudioSpecialtyState; brand?: boolean } = {}) {
    const config = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const [baseState, setState] = useState<StudioToolState>(() => initialState(kind, tool));
    const brandEnabled = kind !== "audio" && options.brand !== false;
    const brand = useStudioBrandChoice(brandEnabled);
    const specialty = options.specialty;
    // 品牌和专项指令不进入本地记忆的工具参数，每次由当前选择拼出。
    const state = useMemo<StudioToolState>(() => {
        let next = baseState;
        if (brandEnabled && brand.context) next = { ...next, brand: brand.context };
        if (specialty) next = { ...next, specialty };
        return next;
    }, [baseState, brand.context, brandEnabled, specialty]);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(0);
    const submitLockRef = useRef(false);

    // T1：模型目录加载或变化后，确认当前模型仍可用。
    useEffect(() => {
        const preferred = studioPreferredModel(config, kind, state.model, specialty);
        if (preferred !== state.model) setState((current) => ({ ...current, model: preferred }));
    }, [config, kind, specialty, state.model]);

    const resolvedModel = useMemo(() => studioResolvedModel(config, state), [config, state]);
    const requirements = useMemo(() => studioModelRequirements(config, state), [config, state]);
    const limits = useMemo(() => studioReferenceLimits(config, state, resolvedModel), [config, state, resolvedModel]);
    const generationConfig = useMemo(() => (resolvedModel ? studioGenerationConfig(config, state, resolvedModel) : config), [config, state, resolvedModel]);
    const overflowIds = useMemo(() => studioOverflowAttachmentIds(state.attachments, limits), [limits, state.attachments]);
    const maxCount = studioMaxCount(config, kind, resolvedModel);

    // T5：换模型后把参数调整到新模型支持的最接近值。
    useEffect(() => {
        if (!resolvedModel) return;
        const profile = modelCapabilityConfigFor(config, resolvedModel);
        setState((current) => {
            if (current.kind === "image") {
                const imageProfile = profile.image!;
                const normalized = normalizeImageValue(imageProfile, { size: current.image.ratio, quality: current.image.quality, imageResolution: current.image.imageResolution, imageParameters: current.image.imageParameters, count: String(current.count) });
                const imageParameters = JSON.stringify(normalizeImageParameters(imageProfile.parameters, current.image.imageParameters));
                const next = { ratio: normalized.size || current.image.ratio, quality: normalized.quality || current.image.quality, imageResolution: normalized.imageResolution || imageProfile.resolution.default || current.image.imageResolution, imageParameters };
                const count = Math.max(1, Math.min(studioMaxCount(config, "image", resolvedModel), current.count));
                if (JSON.stringify(next) === JSON.stringify(current.image) && count === current.count) return current;
                return { ...current, image: next, count };
            }
            if (current.kind === "video") {
                const videoProfile = profile.video!;
                const normalized = normalizeVideoValue(videoProfile, { seconds: current.video.seconds, ratio: current.video.ratio, resolution: current.video.videoQuality });
                const counts = { imageCount: 0, videoCount: 0, audioCount: 0 };
                for (const attachment of current.attachments) {
                    const attachmentKind = creationAttachmentKind(attachment);
                    if (attachmentKind === "image") counts.imageCount += 1;
                    else if (attachmentKind === "video") counts.videoCount += 1;
                    else if (attachmentKind === "audio") counts.audioCount += 1;
                }
                const mode = current.video.mode && videoModeShouldReset(videoProfile, current.video.mode, counts) ? undefined : current.video.mode;
                const generateAudio = videoProfile.generateAudio.supported ? current.video.generateAudio : false;
                const next = { ratio: normalized.ratio, seconds: normalized.seconds, videoQuality: normalized.resolution.replace(/p$/i, ""), generateAudio, mode };
                const count = Math.max(1, Math.min(studioMaxCount(config, "video", resolvedModel), current.count));
                if (JSON.stringify(next) === JSON.stringify(current.video) && count === current.count) return current;
                return { ...current, video: next, count };
            }
            const audioConfig = { ...config, model: resolvedModel, audioModel: resolvedModel };
            const next = { voice: normalizeAudioVoiceForConfig(audioConfig, current.audio.voice), format: normalizeAudioFormatForConfig(audioConfig, current.audio.format), speed: normalizeAudioSpeedValue(current.audio.speed) };
            if (JSON.stringify(next) === JSON.stringify(current.audio)) return current;
            return { ...current, audio: next, count: 1 };
        });
    }, [config, resolvedModel]);

    // T11：记住每个工具的模型与参数（不含提示词和素材）。
    useEffect(() => {
        if (state.model) writeStoredSettings(tool, state);
    }, [state, tool]);

    const creditsEnabled = useUserStore((store) => store.features.creditsEnabled);
    const { availableMicrocredits } = useWalletBalance(user?.id, creditsEnabled);
    // 一次提交的任务数：多条指令时每条一个任务，否则按数量（视频专项不允许多个时为 1）。
    const batch = specialty?.variants?.length || (kind === "audio" || (kind === "video" && specialty && !specialty.allowCount) ? 1 : Math.max(1, Math.min(state.count, maxCount)));
    const { credits: unitCredits, estimated } = useGenerationCredits({
        config: generationConfig,
        model: resolvedModel,
        mode: kind,
        count: kind === "image" ? batch : 1,
        seconds: state.video.seconds,
        requirements,
    });
    // 图片按数量报价；视频报的是单个任务，乘以任务数。
    const credits = unitCredits !== null && kind === "video" ? unitCredits * batch : unitCredits;
    const baseBlockReason = studioBlockReason(config, state, resolvedModel, {
        loggedIn: Boolean(user),
        creditsEnabled,
        availableCredits: availableMicrocredits === null ? null : availableMicrocredits / 1_000_000,
        cost: credits,
    });
    // 专项工具的每个素材都是必需的，模型放不下时不能悄悄少发。
    const blockReason = baseBlockReason || (specialty && resolvedModel && overflowIds.size ? "当前模型放不下所选素材，请换一个模型" : "");

    const update = useCallback((patch: Partial<StudioToolState>) => setState((current) => ({ ...current, ...patch })), []);
    const updateImage = useCallback((patch: Partial<StudioToolState["image"]>) => setState((current) => ({ ...current, image: { ...current.image, ...patch } })), []);
    const updateVideo = useCallback((patch: Partial<StudioToolState["video"]>) => setState((current) => ({ ...current, video: { ...current.video, ...patch } })), []);
    const updateAudio = useCallback((patch: Partial<StudioToolState["audio"]>) => setState((current) => ({ ...current, audio: { ...current.audio, ...patch } })), []);
    const setVideoMode = useCallback((mode: VideoMode | undefined) => updateVideo({ mode }), [updateVideo]);

    /** 加入素材：按当前模型上限截断，返回被拒绝的原因供页面提示。 */
    const addAttachments = useCallback((incoming: CreationAttachment[]) => {
        let reason: string | undefined;
        setState((current) => {
            const result = admitStudioAttachments(current.attachments, incoming, studioReferenceLimits(config, current, studioResolvedModel(config, current)));
            reason = result.reason;
            return result.accepted.length === current.attachments.length ? current : { ...current, attachments: result.accepted };
        });
        return reason;
    }, [config]);

    const uploadFiles = useCallback(async (files: File[]) => {
        setUploading((count) => count + files.length);
        const uploaded: CreationAttachment[] = [];
        const failures: string[] = [];
        for (const file of files) {
            try {
                if (!/^(image|video|audio)\//.test(file.type)) failures.push(`${file.name} 不是图片、视频或音频`);
                else uploaded.push(await uploadStudioFile(file));
            } catch (cause) {
                failures.push(`${file.name} 上传失败：${cause instanceof Error ? cause.message : "未知错误"}`);
            } finally {
                setUploading((count) => Math.max(0, count - 1));
            }
        }
        const reason = uploaded.length ? addAttachments(uploaded) : undefined;
        return { failures, reason };
    }, [addAttachments]);

    const removeAttachment = useCallback((id: string) => setState((current) => ({ ...current, attachments: current.attachments.filter((item) => item.id !== id) })), []);

    /** 把素材排到同类素材的最前面（设为首帧）。 */
    const moveAttachmentFirst = useCallback((id: string) => setState((current) => {
        const target = current.attachments.find((item) => item.id === id);
        if (!target) return current;
        return { ...current, attachments: [target, ...current.attachments.filter((item) => item.id !== id)] };
    }), []);

    /** 交换前两张图片的顺序（首帧和尾帧对调）。 */
    const swapFirstImages = useCallback(() => setState((current) => {
        const images = current.attachments.filter((item) => creationAttachmentKind(item) === "image");
        if (images.length < 2) return current;
        const [first, second] = images;
        return { ...current, attachments: current.attachments.map((item) => (item.id === first.id ? second : item.id === second.id ? first : item)) };
    }), []);

    /** 用作品的设置填回面板（「用同样设置再生成」）。只恢复当前模型仍支持的值，其余由 T5 归一。 */
    const applyWorkSettings = useCallback((work: StudioWork) => {
        const settings = work.settings || {};
        setState((current) => {
            const next: StudioToolState = { ...current, prompt: work.prompt };
            if (typeof settings.model === "string" && settings.model) next.model = settings.model;
            if (current.kind === "image") next.image = { ...current.image, ...(typeof settings.size === "string" ? { ratio: settings.size } : {}), ...(typeof settings.quality === "string" ? { quality: settings.quality } : {}), ...(typeof settings.imageResolution === "string" ? { imageResolution: settings.imageResolution } : {}) };
            if (current.kind === "video") next.video = { ...current.video, ...(typeof settings.size === "string" ? { ratio: settings.size } : {}), ...(settings.videoSeconds !== undefined ? { seconds: String(settings.videoSeconds) } : {}), ...(settings.vquality !== undefined ? { videoQuality: String(settings.vquality).replace(/p$/i, "") } : {}), ...(settings.videoGenerateAudio !== undefined ? { generateAudio: String(settings.videoGenerateAudio) === "true" } : {}), mode: typeof settings.videoMode === "string" ? (settings.videoMode as VideoMode) : undefined };
            if (current.kind === "audio") next.audio = { ...current.audio, ...(typeof settings.audioVoice === "string" ? { voice: settings.audioVoice } : {}), ...(typeof settings.audioFormat === "string" ? { format: settings.audioFormat } : {}), ...(settings.audioSpeed !== undefined ? { speed: String(settings.audioSpeed) } : {}) };
            return next;
        });
    }, []);

    /** T9：任务建好就解锁，可以继续提交；同一次点击不会重复提交。 */
    /** promptOverride：自动润色后的提示词，直接用它提交（同时写回输入框由页面负责）。 */
    const submit = useCallback(async (promptOverride?: string) => {
        if (submitLockRef.current) return { created: 0, failed: 0, error: "上一次提交还在进行，请稍候" };
        if (blockReason || !resolvedModel) return { created: 0, failed: 0, error: blockReason || "后台还没有可用的模型" };
        submitLockRef.current = true;
        setSubmitting(true);
        // 当前模型用不了品牌（视频模型不收参考图）时，不往提示词里加品牌信息。
        const brandState = studioBrandAvailable(kind, limits) ? state : { ...state, brand: undefined };
        const submitState = promptOverride !== undefined && !state.specialty ? { ...brandState, prompt: promptOverride } : brandState;
        // 多条指令（多语言配音、全部角度）：每条指令一个任务。
        const variants = state.specialty?.variants;
        const submissions = variants?.length
            ? variants.map((instruction) => studioSubmission(config, { ...submitState, count: 1, specialty: { ...state.specialty!, instruction } }, resolvedModel, limits))
            : [studioSubmission(config, submitState, resolvedModel, limits)];
        const jobs = submissions.flatMap((submission) => Array.from({ length: submission.count }, () => submission));
        try {
            // 同一批依次建任务：避免并发写入争用数据库锁，任务顺序也和数量一致。
            const settled: PromiseSettledResult<unknown>[] = [];
            for (let batchIndex = 0; batchIndex < jobs.length; batchIndex += 1) {
                const submission = jobs[batchIndex];
                try {
                    const task = await submitBackendGenerationTask({
                        mode: submission.mode,
                        prompt: submission.prompt,
                        config: submission.config,
                        referenceImages: submission.referenceImages,
                        referenceVideos: submission.referenceVideos,
                        referenceAudios: submission.referenceAudios,
                        metadata: jobs.length > 1 ? { ...submission.metadata, batchIndex, batchCount: jobs.length } : submission.metadata,
                        clientOperationId: crypto.randomUUID(),
                    });
                    settled.push({ status: "fulfilled", value: task });
                    notifyStudioWorksChanged();
                } catch (reason) {
                    settled.push({ status: "rejected", reason });
                }
            }
            const created = settled.filter((entry) => entry.status === "fulfilled").length;
            const failures = settled.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
            if (created) window.dispatchEvent(new CustomEvent("wallet:updated"));
            const firstError = failures[0]?.reason;
            return { created, failed: failures.length, error: firstError instanceof Error ? firstError.message : firstError ? String(firstError) : "" };
        } finally {
            submitLockRef.current = false;
            setSubmitting(false);
        }
    }, [blockReason, config, limits, resolvedModel, state]);

    return {
        config,
        state,
        resolvedModel,
        generationConfig,
        requirements,
        limits,
        overflowIds,
        maxCount,
        credits,
        creditsEstimated: estimated,
        creditsEnabled,
        blockReason,
        submitting,
        uploading: uploading > 0,
        effectiveVideoMode: kind === "video" ? studioEffectiveVideoMode(state) : undefined,
        update,
        updateImage,
        updateVideo,
        updateAudio,
        setVideoMode,
        addAttachments,
        uploadFiles,
        removeAttachment,
        moveAttachmentFirst,
        swapFirstImages,
        applyWorkSettings,
        submit,
        brandKits: brand.kits,
        brandKit: brand.kit,
        setBrandChoice: brand.setChoice,
    };
}
