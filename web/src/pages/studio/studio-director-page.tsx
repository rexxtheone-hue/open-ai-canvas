import { useEffect, useState } from "react";
import { App } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Briefcase, Building2, Clapperboard, Film, Megaphone, MicVocal, Plus, Sparkles, Store, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { createStudioStory, deleteStudioStory, listStudioStories } from "@/services/api/studio-agents";
import { useUserStore } from "@/stores/use-user-store";
import { StudioCharacterGrid, useStudioCharacters } from "./studio-character-picker";
import {
    DEFAULT_DIRECTOR_BRIEF,
    DIRECTOR_DURATIONS,
    DIRECTOR_GENRES,
    DIRECTOR_RATIOS,
    directorBriefError,
    directorGenre,
    directorKickoffMessage,
    directorStoryTitle,
    type DirectorBrief,
    type DirectorGenre,
    type DirectorRunMode,
} from "./studio-director";
import { StudioShell } from "./studio-shell";
import { useStudioBrandChoice } from "./use-studio-brand";

const MAX_CHARACTERS = 3;
const RUN_MODE_KEY = "studio.director.run-mode.v1";
const QUICK_STARTS: Array<{ id: DirectorGenre; icon: typeof Megaphone; cta: string }> = [
    { id: "product-ad", icon: Megaphone, cta: "做产品广告" },
    { id: "ugc", icon: UserRound, cta: "做 UGC 口播" },
    { id: "real-estate", icon: Building2, cta: "做楼盘视频" },
    { id: "food", icon: Store, cta: "做探店视频" },
    { id: "presenter", icon: MicVocal, cta: "做讲解视频" },
    { id: "brand-film", icon: Briefcase, cta: "做品牌片" },
    { id: "short-drama", icon: Film, cta: "做短剧" },
];
const STATUS_LABEL: Record<string, string> = { planning: "写分镜中", producing: "生成中", rendering: "合成中", done: "已完成" };

function readRunMode(): DirectorRunMode {
    try {
        return window.localStorage.getItem(RUN_MODE_KEY) === "auto" ? "auto" : "guide";
    } catch {
        return "guide";
    }
}

/** AI 导演首页：一句话开工或按行业填简报；导演项目只属于 Studio。 */
export default function StudioDirectorPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const user = useUserStore((state) => state.user);
    const [searchParams, setSearchParams] = useSearchParams();
    const [prompt, setPrompt] = useState("");
    const [ratio, setRatio] = useState<string>("9:16");
    const [duration, setDuration] = useState<number>(30);
    const [runMode, setRunModeState] = useState<DirectorRunMode>(readRunMode);
    const [brief, setBrief] = useState<DirectorBrief | null>(null);
    const [starting, setStarting] = useState(false);
    const brand = useStudioBrandChoice(true);
    const charactersQuery = useStudioCharacters();
    const characters = charactersQuery.data || [];
    const storiesQuery = useQuery({ queryKey: ["studio", "stories"], queryFn: async () => (await listStudioStories()).items, enabled: Boolean(user) });
    const stories = storiesQuery.data || [];

    const setRunMode = (mode: DirectorRunMode) => {
        setRunModeState(mode);
        try {
            window.localStorage.setItem(RUN_MODE_KEY, mode);
        } catch {
            // 浏览器存储不可用时只在本页生效。
        }
    };

    // 首页一键成片（?genre=）和角色库「交给 AI 导演」（?character=）直接打开简报表单。
    useEffect(() => {
        const genre = searchParams.get("genre");
        const character = searchParams.get("character");
        if (!genre && !character) return;
        setBrief({ ...DEFAULT_DIRECTOR_BRIEF, genre: DIRECTOR_GENRES.some((item) => item.id === genre) ? (genre as DirectorGenre) : character ? "free" : "product-ad", characterIds: character ? [character] : [] });
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    const start = async (value: DirectorBrief, kickoff: string) => {
        if (starting) return;
        if (!user) {
            navigate(`/login?next=${encodeURIComponent("/studio/director")}`);
            return;
        }
        setStarting(true);
        try {
            const story = await createStudioStory({
                title: directorStoryTitle(value),
                ratio: value.ratio,
                durationSeconds: value.durationSeconds,
                brief: { ...value, kickoff },
                settings: { runMode, brandKitId: brand.kit?.id || "" },
                memory: { decisions: [], constraints: [], action_items: [], open_questions: [], resolved: [], context_notes: [] },
            });
            void queryClient.invalidateQueries({ queryKey: ["studio", "stories"] });
            navigate(`/studio/director/${encodeURIComponent(story.id)}?kickoff=1`);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "创建失败，请重试");
            setStarting(false);
        }
    };

    const startFromPrompt = () => {
        const text = prompt.trim();
        if (!text) return;
        void start({ ...DEFAULT_DIRECTOR_BRIEF, genre: "free", subject: Array.from(text).slice(0, 200).join(""), points: "", ratio, durationSeconds: duration }, text);
    };

    const startFromBrief = () => {
        if (!brief) return;
        const error = directorBriefError(brief);
        if (error) {
            message.warning(error);
            return;
        }
        const names = characters.filter((item) => brief.characterIds.includes(item.id)).map((item) => item.name);
        void start(brief, directorKickoffMessage(brief, names));
    };

    const removeStory = (id: string, title: string) => {
        modal.confirm({
            title: `删除导演项目「${title}」？`,
            content: "分镜和对话会被删除，已生成的作品仍保留在作品库。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await deleteStudioStory(id);
                await queryClient.invalidateQueries({ queryKey: ["studio", "stories"] });
            },
        });
    };

    const genre = brief ? directorGenre(brief.genre) : undefined;
    const setField = <K extends keyof DirectorBrief>(key: K, value: DirectorBrief[K]) => setBrief((current) => (current ? { ...current, [key]: value } : current));

    return (
        <StudioShell title="AI 导演">
            <div className="studio-home">
                <section className="studio-hero" aria-labelledby="studio-director-title">
                    <h1 id="studio-director-title">让 AI 导演你的下一支视频</h1>
                    <div className="studio-composer">
                        <textarea
                            value={prompt}
                            placeholder="说说你想拍什么：产品、故事、风格、给谁看……"
                            aria-label="视频想法"
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    startFromPrompt();
                                }
                            }}
                        />
                        <div className="studio-composer-bar">
                            <div className="studio-chat-mode" role="group" aria-label="执行方式">
                                <button type="button" aria-pressed={runMode === "guide"} title="每一步先给你看，确认后再继续" onClick={() => setRunMode("guide")}>引导我</button>
                                <button type="button" aria-pressed={runMode === "auto"} title="写完分镜直接生成到成片" onClick={() => setRunMode("auto")}>直接做</button>
                            </div>
                            <select className="studio-chat-model" aria-label="画面比例" value={ratio} onChange={(event) => setRatio(event.target.value)}>
                                {DIRECTOR_RATIOS.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                            <select className="studio-chat-model" aria-label="成片时长" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                                {DIRECTOR_DURATIONS.map((item) => <option key={item} value={item}>{item} 秒</option>)}
                            </select>
                            <span style={{ flex: 1 }} />
                            <button type="button" className="studio-icon-button studio-send-button" aria-label="开始导演" disabled={!prompt.trim() || starting} onClick={startFromPrompt}><ArrowUp aria-hidden /></button>
                        </div>
                    </div>
                </section>

                <section className="studio-section" aria-labelledby="studio-director-quick">
                    <div className="studio-section-head">
                        <div>
                            <h2 id="studio-director-quick">按行业快速开始</h2>
                            <p>填几项关键信息，导演按行业写法出分镜。</p>
                        </div>
                    </div>
                    <div className="studio-card-row">
                        {QUICK_STARTS.map((item) => {
                            const definition = directorGenre(item.id);
                            return (
                                <button key={item.id} type="button" className="studio-entry-card" onClick={() => setBrief({ ...DEFAULT_DIRECTOR_BRIEF, genre: item.id })}>
                                    <item.icon className="studio-entry-icon" aria-hidden />
                                    <strong>{definition.label}</strong>
                                    <span>{definition.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className="studio-section" aria-labelledby="studio-director-projects">
                    <div className="studio-section-head">
                        <div>
                            <h2 id="studio-director-projects">导演项目</h2>
                            <p>分镜、对话和生成记录都保存在项目里，随时回来继续。</p>
                        </div>
                    </div>
                    <div className="studio-card-row">
                        <button type="button" className="studio-entry-card" onClick={() => setBrief({ ...DEFAULT_DIRECTOR_BRIEF, genre: "free" })}>
                            <Plus className="studio-entry-icon" aria-hidden />
                            <strong>新建项目</strong>
                            <span>从空白简报开始</span>
                        </button>
                        {stories.map((story) => (
                            <div key={story.id} className="studio-entry-card studio-story-card">
                                <Link to={`/studio/director/${encodeURIComponent(story.id)}`} className="studio-story-link">
                                    <Clapperboard className="studio-entry-icon" aria-hidden />
                                    <strong>{story.title}</strong>
                                    <span>{story.ratio} · {story.durationSeconds} 秒 · {STATUS_LABEL[story.status] || story.status}</span>
                                    <small>{new Date(story.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
                                </Link>
                                <button type="button" className="studio-icon-button" aria-label={`删除 ${story.title}`} onClick={() => removeStory(story.id, story.title)}><Trash2 aria-hidden /></button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <AppModal rootClassName="studio-modal" open={Boolean(brief)} width={640} title={genre ? `${genre.label} · 简报` : "简报"} okText={starting ? "正在创建…" : "开始导演"} cancelText="取消" okButtonProps={{ disabled: starting || Boolean(brief && directorBriefError(brief)), icon: <Sparkles aria-hidden /> }} onOk={startFromBrief} onCancel={() => setBrief(null)}>
                {brief && genre ? (
                    <div className="studio-popup studio-form-stack">
                        <div className="studio-chip-list" role="group" aria-label="视频类型">
                            {DIRECTOR_GENRES.map((item) => <button key={item.id} type="button" aria-pressed={brief.genre === item.id} onClick={() => setField("genre", item.id)}>{item.label}</button>)}
                        </div>
                        <label className="studio-field">
                            <span>{genre.subjectLabel} <b aria-hidden>*</b></span>
                            <input value={brief.subject} maxLength={200} placeholder={genre.subjectPlaceholder} onChange={(event) => setField("subject", event.target.value)} />
                        </label>
                        <label className="studio-field">
                            <span>补充要求 <small>{Array.from(brief.points).length}/2000</small></span>
                            <textarea value={brief.points} maxLength={2000} rows={4} placeholder={genre.pointsPlaceholder} onChange={(event) => setField("points", event.target.value)} />
                        </label>
                        <label className="studio-field">
                            <span>风格</span>
                            <input value={brief.style} maxLength={120} placeholder="例如：干净高级、暖色调、电影感" onChange={(event) => setField("style", event.target.value)} />
                        </label>
                        <div className="studio-filter" role="group" aria-label="成片时长">
                            {DIRECTOR_DURATIONS.map((seconds) => <button key={seconds} type="button" aria-pressed={brief.durationSeconds === seconds} onClick={() => setField("durationSeconds", seconds)}>{seconds} 秒</button>)}
                        </div>
                        <div className="studio-filter" role="group" aria-label="画面比例">
                            {DIRECTOR_RATIOS.map((item) => <button key={item} type="button" aria-pressed={brief.ratio === item} onClick={() => setField("ratio", item)}>{item}</button>)}
                        </div>
                        <div className="studio-check-row">
                            <label><input type="checkbox" checked={brief.voiceover} onChange={(event) => setField("voiceover", event.target.checked)} />旁白配音</label>
                            <label><input type="checkbox" checked={brief.subtitles} onChange={(event) => setField("subtitles", event.target.checked)} />字幕</label>
                            <label><input type="checkbox" checked={brief.music} onChange={(event) => setField("music", event.target.checked)} />背景音乐</label>
                        </div>
                        <div className="studio-field">
                            <span>角色（可选，最多 {MAX_CHARACTERS} 个）<Link to="/studio/characters" className="studio-block-link">角色库</Link></span>
                            {characters.length ? (
                                <StudioCharacterGrid characters={characters} selected={brief.characterIds} onToggle={(character) => {
                                    const selected = brief.characterIds.includes(character.id);
                                    if (!selected && brief.characterIds.length >= MAX_CHARACTERS) {
                                        message.warning(`最多选 ${MAX_CHARACTERS} 个角色`);
                                        return;
                                    }
                                    setField("characterIds", selected ? brief.characterIds.filter((id) => id !== character.id) : [...brief.characterIds, character.id]);
                                }} />
                            ) : <p className="studio-hint">{charactersQuery.isLoading ? "正在读取…" : "角色库还是空的。需要固定形象的人物，可以先去角色库建好。"}</p>}
                        </div>
                        <label className="studio-field">
                            <span>品牌（可选）</span>
                            <select className="studio-select" aria-label="品牌套件" value={brand.kit?.id || ""} onChange={(event) => brand.setChoice(event.target.value)}>
                                <option value="">不使用品牌</option>
                                {brand.kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.isDefault ? "（默认）" : ""}</option>)}
                            </select>
                        </label>
                        <p className="studio-hint">{runMode === "auto" ? "直接做：写完分镜后自动生成画面、视频、配音并合成成片。" : "引导我：导演先写分镜给你确认，每一步生成前都会先问你。"}</p>
                    </div>
                ) : null}
            </AppModal>
        </StudioShell>
    );
}
