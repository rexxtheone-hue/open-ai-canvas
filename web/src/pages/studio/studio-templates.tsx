import { useEffect, useMemo, useState } from "react";
import { App, Spin } from "antd";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNavigate } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { catalogIdOf, inspirationSourceOf, inspirationSources, type CreationInspiration, type InspirationSourceId } from "@/lib/inspirations/catalog";
import { fillablePrompt, resolveInspirations } from "@/lib/inspirations/resolve";
import type { StudioKind } from "@/services/api/studio";
import { loadInspirationCatalog, type InspirationCatalog } from "@/services/inspiration-catalog";
import { useInspirationStore } from "@/stores/use-inspiration-store";
import { STUDIO_ATTACH_KEY } from "./studio-agent";
import { Copy, Heart, Search, Sparkles, Wand2 } from "./studio-icons";
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
 * 按来源、分类、类型筛选，点「使用模板」带着提示词去生成。
 */
export function StudioTemplateGallery({ kind, query }: { kind: StudioKind | "all"; query: string }) {
    const { message } = App.useApp();
    const launch = useStudioTemplateLauncher();
    const favorites = useInspirationStore((state) => state.favorites);
    const toggleFavorite = useInspirationStore((state) => state.toggleFavorite);
    const { catalog, items, error, retry } = useStudioTemplateCatalog();
    const [source, setSource] = useState<InspirationSourceId | "all" | "favorites">("all");
    const [category, setCategory] = useState("");
    const [limit, setLimit] = useState(PAGE);
    const [detail, setDetail] = useState<CreationInspiration | null>(null);

    const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
    const sources = useMemo(() => {
        const counts = new Map<InspirationSourceId, number>();
        for (const item of items) counts.set(item.sourceId ?? "original", (counts.get(item.sourceId ?? "original") || 0) + 1);
        return [...counts.entries()].filter(([, count]) => count > 0).map(([id, count]) => ({ id, count }));
    }, [items]);
    const categories = source !== "all" && source !== "favorites" ? catalog?.categoriesBySource[source] || [] : [];
    const categoryLabel = (item: CreationInspiration) => {
        const options = catalog?.categoriesBySource[item.sourceId ?? "original"] || [];
        return options.find((option) => option.id === item.category)?.label || "";
    };

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return items.filter((item) => {
            if (kind !== "all" && item.mode !== kind) return false;
            if (source === "favorites" && !favoriteSet.has(catalogIdOf(item))) return false;
            if (source !== "all" && source !== "favorites" && (item.sourceId ?? "original") !== source) return false;
            if (category && item.category !== category) return false;
            if (!needle) return true;
            return [item.title, item.description, item.prompt, item.promptZh, ...(item.tags || [])].some((text) => text?.toLowerCase().includes(needle));
        });
    }, [category, favoriteSet, items, kind, query, source]);

    useEffect(() => {
        setLimit(PAGE);
    }, [category, kind, query, source]);

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

    const pickSource = (value: typeof source) => {
        setSource(value);
        setCategory("");
    };

    return (
        <div className="studio-templates">
            <div className="studio-filter studio-template-sources" role="group" aria-label="模板来源">
                <button type="button" aria-pressed={source === "all"} onClick={() => pickSource("all")}>
                    全部模板
                </button>
                <button type="button" aria-pressed={source === "favorites"} onClick={() => pickSource("favorites")}>
                    <Heart aria-hidden />
                    我的收藏
                </button>
                {sources.map((item) => (
                    <button key={item.id} type="button" aria-pressed={source === item.id} onClick={() => pickSource(item.id)}>
                        {inspirationSources[item.id]?.name || inspirationSources[item.id]?.label || item.id}
                    </button>
                ))}
            </div>
            {categories.length ? (
                <div className="studio-template-categories" role="group" aria-label="模板分类">
                    <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>
                        全部分类
                    </button>
                    {categories.map((option) => (
                        <button key={option.id} type="button" aria-pressed={category === option.id} onClick={() => setCategory(option.id)}>
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}
            {!filtered.length ? (
                <div className="studio-empty">
                    <Sparkles aria-hidden />
                    <strong>{source === "favorites" ? "还没有收藏的模板" : "没有找到相关模板"}</strong>
                    <span>{source === "favorites" ? "在模板详情里点「收藏」，常用的模板会出现在这里。" : "换个关键词或分类看看。"}</span>
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
                                            <span className="studio-hint">{categoryLabel(item) || inspirationSourceOf(item).name || ""}</span>
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
