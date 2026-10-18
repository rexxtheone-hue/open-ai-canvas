import { useEffect, useMemo, useState } from "react";
import { App, Spin } from "antd";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNavigate } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { catalogIdOf, type CreationInspiration } from "@/lib/inspirations/catalog";
import { fillablePrompt, resolveInspirations } from "@/lib/inspirations/resolve";
import { templateCategoryCounts, templateCategoryLabel, templateCategoryOf, type TemplateCategoryId } from "@/lib/inspirations/template-categories";
import type { StudioKind } from "@/services/api/studio";
import { loadInspirationCatalog, type InspirationCatalog } from "@/services/inspiration-catalog";
import { useInspirationStore } from "@/stores/use-inspiration-store";
import { STUDIO_ATTACH_KEY } from "./studio-agent";
import { Copy, Heart, Layers, Search, Sparkles, Wand2 } from "./studio-icons";
import { studioCanvasHandoffPath } from "@/lib/canvas/studio-canvas-handoff";
import { StudioShell } from "./studio-shell";
import { studioToolForKind } from "./studio-tools";

const PAGE = 48;
type TemplateKind = Extract<StudioKind, "image" | "video">;
const MODE_LABELS: Record<TemplateKind, string> = { image: "图片", video: "视频" };

function isStudioTemplate(item: CreationInspiration): item is CreationInspiration & { mode: TemplateKind } {
    return item.mode === "image" || item.mode === "video";
}

/** 使用模板：带着提示词打开对应的 Studio 生成工具。 */
export function useStudioTemplateLauncher() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    return (item: CreationInspiration) => {
        if (!isStudioTemplate(item)) return;
        const tool = studioToolForKind(item.mode);
        try {
            window.sessionStorage.setItem(STUDIO_ATTACH_KEY, JSON.stringify({ kind: item.mode, prompt: fillablePrompt(item) }));
        } catch {
            message.error("浏览器存储不可用，无法带入提示词");
            return;
        }
        navigate(tool?.path || "/studio/create-image");
    };
}

/** 读取模板目录（就是 AI Canvas 的模板库），合并用户在 Canvas 里自建、改写、隐藏的条目。 */
export function useStudioTemplateCatalog() {
    const custom = useInspirationStore((state) => state.custom);
    const overrides = useInspirationStore((state) => state.overrides);
    const hidden = useInspirationStore((state) => state.hidden);
    const [catalog, setCatalog] = useState<InspirationCatalog | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setError("");
        loadInspirationCatalog()
            .then((loaded) => {
                if (!cancelled) setCatalog(loaded);
            })
            .catch((cause) => {
                if (!cancelled) setError(cause instanceof Error ? cause.message : "模板加载失败");
            });
        return () => {
            cancelled = true;
        };
    }, [attempt]);
    const items = useMemo(() => (catalog ? resolveInspirations(catalog.entries, { custom, overrides, hidden }).filter(isStudioTemplate) : []), [catalog, custom, hidden, overrides]);
    return { catalog, items, error, retry: () => setAttempt((value) => value + 1) };
}

/**
 * 模板库：和 AI Canvas 的「模板」是同一份目录（收藏也互通），
 * 按统一的用途分类和类型筛选，点「使用模板」带着提示词去生成。
 */
export function StudioTemplateGallery({ kind, query }: { kind: StudioKind | "all"; query: string }) {
    const { message } = App.useApp();
    const launch = useStudioTemplateLauncher();
    const navigate = useNavigate();
    const openTemplateInCanvas = (item: CreationInspiration) => {
        const path = studioCanvasHandoffPath([{ kind: "text", content: item.prompt, title: item.title }, ...(item.image ? [{ kind: "image" as const, dataUrl: "", url: item.image, title: item.title }] : [])]);
        if (path) navigate(path);
    };
    const favorites = useInspirationStore((state) => state.favorites);
    const toggleFavorite = useInspirationStore((state) => state.toggleFavorite);
    const { catalog, items, error, retry } = useStudioTemplateCatalog();
    const [category, setCategory] = useState<TemplateCategoryId | "all" | "favorites">("all");
    const [limit, setLimit] = useState(PAGE);
    const [detail, setDetail] = useState<CreationInspiration | null>(null);

    const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
    const kindItems = useMemo(() => items.filter((item) => kind === "all" || item.mode === kind).map((item) => ({ item, category: templateCategoryOf(item) })), [items, kind]);
    const categoryOptions = useMemo(() => templateCategoryCounts(kindItems.map((entry) => entry.item)), [kindItems]);
    const categoryLabel = (item: CreationInspiration) => templateCategoryLabel(templateCategoryOf(item));

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return kindItems
            .filter((entry) => {
                if (category === "favorites" && !favoriteSet.has(catalogIdOf(entry.item))) return false;
                if (category !== "all" && category !== "favorites" && entry.category !== category) return false;
                if (!needle) return true;
                const item = entry.item;
                return [item.title, item.description, item.prompt, item.promptZh, ...(item.tags || [])].some((text) => text?.toLowerCase().includes(needle));
            })
            .map((entry) => entry.item);
    }, [category, favoriteSet, kindItems, query]);

    useEffect(() => {
        setLimit(PAGE);
    }, [category, kind, query]);

    if (error) {
        return (
            <div className="studio-empty" role="alert">
                <strong>模板加载失败</strong>
                <span>{error}</span>
                <button type="button" className="studio-mini-button" onClick={retry}>
                    重试
                </button>
            </div>
        );
    }
    if (!catalog) {
        return (
            <div className="studio-empty">
                <Spin />
            </div>
        );
    }

    return (
        <div className="studio-templates">
            <div className="studio-template-categories" role="group" aria-label="模板分类">
                <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
                    全部模板<em>{kindItems.length}</em>
                </button>
                <button type="button" aria-pressed={category === "favorites"} onClick={() => setCategory("favorites")}>
                    <Heart aria-hidden />
                    我的收藏
                </button>
                {categoryOptions.map((option) => (
                    <button key={option.id} type="button" aria-pressed={category === option.id} onClick={() => setCategory(option.id)}>
                        {option.label}
                        <em>{option.count}</em>
                    </button>
                ))}
            </div>
            {!filtered.length ? (
                <div className="studio-empty">
                    <Sparkles aria-hidden />
                    <strong>{category === "favorites" ? "还没有收藏的模板" : "没有找到相关模板"}</strong>
                    <span>{category === "favorites" ? "在模板详情里点「收藏」，常用的模板会出现在这里。" : "换个关键词或分类看看。"}</span>
                </div>
            ) : (
                <>
                    <div className="studio-community-grid">
                        {filtered.slice(0, limit).map((item) => {
                            const id = catalogIdOf(item);
                            return (
                                <article key={id} className="studio-post-card studio-template-item">
                                    <button type="button" className="studio-post-media" aria-label={`查看 ${item.title}`} onClick={() => setDetail(item)}>
                                        {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="studio-post-empty">{item.title}</div>}
                                        <span className="studio-work-kind">{MODE_LABELS[item.mode]}</span>
                                    </button>
                                    <div className="studio-post-body">
                                        <strong title={item.title}>{item.title}</strong>
                                        <div className="studio-post-meta">
                                            <span className="studio-hint">{categoryLabel(item)}</span>
                                            <button type="button" className="studio-like" aria-pressed={favoriteSet.has(id)} aria-label={favoriteSet.has(id) ? "取消收藏" : "收藏"} onClick={() => toggleFavorite(id)}>
                                                <Heart aria-hidden />
                                            </button>
                                        </div>
                                        <button type="button" className="studio-mini-button" onClick={() => launch(item)}>
                                            <Wand2 aria-hidden />
                                            使用模板
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    {filtered.length > limit ? (
                        <div className="studio-load-more">
                            <button type="button" className="studio-mini-button" onClick={() => setLimit((value) => value + PAGE)}>
                                加载更多（还有 {filtered.length - limit} 个）
                            </button>
                        </div>
                    ) : null}
                </>
            )}
            <AppModal rootClassName="studio-modal" open={Boolean(detail)} title={detail?.title} footer={null} centered destroyOnHidden width="min(980px, calc(100vw - 32px))" onCancel={() => setDetail(null)}>
                {detail && isStudioTemplate(detail) ? (
                    <div className="studio-post-detail">
                        <div className="studio-post-detail-media">{detail.image ? <img src={detail.image} alt={detail.title} /> : null}</div>
                        <div className="studio-post-detail-side">
                            {detail.description ? <p className="studio-template-description">{detail.description}</p> : null}
                            <div className="studio-block">
                                <div className="studio-block-title">
                                    提示词
                                    <button type="button" className="studio-block-link" onClick={() => void navigator.clipboard?.writeText(fillablePrompt(detail)).then(() => message.success("已复制"))}>
                                        <Copy aria-hidden />
                                        复制
                                    </button>
                                </div>
                                <pre className="studio-preview-text">{fillablePrompt(detail)}</pre>
                            </div>
                            <p className="studio-hint">
                                {[MODE_LABELS[detail.mode], categoryLabel(detail), detail.credit ? `作者 ${detail.credit}` : ""].filter(Boolean).join(" · ")}
                                {detail.sourceUrl ? (
                                    <>
                                        {" · "}
                                        <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                                            原案例
                                        </a>
                                    </>
                                ) : null}
                            </p>
                            <div className="studio-form-actions">
                                <button type="button" className="studio-like" aria-pressed={favoriteSet.has(catalogIdOf(detail))} onClick={() => toggleFavorite(catalogIdOf(detail))}>
                                    <Heart aria-hidden />
                                    {favoriteSet.has(catalogIdOf(detail)) ? "已收藏" : "收藏"}
                                </button>
                                <span style={{ flex: 1 }} />
                                <button type="button" className="studio-chip-button" onClick={() => openTemplateInCanvas(detail)}>
                                    <Layers aria-hidden />
                                    在画布中打开
                                </button>
                                <button type="button" className="studio-generate-button is-compact" onClick={() => launch(detail)}>
                                    <Wand2 aria-hidden />
                                    使用模板
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </AppModal>
        </div>
    );
}

/** 模板页（/studio/templates）：独立于灵感社区，内容是 AI Canvas 的模板库。 */
export default function StudioTemplatesPage() {
    const [keyword, setKeyword] = useState("");
    const query = useDebouncedValue(keyword.trim(), 300);
    const [kind, setKind] = useState<"all" | TemplateKind>("all");
    return (
        <StudioShell title="模板">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>模板</h2>
                        <p>挑一个现成的创意，一键带着提示词去生成。和 AI Canvas 的模板库是同一份。</p>
                    </div>
                    <label className="studio-search">
                        <Search aria-hidden />
                        <input value={keyword} placeholder="搜索模板标题或提示词" aria-label="搜索模板" onChange={(event) => setKeyword(event.target.value)} />
                    </label>
                </div>
                <div className="studio-community-toolbar">
                    <div className="studio-filter" role="group" aria-label="模板类型">
                        {(["all", "image", "video"] as const).map((value) => (
                            <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                                {value === "all" ? "全部" : MODE_LABELS[value]}
                            </button>
                        ))}
                    </div>
                </div>
                <StudioTemplateGallery kind={kind} query={query} />
            </div>
        </StudioShell>
    );
}
