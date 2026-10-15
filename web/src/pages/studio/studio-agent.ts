import { normalizeAudioFormatForConfig, normalizeAudioSpeedValue, normalizeAudioVoiceForConfig } from "@/lib/audio-generation";
import { normalizeImageParameters } from "@/lib/image-parameters";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import type { CreationAttachment } from "@/pages/create/creation-assets";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { ApiError } from "@/services/api/request";
import type { StudioKind } from "@/services/api/studio";
import type { AiConfig } from "@/stores/use-config-store";
import {
    studioBlockReason,
    studioMaxCount,
    studioPreferredModel,
    studioReferenceLimits,
    studioResolvedModel,
    studioSubmission,
    type StudioBlockContext,
    type StudioBrandContext,
    type StudioToolState,
} from "./studio-generation";

export const STUDIO_REUSE_KEY = "studio.reuse.v1";

/** 其他页面（角色库、品牌套件）把素材带进工具页：{ kind, attachments }，工具页读取后立即删除。 */
export const STUDIO_ATTACH_KEY = "studio.attach.v1";

/** Agent（对话模式、导演模式）发起的一次生成需求。 */
export type StudioAgentRequest = {
    kind: StudioKind;
    prompt: string;
    ratio?: string;
    seconds?: number;
    count?: number;
    voice?: string;
    /** 指定模型；不填或已下线时用该类型的默认模型。 */
    model?: string;
    attachments?: CreationAttachment[];
    brand?: StudioBrandContext;
    tool: string;
};

/** 枚举时长取最接近且不短于需求的值（镜头可在时间线裁短，不能拉长）；范围时长取整到步进。 */
export function snapVideoSeconds(profile: VideoCapabilityConfig, wanted: number) {
    const target = Number.isFinite(wanted) && wanted > 0 ? wanted : profile.duration.default;
    if (profile.duration.selection === "enum") {
        const values = [...(profile.duration.values || [])].sort((left, right) => left - right);
        if (!values.length) return profile.duration.default;
        return values.find((value) => value >= target) ?? values[values.length - 1];
    }
    const min = profile.duration.min || 1;
    const max = profile.duration.max || min;
    const step = profile.duration.step || 1;
    const clamped = Math.min(max, Math.max(min, Math.ceil(target)));
    return Math.min(max, min + Math.ceil((clamped - min) / step) * step);
}

/** 把 Agent 的需求转成工具页同一套状态，参数按所选模型的能力归一，保证提交路径与工具页一致。 */
export function studioAgentToolState(config: AiConfig, request: StudioAgentRequest): { state: StudioToolState; model: string } {
    const base: StudioToolState = {
        kind: request.kind,
        tool: request.tool,
        model: "",
        prompt: request.prompt.trim(),
        attachments: request.attachments || [],
        count: 1,
        image: { ratio: request.ratio || "1:1", quality: "auto", imageResolution: "auto", imageParameters: "{}" },
        video: { ratio: request.ratio || "16:9", seconds: String(request.seconds || 5), videoQuality: "720", generateAudio: true },
        audio: { voice: request.voice || "", format: "mp3", speed: "1" },
        brand: request.kind === "audio" ? undefined : request.brand,
    };
    base.model = studioPreferredModel(config, request.kind, request.model);
    const model = base.model ? studioResolvedModel(config, base) : "";
    if (!model) return { state: base, model: "" };
    const profile = modelCapabilityConfigFor(config, model);
    if (request.kind === "image") {
        const imageProfile = profile.image!;
        const normalized = normalizeImageValue(imageProfile, { size: base.image.ratio, quality: base.image.quality, imageResolution: base.image.imageResolution, imageParameters: base.image.imageParameters, count: "1" });
        base.image = {
            ratio: normalized.size || base.image.ratio,
            quality: normalized.quality || base.image.quality,
            imageResolution: normalized.imageResolution || imageProfile.resolution.default || base.image.imageResolution,
            imageParameters: JSON.stringify(normalizeImageParameters(imageProfile.parameters, base.image.imageParameters)),
        };
        base.count = Math.max(1, Math.min(studioMaxCount(config, "image", model), Math.floor(request.count || 1)));
    } else if (request.kind === "video") {
        const videoProfile = profile.video!;
        const seconds = String(snapVideoSeconds(videoProfile, Number(request.seconds || videoProfile.duration.default)));
        const normalized = normalizeVideoValue(videoProfile, { seconds, ratio: base.video.ratio, resolution: base.video.videoQuality });
        base.video = { ratio: normalized.ratio, seconds: normalized.seconds, videoQuality: normalized.resolution.replace(/p$/i, ""), generateAudio: videoProfile.generateAudio.supported };
    } else {
        const audioConfig = { ...config, model, audioModel: model };
        base.audio = { voice: normalizeAudioVoiceForConfig(audioConfig, base.audio.voice), format: normalizeAudioFormatForConfig(audioConfig, base.audio.format), speed: normalizeAudioSpeedValue(base.audio.speed) };
    }
    return { state: base, model: studioResolvedModel(config, base) || model };
}

/** 生成前的阻断原因（与工具页同一套检查）；空字符串表示可以提交。 */
export function studioAgentBlockReason(config: AiConfig, state: StudioToolState, model: string, context: StudioBlockContext) {
    return studioBlockReason(config, state, model, context);
}

export function isActiveTaskLimitError(error: unknown) {
    return error instanceof ApiError && Boolean(error.details && "activeTaskLimit" in error.details);
}

const SLOT_WAIT_MS = 5000;
const SLOT_WAIT_LIMIT_MS = 15 * 60 * 1000;

function waitForSlot(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

export type StudioAgentSubmitOptions = {
    /** 离开页面时停止排队等待。 */
    signal?: AbortSignal;
    /** 同时运行的任务已满、正在排队时回调，界面可提示「排队中」。 */
    onWaiting?: (waiting: boolean) => void;
    /** 每次排队等待的间隔，测试可调小。 */
    waitMs?: number;
};

/**
 * 依次提交 count 个任务。同时运行的任务数到达会员上限时不算失败：
 * 等已有任务完成后自动重试同一个（最多等 15 分钟）；其他错误记下第一条后继续下一个。
 */
export async function submitWithSlotWait(count: number, submitOne: (batchIndex: number) => Promise<{ id: string }>, options: StudioAgentSubmitOptions = {}) {
    const taskIds: string[] = [];
    const waitMs = options.waitMs ?? SLOT_WAIT_MS;
    let error = "";
    let waitedMs = 0;
    for (let batchIndex = 0; batchIndex < count; batchIndex += 1) {
        try {
            taskIds.push((await submitOne(batchIndex)).id);
            options.onWaiting?.(false);
        } catch (cause) {
            if (isActiveTaskLimitError(cause) && waitedMs < SLOT_WAIT_LIMIT_MS) {
                options.onWaiting?.(true);
                try {
                    await waitForSlot(waitMs, options.signal);
                } catch {
                    options.onWaiting?.(false);
                    error ||= "已停止排队";
                    break;
                }
                waitedMs += SLOT_WAIT_MS;
                batchIndex -= 1;
                continue;
            }
            options.onWaiting?.(false);
            error ||= cause instanceof Error ? cause.message : String(cause);
        }
    }
    return { taskIds, error };
}

/** 按工具页的提交方式逐个建任务，返回已建好的任务 ID 和第一条失败原因。 */
export async function submitStudioAgentGeneration(config: AiConfig, state: StudioToolState, model: string, extraMetadata: Record<string, unknown> = {}, options: StudioAgentSubmitOptions = {}) {
    const submission = studioSubmission(config, state, model, studioReferenceLimits(config, state, model));
    const result = await submitWithSlotWait(submission.count, (batchIndex) => submitBackendGenerationTask({
        mode: submission.mode,
        prompt: submission.prompt,
        config: submission.config,
        referenceImages: submission.referenceImages,
        referenceVideos: submission.referenceVideos,
        referenceAudios: submission.referenceAudios,
        metadata: { ...submission.metadata, ...extraMetadata, ...(submission.count > 1 ? { batchIndex, batchCount: submission.count } : {}) },
        clientOperationId: crypto.randomUUID(),
    }), options);
    if (result.taskIds.length) window.dispatchEvent(new CustomEvent("wallet:updated"));
    return result;
}
