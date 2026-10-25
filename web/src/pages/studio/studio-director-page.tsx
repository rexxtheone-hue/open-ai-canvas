import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { requireUser } from "@/stores/use-auth-gate-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowUpLeft, Clapperboard, Plus, Sparkles, Trash2 } from "./studio-icons";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

import { createStudioStory, deleteStudioStory, listStudioStories } from "@/services/api/studio-agents";
import { useUserStore } from "@/stores/use-user-store";
import {
    DEFAULT_DIRECTOR_BRIEF,
    DIRECTOR_DURATIONS,
    DIRECTOR_RATIOS,
    directorDefaultTextModel,
    directorStoryTitle,
    type DirectorBrief,
    type DirectorMusic,
    type DirectorRunMode,
} from "./studio-director";
import { StudioQuickStartModal, type QuickStartSubmit } from "./studio-director-quickstart";
import { StudioPosterCard } from "./studio-poster-card";
import { STUDIO_FREE_START, STUDIO_QUICK_STARTS, studioQuickStart, type StudioQuickStart } from "./studio-quickstarts";
import { StudioShell } from "./studio-shell";
import { groupedTextModelOptions, StudioSelect } from "./studio-select";
import { modelDisplayName, selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { useStudioToolCovers } from "./use-studio-tool-meta";
import { useStudioBrandChoice } from "./use-studio-brand";

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
    const [quickStart, setQuickStart] = useState<{ config: StudioQuickStart; characterIds: string[] } | null>(null);
    const [starting, setStarting] = useState(false);
    const covers = useStudioToolCovers();
    const handoffRef = useRef(false);
    const brand = useStudioBrandChoice(true);
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

    // 首页快速开始（?genre=）和角色库「交给 AI 导演」（?character=）直接打开对应表单。
    useEffect(() => {
        const genre = searchParams.get("genre");
        const character = searchParams.get("character");
        if (!genre && !character) return;
        setQuickStart({ config: studioQuickStart(genre) || STUDIO_FREE_START, characterIds: character ? [character] : [] });
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    const start = async (value: DirectorBrief, kickoff: string, options: { title?: string; music?: DirectorMusic } = {}) => {
        if (starting) return;
        if (!requireUser()) return;
        setStarting(true);
        try {
            const story = await createStudioStory({
                title: options.title || directorStoryTitle(value),
                ratio: value.ratio,
                durationSeconds: value.durationSeconds,
                brief: { ...value, kickoff },
                settings: { runMode, mode: "shots", brandKitId: brand.kit?.id || "", ...(options.music ? { music: options.music } : {}) },
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

    const startFromQuickStart = (value: QuickStartSubmit) => {
        void start(value.brief, value.kickoff, { title: value.title, music: value.music });
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
                        <h2 id="studio-director-quick">快速开始</h2>
                    </div>
                    <div className="studio-poster-grid">
                        {STUDIO_QUICK_STARTS.map((item) => (
                            <StudioPosterCard key={item.genre} title={item.label} icon={item.icon} gradient={item.gradient} cover={covers[item.coverId]} badge={item.badge} onClick={() => setQuickStart({ config: item, characterIds: [] })} />
                        ))}
                    </div>
                </section>

                <section className="studio-section" aria-labelledby="studio-director-projects">
                    <div className="studio-section-head">
                        <h2 id="studio-director-projects">导演项目</h2>
                    </div>
                    <div className="studio-poster-grid">
                        <button type="button" className="studio-create-tile" onClick={() => setQuickStart({ config: STUDIO_FREE_START, characterIds: [] })}>
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

            <StudioQuickStartModal
                config={quickStart?.config || null}
                initialCharacterIds={quickStart?.characterIds}
                runMode={runMode}
                starting={starting}
                brandKitId={brand.kit?.id}
                onClose={() => setQuickStart(null)}
                onSubmit={startFromQuickStart}
            />
        </StudioShell>
    );
}
