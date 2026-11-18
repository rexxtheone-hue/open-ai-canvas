import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useLocation } from "react-router";
import { ArrowUp, RotateCcw, Sparkles, X } from "./studio-icons";

import { useHelpAssistantStore } from "@/stores/use-help-assistant-store";

const SUGGESTIONS = ["怎么用首尾帧生成视频？", "生成失败会扣积分吗？", "我的积分都花在哪里了？", "怎么让同一个人物出现在不同视频里？"];

function AnswerMarkdown({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a: ({ href, children }) =>
                    href && href.startsWith("/studio") ? (
                        <Link to={href} className="studio-assistant-link">{children}</Link>
                    ) : (
                        <span>{children}</span>
                    ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

/** 顶部栏的 AI 助手按钮。 */
export function StudioAssistantButton() {
    const open = useHelpAssistantStore((state) => state.open);
    const setOpen = useHelpAssistantStore((state) => state.setOpen);
    return (
        <button type="button" className="studio-assistant-trigger" aria-pressed={open} aria-label="AI 助手" title="AI 助手" onClick={() => setOpen(!open)}>
            <Sparkles aria-hidden />
            <span>AI 助手</span>
        </button>
    );
}

/** 帮助助手面板：用站内知识库回答使用问题，可以查价格、积分和失败原因，必要时转人工。 */
export function StudioHelpAssistant() {
    const { pathname } = useLocation();
    const { open, messages, pending, busy, error, setOpen, send, reset } = useHelpAssistantStore();
    const [draft, setDraft] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [messages, pending, busy, open]);
    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, setOpen]);

    const submit = (text: string) => {
        if (!text.trim() || busy) return;
        setDraft("");
        void send(text, pathname);
    };

    if (!open) return null;
    return (
        <aside className="studio-assistant" aria-label="AI 助手">
            <header className="studio-assistant-head">
                <span className="studio-assistant-badge"><Sparkles aria-hidden /></span>
                <div className="studio-assistant-title">
                    <strong>AI 助手</strong>
                    <small>功能、步骤、积分问题都可以问</small>
                </div>
                {messages.length ? <button type="button" className="studio-topbar-icon" aria-label="新对话" title="新对话" onClick={reset}><RotateCcw aria-hidden /></button> : null}
                <button type="button" className="studio-topbar-icon" aria-label="关闭" title="关闭" onClick={() => setOpen(false)}><X aria-hidden /></button>
            </header>
            <div className="studio-assistant-list" ref={listRef} aria-live="polite">
                {!messages.length ? (
                    <div className="studio-assistant-empty">
                        <p>你好，我是 AI 助手。可以问我怎么用某个功能、为什么生成失败、积分怎么扣。</p>
                        <div className="studio-assistant-suggestions">
                            {SUGGESTIONS.map((item) => <button key={item} type="button" onClick={() => submit(item)}>{item}</button>)}
                        </div>
                    </div>
                ) : null}
                {messages.map((item, index) => (
                    <div key={index} className={`studio-assistant-msg is-${item.role}`}>
                        {item.role === "assistant" ? <AnswerMarkdown text={item.content} /> : <p>{item.content}</p>}
                    </div>
                ))}
                {busy ? (
                    <div className="studio-assistant-msg is-assistant">
                        {pending ? <AnswerMarkdown text={pending} /> : <p className="studio-assistant-typing" aria-label="正在思考"><span /><span /><span /></p>}
                    </div>
                ) : null}
                {error ? <p className="studio-assistant-error" role="alert">{error}</p> : null}
            </div>
            <form
                className="studio-assistant-input"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit(draft);
                }}
            >
                <textarea
                    ref={inputRef}
                    value={draft}
                    rows={2}
                    maxLength={2000}
                    placeholder="输入你的问题，Enter 发送"
                    aria-label="输入你的问题"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            submit(draft);
                        }
                    }}
                />
                <button type="submit" className="studio-assistant-send" aria-label="发送" disabled={!draft.trim() || busy}><ArrowUp aria-hidden /></button>
            </form>
        </aside>
    );
}
