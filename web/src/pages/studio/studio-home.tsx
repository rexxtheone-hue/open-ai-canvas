import { useMemo, useRef, useState } from "react";
import { App } from "antd";
import { ArrowUp, Briefcase, Building2, Clapperboard, Megaphone, MicVocal, Sparkles, Store, UserRound, Wand2 } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { StudioShell } from "./studio-shell";
import { startStudioAgentRun } from "./studio-agent";
import { STUDIO_TOOLS } from "./studio-tools";

const SUGGESTIONS = [
    "做一条 15 秒的产品广告，展示一款保温杯的卖点",
    "设计一张新店开业海报，暖色调，中文标题",
    "为一段美食视频配一段轻快的背景音乐",
];

/** H4：行业一键成片的开场需求。点击后填入输入框，用户确认后再发送。 */
const QUICK_STARTS = [
    { id: "product-ad", label: "产品广告", icon: Megaphone, prompt: "帮我做一支 30 秒的产品广告。产品是：（写产品名称和卖点）。风格：干净、高级、节奏明快，9:16 竖屏，结尾有行动号召。" },
    { id: "real-estate", label: "房地产", icon: Building2, prompt: "帮我做一支房地产宣传短片。项目是：（写楼盘名称、位置、户型和卖点）。镜头包括外观、社区环境和室内样板间，9:16 竖屏，45 秒。" },
    { id: "food-review", label: "餐饮探店", icon: Store, prompt: "帮我做一支餐饮探店视频。店名：（写店名），招牌菜：（写菜名）。风格真实自然，有门头、环境、上菜和试吃镜头，9:16 竖屏，30 秒。" },
    { id: "ugc", label: "UGC 口播", icon: UserRound, prompt: "帮我做一支 UGC 风格的口播广告。产品：（写产品）。一位真实感的年轻主播用手机自拍介绍使用感受，口语化，9:16 竖屏，30 秒。" },
    { id: "presenter", label: "数字人讲解", icon: MicVocal, prompt: "帮我做一支数字人讲解视频。主题：（写主题）。一位专业形象的讲解员面对镜头讲解，画面穿插要点字卡，9:16 竖屏，60 秒。" },
    { id: "brand-film", label: "品牌片", icon: Briefcase, prompt: "帮我做一支品牌故事短片。品牌：（写品牌名和理念）。用三到五个场景讲清楚品牌由来和价值，电影感，16:9，60 秒。" },
];

export default function StudioHomePage({ initialMode = "agents" }: { initialMode?: "agents" | "tools" }) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const [mode, setMode] = useState<"agents" | "tools">(initialMode);
    const [prompt, setPrompt] = useState("");
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

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

    const send = async () => {
        if (sending) return;
        if (!user) {
            navigate(`/login?next=${encodeURIComponent("/studio")}`);
            return;
        }
        setSending(true);
        try {
            navigate(await startStudioAgentRun(prompt));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "启动失败，请重试");
        } finally {
            setSending(false);
        }
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
                                            void send();
                                        }
                                    }}
                                />
                                <div className="studio-composer-bar">
                                    <span className="studio-hint">Enter 发送，Shift + Enter 换行</span>
                                    <span style={{ flex: 1 }} />
                                    <button type="button" className="studio-icon-button studio-send-button" aria-label="发送" disabled={!prompt.trim() || sending} onClick={() => void send()}>
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
                            {STUDIO_TOOLS.map((tool) => (
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
                            <p>选一个行业，填好产品信息，AI 帮你从剧本做到成片。</p>
                        </div>
                    </div>
                    <div className="studio-card-row">
                        {QUICK_STARTS.map((item) => (
                            <button key={item.id} type="button" className="studio-entry-card" onClick={() => { setMode("agents"); fill(item.prompt); }}>
                                <item.icon className="studio-entry-icon" aria-hidden />
                                <strong>{item.label}</strong>
                                <span>填入开场需求，改好后发送</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="studio-section" aria-labelledby="studio-tools-title">
                    <div className="studio-section-head">
                        <div>
                            <h2 id="studio-tools-title">工具</h2>
                            <p>每个工具专做一件事，打开就能用。</p>
                        </div>
                        <Link to="/studio/tools">全部工具</Link>
                    </div>
                    <div className="studio-card-row">
                        {STUDIO_TOOLS.map((tool) => (
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
