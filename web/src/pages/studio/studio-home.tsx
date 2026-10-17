import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Clapperboard, Film, ImageIcon, MessageSquareText, Music, Sparkles, Wand2 } from "./studio-icons";
import { Link, useNavigate } from "react-router";

import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { listStudioCommunity } from "@/services/api/studio";
import { StudioPosterCard } from "./studio-poster-card";
import { STUDIO_QUICK_STARTS } from "./studio-quickstarts";
import { StudioShell } from "./studio-shell";
import { useAvailableStudioTools } from "./use-available-tools";
import { useStudioToolCovers } from "./use-studio-tool-meta";

const SUGGESTIONS = [
    { icon: Clapperboard, text: "做一条 15 秒的产品广告" },
    { icon: ImageIcon, text: "设计一张新店开业海报" },
    { icon: Music, text: "为美食视频配一段轻快音乐" },
];

type AgentMode = "chat" | "director";

const RUN_KEYS: Record<AgentMode, { key: string; options: Array<{ value: string; label: string }> }> = {
    chat: { key: "studio.chat.run-mode.v1", options: [{ value: "ask", label: "先问我" }, { value: "auto", label: "直接做" }] },
    director: { key: "studio.director.run-mode.v1", options: [{ value: "guide", label: "引导我" }, { value: "auto", label: "直接做" }] },
};

function readLocal(key: string, fallback: string) {
    try {
        return window.localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

function writeLocal(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // 浏览器存储不可用时只在本页生效。
    }
}

export default function StudioHomePage({ initialMode = "agents" }: { initialMode?: "agents" | "tools" }) {
    const navigate = useNavigate();
    const config = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const [mode, setMode] = useState<"agents" | "tools">(initialMode);
    const [agent, setAgent] = useState<AgentMode>("chat");
    const [runModes, setRunModes] = useState<Record<AgentMode, string>>(() => ({ chat: readLocal(RUN_KEYS.chat.key, "ask"), director: readLocal(RUN_KEYS.director.key, "guide") }));
    const [prompt, setPrompt] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const tools = useAvailableStudioTools();
    const covers = useStudioToolCovers();
    const templatesQuery = useQuery({ queryKey: ["studio", "home-templates"], queryFn: async () => (await listStudioCommunity({ templates: true, sort: "popular", pageSize: 8 })).posts, enabled: Boolean(user) });
    const templates = templatesQuery.data || [];

    // 只列后台已开启的模型，每类取前几个。
    const latestModels = useMemo(() => {
        const video = selectableModelsByCapability(config, "video").slice(0, 4).map((model) => ({ model, kind: "video" as const }));
        const image = selectableModelsByCapability(config, "image").slice(0, 4).map((model) => ({ model, kind: "image" as const }));
        const seen = new Set<string>();
        return [...video, ...image].filter((item) => {
            const key = `${item.kind}:${modelDisplayName(config, item.model) || item.model}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [config]);

    const fill = (text: string) => {
        setPrompt(text);
        window.requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(text.length, text.length);
        });
    };

    const changeRun = (value: string) => {
        writeLocal(RUN_KEYS[agent].key, value);
        setRunModes((current) => ({ ...current, [agent]: value }));
    };

    /** 首页的需求交给对话模式或导演模式，进入后自动开始。 */
    const send = () => {
        const text = prompt.trim();
        if (!text) return;
        const target = agent === "chat" ? `/studio/agents?q=${encodeURIComponent(text)}` : `/studio/director?q=${encodeURIComponent(text)}`;
        if (!user) {
            navigate(`/login?next=${encodeURIComponent(target)}`);
            return;
        }
        navigate(target);
    };

    const scrollRail = (direction: 1 | -1) => railRef.current?.scrollBy({ left: direction * 640, behavior: "smooth" });

    return (
        <StudioShell title="首页">
            <div className="studio-home">
                <section className="studio-hero" aria-labelledby="studio-hero-title">
                    <h1 id="studio-hero-title">今天想做什么？</h1>
                    <div className="studio-segment" role="group" aria-label="创作方式">
                        <button type="button" aria-pressed={mode === "agents"} onClick={() => setMode("agents")}><Sparkles aria-hidden />Agents</button>
                        <button type="button" aria-pressed={mode === "tools"} onClick={() => setMode("tools")}><Wand2 aria-hidden />工具</button>
                    </div>
                    {mode === "agents" ? (
                        <>
                            <div className="studio-composer is-hero">
                                <textarea
                                    ref={inputRef}
                                    id="studio-home-prompt"
                                    value={prompt}
                                    placeholder={agent === "chat" ? "说说你想做的内容，AI 会帮你规划并生成。" : "说说你想拍的视频：产品、故事、风格、给谁看……"}
                                    aria-label="创作需求"
                                    onChange={(event) => setPrompt(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                            event.preventDefault();
                                            send();
                                        }
                                    }}
                                />
                                <div className="studio-composer-bar">
                                    <label className="studio-pill-select">
                                        {agent === "chat" ? <MessageSquareText aria-hidden /> : <Film aria-hidden />}
                                        <select aria-label="智能体" value={agent} onChange={(event) => setAgent(event.target.value as AgentMode)}>
                                            <option value="chat">对话模式</option>
                                            <option value="director">导演模式</option>
                                        </select>
                                    </label>
                                    <span style={{ flex: 1 }} />
                                    <label className="studio-pill-select">
                                        <select aria-label="执行方式" value={runModes[agent]} onChange={(event) => changeRun(event.target.value)}>
                                            {RUN_KEYS[agent].options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </label>
                                    <button type="button" className="studio-send-orb" aria-label="发送" disabled={!prompt.trim()} onClick={send}>
                                        <ArrowUp aria-hidden />
                                    </button>
                                </div>
                            </div>
                            <div className="studio-suggestions">
                                {SUGGESTIONS.map((item) => <button key={item.text} type="button" onClick={() => fill(item.text)}><item.icon aria-hidden />{item.text}</button>)}
                            </div>
                        </>
                    ) : (
                        <div className="studio-poster-grid is-compact">
                            {tools.filter((tool) => !tool.specialty).map((tool) => (
                                <StudioPosterCard key={tool.id} to={tool.path} title={tool.label} icon={tool.icon} gradient={tool.gradient} cover={covers[tool.id]} />
                            ))}
                        </div>
                    )}
                </section>

                <section className="studio-section" aria-labelledby="studio-quick-title">
                    <div className="studio-section-head">
                        <h2 id="studio-quick-title">让 AI 导演你的视频</h2>
                        <Link to="/studio/director" className="studio-more-link">更多<ArrowRight aria-hidden /></Link>
                    </div>
                    <div className="studio-rail-wrap">
                        <div className="studio-rail" ref={railRef}>
                            {STUDIO_QUICK_STARTS.map((item) => (
                                <StudioPosterCard key={item.genre} to={`/studio/director?genre=${item.genre}`} title={item.label} icon={item.icon} gradient={item.gradient} cover={covers[item.coverId]} badge={item.badge} />
                            ))}
                        </div>
                        <button type="button" className="studio-rail-arrow is-left" aria-label="向左滚动" onClick={() => scrollRail(-1)}><ChevronLeft aria-hidden /></button>
                        <button type="button" className="studio-rail-arrow is-right" aria-label="向右滚动" onClick={() => scrollRail(1)}><ChevronRight aria-hidden /></button>
                    </div>
                </section>

                {templates.length ? (
                    <section className="studio-section" aria-labelledby="studio-templates-title">
                        <div className="studio-section-head">
                            <h2 id="studio-templates-title">热门模板</h2>
                            <Link to="/studio/inspire?tab=templates" className="studio-more-link">全部模板<ArrowRight aria-hidden /></Link>
                        </div>
                        <div className="studio-community-grid">
                            {templates.map((post) => (
                                <Link key={post.id} to="/studio/inspire?tab=templates" className="studio-post-card studio-template-card">
                                    <span className="studio-post-media">
                                        {post.media[0]?.kind === "video" ? <video src={post.media[0].url} muted playsInline preload="metadata" /> : post.media[0]?.kind === "image" ? <img src={post.media[0].url} alt="" loading="lazy" /> : null}
                                    </span>
                                    <span className="studio-post-body"><strong>{post.title}</strong></span>
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="studio-section" aria-labelledby="studio-tools-title">
                    <div className="studio-section-head">
                        <h2 id="studio-tools-title">工具</h2>
                        <Link to="/studio/video" className="studio-more-link">全部工具<ArrowRight aria-hidden /></Link>
                    </div>
                    <div className="studio-poster-grid">
                        {tools.slice(0, 12).map((tool) => (
                            <StudioPosterCard key={tool.id} to={tool.path} title={tool.label} icon={tool.icon} gradient={tool.gradient} cover={covers[tool.id]} badge={tool.badge} />
                        ))}
                    </div>
                </section>

                {latestModels.length ? (
                    <section className="studio-section" aria-labelledby="studio-models-title">
                        <div className="studio-section-head">
                            <h2 id="studio-models-title">可用模型</h2>
                        </div>
                        <div className="studio-model-pills">
                            {latestModels.map((item) => (
                                <Link key={`${item.kind}:${item.model}`} to={`${item.kind === "video" ? "/studio/create-video" : "/studio/create-image"}?model=${encodeURIComponent(item.model)}`}>
                                    {item.kind === "video" ? <Film aria-hidden /> : <ImageIcon aria-hidden />}
                                    <strong>{modelDisplayName(config, item.model) || item.model}</strong>
                                    <span>{item.kind === "video" ? "视频" : "图片"}</span>
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </StudioShell>
    );
}
