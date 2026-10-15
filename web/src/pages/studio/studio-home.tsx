import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Briefcase, Building2, Clapperboard, Megaphone, MicVocal, Sparkles, Store, UserRound, Wand2 } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { StudioShell } from "./studio-shell";
import { useAvailableStudioTools } from "./use-available-tools";
import { listStudioCommunity } from "@/services/api/studio";

const SUGGESTIONS = [
    "做一条 15 秒的产品广告，展示一款保温杯的卖点",
    "设计一张新店开业海报，暖色调，中文标题",
    "为一段美食视频配一段轻快的背景音乐",
];

/** H4：行业一键成片进入 AI 导演，并预选对应类型。 */
const QUICK_STARTS = [
    { id: "product-ad", label: "产品广告", icon: Megaphone },
    { id: "real-estate", label: "房地产", icon: Building2 },
    { id: "food", label: "餐饮探店", icon: Store },
    { id: "ugc", label: "UGC 口播", icon: UserRound },
    { id: "presenter", label: "数字人讲解", icon: MicVocal },
    { id: "brand-film", label: "品牌片", icon: Briefcase },
];

export default function StudioHomePage({ initialMode = "agents" }: { initialMode?: "agents" | "tools" }) {
    const navigate = useNavigate();
    const config = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const [mode, setMode] = useState<"agents" | "tools">(initialMode);
    const [prompt, setPrompt] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const tools = useAvailableStudioTools();
    const templatesQuery = useQuery({ queryKey: ["studio", "home-templates"], queryFn: async () => (await listStudioCommunity({ templates: true, sort: "popular", pageSize: 8 })).posts, enabled: Boolean(user) });
    const templates = templatesQuery.data || [];

    // H5：最新模型只列后台已开启的模型，每类取前几个。
    const latestModels = useMemo(() => {
        const video = selectableModelsByCapability(config, "video").slice(0, 4).map((model) => ({ model, kind: "video" as const }));
        const image = selectableModelsByCapability(config, "image").slice(0, 4).map((model) => ({ model, kind: "image" as const }));
        const seen = new Set<string>();
        return [...video, ...image].filter((item) => {
            const label = modelDisplayName(config, item.model) || item.model;
            const key = `${item.kind}:${label}`;
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

    /** 首页的需求交给对话模式，进入后自动发送。 */
    const send = () => {
        const text = prompt.trim();
        if (!text) return;
        if (!user) {
            navigate(`/login?next=${encodeURIComponent("/studio/agents")}`);
            return;
        }
        navigate(`/studio/agents?q=${encodeURIComponent(text)}`);
    };

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
                            <div className="studio-composer">
                                <textarea
                                    ref={inputRef}
                                    id="studio-home-prompt"
                                    value={prompt}
                                    placeholder="说说你想做的内容，AI 会帮你规划并生成。"
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
                                    <span className="studio-hint">Enter 发送，Shift + Enter 换行</span>
                                    <span style={{ flex: 1 }} />
                                    <button type="button" className="studio-icon-button studio-send-button" aria-label="发送" disabled={!prompt.trim()} onClick={send}>
                                        <ArrowUp aria-hidden />
                                    </button>
                                </div>
                            </div>
                            <div className="studio-suggestions">
                                {SUGGESTIONS.map((item) => <button key={item} type="button" onClick={() => fill(item)}>{item}</button>)}
                            </div>
                        </>
                    ) : (
                        <div className="studio-card-row" style={{ width: "min(760px, 100%)" }}>
                            {tools.filter((tool) => !tool.specialty).map((tool) => (
                                <Link key={tool.id} to={tool.path} className="studio-entry-card">
                                    <tool.icon className="studio-entry-icon" aria-hidden />
                                    <strong>{tool.label}</strong>
                                    <span>{tool.description}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                <section className="studio-section" aria-labelledby="studio-quick-title">
                    <div className="studio-section-head">
                        <div>
                            <h2 id="studio-quick-title">一键成片</h2>
                            <p>选一个行业，填好简报，AI 导演帮你从方案做到成片。</p>
                        </div>
                    </div>
                    <div className="studio-card-row">
                        {QUICK_STARTS.map((item) => (
                            <Link key={item.id} to={`/studio/director?genre=${item.id}`} className="studio-entry-card">
                                <item.icon className="studio-entry-icon" aria-hidden />
                                <strong>{item.label}</strong>
                                <span>交给 AI 导演，从方案做到成片</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {templates.length ? (
                    <section className="studio-section" aria-labelledby="studio-templates-title">
                        <div className="studio-section-head">
                            <div>
                                <h2 id="studio-templates-title">热门模板</h2>
                                <p>挑一个喜欢的，一键做同款。</p>
                            </div>
                            <Link to="/studio/inspire?tab=templates">全部模板</Link>
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
                        <div>
                            <h2 id="studio-tools-title">工具</h2>
                            <p>每个工具专做一件事，打开就能用。</p>
                        </div>
                        <Link to="/studio/video">全部工具</Link>
                    </div>
                    <div className="studio-card-row">
                        {tools.slice(0, 8).map((tool) => (
                            <Link key={tool.id} to={tool.path} className="studio-entry-card">
                                <tool.icon className="studio-entry-icon" aria-hidden />
                                <strong>{tool.label}</strong>
                                <span>{tool.description}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {latestModels.length ? (
                    <section className="studio-section" aria-labelledby="studio-models-title">
                        <div className="studio-section-head">
                            <div>
                                <h2 id="studio-models-title">可用模型</h2>
                                <p>后台已开启的模型，点击直接用它生成。</p>
                            </div>
                        </div>
                        <div className="studio-card-row">
                            {latestModels.map((item) => (
                                <Link key={`${item.kind}:${item.model}`} to={`${item.kind === "video" ? "/studio/create-video" : "/studio/create-image"}?model=${encodeURIComponent(item.model)}`} className="studio-entry-card">
                                    <Clapperboard className="studio-entry-icon" aria-hidden />
                                    <strong>{modelDisplayName(config, item.model) || item.model}</strong>
                                    <span>{item.kind === "video" ? "视频模型" : "图片模型"}</span>
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </StudioShell>
    );
}
