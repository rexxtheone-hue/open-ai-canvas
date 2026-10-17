import { useCallback, useEffect, useRef, useState } from "react";
import { App, Spin } from "antd";
import { Copy, Heart, Search, Sparkles, Trash2, Wand2 } from "./studio-icons";
import { useNavigate, useSearchParams } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { deleteStudioPost, likeStudioPost, listStudioCommunity, remixStudioPost, type StudioCommunityQuery, type StudioKind, type StudioPost } from "@/services/api/studio";
import { STUDIO_REUSE_KEY } from "./studio-agent";
import { studioRemixAsWork, studioRemixToolPath } from "./studio-community";
import { StudioShell } from "./studio-shell";

type Tab = "featured" | "latest" | "popular" | "templates" | "mine";

const TABS: Array<{ id: Tab; label: string }> = [
    { id: "featured", label: "精选" },
    { id: "latest", label: "最新" },
    { id: "popular", label: "最热" },
    { id: "templates", label: "模板" },
    { id: "mine", label: "我的发布" },
];

const KIND_LABELS: Record<StudioKind, string> = { image: "图片", video: "视频", audio: "音频" };

function tabQuery(tab: Tab): StudioCommunityQuery {
    if (tab === "templates") return { templates: true, sort: "popular" };
    if (tab === "mine") return { mine: true, sort: "latest" };
    return { sort: tab };
}

/** 灵感社区：看别人发布的作品，一键做同款。 */
export default function StudioInspirePage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(() => (TABS.some((item) => item.id === searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "featured"));
    const [kind, setKind] = useState<StudioKind | "all">("all");
    const [keyword, setKeyword] = useState("");
    const q = useDebouncedValue(keyword.trim(), 300);
    const [posts, setPosts] = useState<StudioPost[]>([]);
    const [nextOffset, setNextOffset] = useState<number | undefined>();
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [detail, setDetail] = useState<StudioPost | null>(null);
    const [remixing, setRemixing] = useState("");
    const requestRef = useRef(0);

    const load = useCallback(async (offset = 0) => {
        const request = ++requestRef.current;
        if (offset) setLoadingMore(true);
        else setLoading(true);
        setError("");
        try {
            const page = await listStudioCommunity({ ...tabQuery(tab), kind, q, offset, pageSize: 24 });
            if (request !== requestRef.current) return;
            setPosts((current) => (offset ? [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))] : page.posts));
            setNextOffset(page.nextOffset);
        } catch (cause) {
            if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "读取失败");
        } finally {
            if (request === requestRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [kind, q, tab]);

    useEffect(() => {
        void load(0);
    }, [load]);

    const patchPost = (id: string, patch: Partial<StudioPost>) => {
        setPosts((current) => current.map((post) => (post.id === id ? { ...post, ...patch } : post)));
        setDetail((current) => (current?.id === id ? { ...current, ...patch } : current));
    };

    const toggleLike = async (post: StudioPost) => {
        const liked = !post.liked;
        patchPost(post.id, { liked, likeCount: Math.max(0, post.likeCount + (liked ? 1 : -1)) });
        try {
            const result = await likeStudioPost(post.id, liked);
            patchPost(post.id, { liked: result.liked, likeCount: result.likeCount });
        } catch (cause) {
            patchPost(post.id, { liked: post.liked, likeCount: post.likeCount });
            message.error(cause instanceof Error ? cause.message : "操作失败");
        }
    };

    const remix = async (post: StudioPost) => {
        if (remixing) return;
        setRemixing(post.id);
        try {
            const result = await remixStudioPost(post.id);
            try {
                window.sessionStorage.setItem(STUDIO_REUSE_KEY, JSON.stringify(studioRemixAsWork(result)));
            } catch {
                message.error("浏览器存储不可用，无法带入设置");
                return;
            }
            navigate(studioRemixToolPath(result));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "做同款失败");
        } finally {
            setRemixing("");
        }
    };

    const withdraw = (post: StudioPost) => {
        modal.confirm({
            title: "撤回这个作品？",
            content: "作品会从灵感社区移除，你的作品库里仍然保留。",
            okText: "撤回",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await deleteStudioPost(post.id);
                    setPosts((current) => current.filter((item) => item.id !== post.id));
                    setDetail(null);
                    message.success("已撤回");
                } catch (cause) {
                    message.error(cause instanceof Error ? cause.message : "撤回失败");
                }
            },
        });
    };

    return (
        <StudioShell title="灵感">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>灵感社区</h2>
                        <p>看看大家做了什么，喜欢的一键做同款。</p>
                    </div>
                    <label className="studio-search">
                        <Search aria-hidden />
                        <input value={keyword} placeholder="搜索标题或提示词" aria-label="搜索灵感" onChange={(event) => setKeyword(event.target.value)} />
                    </label>
                </div>
                <div className="studio-community-toolbar">
                    <div className="studio-filter" role="group" aria-label="灵感分类">
                        {TABS.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
                    </div>
                    <div className="studio-filter" role="group" aria-label="作品类型">
                        {(["all", "image", "video", "audio"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "all" ? "全部" : KIND_LABELS[value]}</button>)}
                    </div>
                </div>
                {loading ? <div className="studio-empty"><Spin /></div> : error ? (
                    <div className="studio-empty" role="alert"><strong>读取失败</strong><span>{error}</span><button type="button" className="studio-mini-button" onClick={() => void load(0)}>重试</button></div>
                ) : !posts.length ? (
                    <div className="studio-empty"><Sparkles aria-hidden /><strong>{tab === "mine" ? "还没有发布作品" : q ? "没有找到相关作品" : "这里还是空的"}</strong><span>{tab === "mine" ? "在作品库里点「发布到社区」就能分享。" : "换个分类看看，或者先发布一个作品。"}</span></div>
                ) : (
                    <>
                        <div className="studio-community-grid">
                            {posts.map((post) => (
                                <article key={post.id} className="studio-post-card">
                                    <button type="button" className="studio-post-media" aria-label={`查看 ${post.title}`} onClick={() => setDetail(post)}>
                                        <PostMedia post={post} />
                                        <span className="studio-work-kind">{KIND_LABELS[post.kind]}</span>
                                        {post.isTemplate ? <span className="studio-post-badge">模板</span> : post.featured ? <span className="studio-post-badge">精选</span> : null}
                                    </button>
                                    <div className="studio-post-body">
                                        <strong title={post.title}>{post.title}</strong>
                                        <div className="studio-post-meta">
                                            <span>{post.author || "匿名"}</span>
                                            <button type="button" className="studio-like" aria-pressed={post.liked} aria-label={post.liked ? "取消点赞" : "点赞"} onClick={() => void toggleLike(post)}><Heart aria-hidden />{post.likeCount}</button>
                                        </div>
                                        {post.allowRemix || post.mine ? (
                                            <button type="button" className="studio-mini-button" disabled={remixing === post.id} onClick={() => void remix(post)}><Wand2 aria-hidden />做同款{post.remixCount ? ` · ${post.remixCount}` : ""}</button>
                                        ) : <span className="studio-hint">作者未开放做同款</span>}
                                    </div>
                                </article>
                            ))}
                        </div>
                        {nextOffset !== undefined ? (
                            <div className="studio-load-more"><button type="button" className="studio-mini-button" disabled={loadingMore} onClick={() => void load(nextOffset)}>{loadingMore ? "加载中…" : "加载更多"}</button></div>
                        ) : null}
                    </>
                )}
            </div>
            <AppModal open={Boolean(detail)} title={detail?.title} footer={null} centered destroyOnHidden width="min(980px, calc(100vw - 32px))" onCancel={() => setDetail(null)}>
                {detail ? (
                    <div className="studio-post-detail">
                        <div className="studio-post-detail-media"><PostMedia post={detail} controls /></div>
                        <div className="studio-post-detail-side">
                            <p className="studio-hint">{detail.author || "匿名"} · {new Date(detail.createdAt).toLocaleDateString("zh-CN")}</p>
                            {detail.prompt ? (
                                <div className="studio-block">
                                    <div className="studio-block-title">提示词<button type="button" className="studio-block-link" onClick={() => void navigator.clipboard?.writeText(detail.prompt || "").then(() => message.success("已复制"))}><Copy aria-hidden />复制</button></div>
                                    <pre className="studio-preview-text">{detail.prompt}</pre>
                                </div>
                            ) : <p className="studio-hint">作者没有公开提示词和参数。</p>}
                            <div className="studio-form-actions">
                                <button type="button" className="studio-like" aria-pressed={detail.liked} onClick={() => void toggleLike(detail)}><Heart aria-hidden />{detail.likeCount}</button>
                                {detail.mine ? <button type="button" className="studio-mini-button is-danger" onClick={() => withdraw(detail)}><Trash2 aria-hidden />撤回</button> : null}
                                <span style={{ flex: 1 }} />
                                {detail.allowRemix || detail.mine ? <button type="button" className="studio-generate-button is-compact" disabled={Boolean(remixing)} onClick={() => void remix(detail)}><Wand2 aria-hidden />做同款</button> : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </AppModal>
        </StudioShell>
    );
}

function PostMedia({ post, controls = false }: { post: StudioPost; controls?: boolean }) {
    const media = post.media[0];
    if (!media) return <div className="studio-post-empty">文件不可用</div>;
    if (media.kind === "video") {
        return controls ? <video src={media.url} controls playsInline /> : (
            <video
                src={media.url}
                muted
                playsInline
                preload="metadata"
                onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                onMouseLeave={(event) => {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = 0;
                }}
            />
        );
    }
    if (media.kind === "audio") return <div className="studio-post-audio"><audio controls preload="none" src={media.url} aria-label="播放音频" /></div>;
    return <img src={media.url} alt={post.title} loading="lazy" />;
}
