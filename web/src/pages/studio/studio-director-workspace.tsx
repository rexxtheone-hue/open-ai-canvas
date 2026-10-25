import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Popover } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, AudioLines, Check, Clapperboard, Download, Film, Image as ImageIcon, LayoutGrid, Loader2, Music, Pencil, RefreshCw, Sparkles, Type, Upload, X } from "./studio-icons";
import { Link, useParams, useSearchParams } from "react-router";

import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { useGenerationCredits } from "@/hooks/use-generation-credits";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { videoModeUnavailableReason } from "@/lib/video-modes";
import { runBackendGenerationTask } from "@/services/api/generation-task";
import { playbackVariantUrl, resourceFileUrl } from "@/services/api/resources";
import { listStudioWorks, type StudioKind, type StudioWork } from "@/services/api/studio";
import {
    addStudioShotVersion,
    appendStudioChatMessage,
    getStudioChat,
    getStudioStory,
    lookupStudioWorks,
    patchStudioShot,
    replaceStudioStoryPlan,
    setStudioStoryRender,
    updateStudioChatActions,
    updateStudioStory,
    type StudioChatMessage,
    type StudioShot,
    type StudioStory,
    type StudioStoryInput,
} from "@/services/api/studio-agents";
import { createTimelineRenderTask } from "@/services/api/timeline-tasks";
import type { TimelineProject } from "@/types/timeline";
import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { studioAgentToolState, submitStudioAgentGeneration } from "./studio-agent";
import { useStudioCharacters } from "./studio-character-picker";
import { studioCharacterAttachments } from "./studio-characters";
import {
    buildDirectorTimeline,
    DIRECTOR_MEMORY_SECTIONS,
    directorActiveWork,
    directorAskAnswer,
    directorAskBlock,
    directorBoardPrompt,
    directorBoardTargets,
    directorBoardVideoPrompt,
    directorDefaultTextModel,
    directorDesign,
    directorDesignTargets,
    directorFallbackTextModel,
    directorKeyframePrompt,
    directorLocationPrompt,
    directorTurnaroundPrompt,
    mergeDirectorDesign,
    directorHistory,
    directorMessageParts,
    directorProductionMode,
    directorSegmentOfShot,
    directorSegments,
    directorImagePrompt,
    directorMemory,
    directorOrderedShots,
    directorShotCharacters,
    directorShotFields,
    directorStepLabel,
    directorStepTargets,
    directorReferences,
    directorShotFrame,
    type DirectorReference,
    directorSystemPrompt,
    directorVersionIndex,
    directorVideoPrompt,
    directorVisibleText,
    directorWorkActive,
    directorWorkReady,
    parseDirectorReply,
    type DirectorBrief,
    type DirectorCharacter,
    type DirectorMusic,
    type DirectorRunAction,
    type DirectorRunMode,
    type DirectorAsk,
    type DirectorDesign,
    type DirectorDesignAsset,
    type DirectorProductionMode,
    type DirectorRunStep,
    type DirectorSegment,
    type DirectorShotFields,
} from "./studio-director";
import { studioBlockReason, studioGenerationConfig, studioModelRequirements } from "./studio-generation";
import { studioMediaSrc } from "./studio-library";
import { StudioShell } from "./studio-shell";
import { groupedTextModelOptions, StudioSelect } from "./studio-select";
import { uploadStudioFile } from "./use-studio-tool";
import { notifyStudioWorksChanged } from "./use-studio-works";
import { useStudioBrandKits, studioBrandContext } from "./use-studio-brand";

type DirectorMessage = StudioChatMessage<DirectorRunAction>;
type GenerateStep = Exclude<DirectorRunStep, "render">;

const TEXT_MODEL_KEY = "studio.director.text-model.v1";
const STEP_KIND: Record<GenerateStep, StudioKind> = { assets: "image", boards: "image", images: "image", videos: "video", voice: "audio" };

const BOARD_IMAGE_MODELS = [/gpt image 2\.5/i, /nano banana/i];
const BOARD_VIDEO_MODELS = [/^seedance 2\.0$/i, /seedance 2\.5/i, /seedance/i];

/** 分镜板用擅长排版和文字的图片模型；整段视频必须支持全能参考（分镜板作参考图，不是首帧）。 */
function directorBoardModel(config: AiConfig, kind: "image" | "video") {
    const options = selectableModelsByCapability(config, kind).filter((model) => kind === "image" || !videoModeUnavailableReason(modelCapabilityConfigFor(config, model).video, "reference_to_video"));
    for (const pattern of kind === "image" ? BOARD_IMAGE_MODELS : BOARD_VIDEO_MODELS) {
        const hit = options.find((model) => pattern.test(modelDisplayName(config, model) || model));
        if (hit) return hit;
    }
    return options[0] || "";
}

type BoardToolRequest = { prompt: string; ratio: string; seconds?: number; attachments?: Parameters<typeof studioAgentToolState>[1]["attachments"]; brand?: Parameters<typeof studioAgentToolState>[1]["brand"] };

function boardToolState(config: AiConfig, kind: "image" | "video", request: BoardToolRequest) {
    const model = directorBoardModel(config, kind);
    const result = studioAgentToolState(config, { ...request, kind, model: model || undefined, tool: "director" });
    if (kind === "video") result.state = { ...result.state, video: { ...result.state.video, mode: "reference_to_video" } };
    return result;
}

function errorText(cause: unknown, fallback: string) {
    return cause instanceof Error && cause.message ? cause.message : fallback;
}

function storyInput(story: StudioStory, patch: Partial<StudioStoryInput> = {}): StudioStoryInput {
    return { title: story.title, ratio: story.ratio, durationSeconds: story.durationSeconds, brief: story.brief, memory: story.memory, settings: story.settings, status: story.status, ...patch };
}

function workMediaSrc(work: StudioWork | undefined) {
    const media = work?.media[0];
    return media ? studioMediaSrc(media) : "";
}

function storyHasActiveWork(story: StudioStory | undefined) {
    if (!story) return false;
    if (story.render && (story.render.status === "queued" || story.render.status === "running")) return true;
    return story.versions.some((version) => directorWorkActive(version.work));
}

export default function StudioDirectorWorkspace() {
    const { storyId = "" } = useParams<{ storyId: string }>();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const config = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const [searchParams, setSearchParams] = useSearchParams();
    const storyKey = useMemo(() => ["studio", "story", storyId], [storyId]);
    const storyQuery = useQuery({
        queryKey: storyKey,
        queryFn: ({ signal }) => getStudioStory(storyId, signal),
        enabled: Boolean(storyId),
    });
    const story = storyQuery.data;
    // 有镜头或成片在生成时每 4 秒刷新一次。直接写缓存（setQueryData）不会重启 refetchInterval，所以用定时器跟随每次数据变化。
    const refetchStory = storyQuery.refetch;
    useEffect(() => {
        if (!storyHasActiveWork(story)) return;
        const timer = window.setTimeout(() => void refetchStory(), 4000);
        return () => window.clearTimeout(timer);
    }, [refetchStory, story, storyQuery.dataUpdatedAt]);
    const setStory = useCallback((next: StudioStory) => queryClient.setQueryData(storyKey, next), [queryClient, storyKey]);
    const storyRef = useRef<StudioStory | undefined>(story);
    storyRef.current = story;

    const brief = (story?.brief || {}) as Partial<DirectorBrief> & { kickoff?: string };
    const settings = (story?.settings || {}) as { runMode?: DirectorRunMode; brandKitId?: string; music?: DirectorMusic };
    const runMode: DirectorRunMode = settings.runMode === "auto" ? "auto" : "guide";
    const charactersQuery = useStudioCharacters();
    const characters: DirectorCharacter[] = useMemo(() => (charactersQuery.data || []).filter((item) => (brief.characterIds || []).includes(item.id)), [brief.characterIds, charactersQuery.data]);
    const { kits } = useStudioBrandKits();
    const brand = useMemo(() => studioBrandContext(kits.find((kit) => kit.id === settings.brandKitId)), [kits, settings.brandKitId]);
    const kinds = useMemo(() => (["image", "video", "audio"] as StudioKind[]).filter((kind) => selectableModelsByCapability(config, kind).length > 0), [config]);
    const textModels = useMemo(() => selectableModelsByCapability(config, "text"), [config]);
    const [textModelChoice, setTextModelChoice] = useState(() => {
        try {
            return window.localStorage.getItem(TEXT_MODEL_KEY) || "";
        } catch {
            return "";
        }
    });
    const textModel = directorDefaultTextModel(textModels, (model) => modelDisplayName(config, model), textModelChoice, config.textModel);

    const [messages, setMessages] = useState<DirectorMessage[]>([]);
    const [chatLoaded, setChatLoaded] = useState(false);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [streaming, setStreaming] = useState<string | null>(null);
    const [working, setWorking] = useState("");
    const [selectedShotId, setSelectedShotId] = useState("");
    const [editing, setEditing] = useState<StudioShot | null>(null);
    const [musicOpen, setMusicOpen] = useState(false);
    const [quoteOpen, setQuoteOpen] = useState(false);
    const [autoRun, setAutoRun] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const kickoffRef = useRef(false);
    const [queued, setQueued] = useState(false);
    // 离开页面时停止排队中的提交。
    const leaveRef = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        leaveRef.current = controller;
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!story?.sessionId || chatLoaded) return;
        const controller = new AbortController();
        getStudioChat<DirectorRunAction>(story.sessionId, controller.signal)
            .then((view) => {
                setMessages(view.messages);
                setChatLoaded(true);
            })
            .catch((cause) => {
                if (!controller.signal.aborted) message.error(errorText(cause, "导演对话读取失败"));
            });
        return () => controller.abort();
    }, [chatLoaded, message, story?.sessionId]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages, streaming]);

    const shots = useMemo(() => (story ? directorOrderedShots(story) : []), [story]);
    const versions = useMemo(() => (story ? directorVersionIndex(story) : new Map()), [story]);
    const productionMode: DirectorProductionMode = story ? directorProductionMode(story) : "shots";
    const segments = useMemo(() => (story ? directorSegments(story) : []), [story]);
    const timeline = useMemo(() => (story ? buildDirectorTimeline(story, { music: settings.music, subtitles: brief.subtitles !== false, mode: directorProductionMode(story) }) : null), [brief.subtitles, settings.music, story]);

    const saveStory = async (patch: Partial<StudioStoryInput>) => {
        const current = storyRef.current;
        if (!current) return;
        setStory(await updateStudioStory(current.id, storyInput(current, patch)));
    };

    // 剧本阶段的人物和场景；三视图和场景图按任务 ID 查询生成结果，有任务在跑时每 4 秒刷新。
    const design = useMemo(() => directorDesign(story?.settings), [story?.settings]);
    const designTaskIds = useMemo(() => [...design.cast, ...design.locations].map((item) => item.taskId).filter((id): id is string => Boolean(id)), [design]);
    const designWorksQuery = useQuery({
        queryKey: ["studio", "director-design", designTaskIds],
        queryFn: ({ signal }) => lookupStudioWorks(designTaskIds, signal).then((result) => result.works),
        enabled: designTaskIds.length > 0,
        refetchInterval: (query) => ((query.state.data || []).some((work) => directorWorkActive(work)) || (query.state.data || []).length < designTaskIds.length ? 4000 : false),
    });
    const designWorks = useMemo(() => new Map((designWorksQuery.data || []).map((work) => [work.id, work])), [designWorksQuery.data]);
    const designWorksRef = useRef(designWorks);
    designWorksRef.current = designWorks;
    const designRef = useRef(design);
    designRef.current = design;
    const assetTargets = useMemo(() => directorDesignTargets(design, designWorks, characters.map((item) => item.name)), [characters, design, designWorks]);

    /** 人物或场景的参考图：角色库里的形象优先，其次是生成好的三视图或场景图。 */
    const designAttachment = (kind: "cast" | "location", name: string) => {
        if (kind === "cast") {
            const library = characters.find((item) => item.name === name);
            if (library?.imageResourceIds.length) return studioCharacterAttachments({ ...library, updatedAt: "" })[0];
        }
        const asset = (kind === "cast" ? designRef.current.cast : designRef.current.locations).find((item) => item.name === name);
        const work = asset?.taskId ? designWorksRef.current.get(asset.taskId) : undefined;
        const media = directorWorkReady(work) ? work!.media[0] : undefined;
        if (!media) return undefined;
        return { id: `${kind}:${name}`, name: kind === "cast" ? `${name} 三视图` : `${name} 场景`, type: media.mimeType || "image/png", url: studioMediaSrc(media), dataUrl: studioMediaSrc(media), storageKey: media.storageKey, previewUrl: studioMediaSrc(media), width: media.width, height: media.height };
    };

    /** 快速开始表单上传的图片素材，按名字作为参考图或镜头画面。 */
    const references = useMemo(() => directorReferences(story?.brief), [story?.brief]);
    const referenceAttachment = (item: DirectorReference) => ({ id: `ref:${item.label}`, name: item.label, type: item.type || "image/png", url: item.url, dataUrl: item.url, storageKey: item.storageKey, previewUrl: item.url, width: item.width, height: item.height });
    const materialRefs = (labels: string[]) => labels.map((label) => references.find((item) => item.kind === "image" && item.label === label)).filter((item): item is DirectorReference => Boolean(item));

    /** 生成人物三视图和场景图，任务 ID 写回剧本设计。 */
    const generateAssetsStep = async () => {
        const current = storyRef.current;
        if (!current) return { submitted: 0, error: "项目还没加载" };
        const currentDesign = directorDesign(current.settings);
        const targets = directorDesignTargets(currentDesign, designWorksRef.current, characters.map((item) => item.name));
        if (!targets.length) return { submitted: 0, error: currentDesign.cast.length || currentDesign.locations.length ? "人物三视图和场景图都已经生成好了" : "剧本里还没有人物和场景，请先让导演写剧本" };
        const style = typeof current.brief?.style === "string" ? current.brief.style : "";
        const taskIds = new Map<string, string>();
        let error = "";
        for (const target of targets) {
            const photo = target.kind === "cast" ? designAttachment("cast", target.asset.name) : undefined;
            const prompt = target.kind === "cast" ? directorTurnaroundPrompt(target.asset, { hasPhoto: Boolean(photo), style }) : directorLocationPrompt(target.asset, { style });
            const { state, model } = boardToolState(config, "image", { prompt, ratio: "16:9", attachments: photo ? [photo] : [], brand });
            const reason = studioBlockReason(config, state, model, { loggedIn: Boolean(user), creditsEnabled: false, availableCredits: null, cost: null });
            if (reason) {
                error ||= reason;
                continue;
            }
            const result = await submitStudioAgentGeneration(config, state, model, { studioAgent: "director", storyId: current.id }, { signal: leaveRef.current?.signal, onWaiting: setQueued });
            if (!result.taskIds.length) {
                error ||= result.error || "提交失败";
                continue;
            }
            taskIds.set(`${target.kind}:${target.asset.name}`, result.taskIds[0]);
        }
        if (taskIds.size) {
            const latest = storyRef.current || current;
            const latestDesign = directorDesign(latest.settings);
            const assign = (kind: "cast" | "location", list: DirectorDesignAsset[]) => list.map((item) => {
                const taskId = taskIds.get(`${kind}:${item.name}`);
                return taskId ? { ...item, taskId } : item;
            });
            const nextDesign = { ...latestDesign, cast: assign("cast", latestDesign.cast), locations: assign("location", latestDesign.locations) };
            try {
                setStory(await updateStudioStory(latest.id, storyInput(latest, { settings: { ...(latest.settings || {}), design: nextDesign }, ...(latest.status === "planning" ? { status: "producing" } : {}) })));
            } catch (cause) {
                error ||= errorText(cause, "记录生成任务失败");
            }
            notifyStudioWorksChanged();
        }
        return { submitted: taskIds.size, error };
    };

    /** 分镜板模式：每段提交一张分镜板，或按分镜板提交整段视频，都登记在段落第一个镜头上。 */
    const generateBoardStep = async (step: "boards" | "videos", numbers?: number[]) => {
        const current = storyRef.current;
        if (!current) return { submitted: 0, error: "项目还没加载" };
        const segments = directorBoardTargets(current, step, numbers);
        if (!segments.length) return { submitted: 0, error: step === "videos" ? "没有可以生成视频的段落（需要先有分镜板）" : "没有需要生成分镜板的段落" };
        const style = typeof current.brief?.style === "string" ? current.brief.style : "";
        const index = directorVersionIndex(current);
        let submitted = 0;
        let error = "";
        let latest = current;
        for (const segment of segments) {
            const kind = step === "boards" ? "image" : "video";
            const board = directorActiveWork(segment.anchor, "image", index);
            const names = [...new Set(segment.shots.flatMap((shot) => directorShotFields(shot).characters))];
            const places = [...new Set(segment.shots.map((shot) => directorShotFields(shot).location).filter(Boolean))];
            const materials = materialRefs([...new Set(segment.shots.flatMap((shot) => directorShotFields(shot).refs))]).map(referenceAttachment);
            const attachments = step === "boards"
                ? [...names.map((name) => designAttachment("cast", name)), ...places.map((name) => designAttachment("location", name)), ...materials].filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 6)
                : board?.media[0]
                    ? [{ id: `board:${segment.anchor.id}`, name: "分镜板", type: board.media[0].mimeType || "image/png", url: studioMediaSrc(board.media[0]), dataUrl: studioMediaSrc(board.media[0]), storageKey: board.media[0].storageKey, previewUrl: studioMediaSrc(board.media[0]), width: board.media[0].width, height: board.media[0].height }]
                    : [];
            const prompt = step === "boards" ? directorBoardPrompt(segment, characters, { style, ratio: current.ratio }) : directorBoardVideoPrompt(segment, { style, ratio: current.ratio });
            const { state, model } = boardToolState(config, kind, { prompt, ratio: step === "boards" ? "16:9" : current.ratio, seconds: segment.seconds, attachments, brand });
            const reason = studioBlockReason(config, state, model, { loggedIn: Boolean(user), creditsEnabled: false, availableCredits: null, cost: null });
            if (reason) {
                error ||= reason;
                continue;
            }
            const result = await submitStudioAgentGeneration(config, state, model, { studioAgent: "director", storyId: current.id, shotId: segment.anchor.id }, { signal: leaveRef.current?.signal, onWaiting: setQueued });
            if (!result.taskIds.length) {
                error ||= result.error || "提交失败";
                continue;
            }
            try {
                latest = await addStudioShotVersion(current.id, segment.anchor.id, kind, result.taskIds[0]);
                setStory(latest);
                submitted += 1;
            } catch (cause) {
                error ||= errorText(cause, "记录版本失败");
            }
        }
        if (submitted) {
            notifyStudioWorksChanged();
            if (latest.status === "planning") await saveStory({ status: "producing" }).catch(() => undefined);
        }
        return { submitted, error };
    };

    /** 按镜头逐个提交生成并登记为镜头的新版本。返回提交数量和第一条失败原因。 */
    const generateStep = async (step: GenerateStep, numbers?: number[]) => {
        const current = storyRef.current;
        if (!current) return { submitted: 0, error: "项目还没加载" };
        // 分镜板模式下导演说「生成画面」就是生成分镜板，「生成视频」是按分镜板生成整段。
        if (step === "assets") return generateAssetsStep();
        if (directorProductionMode(current) === "board" && step !== "voice") return generateBoardStep(step === "videos" ? "videos" : "boards", numbers);
        if (step === "boards") return generateBoardStep("boards", numbers);
        const targets = directorStepTargets(current, step, numbers);
        if (!targets.length) return { submitted: 0, error: step === "videos" ? "没有可以做成视频的镜头（需要先有画面）" : step === "voice" ? "没有需要配音的镜头" : "没有需要生成的镜头" };
        const style = typeof current.brief?.style === "string" ? current.brief.style : "";
        const index = directorVersionIndex(current);
        let submitted = 0;
        let error = "";
        let latest = current;
        for (const shot of targets) {
            const fields = directorShotFields(shot);
            const kind = STEP_KIND[step];
            const image = directorActiveWork(shot, "image", index);
            // 关键帧参考：出镜人物的三视图（或角色库形象）在前，所在场景的场景图在后，提示词按同样顺序说明。
            const castRefs = fields.characters.map((name) => ({ name, ref: designAttachment("cast", name) })).filter((item) => item.ref).slice(0, 4);
            const locationRef = fields.location ? designAttachment("location", fields.location) : undefined;
            // 上传的产品图、Logo 等排在人物和场景之后，参考图总数不超过 6 张。
            const materials = materialRefs(fields.refs).slice(0, Math.max(0, 6 - castRefs.length - (locationRef ? 1 : 0)));
            const frame = directorShotFrame(shot, references);
            const attachments = step === "images"
                ? [...castRefs.map((item) => item.ref!), ...(locationRef ? [locationRef] : []), ...materials.map(referenceAttachment)]
                : step === "videos" && image?.media[0] && directorWorkReady(image)
                    ? [{ id: `shot-image:${shot.id}`, name: `镜头画面`, type: image.media[0].mimeType || "image/png", url: studioMediaSrc(image.media[0]), dataUrl: studioMediaSrc(image.media[0]), storageKey: image.media[0].storageKey, previewUrl: studioMediaSrc(image.media[0]), width: image.media[0].width, height: image.media[0].height }]
                    : step === "videos" && frame
                        ? [referenceAttachment(frame)]
                        : [];
            const prompt = step === "images"
                ? castRefs.length || locationRef || materials.length
                    ? directorKeyframePrompt(fields, { style, cast: castRefs.map((item) => item.name), location: locationRef ? fields.location : "", ratio: current.ratio, materials: materials.map((item) => item.label) })
                    : directorImagePrompt(fields, characters, style)
                : step === "videos" ? directorVideoPrompt(fields, style) : fields.voiceover;
            const { state, model } = studioAgentToolState(config, { kind, prompt, ratio: current.ratio, seconds: shot.durationSeconds, attachments, brand, tool: "director" });
            const reason = studioBlockReason(config, state, model, { loggedIn: Boolean(user), creditsEnabled: false, availableCredits: null, cost: null });
            if (reason) {
                error ||= reason;
                continue;
            }
            const result = await submitStudioAgentGeneration(config, state, model, { studioAgent: "director", storyId: current.id, shotId: shot.id }, { signal: leaveRef.current?.signal, onWaiting: setQueued });
            if (!result.taskIds.length) {
                error ||= result.error || "提交失败";
                continue;
            }
            try {
                latest = await addStudioShotVersion(current.id, shot.id, kind, result.taskIds[0]);
                setStory(latest);
                submitted += 1;
            } catch (cause) {
                error ||= errorText(cause, "记录版本失败");
            }
        }
        if (submitted) {
            notifyStudioWorksChanged();
            if (latest.status === "planning") await saveStory({ status: "producing" }).catch(() => undefined);
        }
        return { submitted, error };
    };

    const renderFinal = async () => {
        const current = storyRef.current;
        if (!current) return { error: "项目还没加载" };
        const built = buildDirectorTimeline(current, { music: settings.music, subtitles: brief.subtitles !== false, mode: directorProductionMode(current) });
        if (!built.timeline.clips.some((clip) => clip.trackId === "video")) return { error: "还没有可以合成的镜头画面" };
        if (current.versions.some((version) => directorWorkActive(version.work))) return { error: "还有镜头在生成，完成后再合成" };
        try {
            const task = await createTimelineRenderTask({ projectId: "", timeline: built.timeline as unknown as TimelineProject });
            setStory(await setStudioStoryRender(current.id, task.id));
            return { error: "", missing: built.missing };
        } catch (cause) {
            return { error: errorText(cause, "合成提交失败") };
        }
    };

    const executeRun = async (action: DirectorRunAction): Promise<DirectorRunAction> => {
        if (action.step === "render") {
            const result = await renderFinal();
            if (result.error) return { ...action, status: "failed", error: result.error };
            if (result.missing?.length) message.warning(`镜头 ${result.missing.join("、")} 还没有画面，已跳过`);
            return { ...action, status: "done" };
        }
        const result = await generateStep(action.step, action.shots);
        if (!result.submitted) return { ...action, status: "failed", error: result.error };
        if (result.error) message.warning(result.error);
        return { ...action, status: "done" };
    };

    const settleAction = async (owner: DirectorMessage, next: DirectorRunAction) => {
        const actions = (owner.actions || []).map((item) => (item.id === next.id ? next : item));
        setMessages((list) => list.map((item) => (item.id === owner.id ? { ...owner, actions } : item)));
        if (!story?.sessionId) return;
        try {
            const saved = await updateStudioChatActions(story.sessionId, owner.id, actions);
            setMessages((list) => list.map((item) => (item.id === saved.id ? saved : item)));
        } catch (cause) {
            message.error(errorText(cause, "执行状态保存失败"));
        }
    };

    const runManual = async (step: DirectorRunStep, numbers?: number[]) => {
        if (working) return;
        setWorking(step);
        try {
            const result = await executeRun({ id: "manual", step, shots: numbers, status: "proposed" });
            if (result.status === "failed") message.error(result.error || "执行失败");
            else message.success(step === "render" ? "已开始合成成片" : "已提交生成");
        } finally {
            setWorking("");
        }
    };

    const send = async (text = draft) => {
        const content = text.trim();
        const current = storyRef.current;
        if (!content || busy || !current?.sessionId) return;
        if (!textModel) {
            message.error("后台还没有可用的对话模型");
            return;
        }
        setBusy(true);
        try {
            const userMessage = await appendStudioChatMessage<DirectorRunAction>(current.sessionId, { role: "user", content });
            setDraft("");
            const before = messages;
            const withUser = [...before, userMessage];
            setMessages(withUser);
            setStreaming("");
            let reply = "";
            const ask = (model: string) => runBackendGenerationTask({
                mode: "text",
                prompt: content,
                config: { ...config, model, textModel: model, systemPrompt: directorSystemPrompt({ story: current, characters, brand: brand?.prompt, kinds }) } as AiConfig,
                textHistory: directorHistory(before),
                metadata: { studioAgent: "director", storyId: current.id },
                onTextDelta: (delta) => {
                    reply += delta;
                    setStreaming(directorVisibleText(reply));
                },
            });
            try {
                let result;
                try {
                    result = await ask(textModel);
                } catch (cause) {
                    // 上游限流或繁忙且还没输出内容时，换一个备用模型重试一次。
                    const fallback = reply ? "" : directorFallbackTextModel(textModels, (model) => modelDisplayName(config, model), textModel);
                    if (!fallback) throw cause;
                    message.info(`${modelDisplayName(config, textModel) || textModel} 暂时繁忙，已改用 ${modelDisplayName(config, fallback) || fallback} 回复`);
                    result = await ask(fallback);
                }
                reply = result.text || reply;
            } catch (cause) {
                setStreaming(null);
                setDraft(content);
                message.error(errorText(cause, "导演回复失败，请重试"));
                return;
            }
            setStreaming(null);
            const parsed = parseDirectorReply(reply, { characterNames: [...characters.map((item) => item.name), ...directorDesign(current.settings).cast.map((item) => item.name)], shotCount: directorOrderedShots(current).length });
            let notes = "";
            if (parsed.plan) {
                try {
                    // 剧本阶段只有剧本、人物和场景，分镜为空时保留现有分镜。
                    const before = directorDesign(current.settings);
                    const shotKey = (shots: Array<{ durationSeconds: number; fields?: Record<string, unknown> }>) => JSON.stringify(shots.map((shot) => [shot.durationSeconds, shot.fields?.visual, shot.fields?.camera, shot.fields?.voiceover, shot.fields?.location]));
                    const shotsChanged = shotKey(parsed.plan.scenes.flatMap((scene) => scene.shots)) !== shotKey(directorOrderedShots(current));
                    const assetKey = (items: Array<{ name: string; description: string }> = []) => JSON.stringify(items.map((item) => [item.name, item.description]));
                    let updated = parsed.plan.scenes.length ? await replaceStudioStoryPlan(current.id, parsed.plan.scenes) : current;
                    const nextDesign = parsed.plan.design ? mergeDirectorDesign(directorDesign(updated.settings), parsed.plan.design) : undefined;
                    if (parsed.plan.title || parsed.plan.memory || nextDesign) {
                        updated = await updateStudioStory(current.id, storyInput(updated, {
                            ...(parsed.plan.title ? { title: parsed.plan.title } : {}),
                            ...(parsed.plan.memory ? { memory: parsed.plan.memory } : {}),
                            ...(nextDesign ? { settings: { ...(updated.settings || {}), design: nextDesign } } : {}),
                        }));
                    }
                    setStory(updated);
                    storyRef.current = updated;
                    const count = parsed.plan.scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
                    const total = parsed.plan.scenes.reduce((sum, scene) => sum + scene.shots.reduce((inner, shot) => inner + shot.durationSeconds, 0), 0);
                    const parts = [
                        parsed.plan.design?.script && parsed.plan.design.script !== before.script ? "剧本" : "",
                        parsed.plan.design?.cast?.length && assetKey(parsed.plan.design.cast) !== assetKey(before.cast) ? `${parsed.plan.design.cast.length} 个人物` : "",
                        parsed.plan.design?.locations?.length && assetKey(parsed.plan.design.locations) !== assetKey(before.locations) ? `${parsed.plan.design.locations.length} 个场景` : "",
                        count && shotsChanged ? `分镜 ${count} 个镜头，共 ${total} 秒` : "",
                    ].filter(Boolean);
                    notes = parts.length ? `\n\n已更新：${parts.join("、")}。` : "";
                } catch (cause) {
                    notes = `\n\n分镜保存失败：${errorText(cause, "请重试")}`;
                }
            } else if (parsed.planInvalid) {
                notes = "\n\n导演给出的分镜格式不完整，没有保存。可以让导演重新输出分镜。";
            }
            const assistant = await appendStudioChatMessage<DirectorRunAction>(current.sessionId, {
                role: "assistant",
                content: [`${parsed.content}${notes}`.trim() || (parsed.ask ? "" : "（导演没有返回内容）"), parsed.ask ? directorAskBlock(parsed.ask) : ""].filter(Boolean).join("\n\n"),
                actions: parsed.run ? [parsed.run] : undefined,
            });
            setMessages([...withUser, assistant]);
            if (parsed.run && runMode === "auto") {
                setWorking(parsed.run.step);
                try {
                    await settleAction(assistant, await executeRun(parsed.run));
                } finally {
                    setWorking("");
                }
            } else if (parsed.plan && runMode === "auto") {
                setAutoRun(true);
            }
        } catch (cause) {
            message.error(errorText(cause, "发送失败，请重试"));
        } finally {
            setBusy(false);
            setStreaming(null);
        }
    };

    // 新建项目带 ?kickoff=1：把简报作为第一条消息发给导演。
    useEffect(() => {
        if (kickoffRef.current || !chatLoaded || !story || searchParams.get("kickoff") !== "1") return;
        kickoffRef.current = true;
        setSearchParams({}, { replace: true });
        if (!messages.length && typeof brief.kickoff === "string" && brief.kickoff.trim()) void send(brief.kickoff);
        // send 依赖当前状态，只在首次满足条件时触发一次。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatLoaded, story, searchParams]);

    // 「直接做」：三视图和场景图 → 关键帧（或分镜板）和配音 → 视频 → 合成。每项每一步只自动尝试一次，失败的留给用户处理。
    const attemptedRef = useRef<Record<GenerateStep, Set<string>>>({ assets: new Set(), boards: new Set(), images: new Set(), videos: new Set(), voice: new Set() });
    useEffect(() => {
        if (!autoRun || !story || working) return;
        if (storyHasActiveWork(story) || [...designWorks.values()].some((work) => directorWorkActive(work))) return;
        // 三视图和场景图的生成结果还没查回来时先等，避免关键帧缺参考。
        if (designTaskIds.some((id) => !designWorks.has(id))) return;
        const board = directorProductionMode(story) === "board";
        // 分镜板模式按段落推进（段落第一个镜头代表整段），逐镜头模式按镜头推进；三视图和场景图按名字推进。
        const pending = (step: GenerateStep): Array<{ key: string; no?: number }> => {
            if (step === "assets") return directorDesignTargets(directorDesign(story.settings), designWorks, characters.map((item) => item.name)).map((target) => ({ key: `${target.kind}:${target.asset.name}` })).filter((item) => !attemptedRef.current.assets.has(item.key));
            const shotsForStep = board && step !== "voice"
                ? directorBoardTargets(story, step === "videos" ? "videos" : "boards").map((segment) => segment.anchor)
                : directorStepTargets(story, step === "boards" ? "images" : step);
            return shotsForStep.filter((shot) => !attemptedRef.current[step].has(shot.id)).map((shot) => ({ key: shot.id, no: shots.indexOf(shot) + 1 }));
        };
        const wantVoice = brief.voiceover !== false && kinds.includes("audio");
        const visualStep: GenerateStep = board ? "boards" : "images";
        const phases: GenerateStep[] = kinds.includes("image") ? ["assets", visualStep, ...(wantVoice ? (["voice"] as GenerateStep[]) : []), ...(kinds.includes("video") ? (["videos"] as GenerateStep[]) : [])] : [];
        for (const step of phases) {
            const targets = pending(step);
            if (step === "videos" && pending(visualStep).length) break;
            if (!targets.length) continue;
            targets.forEach((item) => attemptedRef.current[step].add(item.key));
            setWorking(step);
            void generateStep(step, step === "assets" ? undefined : targets.map((item) => item.no!)).then((result) => {
                if (result.error) message.warning(result.error);
            }).finally(() => setWorking(""));
            return;
        }
        setAutoRun(false);
        setWorking("render");
        void renderFinal().then((result) => {
            if (result.error) message.error(result.error);
        }).finally(() => setWorking(""));
        // generateStep / renderFinal 读取最新的 storyRef，不需要放进依赖。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRun, story, working, designWorks]);

    const updateMusic = async (music: DirectorMusic | undefined) => {
        setMusicOpen(false);
        try {
            await saveStory({ settings: { ...settings, music } });
        } catch (cause) {
            message.error(errorText(cause, "背景音乐保存失败"));
        }
    };

    if (storyQuery.isError) {
        return (
            <StudioShell title="AI 导演">
                <div className="studio-empty" role="alert"><strong>导演项目打不开</strong><span>{errorText(storyQuery.error, "项目不存在或已删除")}</span><Link to="/studio/director" className="studio-mini-button">返回导演首页</Link></div>
            </StudioShell>
        );
    }
    if (!story || !timeline) {
        return (
            <StudioShell title="AI 导演">
                <div className="studio-empty"><Loader2 className="studio-spin" aria-hidden /></div>
            </StudioShell>
        );
    }

    const memory = directorMemory(story.memory);
    // 分镜板模式下分镜板和整段视频都在段落第一个镜头上，预览时显示所在段落。
    const pickedShot = shots.find((shot) => shot.id === selectedShotId);
    const selectedShot = pickedShot && productionMode === "board" ? directorSegmentOfShot(segments, pickedShot.id)?.anchor || pickedShot : pickedShot;
    const renderReady = story.render?.status === "succeeded" && story.render.resourceId;
    const totalMs = Math.max(1, timeline.timeline.durationMs);

    return (
        <StudioShell title="AI 导演" subtitle={story.title}>
            <div className="studio-director-ws">
                <section className="studio-left-panel studio-chat-panel" aria-label="导演对话">
                    <header className="studio-chat-head">
                        <Link to="/studio/director" className="studio-icon-button" aria-label="返回导演首页"><ArrowLeft aria-hidden /></Link>
                        <strong className="studio-chat-title">{story.title}</strong>
                        <div className="studio-chat-mode" role="group" aria-label="执行方式">
                            <button type="button" aria-pressed={runMode === "guide"} title="每一步先问你" onClick={() => void saveStory({ settings: { ...settings, runMode: "guide" } })}>引导我</button>
                            <button type="button" aria-pressed={runMode === "auto"} title="直接生成到成片" onClick={() => void saveStory({ settings: { ...settings, runMode: "auto" } })}>直接做</button>
                        </div>
                    </header>
                    <div className="studio-chat-scroll" ref={scrollRef}>
                        {!chatLoaded ? <div className="studio-empty"><Loader2 className="studio-spin" aria-hidden /></div> : null}
                        {chatLoaded && !messages.length && streaming === null ? (
                            <div className="studio-chat-welcome">
                                <h2>和导演聊聊这支视频</h2>
                                <p>说清楚卖什么、给谁看、想要什么感觉，导演会写分镜给你。</p>
                            </div>
                        ) : null}
                        {messages.map((item, messageIndex) => {
                            const parts = directorMessageParts(item.content);
                            const latest = messageIndex === messages.length - 1;
                            return (
                            <div key={item.id} className={`studio-chat-message is-${item.role}`}>
                                {parts.text ? (item.role === "assistant" ? <div className="studio-chat-bubble is-markdown"><AIMessageMarkdown>{parts.text}</AIMessageMarkdown></div> : <div className="studio-chat-bubble">{parts.text}</div>) : null}
                                {parts.ask && item.role === "assistant" ? (
                                    <AskCard ask={parts.ask} active={latest && !busy && streaming === null} onPick={(option) => void send(directorAskAnswer(parts.ask!, option))} />
                                ) : null}
                                {(item.actions || []).map((action) => (
                                    <RunCard
                                        key={action.id}
                                        action={action}
                                        story={story}
                                        config={config}
                                        assetCount={assetTargets.length}
                                        disabled={busy || Boolean(working)}
                                        onConfirm={async () => {
                                            setWorking(action.step);
                                            try {
                                                const next = await executeRun(action);
                                                await settleAction(item, next);
                                                if (next.status === "failed") message.error(next.error || "执行失败");
                                            } finally {
                                                setWorking("");
                                            }
                                        }}
                                        onSkip={() => void settleAction(item, { ...action, status: "skipped" })}
                                    />
                                ))}
                            </div>
                            );
                        })}
                        {renderReady && streaming === null ? (
                            <FinalCard
                                story={story}
                                subtitles={brief.subtitles !== false}
                                busy={busy || Boolean(working)}
                                music={settings.music}
                                onMusic={(music) => void updateMusic(music)}
                                onDraft={(text) => {
                                    setDraft(text);
                                    inputRef.current?.focus();
                                }}
                                onToggleSubtitles={async () => {
                                    try {
                                        await saveStory({ brief: { ...story.brief, subtitles: brief.subtitles === false } });
                                        message.success("已更新字幕设置，重新合成后生效");
                                    } catch (cause) {
                                        message.error(errorText(cause, "保存失败"));
                                    }
                                }}
                                onRender={() => void runManual("render")}
                            />
                        ) : null}
                        {streaming !== null ? (
                            <div className="studio-chat-message is-assistant">
                                <div className="studio-chat-bubble">{streaming || <Loader2 className="studio-spin" aria-label="导演正在思考" />}</div>
                            </div>
                        ) : null}
                    </div>
                    <div className="studio-chat-composer">
                        <textarea
                            ref={inputRef}
                            value={draft}
                            placeholder="和导演说你的想法，可以写「镜头 3 换成夜景」"
                            aria-label="对导演说"
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    void send();
                                }
                            }}
                        />
                        <div className="studio-chat-bar">
                            <StudioSelect
                                className="studio-chat-model"
                                ariaLabel="导演模型"
                                value={textModel}
                                options={groupedTextModelOptions(textModels, (model) => modelDisplayName(config, model))}
                                empty="无可用模型"
                                onChange={(value) => {
                                    setTextModelChoice(value);
                                    try {
                                        window.localStorage.setItem(TEXT_MODEL_KEY, value);
                                    } catch {
                                        // 浏览器存储不可用时只在本页生效。
                                    }
                                }}
                                placement="topLeft"
                            />
                            <span style={{ flex: 1 }} />
                            <button type="button" className="studio-icon-button studio-send-button" aria-label="发送" disabled={busy || !draft.trim()} onClick={() => void send()}>
                                {busy ? <Loader2 className="studio-spin" aria-hidden /> : <ArrowUp aria-hidden />}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="studio-director-main" aria-label="分镜与成片">
                    <header className="studio-director-bar">
                        <span className="studio-hint">{story.ratio} · 目标 {story.durationSeconds} 秒 · 当前 {(timeline.timeline.durationMs / 1000).toFixed(1)} 秒 · {shots.length} 个镜头{productionMode === "board" && segments.length ? ` · ${segments.length} 段` : ""}</span>
                        <div className="studio-chat-mode" role="group" aria-label="制作方式">
                            <button type="button" aria-pressed={productionMode === "shots"} title="剧本 → 分镜 → 人物三视图和场景图 → 每个镜头的关键帧 → 视频" disabled={Boolean(working)} onClick={() => void saveStory({ settings: { ...(storyRef.current?.settings || {}), mode: "shots" } })}>标准流程</button>
                            <button type="button" aria-pressed={productionMode === "board"} title="剧本 → 分镜 → 人物三视图和场景图 → 每段一张分镜板 → 整段视频，更快更省" disabled={Boolean(working)} onClick={() => void saveStory({ settings: { ...(storyRef.current?.settings || {}), mode: "board" } })}>分镜板</button>
                        </div>
                        <span style={{ flex: 1 }} />
                        {queued ? <span className="studio-hint"><Loader2 className="studio-spin" aria-hidden /> 排队中：同时运行的任务已满，完成后自动继续</span> : autoRun ? <span className="studio-hint"><Loader2 className="studio-spin" aria-hidden /> 正在自动制作</span> : null}
                        <button type="button" className="studio-mini-button is-primary" disabled={Boolean(working) || autoRun || !shots.length} onClick={() => setQuoteOpen(true)}><Sparkles aria-hidden />一键制作</button>
                        {productionMode === "board" ? (
                            <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("boards")}><LayoutGrid aria-hidden />生成分镜板</button>
                        ) : (
                            <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("images")}><ImageIcon aria-hidden />生成关键帧</button>
                        )}
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("videos")}><Film aria-hidden />生成视频</button>
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("voice")}><AudioLines aria-hidden />生成配音</button>
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("render")}>{working === "render" ? <Loader2 className="studio-spin" aria-hidden /> : <Clapperboard aria-hidden />}合成成片</button>
                        {renderReady ? <a className="studio-mini-button" href={resourceFileUrl(story.render!.resourceId!)} download={`${story.title}.mp4`}><Download aria-hidden />导出</a> : null}
                    </header>

                    <div className="studio-director-body">
                        <div className="studio-director-preview">
                            <div className={`studio-director-player is-${story.ratio.replace(":", "x")}`}>
                                {selectedShot ? <ShotMedia shot={selectedShot} versions={versions} controls frame={directorShotFrame(selectedShot, references)?.url} /> : renderReady ? (
                                    <video key={story.render!.resourceId} src={playbackVariantUrl(story.render!.resourceId!)} controls playsInline preload="metadata" />
                                ) : (
                                    <div className="studio-empty">
                                        {story.render && (story.render.status === "queued" || story.render.status === "running") ? <><Loader2 className="studio-spin" aria-hidden /><span>正在合成 {story.render.progress || 0}%</span></> : story.render?.status === "failed" ? <><strong>合成失败</strong><span>{story.render.error}</span></> : <><Clapperboard aria-hidden /><span>{shots.length ? "生成画面后点「合成成片」" : "导演写好分镜后显示在这里"}</span></>}
                                    </div>
                                )}
                            </div>
                            {selectedShot ? <button type="button" className="studio-mini-button" onClick={() => setSelectedShotId("")}>{renderReady ? "看成片" : "取消选择"}</button> : null}
                            <details className="studio-director-memory">
                                <summary>项目记忆</summary>
                                {DIRECTOR_MEMORY_SECTIONS.map((section) => memory[section.key].length ? (
                                    <div key={section.key}>
                                        <b>{section.label}</b>
                                        <ul>{memory[section.key].map((line, index) => <li key={index}>{line}</li>)}</ul>
                                    </div>
                                ) : null)}
                                {DIRECTOR_MEMORY_SECTIONS.every((section) => !memory[section.key].length) ? <p className="studio-hint">导演会把确认过的决定和待办记在这里。</p> : null}
                            </details>
                        </div>

                        <div className="studio-storyboard">
                            <DesignPanel design={design} works={designWorks} characters={characters} pendingCount={assetTargets.length} busy={Boolean(working)} onGenerate={() => void runManual("assets")} />
                            {!shots.length ? <div className="studio-empty"><Sparkles aria-hidden /><strong>{design.script ? "剧本写好了，还没有分镜" : "还没有剧本"}</strong><span>{design.script ? "确认剧本后，导演会把它拆成分镜。" : "在左边告诉导演你的概念，导演会先写成剧本。"}</span></div> : null}
                            {productionMode === "board" && segments.length ? (
                                <section className="studio-scene" aria-label="分镜板段落">
                                    <header><strong>分镜板</strong><span>每段先出一张分镜板，再按分镜板一次生成整段视频</span></header>
                                    <div className="studio-segment-grid">
                                        {segments.map((segment) => (
                                            <SegmentCard
                                                key={segment.anchor.id}
                                                segment={segment}
                                                versions={versions}
                                                busy={Boolean(working)}
                                                selected={Boolean(selectedShotId) && segment.shots.some((shot) => shot.id === selectedShotId)}
                                                onSelect={() => setSelectedShotId(segment.shots.some((shot) => shot.id === selectedShotId) ? "" : segment.anchor.id)}
                                                onGenerate={(step) => void runManual(step, [segment.shotNumbers[0]])}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                            {story.scenes.map((scene) => {
                                const sceneShots = shots.filter((shot) => shot.sceneId === scene.id);
                                if (!sceneShots.length) return null;
                                return (
                                    <section key={scene.id} className="studio-scene">
                                        <header><strong>{scene.title}</strong>{scene.description ? <span>{scene.description}</span> : null}</header>
                                        <div className="studio-shot-grid">
                                            {sceneShots.map((shot) => (
                                                <ShotCard
                                                    key={shot.id}
                                                    shot={shot}
                                                    no={shots.indexOf(shot) + 1}
                                                    story={story}
                                                    selected={shot.id === selectedShotId}
                                                    busy={Boolean(working)}
                                                    segmentNo={productionMode === "board" ? directorSegmentOfShot(segments, shot.id)?.no : undefined}
                                                    onSelect={() => setSelectedShotId(shot.id === selectedShotId ? "" : shot.id)}
                                                    onMention={() => {
                                                        setDraft((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}镜头 ${shots.indexOf(shot) + 1}：`);
                                                        inputRef.current?.focus();
                                                    }}
                                                    onEdit={() => setEditing(shot)}
                                                    onGenerate={(step) => void runManual(step, [shots.indexOf(shot) + 1])}
                                                    onActivate={async (kind, versionId) => {
                                                        try {
                                                            setStory(await patchStudioShot(story.id, shot.id, kind === "image" ? { activeImageVersionId: versionId } : kind === "video" ? { activeVideoVersionId: versionId } : { activeVoiceVersionId: versionId }));
                                                        } catch (cause) {
                                                            message.error(errorText(cause, "切换版本失败"));
                                                        }
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>

                    <div className="studio-timeline" aria-label="时间线">
                        <TimelineTrack label="画面" icon={<Film aria-hidden />} clips={timeline.timeline.clips.filter((clip) => clip.trackId === "video")} totalMs={totalMs} render={(clip) => (clip.id.startsWith("seg-") ? `第 ${segments.find((segment) => segment.shotNumbers[0] === clip.shotNo)?.no ?? 1} 段` : `镜头 ${clip.shotNo}`)} />
                        <div className="studio-timeline-row">
                            <span className="studio-timeline-label"><Music aria-hidden />音乐</span>
                            <div className="studio-timeline-lane">
                                <Popover open={musicOpen} onOpenChange={setMusicOpen} trigger="click" placement="top" content={<MusicPicker current={settings.music} onPick={(music) => void updateMusic(music)} />}>
                                    <button type="button" className={`studio-timeline-clip is-music${settings.music ? "" : " is-empty"}`} style={{ left: 0, width: settings.music ? `${Math.min(100, ((settings.music.durationMs || totalMs) / totalMs) * 100)}%` : "100%" }}>
                                        {settings.music ? settings.music.name || "背景音乐" : "+ 添加背景音乐"}
                                    </button>
                                </Popover>
                            </div>
                        </div>
                        <TimelineTrack label="旁白" icon={<AudioLines aria-hidden />} clips={timeline.timeline.clips.filter((clip) => clip.trackId === "voiceover")} totalMs={totalMs} render={(clip) => `镜头 ${clip.shotNo}`} />
                        <TimelineTrack label="字幕" icon={<span aria-hidden>T</span>} clips={timeline.timeline.clips.filter((clip) => clip.trackId === "subtitle")} totalMs={totalMs} render={(clip) => clip.text || ""} />
                        {timeline.missing.length || timeline.longVoice.length ? (
                            <p className="studio-block-reason">
                                {timeline.missing.length ? `镜头 ${timeline.missing.join("、")} 还没有画面，合成时会跳过。` : ""}
                                {timeline.longVoice.length ? `镜头 ${timeline.longVoice.join("、")} 的配音比镜头长，超出部分会被裁掉，可以加长镜头或缩短旁白。` : ""}
                            </p>
                        ) : null}
                    </div>
                </section>
            </div>
            <ProductionQuote
                open={quoteOpen}
                story={story}
                config={config}
                mode={productionMode}
                assetCount={assetTargets.length}
                voiceover={brief.voiceover !== false && kinds.includes("audio")}
                onClose={() => setQuoteOpen(false)}
                onConfirm={() => {
                    setQuoteOpen(false);
                    attemptedRef.current = { assets: new Set(), boards: new Set(), images: new Set(), videos: new Set(), voice: new Set() };
                    setAutoRun(true);
                }}
            />
            <ShotEditor
                shot={editing}
                characters={characters}
                onClose={() => setEditing(null)}
                onSave={async (shot, fields, duration) => {
                    try {
                        setStory(await patchStudioShot(story.id, shot.id, { fields, durationSeconds: duration }));
                        setEditing(null);
                    } catch (cause) {
                        message.error(errorText(cause, "保存失败"));
                    }
                }}
            />
        </StudioShell>
    );
}

/** frame 是镜头直接使用的上传图片，还没有生成结果时先显示它。 */
function ShotMedia({ shot, versions, controls = false, frame }: { shot: StudioShot; versions: ReturnType<typeof directorVersionIndex>; controls?: boolean; frame?: string }) {
    const video = directorActiveWork(shot, "video", versions);
    const image = directorActiveWork(shot, "image", versions);
    if (directorWorkReady(video)) return <video src={workMediaSrc(video)} controls={controls} muted={!controls} playsInline preload="metadata" />;
    if (directorWorkReady(image)) return <img src={workMediaSrc(image)} alt="" loading="lazy" />;
    if (frame && !directorWorkActive(video)) return <img src={frame} alt="" loading="lazy" />;
    if (directorWorkActive(video) || directorWorkActive(image)) return <span className="studio-shot-state"><Loader2 className="studio-spin" aria-hidden />生成中</span>;
    if (video?.status === "failed" || image?.status === "failed") return <span className="studio-shot-state is-failed">生成失败</span>;
    return <span className="studio-shot-state">待生成</span>;
}

type ShotCardProps = {
    shot: StudioShot;
    no: number;
    story: StudioStory;
    selected: boolean;
    busy: boolean;
    /** 分镜板模式下镜头所在的段落；画面和视频按段落生成，镜头卡只管文字和配音。 */
    segmentNo?: number;
    onSelect: () => void;
    onMention: () => void;
    onEdit: () => void;
    onGenerate: (step: GenerateStep) => void;
    onActivate: (kind: StudioKind, versionId: string) => void;
};

function ShotCard({ shot, no, story, selected, busy, segmentNo, onSelect, onMention, onEdit, onGenerate, onActivate }: ShotCardProps) {
    const fields = directorShotFields(shot);
    const versions = directorVersionIndex(story);
    const voice = directorActiveWork(shot, "audio", versions);
    const shotVersions = story.versions.filter((version) => version.shotId === shot.id);
    const activeIds: Record<StudioKind, string | undefined> = { image: shot.activeImageVersionId, video: shot.activeVideoVersionId, audio: shot.activeVoiceVersionId };
    return (
        <article className={`studio-shot${selected ? " is-selected" : ""}`} aria-label={`镜头 ${no}`}>
            <button type="button" className="studio-shot-media" onClick={onSelect} aria-pressed={selected} aria-label={`预览镜头 ${no}`}>
                {segmentNo ? <span className="studio-shot-state">第 {segmentNo} 段</span> : <ShotMedia shot={shot} versions={versions} frame={directorShotFrame(shot, directorReferences(story.brief))?.url} />}
                <b>{no}</b>
                <em>{shot.durationSeconds}s</em>
            </button>
            <div className="studio-shot-body">
                <p>{fields.visual}</p>
                {fields.camera ? <small>{fields.camera}</small> : null}
                {fields.characters.length || fields.location ? <small>{[fields.characters.length ? `人物：${fields.characters.join("、")}` : "", fields.location ? `场景：${fields.location}` : ""].filter(Boolean).join(" · ")}</small> : null}
                {fields.voiceover ? <small className="studio-shot-voice">旁白：{fields.voiceover}{directorWorkReady(voice) ? <audio src={workMediaSrc(voice)} controls preload="none" /> : directorWorkActive(voice) ? "（配音生成中）" : ""}</small> : null}
                {fields.subtitle ? <small>字幕：{fields.subtitle}</small> : null}
            </div>
            <footer>
                {segmentNo ? null : (
                    <>
                        <button type="button" className="studio-icon-button" title="生成画面" aria-label={`生成镜头 ${no} 画面`} disabled={busy} onClick={() => onGenerate("images")}><ImageIcon aria-hidden /></button>
                        <button type="button" className="studio-icon-button" title="生成视频" aria-label={`生成镜头 ${no} 视频`} disabled={busy} onClick={() => onGenerate("videos")}><Film aria-hidden /></button>
                    </>
                )}
                <button type="button" className="studio-icon-button" title="生成配音" aria-label={`生成镜头 ${no} 配音`} disabled={busy || !fields.voiceover} onClick={() => onGenerate("voice")}><AudioLines aria-hidden /></button>
                <button type="button" className="studio-icon-button" title="编辑镜头" aria-label={`编辑镜头 ${no}`} onClick={onEdit}><Pencil aria-hidden /></button>
                <button type="button" className="studio-icon-button" title="在对话中引用" aria-label={`在对话中引用镜头 ${no}`} onClick={onMention}>@</button>
                {shotVersions.length > 1 ? (
                    <Popover trigger="click" placement="top" content={(
                        <div className="studio-popup studio-version-list">
                            {(["image", "video", "audio"] as StudioKind[]).map((kind) => {
                                const list = shotVersions.filter((version) => version.kind === kind);
                                if (list.length < 2) return null;
                                return (
                                    <div key={kind}>
                                        <b>{kind === "image" ? "画面" : kind === "video" ? "视频" : "配音"}</b>
                                        {list.map((version, index) => (
                                            <button key={version.id} type="button" className="studio-list-item" aria-current={activeIds[kind] === version.id ? "true" : undefined} disabled={version.work?.status !== "succeeded"} onClick={() => onActivate(kind, version.id)}>
                                                版本 {index + 1} · {version.work?.status === "succeeded" ? "可用" : version.work?.status === "failed" ? "失败" : "生成中"}
                                                {activeIds[kind] === version.id ? <Check aria-hidden /> : null}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}>
                        <button type="button" className="studio-mini-button">{shotVersions.length} 个版本</button>
                    </Popover>
                ) : null}
            </footer>
        </article>
    );
}

function ShotEditor({ shot, characters, onClose, onSave }: { shot: StudioShot | null; characters: DirectorCharacter[]; onClose: () => void; onSave: (shot: StudioShot, fields: DirectorShotFields, duration: number) => Promise<void> }) {
    const [fields, setFields] = useState<DirectorShotFields | null>(null);
    const [duration, setDuration] = useState(4);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!shot) return;
        setFields(directorShotFields(shot));
        setDuration(shot.durationSeconds);
    }, [shot]);
    if (!shot || !fields) return null;
    const set = <K extends keyof DirectorShotFields>(key: K, value: DirectorShotFields[K]) => setFields({ ...fields, [key]: value });
    return (
        <AppModal rootClassName="studio-modal" open title="编辑镜头" okText={saving ? "保存中…" : "保存"} cancelText="取消" okButtonProps={{ disabled: saving || !fields.visual.trim() }} onCancel={onClose} onOk={async () => {
            setSaving(true);
            await onSave(shot, fields, duration);
            setSaving(false);
        }}>
            <div className="studio-popup studio-form-stack">
                <label className="studio-field"><span>画面 <b aria-hidden>*</b></span><textarea rows={4} maxLength={2000} value={fields.visual} onChange={(event) => set("visual", event.target.value)} /></label>
                <label className="studio-field"><span>景别与运镜</span><input maxLength={200} value={fields.camera} onChange={(event) => set("camera", event.target.value)} /></label>
                <label className="studio-field"><span>场景</span><input maxLength={40} value={fields.location} onChange={(event) => set("location", event.target.value)} /></label>
                <label className="studio-field"><span>旁白 / 台词</span><textarea rows={2} maxLength={1000} value={fields.voiceover} onChange={(event) => set("voiceover", event.target.value)} /></label>
                <label className="studio-field"><span>字幕</span><input maxLength={200} value={fields.subtitle} onChange={(event) => set("subtitle", event.target.value)} /></label>
                <label className="studio-field"><span>时长（秒）</span><input type="number" min={1} max={60} value={duration} onChange={(event) => setDuration(Math.min(60, Math.max(1, Math.round(Number(event.target.value) || 1))))} /></label>
                {characters.length ? (
                    <div className="studio-field">
                        <span>出镜角色</span>
                        <div className="studio-chip-list">
                            {characters.map((item) => {
                                const pressed = fields.characters.includes(item.name);
                                return <button key={item.id} type="button" aria-pressed={pressed} onClick={() => set("characters", pressed ? fields.characters.filter((name) => name !== item.name) : [...fields.characters, item.name])}>{item.name}</button>;
                            })}
                        </div>
                    </div>
                ) : null}
                <p className="studio-hint">改了画面后，点镜头上的「生成画面」重新生成；旧版本会保留，可以切回。</p>
            </div>
        </AppModal>
    );
}

function TimelineTrack({ label, icon, clips, totalMs, render }: { label: string; icon: ReactNode; clips: ReturnType<typeof buildDirectorTimeline>["timeline"]["clips"]; totalMs: number; render: (clip: ReturnType<typeof buildDirectorTimeline>["timeline"]["clips"][number]) => string }) {
    return (
        <div className="studio-timeline-row">
            <span className="studio-timeline-label">{icon}{label}</span>
            <div className="studio-timeline-lane">
                {clips.map((clip) => (
                    <span key={clip.id} className={`studio-timeline-clip is-${clip.trackId}`} style={{ left: `${(clip.startMs / totalMs) * 100}%`, width: `${(clip.durationMs / totalMs) * 100}%` }} title={render(clip)}>{render(clip)}</span>
                ))}
            </div>
        </div>
    );
}

function MusicPicker({ current, onPick }: { current?: DirectorMusic; onPick: (music: DirectorMusic | undefined) => void }) {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);
    const worksQuery = useQuery({ queryKey: ["studio", "director-music"], queryFn: async () => (await listStudioWorks({ kind: "audio", pageSize: 30 })).works.filter((work) => work.status === "succeeded" && work.media[0]?.storageKey) });
    return (
        <div className="studio-popup studio-music-picker">
            <label className="studio-list-item">
                <Upload aria-hidden />{uploading ? "上传中…" : "上传音乐（mp3 / m4a / wav）"}
                <input type="file" hidden accept="audio/*" disabled={uploading} onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    try {
                        const uploaded = await uploadStudioFile(file);
                        if (!uploaded.storageKey?.startsWith("resource:")) throw new Error("音乐没有保存到云端");
                        onPick({ storageKey: uploaded.storageKey, durationMs: "durationMs" in uploaded ? uploaded.durationMs : undefined, name: file.name });
                    } catch (cause) {
                        message.error(errorText(cause, "上传失败"));
                    } finally {
                        setUploading(false);
                    }
                }} />
            </label>
            {(worksQuery.data || []).map((work) => (
                <button key={work.id} type="button" className="studio-list-item" aria-current={current?.storageKey === work.media[0].storageKey ? "true" : undefined} onClick={() => onPick({ storageKey: work.media[0].storageKey!, durationMs: work.media[0].durationMs, name: work.prompt.slice(0, 24) || "音频作品" })}>
                    <Music aria-hidden /><span>{work.prompt.slice(0, 40) || "音频作品"}</span>
                </button>
            ))}
            {current ? <button type="button" className="studio-list-item" onClick={() => onPick(undefined)}><X aria-hidden />不使用背景音乐</button> : null}
        </div>
    );
}

function RunCard({ action, story, config, disabled, assetCount, onConfirm, onSkip }: { action: DirectorRunAction; story: StudioStory; config: AiConfig; disabled: boolean; assetCount: number; onConfirm: () => void; onSkip: () => void }) {
    if (action.step === "assets") {
        return (
            <article className={`studio-chat-action is-${action.status}`} aria-label={directorStepLabel(action.step)}>
                <header>
                    <strong>{directorStepLabel(action.step)}</strong>
                    <span>{assetCount ? `${assetCount} 张` : ""}</span>
                    <em>{action.status === "done" ? "已执行" : action.status === "skipped" ? "已跳过" : action.status === "failed" ? "失败" : "待确认"}</em>
                </header>
                {action.error ? <p className="studio-block-reason" role="alert">{action.error}</p> : null}
                {action.status === "proposed" ? (
                    <footer>
                        <AssetEstimate count={assetCount} story={story} config={config} />
                        <span style={{ flex: 1 }} />
                        <button type="button" className="studio-mini-button" disabled={disabled} onClick={onSkip}>跳过</button>
                        <button type="button" className="studio-mini-button is-primary" disabled={disabled || !assetCount} onClick={onConfirm}><Check aria-hidden />执行</button>
                    </footer>
                ) : null}
            </article>
        );
    }
    const boardStep = action.step !== "render" && action.step !== "voice" && (action.step === "boards" || directorProductionMode(story) === "board");
    const segmentTargets = boardStep ? directorBoardTargets(story, action.step === "videos" ? "videos" : "boards", action.shots) : [];
    const targets = action.step === "render" ? [] : boardStep ? segmentTargets.map((segment) => segment.anchor) : directorStepTargets(story, action.step === "boards" ? "images" : action.step, action.shots);
    return (
        <article className={`studio-chat-action is-${action.status}`} aria-label={directorStepLabel(action.step)}>
            <header>
                <strong>{directorStepLabel(action.step)}</strong>
                <span>{action.shots?.length ? `镜头 ${action.shots.join("、")}` : action.step === "render" ? "" : "全部镜头"}</span>
                <em>{action.status === "done" ? "已执行" : action.status === "skipped" ? "已跳过" : action.status === "failed" ? "失败" : "待确认"}</em>
            </header>
            {action.error ? <p className="studio-block-reason" role="alert">{action.error}</p> : null}
            {action.status === "proposed" ? (
                <footer>
                    {action.step === "render"
                        ? <span className="studio-hint">合成不消耗积分</span>
                        : boardStep
                            ? <SegmentEstimate kind={action.step === "videos" ? "video" : "image"} segments={segmentTargets} story={story} config={config} />
                            : <StepEstimate step={action.step === "boards" ? "images" : action.step} story={story} config={config} shots={targets} />}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="studio-mini-button" disabled={disabled} onClick={onSkip}>跳过</button>
                    <button type="button" className="studio-mini-button is-primary" disabled={disabled || (action.step !== "render" && !targets.length)} onClick={onConfirm}><Check aria-hidden />执行</button>
                </footer>
            ) : null}
        </article>
    );
}

/** 三视图和场景图的积分：每张一次图片生成。 */
function AssetEstimate({ count, story, config }: { count: number; story: StudioStory; config: AiConfig }) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { onValue, total } = useCostTotal();
    if (!count) return <span className="studio-hint">人物三视图和场景图都已经生成好了</span>;
    return (
        <span className="studio-hint">
            {count} 张{creditsEnabled && total !== null ? ` · 约 ${formatCredits(total)} 积分` : ""}
            <table hidden><tbody><CostLine id="assets" label="" kind="image" ratio={story.ratio} seconds={5} count={count} board config={config} onValue={onValue} /></tbody></table>
        </span>
    );
}

/** 估算一步的积分：视频按镜头时长分组逐组报价，图片和配音按张数。 */
function StepEstimate({ step, story, config, shots }: { step: GenerateStep; story: StudioStory; config: AiConfig; shots: StudioShot[] }) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const kind = STEP_KIND[step];
    const { onValue, total } = useCostTotal();
    const { model } = useUnitCredits(config, kind, story.ratio, 5, false);
    if (!shots.length) return <span className="studio-hint">没有需要处理的镜头</span>;
    const groups: Array<[number, number]> = kind === "video" ? groupBySeconds(shots, (shot) => shot.durationSeconds) : [[5, shots.length]];
    return (
        <span className="studio-hint">
            {shots.length} 个镜头 · {model ? modelDisplayName(config, model) || model : "无可用模型"}{creditsEnabled && total !== null ? ` · 约 ${formatCredits(total)} 积分` : ""}
            <table hidden>
                <tbody>
                    {groups.map(([seconds, count]) => <CostLine key={`${kind}-${seconds}`} id={`${kind}-${seconds}`} label="" kind={kind} ratio={story.ratio} seconds={seconds} count={count} board={false} config={config} onValue={onValue} />)}
                </tbody>
            </table>
        </span>
    );
}

function useUnitCredits(config: AiConfig, kind: StudioKind, ratio: string, seconds: number, board: boolean) {
    const { state, model } = useMemo(
        () => (board && kind !== "audio"
            ? boardToolState(config, kind, { prompt: "示例", ratio: kind === "image" ? "16:9" : ratio, seconds })
            : studioAgentToolState(config, { kind, prompt: "示例", ratio, seconds, tool: "director" })),
        [board, config, kind, ratio, seconds],
    );
    const requirements = useMemo(() => studioModelRequirements(config, state), [config, state]);
    const generationConfig = useMemo(() => (model ? studioGenerationConfig(config, state, model) : config), [config, model, state]);
    const { credits } = useGenerationCredits({ config: generationConfig, model, mode: kind, count: 1, seconds: state.video.seconds, requirements });
    return { credits, model };
}

function formatCredits(value: number) {
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

type CostLineProps = { id: string; label: string; kind: StudioKind; ratio: string; seconds: number; count: number; board: boolean; config: AiConfig; onValue: (id: string, value: number | null | undefined) => void };

/** 报价单的一行：同一模型、同一时长的若干次生成。 */
function CostLine({ id, label, kind, ratio, seconds, count, board, config, onValue }: CostLineProps) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { credits, model } = useUnitCredits(config, kind, ratio, seconds, board);
    const value = credits === null ? null : credits * count;
    useEffect(() => {
        onValue(id, value);
    }, [id, onValue, value]);
    useEffect(() => () => onValue(id, undefined), [id, onValue]);
    return (
        <tr>
            <td>{label}</td>
            <td>{model ? modelDisplayName(config, model) || model : "无可用模型"}</td>
            <td>× {count}</td>
            <td>{creditsEnabled ? (value === null ? "—" : `${formatCredits(value)} 积分`) : "—"}</td>
        </tr>
    );
}

function groupBySeconds<T>(items: T[], seconds: (item: T) => number): Array<[number, number]> {
    const groups = new Map<number, number>();
    for (const item of items) groups.set(seconds(item), (groups.get(seconds(item)) || 0) + 1);
    return [...groups.entries()].sort((left, right) => left[0] - right[0]);
}

/** 汇总各行积分；有任何一行还没算出来时合计为 null。undefined 表示该行已移除。 */
function useCostTotal() {
    const [values, setValues] = useState<Record<string, number | null>>({});
    const onValue = useCallback((id: string, value: number | null | undefined) => setValues((current) => {
        if (value === undefined) {
            if (!(id in current)) return current;
            const next = { ...current };
            delete next[id];
            return next;
        }
        return current[id] === value ? current : { ...current, [id]: value };
    }), []);
    const entries = Object.values(values);
    const total = entries.length && entries.every((value) => value !== null) ? entries.reduce<number>((sum, value) => sum + (value || 0), 0) : null;
    return { onValue, total };
}

/** 一步要处理的段落报价：分镜板按张，整段视频按段落时长分组。 */
function SegmentEstimate({ kind, segments, story, config }: { kind: "image" | "video"; segments: DirectorSegment[]; story: StudioStory; config: AiConfig }) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { onValue, total } = useCostTotal();
    if (!segments.length) return <span className="studio-hint">没有需要处理的段落</span>;
    const groups: Array<[number, number]> = kind === "image" ? [[5, segments.length]] : groupBySeconds(segments, (segment) => segment.seconds);
    return (
        <span className="studio-hint">
            {segments.length} 段{kind === "image" ? "分镜板" : "视频"}{creditsEnabled && total !== null ? ` · 约 ${formatCredits(total)} 积分` : ""}
            <table hidden>
                <tbody>
                    {groups.map(([seconds, count]) => <CostLine key={`${kind}-${seconds}`} id={`${kind}-${seconds}`} label="" kind={kind} ratio={story.ratio} seconds={seconds} count={count} board config={config} onValue={onValue} />)}
                </tbody>
            </table>
        </span>
    );
}

/** 一键制作前的报价单：按尚未完成的分镜板、视频和配音逐项计算积分，确认后自动跑完并合成。 */
function ProductionQuote({ open, story, config, mode, assetCount, voiceover, onClose, onConfirm }: { open: boolean; story: StudioStory; config: AiConfig; mode: DirectorProductionMode; assetCount: number; voiceover: boolean; onClose: () => void; onConfirm: () => void }) {
    if (!open) return null;
    return <ProductionQuoteBody story={story} config={config} mode={mode} assetCount={assetCount} voiceover={voiceover} onClose={onClose} onConfirm={onConfirm} />;
}

function ProductionQuoteBody({ story, config, mode, assetCount, voiceover, onClose, onConfirm }: { story: StudioStory; config: AiConfig; mode: DirectorProductionMode; assetCount: number; voiceover: boolean; onClose: () => void; onConfirm: () => void }) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { onValue, total } = useCostTotal();
    const versions = directorVersionIndex(story);
    const needsVideo = (shot: StudioShot) => {
        const work = directorActiveWork(shot, "video", versions);
        return !directorWorkReady(work) && !directorWorkActive(work);
    };
    const board = mode === "board";
    const segments = directorSegments(story);
    const visualCount = board ? directorBoardTargets(story, "boards").length : directorStepTargets(story, "images").length;
    const videoGroups = board
        ? groupBySeconds(segments.filter((segment) => needsVideo(segment.anchor)), (segment) => segment.seconds)
        : groupBySeconds(directorOrderedShots(story).filter(needsVideo), (shot) => shot.durationSeconds);
    const voiceCount = voiceover ? directorStepTargets(story, "voice").length : 0;
    const nothing = !assetCount && !visualCount && !videoGroups.length && !voiceCount;
    return (
        <AppModal rootClassName="studio-modal" open title="一键制作 · 积分报价" okText={nothing ? "直接合成" : "确认制作"} cancelText="取消" onCancel={onClose} onOk={onConfirm}>
            <div className="studio-popup studio-form-stack">
                <p className="studio-hint">{board ? `分镜板模式：先生成人物三视图和场景图，再把 ${segments.length} 段各出一张分镜板、按分镜板一次生成整段视频，最后加上配音、字幕和音乐合成成片。` : "标准流程：先生成人物三视图和场景图，再以它们为参考为每个镜头生成关键帧，把关键帧做成视频，最后合成成片。"}</p>
                {nothing ? <p className="studio-hint">画面、视频和配音都已经生成好了，确认后直接合成成片。</p> : (
                    <table className="studio-quote-table">
                        <thead><tr><th>项目</th><th>模型</th><th>数量</th><th>积分</th></tr></thead>
                        <tbody>
                            {assetCount ? <CostLine id="assets" label="人物三视图和场景图" kind="image" ratio={story.ratio} seconds={5} count={assetCount} board config={config} onValue={onValue} /> : null}
                            {visualCount ? <CostLine id="visual" label={board ? "分镜板" : "关键帧"} kind="image" ratio={story.ratio} seconds={5} count={visualCount} board={board} config={config} onValue={onValue} /> : null}
                            {videoGroups.map(([seconds, count]) => <CostLine key={`video-${seconds}`} id={`video-${seconds}`} label={`${board ? "整段视频" : "镜头视频"} ${seconds} 秒`} kind="video" ratio={story.ratio} seconds={seconds} count={count} board={board} config={config} onValue={onValue} />)}
                            {voiceCount ? <CostLine id="voice" label="旁白配音" kind="audio" ratio={story.ratio} seconds={5} count={voiceCount} board={false} config={config} onValue={onValue} /> : null}
                        </tbody>
                        {creditsEnabled ? <tfoot><tr><td colSpan={3}>合计</td><td>{total === null ? "计算中…" : `约 ${formatCredits(total)} 积分`}</td></tr></tfoot> : null}
                    </table>
                )}
                <p className="studio-hint">合成成片不消耗积分；导演对话按实际用量另计。生成失败的部分会退回积分。</p>
            </div>
        </AppModal>
    );
}

function AskCard({ ask, active, onPick }: { ask: DirectorAsk; active: boolean; onPick: (option: string) => void }) {
    return (
        <article className="studio-ask-card" aria-label={ask.question}>
            <strong>{ask.question}</strong>
            <div>
                {ask.options.map((option, index) => (
                    <button key={option} type="button" disabled={!active} onClick={() => onPick(option)}><b>{index + 1}</b><span>{option}</span></button>
                ))}
            </div>
        </article>
    );
}

function SegmentCard({ segment, versions, busy, selected, onSelect, onGenerate }: { segment: DirectorSegment; versions: ReturnType<typeof directorVersionIndex>; busy: boolean; selected: boolean; onSelect: () => void; onGenerate: (step: "boards" | "videos") => void }) {
    const board = directorActiveWork(segment.anchor, "image", versions);
    const video = directorActiveWork(segment.anchor, "video", versions);
    const [boardOpen, setBoardOpen] = useState(false);
    const first = segment.shotNumbers[0];
    const last = segment.shotNumbers[segment.shotNumbers.length - 1];
    const boardReady = directorWorkReady(board);
    const videoReady = directorWorkReady(video);
    // 卡片始终显示分镜板，视频在左侧预览里播放；没有分镜板时才显示状态。
    const media = boardReady ? <img src={workMediaSrc(board)} alt={`第 ${segment.no} 段分镜板`} loading="lazy" />
        : directorWorkActive(board) ? <span className="studio-shot-state"><Loader2 className="studio-spin" aria-hidden />生成中</span>
            : board?.status === "failed" ? <span className="studio-shot-state is-failed">生成失败</span>
                : <span className="studio-shot-state">待生成分镜板</span>;
    return (
        <article className={`studio-segment${selected ? " is-selected" : ""}`} aria-label={`第 ${segment.no} 段`}>
            <button type="button" className="studio-segment-media" onClick={() => (boardReady ? setBoardOpen(true) : onSelect())} aria-label={boardReady ? `查看第 ${segment.no} 段分镜板` : `预览第 ${segment.no} 段`}>
                {media}
                <b>{segment.no}</b>
                <em>{segment.seconds}s</em>
                {videoReady ? <i>视频已完成</i> : directorWorkActive(video) ? <i><Loader2 className="studio-spin" aria-hidden />视频生成中</i> : video?.status === "failed" ? <i className="is-failed">视频生成失败</i> : null}
            </button>
            <footer>
                <span className="studio-hint">镜头 {first === last ? first : `${first}–${last}`}</span>
                <span style={{ flex: 1 }} />
                {videoReady ? <button type="button" className="studio-mini-button" aria-pressed={selected} onClick={onSelect}><Film aria-hidden />{selected ? "收起视频" : "播放视频"}</button> : null}
                <button type="button" className="studio-icon-button" title={directorWorkReady(board) ? "重做分镜板" : "生成分镜板"} aria-label={`生成第 ${segment.no} 段分镜板`} disabled={busy} onClick={() => onGenerate("boards")}><LayoutGrid aria-hidden /></button>
                <button type="button" className="studio-icon-button" title={directorWorkReady(video) ? "重做整段视频" : "按分镜板生成视频"} aria-label={`生成第 ${segment.no} 段视频`} disabled={busy || !directorWorkReady(board)} onClick={() => onGenerate("videos")}><Film aria-hidden /></button>
            </footer>
            {boardOpen && boardReady ? (
                <AppModal rootClassName="studio-modal studio-board-modal" open width={1100} title={`第 ${segment.no} 段分镜板 · 镜头 ${first === last ? first : `${first}–${last}`}`} footer={null} onCancel={() => setBoardOpen(false)}>
                    <img className="studio-board-full" src={workMediaSrc(board)} alt={`第 ${segment.no} 段分镜板`} />
                    <a className="studio-mini-button" href={workMediaSrc(board)} download={`分镜板-${segment.no}.png`} target="_blank" rel="noreferrer"><Download aria-hidden />下载分镜板</a>
                </AppModal>
            ) : null}
        </article>
    );
}

type FinalCardProps = {
    story: StudioStory;
    subtitles: boolean;
    busy: boolean;
    music?: DirectorMusic;
    onMusic: (music: DirectorMusic | undefined) => void;
    onDraft: (text: string) => void;
    onToggleSubtitles: () => void;
    onRender: () => void;
};

/** 成片卡：播放、下载，以及常用的下一步（换音乐、重做一段、字幕开关、改时长、重新合成）。 */
function FinalCard({ story, subtitles, busy, music, onMusic, onDraft, onToggleSubtitles, onRender }: FinalCardProps) {
    const [musicOpen, setMusicOpen] = useState(false);
    const resourceId = story.render!.resourceId!;
    return (
        <article className="studio-final-card" aria-label="成片">
            <header><Clapperboard aria-hidden /><strong>{story.title}</strong></header>
            <video key={resourceId} src={playbackVariantUrl(resourceId)} controls playsInline preload="metadata" />
            <a className="studio-mini-button is-primary" href={resourceFileUrl(resourceId)} download={`${story.title}.mp4`}><Download aria-hidden />下载成片</a>
            <div className="studio-final-actions">
                <Popover open={musicOpen} onOpenChange={setMusicOpen} trigger="click" placement="top" content={<MusicPicker current={music} onPick={(next) => { setMusicOpen(false); onMusic(next); }} />}>
                    <button type="button" className="studio-chip-button" disabled={busy}><Music aria-hidden />换背景音乐</button>
                </Popover>
                <button type="button" className="studio-chip-button" disabled={busy} onClick={() => onDraft("重做第 1 段：")}><RefreshCw aria-hidden />重做某一段</button>
                <button type="button" className="studio-chip-button" disabled={busy} onClick={onToggleSubtitles}><Type aria-hidden />{subtitles ? "去掉字幕" : "加上字幕"}</button>
                <button type="button" className="studio-chip-button" disabled={busy} onClick={() => onDraft(`把成片从 ${story.durationSeconds} 秒改成 `)}><Film aria-hidden />调整时长</button>
                <button type="button" className="studio-chip-button" disabled={busy} onClick={onRender}><Clapperboard aria-hidden />重新合成</button>
            </div>
        </article>
    );
}

function DesignAssetCard({ kind, asset, work, libraryImage, busy, onRetry }: { kind: "cast" | "location"; asset: DirectorDesignAsset; work?: StudioWork; libraryImage?: string; busy: boolean; onRetry: () => void }) {
    const [open, setOpen] = useState(false);
    const src = libraryImage || (directorWorkReady(work) ? workMediaSrc(work) : "");
    const label = kind === "cast" ? "三视图" : "场景图";
    return (
        <article className="studio-design-card" aria-label={`${asset.name} ${label}`}>
            <button type="button" className="studio-design-media" disabled={!src} onClick={() => setOpen(true)} aria-label={src ? `查看${asset.name}${label}` : `${asset.name}${label}`}>
                {src ? <img src={src} alt={`${asset.name}${label}`} loading="lazy" />
                    : directorWorkActive(work) ? <span className="studio-shot-state"><Loader2 className="studio-spin" aria-hidden />生成中</span>
                        : work && !directorWorkReady(work) ? <span className="studio-shot-state is-failed">生成失败</span>
                            : <span className="studio-shot-state">待生成{label}</span>}
            </button>
            <div className="studio-design-body">
                <strong>{asset.name}{libraryImage ? <small>角色库</small> : null}</strong>
                {asset.description ? <p>{asset.description}</p> : null}
            </div>
            {work && !directorWorkReady(work) && !directorWorkActive(work) ? <footer><button type="button" className="studio-mini-button" disabled={busy} onClick={onRetry}><RefreshCw aria-hidden />重新生成</button></footer> : null}
            {open && src ? (
                <AppModal rootClassName="studio-modal studio-board-modal" open width={1100} title={`${asset.name} · ${label}`} footer={null} onCancel={() => setOpen(false)}>
                    <img className="studio-board-full" src={src} alt={`${asset.name}${label}`} />
                </AppModal>
            ) : null}
        </article>
    );
}

/** 剧本与美术：剧本正文、人物三视图、场景图。三视图和场景图是后续关键帧和分镜板的参考。 */
function DesignPanel({ design, works, characters, pendingCount, busy, onGenerate }: { design: DirectorDesign; works: Map<string, StudioWork>; characters: DirectorCharacter[]; pendingCount: number; busy: boolean; onGenerate: () => void }) {
    if (!design.script && !design.cast.length && !design.locations.length) return null;
    const libraryImage = (name: string) => {
        const library = characters.find((item) => item.name === name);
        const attachment = library?.imageResourceIds.length ? studioCharacterAttachments({ ...library, updatedAt: "" })[0] : undefined;
        return attachment?.url || undefined;
    };
    return (
        <section className="studio-scene studio-design" aria-label="剧本与美术">
            <header>
                <strong>剧本与美术</strong>
                <span>人物三视图和场景图会作为每个画面的参考，保证人物和场景前后一致</span>
                <span style={{ flex: 1 }} />
                {design.cast.length || design.locations.length ? (
                    <button type="button" className="studio-mini-button" disabled={busy || !pendingCount} onClick={onGenerate}><Sparkles aria-hidden />{pendingCount ? `生成三视图和场景图（${pendingCount}）` : "三视图和场景图已完成"}</button>
                ) : null}
            </header>
            {design.script ? (
                <details className="studio-design-script">
                    <summary>剧本</summary>
                    <div>{design.script}</div>
                </details>
            ) : null}
            {design.cast.length ? (
                <>
                    <h4>人物</h4>
                    <div className="studio-design-grid">
                        {design.cast.map((asset) => <DesignAssetCard key={asset.name} kind="cast" asset={asset} work={asset.taskId ? works.get(asset.taskId) : undefined} libraryImage={libraryImage(asset.name)} busy={busy} onRetry={onGenerate} />)}
                    </div>
                </>
            ) : null}
            {design.locations.length ? (
                <>
                    <h4>场景</h4>
                    <div className="studio-design-grid">
                        {design.locations.map((asset) => <DesignAssetCard key={asset.name} kind="location" asset={asset} work={asset.taskId ? works.get(asset.taskId) : undefined} busy={busy} onRetry={onGenerate} />)}
                    </div>
                </>
            ) : null}
        </section>
    );
}
