import { useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { requireUser } from "@/stores/use-auth-gate-store";
import { addSkill, listAddedSkills, listSkillExperts, type SkillExpert } from "@/services/api/skills";
import { ArrowRight, ArrowUp, Library, Lightbulb, Loader2, MessageSquareText, PenLine, Plus, RefreshCw, Sparkles, Store, UserRound, Video } from "./studio-icons";
import { MARKETER_DEFAULT_EXPERT, MARKETER_EXPERT_IDS, MARKETER_QUICK_GROUPS, MARKETER_SHOWCASES, marketerExperts } from "./studio-marketer";
import { StudioSelect } from "./studio-select";
import { StudioShell } from "./studio-shell";
import "./studio-marketer.css";

const AVATAR_GRADIENTS = [
    "linear-gradient(135deg, #a23cff, #ff7ad9)",
    "linear-gradient(135deg, #3c8dff, #7af0ff)",
    "linear-gradient(135deg, #ff5c5c, #ffc27a)",
    "linear-gradient(135deg, #2fd18b, #d6ff7a)",
    "linear-gradient(135deg, #ffb347, #ff5cae)",
    "linear-gradient(135deg, #7a7cff, #5cffe1)",
];

const SHOWCASE_ICONS = [Lightbulb, Video, RefreshCw, PenLine];

function ExpertAvatar({ expert, index }: { expert: SkillExpert; index: number }) {
    return (
        <span className="studio-marketer-avatar" style={{ background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length] }} aria-hidden>
            {expert.name.slice(0, 1)}
        </span>
    );
}

/** 先把专家的技能装进用户技能库，对话页才能按需注入；装失败不阻断对话，只少用技能。 */
async function ensureExpertSkills(expert: SkillExpert) {
    const added = await listAddedSkills();
    const installed = new Set(added.skills.filter((skill) => skill.isAdded).map((skill) => skill.skillId));
    for (const id of expert.skillIds) if (!installed.has(id)) await addSkill(id);
}

export default function StudioMarketerPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const view = params.get("view") === "experts" ? "experts" : "home";
    const [prompt, setPrompt] = useState("");
    const [expertId, setExpertId] = useState(MARKETER_DEFAULT_EXPERT);
    const [groupId, setGroupId] = useState(MARKETER_QUICK_GROUPS[0].id);
    const [starting, setStarting] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const expertsQuery = useQuery({ queryKey: ["skills", "experts"], queryFn: listSkillExperts, staleTime: 10 * 60 * 1000 });
    const experts = useMemo(() => marketerExperts(expertsQuery.data?.experts || []), [expertsQuery.data]);
    const teamExperts = experts.filter((expert) => MARKETER_EXPERT_IDS.includes(expert.expertId));
    const activeExpert = experts.find((expert) => expert.expertId === expertId) || experts[0];
    const group = MARKETER_QUICK_GROUPS.find((item) => item.id === groupId) || MARKETER_QUICK_GROUPS[0];

    const showView = (next: "home" | "experts") => setParams(next === "experts" ? { view: "experts" } : {}, { replace: false });

    const fill = (text: string, nextExpert?: string) => {
        setPrompt(text);
        if (nextExpert) setExpertId(nextExpert);
        if (view !== "home") showView("home");
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const pickExpert = (id: string) => {
        setExpertId(id);
        if (view !== "home") showView("home");
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const start = async () => {
        const text = prompt.trim();
        if (!text || starting || !activeExpert) return;
        const target = `/studio/agents?q=${encodeURIComponent(text)}&expert=${encodeURIComponent(activeExpert.expertId)}`;
        if (!requireUser({ next: target })) return;
        setStarting(true);
        try {
            await ensureExpertSkills(activeExpert);
        } catch {
            message.warning("部分专家技能没装上，本次对话会少用这些技能");
        } finally {
            setStarting(false);
        }
        navigate(target);
    };

    return (
        <StudioShell title="AI Marketer">
            <div className="studio-marketer">
                <aside className="studio-marketer-nav" aria-label="AI Marketer 导航">
                    <div className="studio-marketer-brand"><Sparkles aria-hidden /><strong>AI Marketer</strong></div>
                    <button type="button" className="studio-marketer-nav-item" aria-current={view === "home" ? "page" : undefined} onClick={() => { setPrompt(""); showView("home"); }}><Plus aria-hidden />新任务</button>
                    <button type="button" className="studio-marketer-nav-item" aria-current={view === "experts" ? "page" : undefined} onClick={() => showView("experts")}><Store aria-hidden />专家市场</button>
                    <button type="button" className="studio-marketer-nav-item" onClick={() => navigate("/studio/skills")}><Library aria-hidden />Skill 库</button>
                    <button type="button" className="studio-marketer-nav-item" onClick={() => navigate("/studio/agents")}><MessageSquareText aria-hidden />历史任务</button>
                    <p className="studio-marketer-nav-label">专家</p>
                    {teamExperts.map((expert, index) => (
                        <button key={expert.expertId} type="button" className="studio-marketer-nav-item is-expert" aria-pressed={view === "home" && expert.expertId === activeExpert?.expertId} title={expert.tagline} onClick={() => pickExpert(expert.expertId)}>
                            <ExpertAvatar expert={expert} index={index} />
                            <span>{expert.name}</span>
                        </button>
                    ))}
                </aside>

                <div className="studio-marketer-main">
                    {view === "home" ? (
                        <div className="studio-home studio-marketer-home">
                            <section className="studio-hero" aria-labelledby="studio-marketer-title">
                                <p className="studio-marketer-eyebrow">你的 AI 营销专员，随时开工</p>
                                <h1 id="studio-marketer-title">懂你的生意，把活干完</h1>
                                <div className="studio-composer is-hero">
                                    <textarea
                                        ref={inputRef}
                                        value={prompt}
                                        placeholder={activeExpert ? `告诉${activeExpert.name}你的产品、市场和想达成的目标` : "说说你的产品和营销目标"}
                                        aria-label="营销需求"
                                        onChange={(event) => setPrompt(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                                event.preventDefault();
                                                void start();
                                            }
                                        }}
                                    />
                                    <div className="studio-composer-bar">
                                        <StudioSelect
                                            ariaLabel="激活专家"
                                            value={activeExpert?.expertId || ""}
                                            icon={<UserRound aria-hidden />}
                                            options={experts.map((expert) => ({ value: expert.expertId, label: expert.name, hint: expert.tagline }))}
                                            onChange={setExpertId}
                                            placement="bottomLeft"
                                            empty="专家加载中"
                                        />
                                        <span style={{ flex: 1 }} />
                                        <button type="button" className="studio-send-orb" aria-label="开始任务" disabled={!prompt.trim() || starting || !activeExpert} onClick={() => void start()}>
                                            {starting ? <Loader2 className="studio-spin" aria-hidden /> : <ArrowUp aria-hidden />}
                                        </button>
                                    </div>
                                </div>
                                <div className="studio-marketer-groups" role="tablist" aria-label="快速开始分类">
                                    {MARKETER_QUICK_GROUPS.map((item) => (
                                        <button key={item.id} type="button" role="tab" aria-selected={item.id === group.id} onClick={() => setGroupId(item.id)}>{item.label}</button>
                                    ))}
                                </div>
                                <div className="studio-suggestions">
                                    {group.items.map((item) => (
                                        <button key={item.label} type="button" title={item.prompt} onClick={() => fill(item.prompt, item.expertId)}><Sparkles aria-hidden />{item.label}</button>
                                    ))}
                                </div>
                            </section>

                            <section className="studio-section" aria-labelledby="studio-marketer-popular">
                                <div className="studio-section-head">
                                    <h2 id="studio-marketer-popular">热门玩法</h2>
                                    <button type="button" onClick={() => showView("experts")}>全部专家<ArrowRight aria-hidden /></button>
                                </div>
                                <div className="studio-marketer-showcases">
                                    {MARKETER_SHOWCASES.map((item, index) => {
                                        const Icon = SHOWCASE_ICONS[index % SHOWCASE_ICONS.length];
                                        const owner = experts.find((expert) => expert.expertId === item.expertId);
                                        return (
                                        <button key={item.title} type="button" className="studio-marketer-showcase" onClick={() => fill(item.prompt, item.expertId)}>
                                            <span className="studio-marketer-showcase-art" style={{ background: item.gradient }} aria-hidden>
                                                <Icon />
                                                {owner ? <em>{owner.name}</em> : null}
                                            </span>
                                            <span className="studio-marketer-showcase-body">
                                                <strong>{item.title}</strong>
                                                <span>{item.description}</span>
                                            </span>
                                        </button>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="studio-home studio-marketer-market">
                            <div className="studio-section-head">
                                <div>
                                    <h2>专家市场</h2>
                                    <p>每位专家自带一套工作方法和技能组合，选一位把任务交给 TA。</p>
                                </div>
                            </div>
                            {expertsQuery.isLoading ? <div className="studio-empty"><Loader2 className="studio-spin" aria-hidden /></div> : null}
                            {expertsQuery.isError ? <p className="studio-hint">专家目录读取失败，请刷新重试</p> : null}
                            <div className="studio-marketer-expert-grid">
                                {experts.map((expert, index) => (
                                    <article key={expert.expertId} className="studio-marketer-expert-card">
                                        <header>
                                            <ExpertAvatar expert={expert} index={index} />
                                            <div>
                                                <strong>{expert.name}</strong>
                                                <span>{expert.skillIds.length} 个技能</span>
                                            </div>
                                        </header>
                                        <p>{expert.tagline}</p>
                                        {expert.cases.length ? (
                                            <ul aria-label={`${expert.name}的示例任务`}>
                                                {expert.cases.map((item) => (
                                                    <li key={item}><button type="button" onClick={() => fill(item, expert.expertId)}>{item}</button></li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        <button type="button" className="studio-marketer-expert-cta" onClick={() => pickExpert(expert.expertId)}>派活给 TA<ArrowRight aria-hidden /></button>
                                    </article>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </StudioShell>
    );
}
