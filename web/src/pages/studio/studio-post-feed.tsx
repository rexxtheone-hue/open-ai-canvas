import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { App } from "antd";
import { requireUser } from "@/stores/use-auth-gate-store";
import { Link, useLocation, useNavigate } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { deleteStudioPost, likeStudioPost, remixStudioPost, type StudioKind, type StudioPost } from "@/services/api/studio";
import { STUDIO_REUSE_KEY } from "./studio-agent";
import { studioRemixAsWork, studioRemixToolPath } from "./studio-community";
import { Copy, Heart, Trash2, Wand2 } from "./studio-icons";

export const STUDIO_POST_KIND_LABELS: Record<StudioKind, string> = { image: "图片", video: "视频", audio: "音频" };

/** 创作者主页链接：站内用 /studio/u/，未登录的公开页用 /u/。 */
export function studioProfilePath(handle: string, guest = false) {
    return `${guest ? "/u/" : "/studio/u/"}${encodeURIComponent(handle)}`;
}

export function StudioCreatorAvatar({ name, url, size = 22 }: { name: string; url?: string; size?: number }) {
    const initial = (name.trim()[0] || "?").toUpperCase();
    return url ? (
        <img className="studio-creator-avatar" src={url} alt="" style={{ width: size, height: size }} />
    ) : (
        <span className="studio-creator-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }} aria-hidden>
            {initial}
        </span>
    );
}

function PostAuthor({ post, guest }: { post: StudioPost; guest: boolean }) {
    const name = post.author || "匿名";
    if (!post.authorHandle)
        return (
            <span className="studio-post-author">
                <StudioCreatorAvatar name={name} url={post.authorAvatar} />
                {name}
            </span>
        );
    return (
        <Link className="studio-post-author" to={studioProfilePath(post.authorHandle, guest)} onClick={(event) => event.stopPropagation()}>
            <StudioCreatorAvatar name={name} url={post.authorAvatar} />
            <span>{name}</span>
        </Link>
    );
}

export function PostMedia({ post, controls = false }: { post: StudioPost; controls?: boolean }) {
    const media = post.media[0];
    if (!media) return <div className="studio-post-empty">文件不可用</div>;
    if (media.kind === "video") {
        return controls ? (
            <video src={media.url} controls playsInline />
        ) : (
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
    if (media.kind === "audio")
        return (
            <div className="studio-post-audio">
                <audio controls preload="none" src={media.url} aria-label="播放音频" />
            </div>
        );
    return <img src={media.url} alt={post.title} loading="lazy" />;
}

/**
 * 社区作品网格 + 详情弹窗：灵感社区和创作者主页共用，点赞、做同款、撤回都在这里处理。
 * guest 为公开页（未登录），点赞和做同款会先去登录。
 */
export function StudioPostFeed({
    posts,
    setPosts,
    nextOffset,
    loadingMore,
    onLoadMore,
    guest = false,
    hideAuthor = false,
}: {
    posts: StudioPost[];
    setPosts: Dispatch<SetStateAction<StudioPost[]>>;
    nextOffset?: number;
    loadingMore: boolean;
    onLoadMore: (offset: number) => void;
    guest?: boolean;
    hideAuthor?: boolean;
}) {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const [detail, setDetail] = useState<StudioPost | null>(null);
    const [remixing, setRemixing] = useState("");

    const goLogin = () => requireUser();

    const patchPost = (id: string, patch: Partial<StudioPost>) => {
        setPosts((current) => current.map((post) => (post.id === id ? { ...post, ...patch } : post)));
        setDetail((current) => (current?.id === id ? { ...current, ...patch } : current));
    };

    const toggleLike = async (post: StudioPost) => {
        if (guest) return goLogin();
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
        if (guest) return goLogin();
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

    let more: ReactNode = null;
    if (nextOffset !== undefined) {
        more = (
            <div className="studio-load-more">
                <button type="button" className="studio-mini-button" disabled={loadingMore} onClick={() => onLoadMore(nextOffset)}>
                    {loadingMore ? "加载中…" : "加载更多"}
                </button>
            </div>
        );
    }

    return (
        <>
            <div className="studio-community-grid">
                {posts.map((post) => (
                    <article key={post.id} className="studio-post-card">
                        <button type="button" className="studio-post-media" aria-label={`查看 ${post.title}`} onClick={() => setDetail(post)}>
                            <PostMedia post={post} />
                            <span className="studio-work-kind">{STUDIO_POST_KIND_LABELS[post.kind]}</span>
                            {post.isTemplate ? <span className="studio-post-badge">模板</span> : post.featured ? <span className="studio-post-badge">精选</span> : null}
                        </button>
                        <div className="studio-post-body">
                            <strong title={post.title}>{post.title}</strong>
                            <div className="studio-post-meta">
                                {hideAuthor ? <span /> : <PostAuthor post={post} guest={guest} />}
                                <button type="button" className="studio-like" aria-pressed={post.liked} aria-label={post.liked ? "取消点赞" : "点赞"} onClick={() => void toggleLike(post)}>
                                    <Heart aria-hidden />
                                    {post.likeCount}
                                </button>
                            </div>
                            {post.allowRemix || post.mine ? (
                                <button type="button" className="studio-mini-button" disabled={remixing === post.id} onClick={() => void remix(post)}>
                                    <Wand2 aria-hidden />
                                    做同款{post.remixCount ? ` · ${post.remixCount}` : ""}
                                </button>
                            ) : (
                                <span className="studio-hint">作者未开放做同款</span>
                            )}
                        </div>
                    </article>
                ))}
            </div>
            {more}
            <AppModal rootClassName="studio-modal" open={Boolean(detail)} title={detail?.title} footer={null} centered destroyOnHidden width="min(980px, calc(100vw - 32px))" onCancel={() => setDetail(null)}>
                {detail ? (
                    <div className="studio-post-detail">
                        <div className="studio-post-detail-media">
                            <PostMedia post={detail} controls />
                        </div>
                        <div className="studio-post-detail-side">
                            <div className="studio-post-detail-author">
                                <PostAuthor post={detail} guest={guest} />
                                <span className="studio-hint">{new Date(detail.createdAt).toLocaleDateString("zh-CN")}</span>
                            </div>
                            {detail.prompt ? (
                                <div className="studio-block">
                                    <div className="studio-block-title">
                                        提示词
                                        <button type="button" className="studio-block-link" onClick={() => void navigator.clipboard?.writeText(detail.prompt || "").then(() => message.success("已复制"))}>
                                            <Copy aria-hidden />
                                            复制
                                        </button>
                                    </div>
                                    <pre className="studio-preview-text">{detail.prompt}</pre>
                                </div>
                            ) : (
                                <p className="studio-hint">作者没有公开提示词和参数。</p>
                            )}
                            <div className="studio-form-actions">
                                <button type="button" className="studio-like" aria-pressed={detail.liked} onClick={() => void toggleLike(detail)}>
                                    <Heart aria-hidden />
                                    {detail.likeCount}
                                </button>
                                {detail.mine ? (
                                    <button type="button" className="studio-mini-button is-danger" onClick={() => withdraw(detail)}>
                                        <Trash2 aria-hidden />
                                        撤回
                                    </button>
                                ) : null}
                                <span style={{ flex: 1 }} />
                                {detail.allowRemix || detail.mine ? (
                                    <button type="button" className="studio-generate-button is-compact" disabled={Boolean(remixing)} onClick={() => void remix(detail)}>
                                        <Wand2 aria-hidden />
                                        做同款
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </AppModal>
        </>
    );
}
