import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { requireUser } from "@/stores/use-auth-gate-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowUpLeft, Clapperboard, Plus, Sparkles, Trash2 } from "./studio-icons";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

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
    directorDefaultTextModel,
    directorGenre,
    directorKickoffMessage,
    directorStoryTitle,
    type DirectorBrief,
    type DirectorGenre,
    type DirectorRunMode,
} from "./studio-director";
import { StudioPosterCard } from "./studio-poster-card";
import { STUDIO_QUICK_STARTS } from "./studio-quickstarts";
import { StudioShell } from "./studio-shell";
import { groupedTextModelOptions, StudioSelect } from "./studio-select";
import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { useStudioToolCovers } from "./use-studio-tool-meta";
import { useStudioBrandChoice } from "./use-studio-brand";

const MAX_CHARACTERS = 3;
const RUN_MODE_KEY = "studio.director.run-mode.v1";
// 与导演工作台共用，首页选的模型进入项目后继续沿用。
const TEXT_MODEL_KEY = "studio.director.text-model.v1";
const EXAMPLES = ["做一支咖啡店开业宣传片", "做一个外卖小哥逆袭的短剧", "做一条楼盘样板间展示视频"];
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
    const config = useEffectiveConfig();
    const textModels = useMemo(() => selectableModelsByCapability(config, "text"), [config]);
    const [textModelChoice, setTextModelChoice] = useState(() => {
        try {
            return window.localStorage.getItem(TEXT_MODEL_KEY) || "";
        } catch {
            return "";
        }
    });
    const textModel = directorDefaultTextModel(textModels, (model) => modelDisplayName(config, model), textModelChoice, config.textModel);
    const chooseTextModel = (value: string) => {
        setTextModelChoice(value);
        try {
            window.localStorage.setItem(TEXT_MODEL_KEY, value);
        } catch {
            // 浏览器禁用存储时只在本页生效。
        }
    };
    const [brief, setBrief] = useState<DirectorBrief | null>(null);
    const [starting, setStarting] = useState(false);
    const covers = useStudioToolCovers();
    const handoffRef = useRef(false);
    const brand = useStudioBrandChoice(true);
    const charactersQuery = useStudioCharacters();
    const characters = charactersQuery.data || [];
    const storiesQuery = useQuery({ queryKey: ["studio", "stories"], queryFn: async () => (await listStudioStories()).items, enabled: Boolean(user) });
    const stories = storiesQuery.data || [];
    // 侧栏「导演项目」带 #studio-director-projects 进来时，项目列表加载后滚到那里。
    const { hash } = useLocation();
    useEffect(() => {
        if (hash !== "#studio-director-projects" || storiesQuery.isLoading) return;
        document.getElementById("studio-director-projects")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [hash, storiesQuery.isLoading]);

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
        if (!requireUser()) return;
        setStarting(true);
        try {
            const story = await createStudioStory({
                title: directorStoryTitle(value),
                ratio: value.ratio,
                durationSeconds: value.durationSeconds,
                brief: { ...value, kickoff },
                settings: { runMode, mode: "shots", brandKitId: brand.kit?.id || "" },
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

    useEffect(() => {
        const text = searchParams.get("q")?.trim();
        if (!text || handoffRef.current || !user) return;
        handoffRef.current = true;
        setSearchParams({}, { replace: true });
        void start({ ...DEFAULT_DIRECTOR_BRIEF, genre: "free", subject: Array.from(text).slice(0, 200).join(""), points: "", ratio, durationSeconds: duration }, text);
        // start 只在首次带入时触发一次。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, user]);

    const genre = brief ? directorGenre(brief.genre) : undefined;
    const setField = <K extends keyof DirectorBrief>(key: K, value: DirectorBrief[K]) => setBrief((current) => (current ? { ...current, [key]: value } : current));

    return (
        <StudioShell title="AI 导演">
            <div className="studio-home">
                <section className="studio-director-hero" aria-labelledby="studio-director-title">
                    <h1 id="studio-director-title">让 AI 导演你的下一支视频</h1>
                    <p>和 AI 聊聊，就能做出一支完整的视频。</p>
                    <div className="studio-composer is-hero">
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
                            <StudioSelect ariaLabel="画面比例" value={ratio} options={DIRECTOR_RATIOS.map((item) => ({ value: item, label: item }))} onChange={setRatio} placement="bottomLeft" />
                            <StudioSelect ariaLabel="成片时长" value={String(duration)} options={DIRECTOR_DURATIONS.map((item) => ({ value: String(item), label: `${item} 秒` }))} onChange={(value) => setDuration(Number(value))} placement="bottomLeft" />
                            <span style={{ flex: 1 }} />
                            <StudioSelect
                                className="studio-pill-select is-small"
                                ariaLabel="导演模型"
                                icon={<Sparkles aria-hidden />}
                                value={textModel}
                                options={groupedTextModelOptions(textModels, (model) => modelDisplayName(config, model))}
                                empty="无可用模型"
                                onChange={chooseTextModel}
                                placement="bottomRight"
                            />
                            <StudioSelect
                                ariaLabel="执行方式"
                                value={runMode}
                                options={[
                                    { value: "guide", label: "引导我", hint: "每一步生成前先问你" },
                                    { value: "auto", label: "直接做", hint: "写完分镜后自动生成成片" },
                                ]}
                                onChange={(value) => setRunMode(value as DirectorRunMode)}
                                placement="bottomRight"
                            />
                            <button type="button" className="studio-send-orb" aria-label="开始导演" disabled={!prompt.trim() || starting} onClick={startFromPrompt}><ArrowUp aria-hidden /></button>
                        </div>
                    </div>
                    <div className="studio-example-chips">
                        {EXAMPLES.map((text) => <button key={text} type="button" onClick={() => setPrompt(text)}>{text}<ArrowUpLeft aria-hidden /></button>)}
                    </div>
                </section>

                <section className="studio-section" aria-labelledby="studio-director-quick">
                    <div className="studio-section-head">
                        <h2 id="studio-director-quick">按行业快速开始</h2>
                    </div>
                    <div className="studio-poster-grid">
                        {STUDIO_QUICK_STARTS.map((item) => (
                            <StudioPosterCard key={item.genre} title={item.label} icon={item.icon} gradient={item.gradient} cover={covers[item.coverId]} badge={item.badge} onClick={() => setBrief({ ...DEFAULT_DIRECTOR_BRIEF, genre: item.genre })} />
                        ))}
                    </div>
                </section>

                <section className="studio-section" aria-labelledby="studio-director-projects">
                    <div className="studio-section-head">
                        <h2 id="studio-director-projects">导演项目</h2>
                    </div>
                    <div className="studio-poster-grid">
                        <button type="button" className="studio-create-tile" onClick={() => setBrief({ ...DEFAULT_DIRECTOR_BRIEF, genre: "free" })}>
                            <Plus aria-hidden />
                            <strong>新建项目</strong>
                        </button>
                        {stories.map((story) => (
                            <div key={story.id} className="studio-story-card">
                                <Link to={`/studio/director/${encodeURIComponent(story.id)}`} className="studio-story-link">
                                    <span className="studio-story-art" aria-hidden><Clapperboard /></span>
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
                        <div className="studio-field">
                            <span>品牌（可选）</span>
                            <StudioSelect
                                className="studio-select"
                                ariaLabel="品牌套件"
                                value={brand.kit?.id || ""}
                                options={[{ value: "", label: "不使用品牌" }, ...brand.kits.map((kit) => ({ value: kit.id, label: `${kit.name}${kit.isDefault ? "（默认）" : ""}` }))]}
                                onChange={brand.setChoice}
                                placement="bottomLeft"
                            />
                        </div>
                        <p className="studio-hint">{runMode === "auto" ? "直接做：写完分镜后自动生成画面、视频、配音并合成成片。" : "引导我：导演先写分镜给你确认，每一步生成前都会先问你。"}</p>
                    </div>
                ) : null}
            </AppModal>
        </StudioShell>
    );
}
