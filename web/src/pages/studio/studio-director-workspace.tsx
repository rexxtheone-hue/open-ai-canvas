import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Popover } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, AudioLines, Check, Clapperboard, Download, Film, Image as ImageIcon, LayoutGrid, Loader2, Music, Pencil, RefreshCw, Sparkles, Type, Upload, X } from "./studio-icons";
import { Link, useParams, useSearchParams } from "react-router";

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
const STEP_KIND: Record<GenerateStep, StudioKind> = { boards: "image", images: "image", videos: "video", voice: "audio" };

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
    const productionMode: DirectorProductionMode = story ? directorProductionMode(story) : "board";
    const segments = useMemo(() => (story ? directorSegments(story) : []), [story]);
    const timeline = useMemo(() => (story ? buildDirectorTimeline(story, { music: settings.music, subtitles: brief.subtitles !== false, mode: directorProductionMode(story) }) : null), [brief.subtitles, settings.music, story]);

    const saveStory = async (patch: Partial<StudioStoryInput>) => {
        const current = storyRef.current;
        if (!current) return;
        setStory(await updateStudioStory(current.id, storyInput(current, patch)));
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
            const names = new Set(segment.shots.flatMap((shot) => directorShotFields(shot).characters));
            const attachments = step === "boards"
                ? characters.filter((item) => names.has(item.name)).flatMap((item) => studioCharacterAttachments({ ...item, updatedAt: "" })).slice(0, 4)
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
            const cast = directorShotCharacters(fields, characters);
            const image = directorActiveWork(shot, "image", index);
            const attachments = step === "images"
                ? cast.flatMap((item) => studioCharacterAttachments({ ...item, updatedAt: "" })).slice(0, 3)
                : step === "videos" && image?.media[0]
                    ? [{ id: `shot-image:${shot.id}`, name: `镜头画面`, type: image.media[0].mimeType || "image/png", url: studioMediaSrc(image.media[0]), dataUrl: studioMediaSrc(image.media[0]), storageKey: image.media[0].storageKey, previewUrl: studioMediaSrc(image.media[0]), width: image.media[0].width, height: image.media[0].height }]
                    : [];
            const prompt = step === "images" ? directorImagePrompt(fields, characters, style) : step === "videos" ? directorVideoPrompt(fields, style) : fields.voiceover;
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
            try {
                const result = await runBackendGenerationTask({
                    mode: "text",
                    prompt: content,
                    config: { ...config, model: textModel, textModel, systemPrompt: directorSystemPrompt({ story: current, characters, brand: brand?.prompt, kinds }) } as AiConfig,
                    textHistory: directorHistory(before),
                    metadata: { studioAgent: "director", storyId: current.id },
                    onTextDelta: (delta) => {
                        reply += delta;
                        setStreaming(directorVisibleText(reply));
                    },
                });
                reply = result.text || reply;
            } catch (cause) {
                setStreaming(null);
                setDraft(content);
                message.error(errorText(cause, "导演回复失败，请重试"));
                return;
            }
            setStreaming(null);
            const parsed = parseDirectorReply(reply, { characterNames: characters.map((item) => item.name), shotCount: directorOrderedShots(current).length });
            let notes = "";
            if (parsed.plan) {
                try {
                    let updated = await replaceStudioStoryPlan(current.id, parsed.plan.scenes);
                    if (parsed.plan.title || parsed.plan.memory) {
                        updated = await updateStudioStory(current.id, storyInput(updated, { ...(parsed.plan.title ? { title: parsed.plan.title } : {}), ...(parsed.plan.memory ? { memory: parsed.plan.memory } : {}) }));
                    }
                    setStory(updated);
                    storyRef.current = updated;
                    const count = parsed.plan.scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
                    const total = parsed.plan.scenes.reduce((sum, scene) => sum + scene.shots.reduce((inner, shot) => inner + shot.durationSeconds, 0), 0);
                    notes = `\n\n已更新分镜：${count} 个镜头，共 ${total} 秒。`;
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

    // 「直接做」：分镜写好后依次生成画面和配音 → 视频 → 合成。每个镜头每一步只自动尝试一次，失败的留给用户处理。
    const attemptedRef = useRef<Record<GenerateStep, Set<string>>>({ boards: new Set(), images: new Set(), videos: new Set(), voice: new Set() });
    useEffect(() => {
        if (!autoRun || !story || working) return;
        if (storyHasActiveWork(story)) return;
        const board = directorProductionMode(story) === "board";
        // 分镜板模式按段落推进（段落第一个镜头代表整段），逐镜头模式按镜头推进。
        const pending = (step: GenerateStep) => {
            const shotsForStep = board && step !== "voice"
                ? directorBoardTargets(story, step === "videos" ? "videos" : "boards").map((segment) => segment.anchor)
                : directorStepTargets(story, step === "boards" ? "images" : step);
            return shotsForStep.filter((shot) => !attemptedRef.current[step].has(shot.id));
        };
        const wantVoice = brief.voiceover !== false && kinds.includes("audio");
        const visualStep: GenerateStep = board ? "boards" : "images";
        const phases: GenerateStep[] = kinds.includes("image") ? [visualStep, ...(wantVoice ? (["voice"] as GenerateStep[]) : []), ...(kinds.includes("video") ? (["videos"] as GenerateStep[]) : [])] : [];
        for (const step of phases) {
            const targets = pending(step);
            if (step === "videos" && pending(visualStep).length) break;
            if (!targets.length) continue;
            targets.forEach((shot) => attemptedRef.current[step].add(shot.id));
            setWorking(step);
            void generateStep(step, targets.map((shot) => shots.indexOf(shot) + 1)).then((result) => {
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
    }, [autoRun, story, working]);

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
                                {parts.text ? <div className="studio-chat-bubble">{parts.text}</div> : null}
                                {parts.ask && item.role === "assistant" ? (
                                    <AskCard ask={parts.ask} active={latest && !busy && streaming === null} onPick={(option) => void send(directorAskAnswer(parts.ask!, option))} />
                                ) : null}
                                {(item.actions || []).map((action) => (
                                    <RunCard
                                        key={action.id}
                                        action={action}
                                        story={story}
                                        config={config}
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
                            <button type="button" aria-pressed={productionMode === "board"} title="每段先出一张分镜板，再一次生成整段视频，人物和场景更一致" disabled={Boolean(working)} onClick={() => void saveStory({ settings: { ...settings, mode: "board" } })}>分镜板</button>
                            <button type="button" aria-pressed={productionMode === "shots"} title="每个镜头单独生成画面和视频，方便逐个调整" disabled={Boolean(working)} onClick={() => void saveStory({ settings: { ...settings, mode: "shots" } })}>逐镜头</button>
                        </div>
                        <span style={{ flex: 1 }} />
                        {queued ? <span className="studio-hint"><Loader2 className="studio-spin" aria-hidden /> 排队中：同时运行的任务已满，完成后自动继续</span> : autoRun ? <span className="studio-hint"><Loader2 className="studio-spin" aria-hidden /> 正在自动制作</span> : null}
                        <button type="button" className="studio-mini-button is-primary" disabled={Boolean(working) || autoRun || !shots.length} onClick={() => setQuoteOpen(true)}><Sparkles aria-hidden />一键制作</button>
                        {productionMode === "board" ? (
                            <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("boards")}><LayoutGrid aria-hidden />生成分镜板</button>
                        ) : (
                            <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("images")}><ImageIcon aria-hidden />生成画面</button>
                        )}
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("videos")}><Film aria-hidden />生成视频</button>
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("voice")}><AudioLines aria-hidden />生成配音</button>
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("render")}>{working === "render" ? <Loader2 className="studio-spin" aria-hidden /> : <Clapperboard aria-hidden />}合成成片</button>
                        {renderReady ? <a className="studio-mini-button" href={resourceFileUrl(story.render!.resourceId!)} download={`${story.title}.mp4`}><Download aria-hidden />导出</a> : null}
                    </header>

                    <div className="studio-director-body">
                        <div className="studio-director-preview">
                            <div className={`studio-director-player is-${story.ratio.replace(":", "x")}`}>
                                {selectedShot ? <ShotMedia shot={selectedShot} versions={versions} controls /> : renderReady ? (
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
                            {!shots.length ? <div className="studio-empty"><Sparkles aria-hidden /><strong>还没有分镜</strong><span>在左边告诉导演你的想法。</span></div> : null}
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
                voiceover={brief.voiceover !== false && kinds.includes("audio")}
                onClose={() => setQuoteOpen(false)}
                onConfirm={() => {
                    setQuoteOpen(false);
                    attemptedRef.current = { boards: new Set(), images: new Set(), videos: new Set(), voice: new Set() };
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

function ShotMedia({ shot, versions, controls = false }: { shot: StudioShot; versions: ReturnType<typeof directorVersionIndex>; controls?: boolean }) {
    const video = directorActiveWork(shot, "video", versions);
    const image = directorActiveWork(shot, "image", versions);
    if (directorWorkReady(video)) return <video src={workMediaSrc(video)} controls={controls} muted={!controls} playsInline preload="metadata" />;
    if (directorWorkReady(image)) return <img src={workMediaSrc(image)} alt="" loading="lazy" />;
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
                {segmentNo ? <span className="studio-shot-state">第 {segmentNo} 段</span> : <ShotMedia shot={shot} versions={versions} />}
                <b>{no}</b>
                <em>{shot.durationSeconds}s</em>
            </button>
            <div className="studio-shot-body">
                <p>{fields.visual}</p>
                {fields.camera ? <small>{fields.camera}</small> : null}
                {fields.characters.length ? <small>角色：{fields.characters.join("、")}</small> : null}
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

function RunCard({ action, story, config, disabled, onConfirm, onSkip }: { action: DirectorRunAction; story: StudioStory; config: AiConfig; disabled: boolean; onConfirm: () => void; onSkip: () => void }) {
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
                            : <StepEstimate step={action.step === "boards" ? "images" : action.step} story={story} config={config} count={targets.length} />}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="studio-mini-button" disabled={disabled} onClick={onSkip}>跳过</button>
                    <button type="button" className="studio-mini-button is-primary" disabled={disabled || (action.step !== "render" && !targets.length)} onClick={onConfirm}><Check aria-hidden />执行</button>
                </footer>
            ) : null}
        </article>
    );
}

/** 估算一步的积分：取一个代表镜头的报价乘以镜头数，视频按最常见的镜头时长估。 */
function StepEstimate({ step, story, config, count }: { step: GenerateStep; story: StudioStory; config: AiConfig; count: number }) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const kind = STEP_KIND[step];
    const seconds = useMemo(() => {
        const counts = new Map<number, number>();
        for (const shot of story.shots) counts.set(shot.durationSeconds, (counts.get(shot.durationSeconds) || 0) + 1);
        return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 5;
    }, [story.shots]);
    const { state, model } = useMemo(() => studioAgentToolState(config, { kind, prompt: "示例", ratio: story.ratio, seconds, tool: "director" }), [config, kind, seconds, story.ratio]);
    const requirements = useMemo(() => studioModelRequirements(config, state), [config, state]);
    const generationConfig = useMemo(() => (model ? studioGenerationConfig(config, state, model) : config), [config, model, state]);
    const { credits } = useGenerationCredits({ config: generationConfig, model, mode: kind, count: 1, seconds: state.video.seconds, requirements });
    if (!count) return <span className="studio-hint">没有需要处理的镜头</span>;
    return <span className="studio-hint">{count} 个镜头 · {model ? modelDisplayName(config, model) || model : "无可用模型"}{creditsEnabled && credits !== null ? ` · 约 ${(credits * count).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 积分` : ""}</span>;
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
function ProductionQuote({ open, story, config, mode, voiceover, onClose, onConfirm }: { open: boolean; story: StudioStory; config: AiConfig; mode: DirectorProductionMode; voiceover: boolean; onClose: () => void; onConfirm: () => void }) {
    if (!open) return null;
    return <ProductionQuoteBody story={story} config={config} mode={mode} voiceover={voiceover} onClose={onClose} onConfirm={onConfirm} />;
}

function ProductionQuoteBody({ story, config, mode, voiceover, onClose, onConfirm }: { story: StudioStory; config: AiConfig; mode: DirectorProductionMode; voiceover: boolean; onClose: () => void; onConfirm: () => void }) {
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
    const nothing = !visualCount && !videoGroups.length && !voiceCount;
    return (
        <AppModal rootClassName="studio-modal" open title="一键制作 · 积分报价" okText={nothing ? "直接合成" : "确认制作"} cancelText="取消" onCancel={onClose} onOk={onConfirm}>
            <div className="studio-popup studio-form-stack">
                <p className="studio-hint">{board ? `分镜板模式：共 ${segments.length} 段。每段先出一张分镜板，再按分镜板一次生成整段视频，最后加上配音、字幕和音乐合成成片。` : "逐镜头模式：每个镜头分别生成画面和视频，最后合成成片。"}</p>
                {nothing ? <p className="studio-hint">画面、视频和配音都已经生成好了，确认后直接合成成片。</p> : (
                    <table className="studio-quote-table">
                        <thead><tr><th>项目</th><th>模型</th><th>数量</th><th>积分</th></tr></thead>
                        <tbody>
                            {visualCount ? <CostLine id="visual" label={board ? "分镜板" : "镜头画面"} kind="image" ratio={story.ratio} seconds={5} count={visualCount} board={board} config={config} onValue={onValue} /> : null}
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
    const first = segment.shotNumbers[0];
    const last = segment.shotNumbers[segment.shotNumbers.length - 1];
    const media = directorWorkReady(video) ? <video src={workMediaSrc(video)} muted playsInline preload="metadata" />
        : directorWorkReady(board) ? <img src={workMediaSrc(board)} alt="" loading="lazy" />
            : directorWorkActive(board) || directorWorkActive(video) ? <span className="studio-shot-state"><Loader2 className="studio-spin" aria-hidden />生成中</span>
                : board?.status === "failed" || video?.status === "failed" ? <span className="studio-shot-state is-failed">生成失败</span>
                    : <span className="studio-shot-state">待生成分镜板</span>;
    return (
        <article className={`studio-segment${selected ? " is-selected" : ""}`} aria-label={`第 ${segment.no} 段`}>
            <button type="button" className="studio-segment-media" onClick={onSelect} aria-pressed={selected} aria-label={`预览第 ${segment.no} 段`}>
                {media}
                <b>{segment.no}</b>
                <em>{segment.seconds}s</em>
            </button>
            <footer>
                <span className="studio-hint">镜头 {first === last ? first : `${first}–${last}`}{directorWorkReady(video) ? " · 视频已完成" : directorWorkReady(board) ? " · 分镜板已完成" : ""}</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="studio-icon-button" title={directorWorkReady(board) ? "重做分镜板" : "生成分镜板"} aria-label={`生成第 ${segment.no} 段分镜板`} disabled={busy} onClick={() => onGenerate("boards")}><LayoutGrid aria-hidden /></button>
                <button type="button" className="studio-icon-button" title={directorWorkReady(video) ? "重做整段视频" : "按分镜板生成视频"} aria-label={`生成第 ${segment.no} 段视频`} disabled={busy || !directorWorkReady(board)} onClick={() => onGenerate("videos")}><Film aria-hidden /></button>
            </footer>
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
