import { useEffect, useRef, useState } from "react";
import { App, Spin } from "antd";
import { Check, Download, ImagePlus, Loader2, RefreshCw, Search, Share2, Star, Trash2, Waypoints, Wand2 } from "lucide-react";
import { useNavigate } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { generationErrorMessage } from "@/lib/generation-error";
import { getResourceBlob, playbackVariantUrl, resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { recoverGenerationTaskMedia, retryGenerationTask } from "@/services/api/task-center";
import type { StudioKind, StudioMedia, StudioWork } from "@/services/api/studio";
import { createCanvasProjectWithRemoteSync } from "@/services/user-data-sync";
import { CanvasNodeType } from "@/types/canvas";
import { studioSelectionRange, studioWorkFileName, studioWorkIsActive, studioWorkTitle } from "./studio-library-model";
import { notifyStudioWorksChanged, useStudioWorks, type StudioWorksFilter } from "./use-studio-works";
import { StudioPublishModal } from "./studio-publish-modal";

const KIND_LABELS: Record<StudioKind, string> = { image: "图片", video: "视频", audio: "音频" };

export function studioMediaSrc(media: StudioMedia, purpose: "display" | "download" = "display") {
    const resourceId = resourceIdFromStorageKey(media.storageKey);
    if (resourceId && media.kind === "video" && purpose === "display") return playbackVariantUrl(resourceId);
    return resolveResourceUrl(media.storageKey, media.url || "");
}

async function downloadStudioMedia(work: StudioWork, index: number) {
    const media = work.media[index];
    if (!media) return;
    const name = studioWorkFileName(work, index);
    let href = "";
    let revoke = false;
    if (media.storageKey && resourceIdFromStorageKey(media.storageKey)) {
        const blob = await getResourceBlob(media.storageKey);
        if (blob) {
            href = URL.createObjectURL(blob);
            revoke = true;
        }
    }
    if (!href) href = media.url || "";
    if (!href) throw new Error("作品文件暂时不可用");
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.rel = "noopener";
    if (!revoke) link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (revoke) window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** 在新画布里放入作品节点，供用户到 AI Canvas 精修（规则 L4）。 */
async function openWorkInCanvas(work: StudioWork) {
    const nodeType = work.kind === "video" ? CanvasNodeType.Video : work.kind === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
    const nodes = work.media.map((media, index) => createCanvasNode(nodeType, { x: 720 + index * 560, y: 420 }, {
        content: media.storageKey ? resolveResourceUrl(media.storageKey, media.url || "") : media.url,
        storageKey: media.storageKey,
        prompt: work.prompt,
        status: "success",
        ...(media.width && media.height ? { naturalWidth: media.width, naturalHeight: media.height } : {}),
    }));
    if (!nodes.length) throw new Error("作品还没有可用的文件");
    const created = await createCanvasProjectWithRemoteSync(studioWorkTitle(work), undefined, { nodes, connections: [] });
    if (!created.id) throw new Error("画布创建失败，请重试");
    return created.id;
}

type StudioLibraryProps = {
    /** 固定类型时不显示类型筛选（工具页右侧）；独立素材页显示全部类型。 */
    kind?: StudioKind;
    onUseAsReference?: (work: StudioWork, media: StudioMedia) => void;
    onReuseSettings?: (work: StudioWork) => void;
};

export function StudioLibrary({ kind, onUseAsReference, onReuseSettings }: StudioLibraryProps) {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<StudioWorksFilter>({ kind: kind || "all", favorite: false, q: "" });
    const [searchDraft, setSearchDraft] = useState("");
    const { works, loading, loadingMore, error, hasMore, loadMore, refresh, toggleFavorite, removeWorks } = useStudioWorks(filter);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const anchorRef = useRef<string | null>(null);
    const [preview, setPreview] = useState<{ work: StudioWork; media: StudioMedia } | null>(null);
    const [publishTarget, setPublishTarget] = useState<StudioWork | null>(null);
    const [busyId, setBusyId] = useState("");

    useEffect(() => {
        setFilter((current) => (kind && current.kind !== kind ? { ...current, kind } : current));
    }, [kind]);
    useEffect(() => {
        const timer = window.setTimeout(() => setFilter((current) => (current.q === searchDraft ? current : { ...current, q: searchDraft })), 350);
        return () => window.clearTimeout(timer);
    }, [searchDraft]);
    useEffect(() => {
        setSelected((current) => {
            const ids = new Set(works.map((work) => work.id));
            const next = new Set([...current].filter((id) => ids.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [works]);

    const toggleSelect = (work: StudioWork, shift: boolean) => {
        setSelected((current) => {
            if (shift) return studioSelectionRange(works, anchorRef.current, work.id, current);
            const next = new Set(current);
            if (next.has(work.id)) next.delete(work.id);
            else next.add(work.id);
            return next;
        });
        anchorRef.current = work.id;
    };

    const run = async (id: string, action: () => Promise<unknown>, success?: string) => {
        if (busyId) return;
        setBusyId(id);
        try {
            await action();
            if (success) message.success(success);
        } catch (cause) {
            message.error(generationErrorMessage(cause));
        } finally {
            setBusyId("");
        }
    };

    const confirmDelete = (ids: string[]) => {
        modal.confirm({
            title: ids.length > 1 ? `删除 ${ids.length} 个作品？` : "删除这个作品？",
            content: "作品会从作品库移除，已扣的积分和账单记录不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    const removed = await removeWorks(ids);
                    setSelected(new Set());
                    message.success(`已删除 ${removed} 个作品`);
                } catch (cause) {
                    message.error(generationErrorMessage(cause));
                }
            },
        });
    };

    const selectedWorks = works.filter((work) => selected.has(work.id));

    return (
        <section className={`studio-library${selected.size ? " is-selecting" : ""}`} aria-label="作品库">
            <div className="studio-library-toolbar">
                {!kind ? (
                    <div className="studio-filter" role="group" aria-label="作品类型">
                        {(["all", "image", "video", "audio"] as const).map((value) => (
                            <button key={value} type="button" aria-pressed={filter.kind === value} onClick={() => setFilter((current) => ({ ...current, kind: value }))}>
                                {value === "all" ? "全部" : KIND_LABELS[value]}
                            </button>
                        ))}
                    </div>
                ) : null}
                <div className="studio-filter" role="group" aria-label="收藏筛选">
                    <button type="button" aria-pressed={!filter.favorite} onClick={() => setFilter((current) => ({ ...current, favorite: false }))}>全部作品</button>
                    <button type="button" aria-pressed={filter.favorite} onClick={() => setFilter((current) => ({ ...current, favorite: true }))}>收藏</button>
                </div>
                <label className="studio-search">
                    <Search aria-hidden />
                    <input id={`studio-search-${kind || "all"}`} value={searchDraft} placeholder="搜索提示词" aria-label="搜索作品提示词" onChange={(event) => setSearchDraft(event.target.value)} />
                </label>
                <button type="button" className="studio-mini-button" onClick={() => void refresh()} aria-label="刷新作品库"><RefreshCw aria-hidden />刷新</button>
            </div>
            <div className="studio-library-scroll">
                {loading ? (
                    <div className="studio-empty"><Spin /></div>
                ) : error && !works.length ? (
                    <div className="studio-empty" role="alert"><strong>作品读取失败</strong><span>{error}</span><button type="button" className="studio-mini-button" onClick={() => void refresh()}>重试</button></div>
                ) : !works.length ? (
                    <div className="studio-empty"><strong>{filter.favorite ? "还没有收藏的作品" : filter.q ? "没有找到相关作品" : "还没有作品"}</strong><span>{filter.favorite || filter.q ? "换个条件试试。" : "在左边写下想法，点生成，作品会出现在这里。"}</span></div>
                ) : (
                    <>
                        <div className="studio-grid">
                            {works.map((work) => (
                                <StudioWorkCard
                                    key={work.id}
                                    work={work}
                                    selected={selected.has(work.id)}
                                    busy={busyId === work.id}
                                    onSelect={(shift) => toggleSelect(work, shift)}
                                    onPreview={(media) => setPreview({ work, media })}
                                    onFavorite={() => void toggleFavorite(work).catch((cause) => message.error(generationErrorMessage(cause)))}
                                    onDownload={() => void run(work.id, () => downloadStudioMedia(work, 0))}
                                    onUseAsReference={onUseAsReference && work.media[0] ? () => onUseAsReference(work, work.media[0]) : undefined}
                                    onReuseSettings={onReuseSettings ? () => onReuseSettings(work) : undefined}
                                    onOpenInCanvas={() => void run(work.id, async () => navigate(`/canvas/${encodeURIComponent(await openWorkInCanvas(work))}`))}
                                    onRetry={() => void run(work.id, async () => {
                                        if (work.canRecoverMedia) await recoverGenerationTaskMedia(work.id);
                                        else await retryGenerationTask(work.id);
                                        notifyStudioWorksChanged();
                                    }, work.canRecoverMedia ? "正在重新保存作品" : "已重新提交")}
                                    onDelete={() => confirmDelete([work.id])}
                                    onPublish={work.status === "succeeded" && work.media.some((item) => item.storageKey?.startsWith("resource:")) ? () => setPublishTarget(work) : undefined}
                                />
                            ))}
                        </div>
                        {hasMore ? (
                            <div className="studio-load-more">
                                <button type="button" className="studio-mini-button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "加载中…" : "加载更多"}</button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
            {selected.size ? (
                <div className="studio-selection-bar">
                    <span>已选 {selected.size} 个</span>
                    <button type="button" className="studio-mini-button" onClick={() => void run("batch", async () => {
                        for (const work of selectedWorks) for (let index = 0; index < work.media.length; index += 1) await downloadStudioMedia(work, index);
                    })}><Download aria-hidden />下载</button>
                    <button type="button" className="studio-mini-button" onClick={() => confirmDelete([...selected])}><Trash2 aria-hidden />删除</button>
                    <button type="button" className="studio-mini-button" onClick={() => setSelected(new Set())}>取消选择</button>
                </div>
            ) : null}
            {preview?.media.kind === "image" ? <CanvasImagePreview src={preview.media.url} storageKey={preview.media.storageKey} alt={studioWorkTitle(preview.work)} onClose={() => setPreview(null)} /> : null}
            <StudioPublishModal work={publishTarget} onClose={() => setPublishTarget(null)} />
            <AppModal flush open={preview?.media.kind === "video"} title={null} footer={null} centered destroyOnHidden width="min(1160px, calc(100vw - 32px))" onCancel={() => setPreview(null)}>
                {preview?.media.kind === "video" ? <video controls autoPlay style={{ width: "100%", maxHeight: "80vh", display: "block", background: "#000" }} src={studioMediaSrc(preview.media)} /> : null}
            </AppModal>
        </section>
    );
}

type StudioWorkCardProps = {
    work: StudioWork;
    selected: boolean;
    busy: boolean;
    onSelect: (shift: boolean) => void;
    onPreview: (media: StudioMedia) => void;
    onFavorite: () => void;
    onDownload: () => void;
    onUseAsReference?: () => void;
    onReuseSettings?: () => void;
    onOpenInCanvas: () => void;
    onRetry: () => void;
    onDelete: () => void;
    onPublish?: () => void;
};

function StudioWorkCard({ work, selected, busy, onSelect, onPreview, onFavorite, onDownload, onUseAsReference, onReuseSettings, onOpenInCanvas, onRetry, onDelete, onPublish }: StudioWorkCardProps) {
    const media = work.media[0];
    const active = studioWorkIsActive(work);
    const failed = work.status === "failed" || work.status === "cancelled";
    return (
        <article className={`studio-work${selected ? " is-selected" : ""}`} aria-label={studioWorkTitle(work)}>
            {media && !active ? <StudioWorkMedia work={work} media={media} onPreview={() => onPreview(media)} /> : null}
            {active ? (
                <div className="studio-work-state" role="status">
                    <Loader2 className="animate-spin" aria-hidden />
                    <p>{work.status === "succeeded" ? "正在保存作品" : work.status === "queued" ? "排队中" : work.stage || "生成中"}</p>
                    <div className="studio-progress" aria-hidden><i style={{ width: `${Math.max(5, Math.min(100, work.progress || 5))}%` }} /></div>
                </div>
            ) : null}
            {failed ? (
                <div className="studio-work-state is-failed" role="alert">
                    <p>{work.status === "cancelled" ? "已取消" : work.error || "生成失败"}</p>
                    <button type="button" className="studio-mini-button" disabled={busy} onClick={onRetry}>{work.canRecoverMedia ? "重试保存" : "重试"}</button>
                </div>
            ) : null}
            {!active && !failed && !media ? <div className="studio-work-state"><p>作品文件暂时不可用</p></div> : null}
            <span className="studio-work-kind">{KIND_LABELS[work.kind]}{work.media.length > 1 ? ` ×${work.media.length}` : ""}</span>
            <button type="button" className="studio-work-select" aria-pressed={selected} aria-label={selected ? "取消选择" : "选择作品"} onClick={(event) => onSelect(event.shiftKey)}>
                {selected ? <Check aria-hidden /> : null}
            </button>
            {!active ? (
                <div className="studio-work-actions">
                    {media ? <button type="button" aria-pressed={work.favorite} aria-label={work.favorite ? "取消收藏" : "收藏"} title={work.favorite ? "取消收藏" : "收藏"} onClick={onFavorite}><Star aria-hidden /></button> : null}
                    {media ? <button type="button" aria-label="下载" title="下载" disabled={busy} onClick={onDownload}><Download aria-hidden /></button> : null}
                    {media && onUseAsReference ? <button type="button" aria-label="作为参考" title="作为参考" onClick={onUseAsReference}><ImagePlus aria-hidden /></button> : null}
                    {onReuseSettings ? <button type="button" aria-label="用同样设置再生成" title="用同样设置再生成" onClick={onReuseSettings}><Wand2 aria-hidden /></button> : null}
                    {media ? <button type="button" aria-label="在画布中打开" title="在画布中打开" disabled={busy} onClick={onOpenInCanvas}><Waypoints aria-hidden /></button> : null}
                    {onPublish ? <button type="button" aria-label="发布到社区" title="发布到社区" onClick={onPublish}><Share2 aria-hidden /></button> : null}
                    <button type="button" aria-label="删除" title="删除" onClick={onDelete}><Trash2 aria-hidden /></button>
                </div>
            ) : null}
        </article>
    );
}

function StudioWorkMedia({ work, media, onPreview }: { work: StudioWork; media: StudioMedia; onPreview: () => void }) {
    if (media.kind === "audio") {
        return (
            <div className="studio-work-media studio-work-audio">
                <p>{work.prompt}</p>
                <audio controls preload="none" src={studioMediaSrc(media)} aria-label="播放配音" />
            </div>
        );
    }
    if (media.kind === "video") {
        return (
            <button type="button" className="studio-work-media" aria-label="放大预览视频" onClick={onPreview}>
                <video
                    src={studioMediaSrc(media)}
                    muted
                    playsInline
                    preload="metadata"
                    onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(event) => {
                        event.currentTarget.pause();
                        event.currentTarget.currentTime = 0;
                    }}
                />
            </button>
        );
    }
    return (
        <button type="button" className="studio-work-media" aria-label="放大预览图片" onClick={onPreview}>
            <CachedResourceImage storageKey={media.storageKey} src={media.url} alt={studioWorkTitle(work)} variant="thumbnail" />
        </button>
    );
}
