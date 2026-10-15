import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Check, Clapperboard, FolderOpen, Sparkles, UserRound } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { listCharacters, type ProjectCharacterDetail } from "@/services/api/projects";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { startStudioDirectorRun } from "./studio-agent";
import { studioCharacterCover } from "./studio-characters";
import {
    compileDirectorPrompt,
    DEFAULT_DIRECTOR_BRIEF,
    DIRECTOR_BUDGET_MAX,
    DIRECTOR_BUDGET_MIN,
    DIRECTOR_DURATIONS,
    DIRECTOR_GENRES,
    DIRECTOR_RATIOS,
    directorBriefError,
    directorGenre,
    directorProjectSubject,
    type DirectorBrief,
    type DirectorGenre,
} from "./studio-director";
import { StudioShell } from "./studio-shell";
import { useStudioBrandChoice } from "./use-studio-brand";

const MAX_CHARACTERS = 3;

/** AI 导演：填一份简报，导演在专属画布上写方案、出分镜、确认后逐镜生成并剪进时间线。 */
export default function StudioDirectorPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [brief, setBrief] = useState<DirectorBrief>(() => {
        const genre = searchParams.get("genre") as DirectorGenre | null;
        return { ...DEFAULT_DIRECTOR_BRIEF, ...(genre && DIRECTOR_GENRES.some((item) => item.id === genre) ? { genre } : {}) };
    });
    const [selectedCharacters, setSelectedCharacters] = useState<ProjectCharacterDetail[]>([]);
    const [starting, setStarting] = useState(false);
    const brand = useStudioBrandChoice(true);
    const genre = directorGenre(brief.genre);
    const set = <K extends keyof DirectorBrief>(key: K, value: DirectorBrief[K]) => setBrief((current) => ({ ...current, [key]: value }));

    const charactersQuery = useQuery({ queryKey: ["characters", "studio-director"], queryFn: () => listCharacters({ page: 1, pageSize: 48 }) });
    const characters = charactersQuery.data?.characters || [];

    // 从角色库「交给 AI 导演」进入时预选该角色。
    // 先把参数存进状态再清地址栏；读取请求只跟随这个状态，清参数不会打断它。
    const [presetCharacterId, setPresetCharacterId] = useState(() => searchParams.get("character") || "");
    useEffect(() => {
        const id = searchParams.get("character");
        if (!id) return;
        setPresetCharacterId(id);
        const next = new URLSearchParams(searchParams);
        next.delete("character");
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);
    useEffect(() => {
        if (!presetCharacterId) return;
        let active = true;
        void listCharacters({ ids: [presetCharacterId], pageSize: 1 })
            .then((page) => {
                const detail = page.characters[0];
                if (active && detail) setSelectedCharacters((current) => (current.some((item) => item.asset.id === detail.asset.id) ? current : [...current, detail].slice(0, MAX_CHARACTERS)));
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [presetCharacterId]);

    const toggleCharacter = (detail: ProjectCharacterDetail) => {
        setSelectedCharacters((current) => {
            if (current.some((item) => item.asset.id === detail.asset.id)) return current.filter((item) => item.asset.id !== detail.asset.id);
            if (current.length >= MAX_CHARACTERS) {
                message.warning(`最多选 ${MAX_CHARACTERS} 个角色`);
                return current;
            }
            return [...current, detail];
        });
    };

    const projects = useCanvasStore((state) => state.projects);
    const directorProjects = useMemo(
        () => projects.filter((project) => directorProjectSubject(project.title) !== null).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 12),
        [projects],
    );

    const blockReason = directorBriefError(brief);
    const preview = useMemo(
        () => compileDirectorPrompt(brief, { brand: brand.context, characters: selectedCharacters.map((detail) => ({ name: detail.asset.title })) }).displayText,
        [brand.context, brief, selectedCharacters],
    );

    const start = async () => {
        if (blockReason || starting) return;
        setStarting(true);
        try {
            navigate(await startStudioDirectorRun(brief, { brand: brand.context, characters: selectedCharacters }));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "启动失败，请重试");
            setStarting(false);
        }
    };

    return (
        <StudioShell title="AI 导演">
            <div className="studio-director">
                <section className="studio-panel" aria-label="导演简报">
                    <div className="studio-panel-scroll">
                        <div className="studio-tool-header">
                            <Clapperboard aria-hidden />
                            <div><strong>AI 导演</strong><span>填好简报，导演先出方案和分镜给你确认，再逐镜生成、剪成片。</span></div>
                        </div>
                        <div className="studio-block">
                            <div className="studio-block-title">视频类型</div>
                            <div className="studio-mode-list" role="group" aria-label="视频类型">
                                {DIRECTOR_GENRES.map((item) => (
                                    <button key={item.id} type="button" aria-pressed={brief.genre === item.id} onClick={() => set("genre", item.id)}>
                                        {item.label}
                                        <small>{item.description}</small>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="studio-block">
                            <label className="studio-field">
                                <span>{genre.subjectLabel} <b aria-hidden>*</b></span>
                                <input value={brief.subject} maxLength={200} placeholder={genre.subjectPlaceholder} onChange={(event) => set("subject", event.target.value)} />
                            </label>
                            <label className="studio-field">
                                <span>补充要求</span>
                                <textarea value={brief.points} maxLength={2000} rows={4} placeholder={genre.pointsPlaceholder} onChange={(event) => set("points", event.target.value)} />
                            </label>
                            <label className="studio-field">
                                <span>风格</span>
                                <input value={brief.style} maxLength={120} placeholder="例如：干净高级、暖色调、电影感" onChange={(event) => set("style", event.target.value)} />
                            </label>
                        </div>
                        <div className="studio-block">
                            <div className="studio-block-title">时长与比例</div>
                            <div className="studio-filter" role="group" aria-label="成片时长">
                                {DIRECTOR_DURATIONS.map((seconds) => <button key={seconds} type="button" aria-pressed={brief.durationSeconds === seconds} onClick={() => set("durationSeconds", seconds)}>{seconds} 秒</button>)}
                            </div>
                            <div className="studio-filter" role="group" aria-label="画面比例">
                                {DIRECTOR_RATIOS.map((ratio) => <button key={ratio} type="button" aria-pressed={brief.ratio === ratio} onClick={() => set("ratio", ratio)}>{ratio}</button>)}
                            </div>
                            <div className="studio-check-row">
                                <label><input type="checkbox" checked={brief.voiceover} onChange={(event) => set("voiceover", event.target.checked)} />旁白配音</label>
                                <label><input type="checkbox" checked={brief.subtitles} onChange={(event) => set("subtitles", event.target.checked)} />字幕</label>
                                <label><input type="checkbox" checked={brief.music} onChange={(event) => set("music", event.target.checked)} />背景音乐</label>
                            </div>
                        </div>
                        <div className="studio-block">
                            <div className="studio-block-title">角色 <em>可选，最多 {MAX_CHARACTERS} 个</em><Link to="/studio/characters" className="studio-block-link">角色库</Link></div>
                            {characters.length ? (
                                <div className="studio-character-picker">
                                    {characters.map((detail) => {
                                        const selected = selectedCharacters.some((item) => item.asset.id === detail.asset.id);
                                        const cover = studioCharacterCover(detail);
                                        return (
                                            <button key={detail.asset.id} type="button" aria-pressed={selected} title={detail.asset.title} onClick={() => toggleCharacter(detail)}>
                                                {cover ? <img src={cover} alt="" loading="lazy" /> : <UserRound aria-hidden />}
                                                <span>{detail.asset.title}</span>
                                                {selected ? <Check className="studio-pick-check" aria-hidden /> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : <p className="studio-hint">{charactersQuery.isLoading ? "正在读取…" : "角色库还是空的。需要固定形象的人物，可以先去角色库建好。"}</p>}
                        </div>
                        <div className="studio-block">
                            <div className="studio-block-title">品牌 <em>可选</em><Link to="/studio/brand" className="studio-block-link">管理</Link></div>
                            <select className="studio-select" aria-label="品牌套件" value={brand.kit?.id || ""} onChange={(event) => brand.setChoice(event.target.value)}>
                                <option value="">不使用品牌</option>
                                {brand.kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.isDefault ? "（默认）" : ""}</option>)}
                            </select>
                        </div>
                        <div className="studio-block">
                            <label className="studio-field">
                                <span>预算上限（积分）</span>
                                <input type="number" min={DIRECTOR_BUDGET_MIN} max={DIRECTOR_BUDGET_MAX} step={10} value={Number.isFinite(brief.budgetCredits) ? brief.budgetCredits : ""} onChange={(event) => set("budgetCredits", event.target.value === "" ? Number.NaN : Number(event.target.value))} />
                            </label>
                            <p className="studio-hint">导演每次生成前都会先报价，等你确认才扣积分；总花费不会超过这个上限。</p>
                        </div>
                    </div>
                    <div className="studio-panel-footer">
                        <button type="button" className="studio-generate-button" disabled={Boolean(blockReason) || starting} onClick={() => void start()}>
                            <Sparkles aria-hidden />
                            {starting ? "正在准备导演…" : "开始导演"}
                        </button>
                        <p className="studio-block-reason" role="status">{blockReason || "开始后会打开导演画布。第一步只写方案和分镜，不生成图片和视频。"}</p>
                    </div>
                </section>
                <div className="studio-director-side">
                    <section className="studio-panel studio-director-preview" aria-labelledby="studio-director-preview-title">
                        <div className="studio-list-head"><strong id="studio-director-preview-title">导演会收到的简报</strong></div>
                        <pre className="studio-preview-text">{preview}</pre>
                        <ol className="studio-steps">
                            <li><b>写方案和分镜</b><span>每个镜头的画面、景别、运镜、台词和时长，等你确认。</span></li>
                            <li><b>逐镜生成</b><span>每次生成前报模型和积分，你点同意才开始。</span></li>
                            <li><b>剪成片</b><span>按分镜顺序放进时间线，补上配音、字幕和音乐，可直接导出。</span></li>
                        </ol>
                    </section>
                    <section className="studio-panel" aria-labelledby="studio-director-projects-title">
                        <div className="studio-list-head"><strong id="studio-director-projects-title">导演项目</strong></div>
                        <div className="studio-list-scroll">
                            {directorProjects.length ? directorProjects.map((project) => (
                                <Link key={project.id} to={`/canvas/${encodeURIComponent(project.id)}?agent=1`} className="studio-list-item">
                                    <span className="studio-brand-logo"><FolderOpen aria-hidden /></span>
                                    <span className="studio-list-text">
                                        <b>{directorProjectSubject(project.title)}</b>
                                        <small>{new Date(project.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {project.nodes.length} 个节点</small>
                                    </span>
                                </Link>
                            )) : <p className="studio-hint">还没有导演项目。</p>}
                        </div>
                    </section>
                </div>
            </div>
        </StudioShell>
    );
}
