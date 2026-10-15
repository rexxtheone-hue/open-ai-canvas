import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Popover } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, AudioLines, Check, Clapperboard, Download, Film, Image as ImageIcon, Loader2, Music, Pencil, Sparkles, Upload, X } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { useGenerationCredits } from "@/hooks/use-generation-credits";
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
    directorHistory,
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
    type DirectorRunStep,
    type DirectorShotFields,
} from "./studio-director";
import { studioBlockReason, studioGenerationConfig, studioModelRequirements } from "./studio-generation";
import { studioMediaSrc } from "./studio-library";
import { StudioShell } from "./studio-shell";
import { uploadStudioFile } from "./use-studio-tool";
import { notifyStudioWorksChanged } from "./use-studio-works";
import { useStudioBrandKits, studioBrandContext } from "./use-studio-brand";

type DirectorMessage = StudioChatMessage<DirectorRunAction>;
type GenerateStep = Exclude<DirectorRunStep, "render">;

const TEXT_MODEL_KEY = "studio.director.text-model.v1";
const STEP_KIND: Record<GenerateStep, StudioKind> = { images: "image", videos: "video", voice: "audio" };

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
    const textModel = textModels.includes(textModelChoice) ? textModelChoice : textModels.includes(config.textModel) ? config.textModel : textModels[0] || "";

    const [messages, setMessages] = useState<DirectorMessage[]>([]);
    const [chatLoaded, setChatLoaded] = useState(false);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [streaming, setStreaming] = useState<string | null>(null);
    const [working, setWorking] = useState("");
    const [selectedShotId, setSelectedShotId] = useState("");
    const [editing, setEditing] = useState<StudioShot | null>(null);
    const [musicOpen, setMusicOpen] = useState(false);
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
    const timeline = useMemo(() => (story ? buildDirectorTimeline(story, { music: settings.music, subtitles: brief.subtitles !== false }) : null), [brief.subtitles, settings.music, story]);

    const saveStory = async (patch: Partial<StudioStoryInput>) => {
        const current = storyRef.current;
        if (!current) return;
        setStory(await updateStudioStory(current.id, storyInput(current, patch)));
    };

    /** 按镜头逐个提交生成并登记为镜头的新版本。返回提交数量和第一条失败原因。 */
    const generateStep = async (step: GenerateStep, numbers?: number[]) => {
        const current = storyRef.current;
        if (!current) return { submitted: 0, error: "项目还没加载" };
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
        const built = buildDirectorTimeline(current, { music: settings.music, subtitles: brief.subtitles !== false });
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
                content: `${parsed.content}${notes}`.trim() || "（导演没有返回内容）",
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
    const attemptedRef = useRef<Record<GenerateStep, Set<string>>>({ images: new Set(), videos: new Set(), voice: new Set() });
    useEffect(() => {
        if (!autoRun || !story || working) return;
        if (storyHasActiveWork(story)) return;
        const pending = (step: GenerateStep) => directorStepTargets(story, step).filter((shot) => !attemptedRef.current[step].has(shot.id));
        const wantVoice = brief.voiceover !== false && kinds.includes("audio");
        const phases: GenerateStep[] = kinds.includes("image") ? ["images", ...(wantVoice ? (["voice"] as GenerateStep[]) : []), ...(kinds.includes("video") ? (["videos"] as GenerateStep[]) : [])] : [];
        for (const step of phases) {
            const targets = pending(step);
            if (step === "videos" && pending("images").length) break;
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
    const selectedShot = shots.find((shot) => shot.id === selectedShotId);
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
                        {messages.map((item) => (
                            <div key={item.id} className={`studio-chat-message is-${item.role}`}>
                                {item.content ? <div className="studio-chat-bubble">{item.content}</div> : null}
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
                        ))}
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
                            <select className="studio-chat-model" aria-label="导演模型" value={textModel} onChange={(event) => {
                                setTextModelChoice(event.target.value);
                                try {
                                    window.localStorage.setItem(TEXT_MODEL_KEY, event.target.value);
                                } catch {
                                    // 浏览器存储不可用时只在本页生效。
                                }
                            }}>
                                {textModels.length ? textModels.map((model) => <option key={model} value={model}>{modelDisplayName(config, model) || model}</option>) : <option value="">无可用模型</option>}
                            </select>
                            <span style={{ flex: 1 }} />
                            <button type="button" className="studio-icon-button studio-send-button" aria-label="发送" disabled={busy || !draft.trim()} onClick={() => void send()}>
                                {busy ? <Loader2 className="studio-spin" aria-hidden /> : <ArrowUp aria-hidden />}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="studio-director-main" aria-label="分镜与成片">
                    <header className="studio-director-bar">
                        <span className="studio-hint">{story.ratio} · 目标 {story.durationSeconds} 秒 · 当前 {(timeline.timeline.durationMs / 1000).toFixed(1)} 秒 · {shots.length} 个镜头</span>
                        <span style={{ flex: 1 }} />
                        {queued ? <span className="studio-hint"><Loader2 className="studio-spin" aria-hidden /> 排队中：同时运行的任务已满，完成后自动继续</span> : autoRun ? <span className="studio-hint"><Loader2 className="studio-spin" aria-hidden /> 正在自动制作</span> : null}
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("images")}><ImageIcon aria-hidden />生成画面</button>
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("videos")}><Film aria-hidden />生成视频</button>
                        <button type="button" className="studio-mini-button" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("voice")}><AudioLines aria-hidden />生成配音</button>
                        <button type="button" className="studio-mini-button is-primary" disabled={Boolean(working) || !shots.length} onClick={() => void runManual("render")}>{working === "render" ? <Loader2 className="studio-spin" aria-hidden /> : <Clapperboard aria-hidden />}合成成片</button>
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
                        <TimelineTrack label="画面" icon={<Film aria-hidden />} clips={timeline.timeline.clips.filter((clip) => clip.trackId === "video")} totalMs={totalMs} render={(clip) => `镜头 ${clip.shotNo}`} />
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
    onSelect: () => void;
    onMention: () => void;
    onEdit: () => void;
    onGenerate: (step: GenerateStep) => void;
    onActivate: (kind: StudioKind, versionId: string) => void;
};

function ShotCard({ shot, no, story, selected, busy, onSelect, onMention, onEdit, onGenerate, onActivate }: ShotCardProps) {
    const fields = directorShotFields(shot);
    const versions = directorVersionIndex(story);
    const voice = directorActiveWork(shot, "audio", versions);
    const shotVersions = story.versions.filter((version) => version.shotId === shot.id);
    const activeIds: Record<StudioKind, string | undefined> = { image: shot.activeImageVersionId, video: shot.activeVideoVersionId, audio: shot.activeVoiceVersionId };
    return (
        <article className={`studio-shot${selected ? " is-selected" : ""}`} aria-label={`镜头 ${no}`}>
            <button type="button" className="studio-shot-media" onClick={onSelect} aria-pressed={selected} aria-label={`预览镜头 ${no}`}>
                <ShotMedia shot={shot} versions={versions} />
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
                <button type="button" className="studio-icon-button" title="生成画面" aria-label={`生成镜头 ${no} 画面`} disabled={busy} onClick={() => onGenerate("images")}><ImageIcon aria-hidden /></button>
                <button type="button" className="studio-icon-button" title="生成视频" aria-label={`生成镜头 ${no} 视频`} disabled={busy} onClick={() => onGenerate("videos")}><Film aria-hidden /></button>
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
    const targets = action.step === "render" ? [] : directorStepTargets(story, action.step, action.shots);
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
                    {action.step === "render" ? <span className="studio-hint">合成不消耗积分</span> : <StepEstimate step={action.step} story={story} config={config} count={targets.length} />}
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
