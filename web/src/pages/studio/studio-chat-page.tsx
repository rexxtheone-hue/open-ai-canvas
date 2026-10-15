import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Popover } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, Loader2, MessageSquarePlus, Paperclip, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { useGenerationCredits } from "@/hooks/use-generation-credits";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { runBackendGenerationTask } from "@/services/api/generation-task";
import type { StudioKind, StudioWork } from "@/services/api/studio";
import {
    appendStudioChatMessage,
    createStudioChat,
    deleteStudioChat,
    getStudioChat,
    listStudioChats,
    lookupStudioWorks,
    renameStudioChat,
    updateStudioChatActions,
    type StudioChatMessage,
} from "@/services/api/studio-agents";
import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { studioAgentToolState, submitStudioAgentGeneration } from "./studio-agent";
import { studioBlockReason, studioGenerationConfig, studioModelRequirements } from "./studio-generation";
import { StudioCharacterPicker } from "./studio-character-picker";
import {
    parseStudioChatReply,
    STUDIO_CHAT_MAX_ATTACHMENTS,
    studioChatAssets,
    studioChatAttachmentFromCreation,
    studioChatAttachmentFromWork,
    studioChatAttachmentToCreation,
    studioChatHistory,
    studioChatSystemPrompt,
    studioChatVisibleText,
    studioKindLabel,
    type StudioChatAction,
    type StudioChatAsset,
    type StudioChatAttachment,
    type StudioRunMode,
} from "./studio-chat";
import { StudioLibrary, studioMediaSrc } from "./studio-library";
import { StudioShell } from "./studio-shell";
import { StudioPanelFooter } from "./studio-workspace";
import { uploadStudioFile } from "./use-studio-tool";
import { notifyStudioWorksChanged } from "./use-studio-works";

type ChatMessage = StudioChatMessage<StudioChatAction, StudioChatAttachment>;

const RUN_MODE_KEY = "studio.chat.run-mode.v1";
const TEXT_MODEL_KEY = "studio.chat.text-model.v1";
const SUGGESTIONS = ["做一张咖啡新品海报，暖色调，留出标题位置", "把这张产品图做成 5 秒的旋转展示视频", "写一段 15 秒的促销口播并配音"];

function readLocal(key: string) {
    try {
        return window.localStorage.getItem(key) || "";
    } catch {
        return "";
    }
}

function writeLocal(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // 浏览器存储不可用时只在本页生效。
    }
}

function errorText(cause: unknown, fallback: string) {
    return cause instanceof Error && cause.message ? cause.message : fallback;
}

function workActive(work: StudioWork | undefined) {
    return !work || work.status === "queued" || work.status === "running";
}

export default function StudioChatPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const config = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const [params, setParams] = useSearchParams();
    const sessionId = params.get("c") || "";
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingChat, setLoadingChat] = useState(false);
    const [draft, setDraft] = useState("");
    const [pending, setPending] = useState<StudioChatAttachment[]>([]);
    const [uploading, setUploading] = useState(0);
    const [busy, setBusy] = useState(false);
    const [streaming, setStreaming] = useState<string | null>(null);
    const [runMode, setRunModeState] = useState<StudioRunMode>(() => (readLocal(RUN_MODE_KEY) === "auto" ? "auto" : "ask"));
    const textModels = useMemo(() => selectableModelsByCapability(config, "text"), [config]);
    const [textModelChoice, setTextModelChoice] = useState(() => readLocal(TEXT_MODEL_KEY));
    const textModel = textModels.includes(textModelChoice) ? textModelChoice : textModels.includes(config.textModel) ? config.textModel : textModels[0] || "";
    const kinds = useMemo(() => (["image", "video", "audio"] as StudioKind[]).filter((kind) => selectableModelsByCapability(config, kind).length > 0), [config]);
    const [sessionsOpen, setSessionsOpen] = useState(false);
    const [characterOpen, setCharacterOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const loadedRef = useRef("");
    const [queued, setQueued] = useState(false);
    // 离开页面时停止排队中的提交。
    const leaveRef = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        leaveRef.current = controller;
        return () => controller.abort();
    }, []);

    const sessionsQuery = useQuery({ queryKey: ["studio", "chats"], queryFn: async () => (await listStudioChats("chat")).items, enabled: Boolean(user) });
    const sessions = sessionsQuery.data || [];
    const current = sessions.find((item) => item.id === sessionId);

    const setRunMode = (mode: StudioRunMode) => {
        setRunModeState(mode);
        writeLocal(RUN_MODE_KEY, mode);
    };

    // 切换会话时读取消息；本页刚建的会话已有本地消息，不重复读取。
    useEffect(() => {
        if (!sessionId) {
            loadedRef.current = "";
            setMessages([]);
            return;
        }
        if (loadedRef.current === sessionId) return;
        const controller = new AbortController();
        setLoadingChat(true);
        getStudioChat<StudioChatAction, StudioChatAttachment>(sessionId, controller.signal)
            .then((view) => {
                loadedRef.current = sessionId;
                setMessages(view.messages);
            })
            .catch((cause) => {
                if (controller.signal.aborted) return;
                message.error(errorText(cause, "对话读取失败"));
                setParams({}, { replace: true });
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingChat(false);
            });
        return () => controller.abort();
    }, [message, sessionId, setParams]);

    const taskIds = useMemo(() => [...new Set(messages.flatMap((item) => (item.actions || []).flatMap((action) => action.taskIds || [])))], [messages]);
    const worksQuery = useQuery({
        queryKey: ["studio", "chat-works", taskIds],
        queryFn: async ({ signal }) => (await lookupStudioWorks(taskIds, signal)).works,
        enabled: taskIds.length > 0,
        refetchInterval: (query) => {
            const works = query.state.data || [];
            return taskIds.some((id) => workActive(works.find((work) => work.id === id))) ? 4000 : false;
        },
    });
    const works = useMemo(() => new Map((worksQuery.data || []).map((work) => [work.id, work])), [worksQuery.data]);
    const assets = useMemo(() => studioChatAssets(messages, works), [messages, works]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages, streaming]);

    // 从 Studio 首页带来的需求（?q=）：开一个新对话并自动发送一次，随后从地址栏移除。
    const handoffRef = useRef(false);

    const addPending = useCallback((items: StudioChatAttachment[]) => {
        setPending((list) => {
            const next = [...list];
            for (const item of items) if (!next.some((existing) => existing.id === item.id)) next.push(item);
            if (next.length > STUDIO_CHAT_MAX_ATTACHMENTS) message.warning(`一次最多附带 ${STUDIO_CHAT_MAX_ATTACHMENTS} 个素材`);
            return next.slice(0, STUDIO_CHAT_MAX_ATTACHMENTS);
        });
    }, [message]);

    const uploadFiles = async (files: File[]) => {
        setUploading((count) => count + files.length);
        for (const file of files) {
            try {
                const uploaded = studioChatAttachmentFromCreation(await uploadStudioFile(file));
                if (!uploaded) throw new Error("文件没有保存到云端");
                addPending([uploaded]);
            } catch (cause) {
                message.error(`${file.name}：${errorText(cause, "上传失败")}`);
            } finally {
                setUploading((count) => Math.max(0, count - 1));
            }
        }
    };

    const addWorks = (list: StudioWork[]) => {
        addPending(list.flatMap((work) => (work.media[0] ? [studioChatAttachmentFromWork(work, work.media[0])] : [])));
        inputRef.current?.focus();
    };

    const replaceMessage = (next: ChatMessage) => setMessages((list) => list.map((item) => (item.id === next.id ? next : item)));

    /** 执行一项生成计划：参考素材按编号取，提交后回写状态。 */
    const runAction = async (sessionKey: string, owner: ChatMessage, action: StudioChatAction, snapshot: StudioChatAsset[]) => {
        const refs = (action.refs || []).map((index) => snapshot.find((asset) => asset.index === index)).filter((asset): asset is StudioChatAsset => Boolean(asset?.attachment));
        const { state, model } = studioAgentToolState(config, { kind: action.kind, prompt: action.prompt, ratio: action.ratio, seconds: action.seconds, count: action.count, attachments: refs.map((asset) => asset.attachment!), tool: "chat" });
        const reason = studioBlockReason(config, state, model, { loggedIn: Boolean(user), creditsEnabled: false, availableCredits: null, cost: null });
        let next: StudioChatAction;
        if (reason) {
            next = { ...action, status: "failed", error: reason };
        } else {
            const result = await submitStudioAgentGeneration(config, state, model, { studioAgent: "chat" }, { signal: leaveRef.current?.signal, onWaiting: setQueued });
            next = result.taskIds.length ? { ...action, status: "submitted", taskIds: result.taskIds, model, error: result.error || undefined } : { ...action, status: "failed", error: result.error || "提交失败" };
            if (result.taskIds.length) notifyStudioWorksChanged();
        }
        return { owner, next, sessionKey };
    };

    const settleActions = async (sessionKey: string, owner: ChatMessage, updates: Map<string, StudioChatAction>) => {
        const actions = (owner.actions || []).map((item) => updates.get(item.id) || item);
        const optimistic = { ...owner, actions };
        replaceMessage(optimistic);
        try {
            replaceMessage(await updateStudioChatActions<StudioChatAction, StudioChatAttachment>(sessionKey, owner.id, actions));
        } catch (cause) {
            message.error(errorText(cause, "生成状态保存失败"));
        }
        return optimistic;
    };

    const confirmAction = async (owner: ChatMessage, action: StudioChatAction, prompt: string) => {
        if (!sessionId || busy) return;
        setBusy(true);
        try {
            const { next } = await runAction(sessionId, owner, { ...action, prompt: prompt.trim() || action.prompt }, assets);
            await settleActions(sessionId, owner, new Map([[action.id, next]]));
            if (next.status === "failed") message.error(next.error || "提交失败");
        } finally {
            setBusy(false);
        }
    };

    const skipAction = async (owner: ChatMessage, action: StudioChatAction) => {
        if (!sessionId) return;
        await settleActions(sessionId, owner, new Map([[action.id, { ...action, status: "skipped" }]]));
    };

    const send = async (text = draft) => {
        const content = text.trim();
        if (busy || uploading || (!content && !pending.length)) return;
        if (!user) {
            navigate(`/login?next=${encodeURIComponent("/studio/agents")}`);
            return;
        }
        if (!textModel) {
            message.error("后台还没有可用的对话模型");
            return;
        }
        setBusy(true);
        const attachments = pending;
        try {
            let key = sessionId;
            if (!key) {
                const created = await createStudioChat();
                key = created.id;
                loadedRef.current = key;
                setParams({ c: key }, { replace: true });
            }
            const userMessage = await appendStudioChatMessage<StudioChatAction, StudioChatAttachment>(key, { role: "user", content, attachments: attachments.length ? attachments : undefined });
            setDraft("");
            setPending([]);
            const before = messages;
            const withUser = [...before, userMessage];
            setMessages(withUser);
            void queryClient.invalidateQueries({ queryKey: ["studio", "chats"] });

            const snapshot = studioChatAssets(withUser, works);
            const newRefs = snapshot.slice(snapshot.length - attachments.length).map((asset) => `#${asset.index} ${studioKindLabel(asset.kind)}`);
            const prompt = [content, newRefs.length ? `（附件：${newRefs.join("、")}）` : ""].filter(Boolean).join("\n") || "（发送了附件）";
            setStreaming("");
            let reply = "";
            try {
                const result = await runBackendGenerationTask({
                    mode: "text",
                    prompt,
                    config: { ...config, model: textModel, textModel, systemPrompt: studioChatSystemPrompt({ kinds, assets: snapshot }) } as AiConfig,
                    textHistory: studioChatHistory(before),
                    metadata: { studioAgent: "chat" },
                    onTextDelta: (delta) => {
                        reply += delta;
                        setStreaming(studioChatVisibleText(reply));
                    },
                });
                reply = result.text || reply;
            } catch (cause) {
                setStreaming(null);
                message.error(errorText(cause, "AI 回复失败，请重试"));
                setDraft(content);
                return;
            }
            setStreaming(null);
            const parsed = parseStudioChatReply(reply, { kinds, assetCount: snapshot.length });
            const assistant = await appendStudioChatMessage<StudioChatAction, StudioChatAttachment>(key, {
                role: "assistant",
                content: parsed.content || (parsed.actions.length ? "" : "（AI 没有返回内容）"),
                actions: parsed.actions.length ? parsed.actions : undefined,
            });
            setMessages([...withUser, assistant]);
            if (runMode === "auto" && parsed.actions.length) {
                const updates = new Map<string, StudioChatAction>();
                for (const action of parsed.actions) {
                    const { next } = await runAction(key, assistant, action, snapshot);
                    updates.set(action.id, next);
                }
                await settleActions(key, assistant, updates);
                const failed = [...updates.values()].find((item) => item.status === "failed");
                if (failed) message.error(failed.error || "部分生成提交失败");
            }
        } catch (cause) {
            message.error(errorText(cause, "发送失败，请重试"));
        } finally {
            setBusy(false);
            setStreaming(null);
        }
    };

    useEffect(() => {
        const text = params.get("q")?.trim();
        if (!text || handoffRef.current || !user) return;
        handoffRef.current = true;
        setParams({}, { replace: true });
        void send(text);
        // send 只在首次带入时触发一次。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params, user]);

    const newChat = () => {
        setSessionsOpen(false);
        setParams({}, { replace: false });
        setDraft("");
        setPending([]);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const renameChat = (id: string, title: string) => {
        let value = title;
        modal.confirm({
            title: "重命名对话",
            icon: null,
            content: <input className="studio-chat-rename" defaultValue={title} maxLength={60} aria-label="对话标题" onChange={(event) => { value = event.target.value; }} />,
            okText: "保存",
            cancelText: "取消",
            onOk: async () => {
                await renameStudioChat(id, value);
                await queryClient.invalidateQueries({ queryKey: ["studio", "chats"] });
            },
        });
    };

    const removeChat = (id: string) => {
        modal.confirm({
            title: "删除这段对话？",
            content: "对话记录会被删除，已生成的作品仍保留在作品库。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await deleteStudioChat(id);
                if (id === sessionId) newChat();
                await queryClient.invalidateQueries({ queryKey: ["studio", "chats"] });
            },
        });
    };

    const sessionList = (
        <div className="studio-popup studio-chat-sessions">
            <button type="button" className="studio-list-item" onClick={newChat}><Plus aria-hidden />新对话</button>
            {sessions.length ? sessions.map((item) => (
                <div key={item.id} className="studio-chat-session-row" aria-current={item.id === sessionId ? "true" : undefined}>
                    <button type="button" className="studio-list-item" aria-current={item.id === sessionId ? "true" : undefined} onClick={() => { setSessionsOpen(false); setParams({ c: item.id }); }}>
                        <span>{item.title}</span>
                    </button>
                    <button type="button" className="studio-icon-button" aria-label={`重命名 ${item.title}`} onClick={() => renameChat(item.id, item.title)}><Pencil aria-hidden /></button>
                    <button type="button" className="studio-icon-button" aria-label={`删除 ${item.title}`} onClick={() => removeChat(item.id)}><Trash2 aria-hidden /></button>
                </div>
            )) : <p className="studio-hint">还没有历史对话</p>}
        </div>
    );

    const assetByTask = new Map(assets.filter((asset) => asset.taskId).map((asset) => [asset.taskId!, asset]));

    return (
        <StudioShell title="对话">
            <div className="studio-workspace">
                <section className="studio-left-panel studio-chat-panel" aria-label="对话">
                    <header className="studio-chat-head">
                        <Popover open={sessionsOpen} onOpenChange={setSessionsOpen} trigger="click" placement="bottomLeft" arrow={false} content={sessionList}>
                            <button type="button" className="studio-chat-title" aria-label="切换对话">
                                <span>{current?.title || "新对话"}</span>
                                <ChevronDown aria-hidden />
                            </button>
                        </Popover>
                        <button type="button" className="studio-icon-button" aria-label="新对话" title="新对话" onClick={newChat}><MessageSquarePlus aria-hidden /></button>
                    </header>

                    <div className="studio-chat-scroll" ref={scrollRef}>
                        {loadingChat ? <div className="studio-empty"><Loader2 className="studio-spin" aria-hidden /></div> : null}
                        {!loadingChat && !messages.length && streaming === null ? (
                            <div className="studio-chat-welcome">
                                <h2>说出想法，马上做出来</h2>
                                <p>描述你要的图片、视频或配音，可以附上参考素材。</p>
                                <div className="studio-suggestions">
                                    {SUGGESTIONS.map((item) => <button key={item} type="button" onClick={() => { setDraft(item); inputRef.current?.focus(); }}>{item}</button>)}
                                </div>
                            </div>
                        ) : null}
                        {messages.map((item) => (
                            <div key={item.id} className={`studio-chat-message is-${item.role}`}>
                                {item.attachments?.length ? (
                                    <div className="studio-chat-attachments">
                                        {item.attachments.map((attachment) => <AttachmentThumb key={attachment.id} item={attachment} />)}
                                    </div>
                                ) : null}
                                {item.content ? <div className="studio-chat-bubble">{item.content}</div> : null}
                                {(item.actions || []).map((action) => (
                                    <ActionCard
                                        key={action.id}
                                        action={action}
                                        config={config}
                                        assets={assets}
                                        works={works}
                                        assetByTask={assetByTask}
                                        disabled={busy}
                                        onConfirm={(prompt) => void confirmAction(item, action, prompt)}
                                        onSkip={() => void skipAction(item, action)}
                                    />
                                ))}
                            </div>
                        ))}
                        {streaming !== null ? (
                            <div className="studio-chat-message is-assistant">
                                <div className="studio-chat-bubble">{streaming || <Loader2 className="studio-spin" aria-label="AI 正在思考" />}</div>
                            </div>
                        ) : null}
                    </div>

                    {queued ? <p className="studio-hint studio-chat-queued"><Loader2 className="studio-spin" aria-hidden />排队中：同时运行的任务已满，完成后自动继续提交</p> : null}
                    <div className="studio-chat-composer">
                        {pending.length || uploading ? (
                            <div className="studio-chat-attachments is-pending">
                                {pending.map((item) => (
                                    <span key={item.id} className="studio-chat-pending">
                                        <AttachmentThumb item={item} />
                                        <button type="button" aria-label={`移除 ${item.name}`} onClick={() => setPending((list) => list.filter((entry) => entry.id !== item.id))}><X aria-hidden /></button>
                                    </span>
                                ))}
                                {uploading ? <span className="studio-chat-thumb"><Loader2 className="studio-spin" aria-label="上传中" /></span> : null}
                            </div>
                        ) : null}
                        <textarea
                            ref={inputRef}
                            value={draft}
                            placeholder="说出你的想法，AI 帮你做出来"
                            aria-label="对话内容"
                            onChange={(event) => setDraft(event.target.value)}
                            onPaste={(event) => {
                                const files = [...event.clipboardData.files].filter((file) => /^(image|video|audio)\//.test(file.type));
                                if (files.length) {
                                    event.preventDefault();
                                    void uploadFiles(files);
                                }
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    void send();
                                }
                            }}
                        />
                        <div className="studio-chat-bar">
                            <Popover trigger="click" placement="topLeft" arrow={false} content={(
                                <div className="studio-popup studio-chat-menu">
                                    <button type="button" className="studio-list-item" onClick={() => fileRef.current?.click()}><Paperclip aria-hidden />上传图片、视频或音频</button>
                                    <button type="button" className="studio-list-item" onClick={() => setCharacterOpen(true)}><UserRound aria-hidden />从角色库选择</button>
                                </div>
                            )}>
                                <button type="button" className="studio-icon-button" aria-label="添加素材" title="添加素材"><Plus aria-hidden /></button>
                            </Popover>
                            <input ref={fileRef} type="file" hidden multiple accept="image/*,video/*,audio/*" onChange={(event) => {
                                const files = [...(event.target.files || [])];
                                event.target.value = "";
                                if (files.length) void uploadFiles(files);
                            }} />
                            <div className="studio-chat-mode" role="group" aria-label="执行方式">
                                <button type="button" aria-pressed={runMode === "ask"} title="先给出生成计划，确认后再生成" onClick={() => setRunMode("ask")}>先问我</button>
                                <button type="button" aria-pressed={runMode === "auto"} title="直接按计划生成" onClick={() => setRunMode("auto")}>直接做</button>
                            </div>
                            <select className="studio-chat-model" aria-label="对话模型" value={textModel} onChange={(event) => { setTextModelChoice(event.target.value); writeLocal(TEXT_MODEL_KEY, event.target.value); }}>
                                {textModels.length ? textModels.map((model) => <option key={model} value={model}>{modelDisplayName(config, model) || model}</option>) : <option value="">无可用模型</option>}
                            </select>
                            <span style={{ flex: 1 }} />
                            <button type="button" className="studio-icon-button studio-send-button" aria-label="发送" disabled={busy || uploading > 0 || (!draft.trim() && !pending.length)} onClick={() => void send()}>
                                {busy ? <Loader2 className="studio-spin" aria-hidden /> : <ArrowUp aria-hidden />}
                            </button>
                        </div>
                    </div>
                    <StudioPanelFooter active="chat" />
                </section>
                <div className="studio-right-panel">
                    <StudioLibrary onAddToChat={addWorks} />
                </div>
            </div>
            <StudioCharacterPicker
                open={characterOpen}
                onClose={() => setCharacterOpen(false)}
                onPick={(items) => {
                    setCharacterOpen(false);
                    addPending(items);
                }}
            />
        </StudioShell>
    );
}

function AttachmentThumb({ item }: { item: StudioChatAttachment }) {
    const creation = studioChatAttachmentToCreation(item);
    const src = creation.previewUrl;
    return (
        <span className="studio-chat-thumb" title={item.name}>
            {item.kind === "image" ? <img src={src} alt={item.name} loading="lazy" /> : item.kind === "video" ? <video src={src} muted playsInline preload="metadata" /> : <span className="studio-chat-audio">音频</span>}
        </span>
    );
}

type ActionCardProps = {
    action: StudioChatAction;
    config: AiConfig;
    assets: StudioChatAsset[];
    works: Map<string, StudioWork>;
    assetByTask: Map<string, StudioChatAsset>;
    disabled: boolean;
    onConfirm: (prompt: string) => void;
    onSkip: () => void;
};

function ActionCard({ action, config, assets, works, assetByTask, disabled, onConfirm, onSkip }: ActionCardProps) {
    const [prompt, setPrompt] = useState(action.prompt);
    const refs = (action.refs || []).map((index) => assets.find((asset) => asset.index === index)).filter((asset): asset is StudioChatAsset => Boolean(asset));
    const proposed = action.status === "proposed";
    return (
        <article className={`studio-chat-action is-${action.status}`} aria-label={`${studioKindLabel(action.kind)}生成计划`}>
            <header>
                <strong>{studioKindLabel(action.kind)}{action.kind === "image" && (action.count || 1) > 1 ? ` × ${action.count}` : ""}</strong>
                <span>{[action.ratio, action.kind === "video" && action.seconds ? `${action.seconds} 秒` : ""].filter(Boolean).join(" · ")}</span>
                <em>{action.status === "submitted" ? "已提交" : action.status === "skipped" ? "已跳过" : action.status === "failed" ? "失败" : "待确认"}</em>
            </header>
            {proposed ? (
                <textarea value={prompt} aria-label="生成描述" onChange={(event) => setPrompt(event.target.value)} rows={3} />
            ) : (
                <p>{action.prompt}</p>
            )}
            {refs.length ? <div className="studio-chat-refs">参考：{refs.map((asset) => `#${asset.index}`).join("、")}{refs.some((asset) => !asset.attachment) ? "（部分素材还不可用）" : ""}</div> : null}
            {action.error ? <p className="studio-block-reason" role="alert">{action.error}</p> : null}
            {proposed ? (
                <ProposalFooter action={{ ...action, prompt }} config={config} refs={refs} disabled={disabled} onConfirm={() => onConfirm(prompt)} onSkip={onSkip} />
            ) : null}
            {action.taskIds?.length ? (
                <div className="studio-chat-results">
                    {action.taskIds.map((taskId) => <ResultTile key={taskId} work={works.get(taskId)} asset={assetByTask.get(taskId)} />)}
                </div>
            ) : null}
        </article>
    );
}

function ProposalFooter({ action, config, refs, disabled, onConfirm, onSkip }: { action: StudioChatAction; config: AiConfig; refs: StudioChatAsset[]; disabled: boolean; onConfirm: () => void; onSkip: () => void }) {
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { availableMicrocredits } = useWalletBalance(user?.id, creditsEnabled);
    const attachments = useMemo(() => refs.flatMap((asset) => (asset.attachment ? [asset.attachment] : [])), [refs]);
    const { state, model } = useMemo(
        () => studioAgentToolState(config, { kind: action.kind, prompt: action.prompt, ratio: action.ratio, seconds: action.seconds, count: action.count, attachments, tool: "chat" }),
        [action.count, action.kind, action.prompt, action.ratio, action.seconds, attachments, config],
    );
    const requirements = useMemo(() => studioModelRequirements(config, state), [config, state]);
    const generationConfig = useMemo(() => (model ? studioGenerationConfig(config, state, model) : config), [config, model, state]);
    const { credits } = useGenerationCredits({ config: generationConfig, model, mode: action.kind, count: state.count, seconds: state.video.seconds, requirements });
    const reason = studioBlockReason(config, state, model, { loggedIn: Boolean(user), creditsEnabled, availableCredits: availableMicrocredits === null ? null : availableMicrocredits / 1_000_000, cost: credits });
    return (
        <footer>
            <span className="studio-hint">{model ? modelDisplayName(config, model) || model : "无可用模型"}{creditsEnabled && credits !== null ? ` · 约 ${credits.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 积分` : ""}</span>
            {reason ? <span className="studio-block-reason">{reason}</span> : null}
            <span style={{ flex: 1 }} />
            <button type="button" className="studio-mini-button" disabled={disabled} onClick={onSkip}>跳过</button>
            <button type="button" className="studio-mini-button is-primary" disabled={disabled || Boolean(reason)} onClick={onConfirm}><Check aria-hidden />生成</button>
        </footer>
    );
}

function ResultTile({ work, asset }: { work?: StudioWork; asset?: StudioChatAsset }) {
    const media = work?.media[0];
    const label = asset ? `#${asset.index}` : "";
    if (!work || work.status === "queued" || work.status === "running") {
        return <div className="studio-chat-result is-pending"><Loader2 className="studio-spin" aria-hidden /><span>{work?.stage || "生成中"}</span><b>{label}</b></div>;
    }
    if (work.status !== "succeeded" || !media) {
        return <div className="studio-chat-result is-failed" role="alert"><span>{work.error || "生成失败"}</span><b>{label}</b></div>;
    }
    const src = studioMediaSrc(media);
    return (
        <div className="studio-chat-result">
            {media.kind === "image" ? <img src={src} alt={work.prompt} loading="lazy" /> : media.kind === "video" ? <video src={src} controls playsInline preload="metadata" /> : <audio src={src} controls preload="metadata" />}
            <b>{label}</b>
        </div>
    );
}
