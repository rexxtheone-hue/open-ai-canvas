import { useEffect, useRef, useState } from "react";
import { App, Popover, Spin } from "antd";
import { Check, ChevronDown, Download, Filter, Folder, FolderOpen, ImagePlus, Layers, LayoutGrid, LayoutTemplate, Loader2, RefreshCw, Search, Share2, SlidersHorizontal, Star, Trash2, UserPlus, Wand2, MessageSquarePlus } from "./studio-icons";
import { Link, useNavigate } from "react-router";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { studioCanvasHandoffPath } from "@/lib/canvas/studio-canvas-handoff";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { generationErrorMessage } from "@/lib/generation-error";
import { playbackVariantUrl, resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { downloadBrowserMedia } from "@/services/browser-download";
import { recoverGenerationTaskMedia, retryGenerationTask } from "@/services/api/task-center";
import type { StudioKind, StudioLabel, StudioMedia, StudioWork } from "@/services/api/studio";
import { studioSelectionRange, studioWorkFileName, studioWorkIsActive, studioWorkTitle } from "./studio-library-model";
import { notifyStudioWorksChanged, useStudioWorks, type StudioWorksFilter } from "./use-studio-works";
import { StudioLightbox } from "./studio-lightbox";
import { StudioPublishModal } from "./studio-publish-modal";
import { StudioSaveCharacterModal } from "./studio-save-character";
import { StudioFolderSection, StudioLabelDot, StudioLabelFilter, StudioLabelWorks, StudioMoveToFolder, useStudioOrganize } from "./studio-organize";

const KIND_LABELS: Record<StudioKind, string> = { image: "图片", video: "视频", audio: "音频" };
const SOURCE_OPTIONS: Array<{ value: "studio" | "canvas" | undefined; label: string }> = [
    { value: undefined, label: "全部来源" },
    { value: "studio", label: "Studio 工具" },
    { value: "canvas", label: "无限画布" },
];
const CARD_SIZE_KEY = "studio.library.card-size.v1";

export function studioMediaSrc(media: StudioMedia, purpose: "display" | "download" = "display") {
    const resourceId = resourceIdFromStorageKey(media.storageKey);
    if (resourceId && media.kind === "video" && purpose === "display") return playbackVariantUrl(resourceId);
    return resolveResourceUrl(media.storageKey, media.url || "");
}

/** 把一件作品转成画布素材：提示词作为文字节点，图片和视频保留原资源引用，可继续当参考或再生成。 */
export function studioWorkCanvasPayloads(work: StudioWork): InsertAssetPayload[] {
    const title = studioWorkTitle(work);
    const payloads: InsertAssetPayload[] = work.prompt?.trim() ? [{ kind: "text", content: work.prompt.trim(), title }] : [];
    for (const media of work.media) {
        const storageKey = resourceIdFromStorageKey(media.storageKey) ? media.storageKey : undefined;
        const src = resolveResourceUrl(media.storageKey, media.url || "");
        if (!src) continue;
        if (media.kind === "image") {
            payloads.push(storageKey ? { kind: "image", dataUrl: src, storageKey, title, width: media.width || 1024, height: media.height || 1024, mimeType: media.mimeType } : { kind: "image", dataUrl: "", url: src, title, mimeType: media.mimeType });
        } else if (media.kind === "video") {
            payloads.push({ kind: "video", url: src, storageKey, title, width: media.width, height: media.height, durationMs: media.durationMs, mimeType: media.mimeType });
        } else {
            payloads.push({ kind: "audio", url: src, storageKey, title, durationMs: media.durationMs, mimeType: media.mimeType });
        }
    }
    return payloads;
}

async function downloadStudioMedia(work: StudioWork, index: number) {
    const media = work.media[index];
    if (!media) return;
    if (!media.url && !resourceIdFromStorageKey(media.storageKey)) throw new Error("作品文件暂时不可用");
    await downloadBrowserMedia({ fileName: studioWorkFileName(work, index), storageKey: media.storageKey, url: media.url });
}

type StudioLibraryProps = {
    /** 固定类型时不显示类型筛选（工具页右侧）；独立素材页显示全部类型。 */
    kind?: StudioKind;
    onUseAsReference?: (work: StudioWork, media: StudioMedia) => void;
    onReuseSettings?: (work: StudioWork) => void;
    /** 对话模式：把选中的作品加入对话作为素材。 */
    onAddToChat?: (works: StudioWork[]) => void;
};

export function StudioLibrary({ kind, onUseAsReference, onReuseSettings, onAddToChat }: StudioLibraryProps) {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const openInCanvas = (work: StudioWork) => {
        const path = studioCanvasHandoffPath(studioWorkCanvasPayloads(work));
        if (path) navigate(path);
        else message.error("这件作品暂时无法带入无限画布");
    };
    const [filter, setFilter] = useState<StudioWorksFilter>({ kind: kind || "all", favorite: false, q: "" });
    const [searchDraft, setSearchDraft] = useState("");
    const { works, loading, loadingMore, error, hasMore, loadMore, refresh, toggleFavorite, removeWorks } = useStudioWorks(filter);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const anchorRef = useRef<string | null>(null);
    const [preview, setPreview] = useState<{ work: StudioWork; media: StudioMedia } | null>(null);
    const [publishTarget, setPublishTarget] = useState<StudioWork | null>(null);
    const [characterTarget, setCharacterTarget] = useState<StudioWork | null>(null);
    const [busyId, setBusyId] = useState("");
    const [collectionOpen, setCollectionOpen] = useState(false);
    const organize = useStudioOrganize();
    const labelsById = new Map((organize.data?.labels || []).map((label) => [label.id, label]));
    const currentFolder = filter.folder && filter.folder !== "unsorted" ? organize.data?.folders.find((folder) => folder.id === filter.folder) : undefined;
    const scopeLabel = filter.favorite ? "收藏" : filter.folder === "unsorted" ? "未归类" : currentFolder ? currentFolder.name : "全部作品";
    const ScopeIcon = filter.favorite ? Star : filter.folder === "unsorted" ? FolderOpen : currentFolder ? Folder : LayoutGrid;
    const chooseScope = (patch: Partial<StudioWorksFilter>) => {
        setFilter((current) => ({ ...current, favorite: false, folder: undefined, ...patch }));
        setCollectionOpen(false);
    };
    const [typeOpen, setTypeOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [cardSize, setCardSize] = useState(() => {
        try {
            const value = Number(window.localStorage.getItem(CARD_SIZE_KEY));
            return value >= 120 && value <= 320 ? value : 180;
        } catch {
            return 180;
        }
    });
    const changeCardSize = (value: number) => {
        setCardSize(value);
        try {
            window.localStorage.setItem(CARD_SIZE_KEY, String(value));
        } catch {
            // 浏览器存储不可用时只在本页生效。
        }
    };

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
            title: ids.length > 1 ? `永久删除 ${ids.length} 个作品？` : "永久删除这个作品？",
            content: `作品和它的图片、视频文件会被彻底删除，画布资产里也不能再还原；用到它的画布节点会失效。${works.some((work) => ids.includes(work.id) && studioWorkCardIndexes(work).length > 1) ? "同一次生成的多张图会一起删除。" : ""}已扣的积分和账单记录不受影响。`,
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
                <Popover
                    trigger="click"
                    placement="bottomLeft"
                    arrow={false}
                    open={collectionOpen}
                    onOpenChange={setCollectionOpen}
                    content={
                        <div className="studio-menu" role="menu">
                            <button type="button" role="menuitemradio" aria-checked={!filter.favorite && !filter.folder} onClick={() => chooseScope({})}>
                                <LayoutGrid aria-hidden />
                                全部作品{!filter.favorite && !filter.folder ? <Check className="studio-menu-check" aria-hidden /> : null}
                            </button>
                            <button type="button" role="menuitemradio" aria-checked={filter.folder === "unsorted"} title="没有放进任何文件夹的作品" onClick={() => chooseScope({ folder: "unsorted" })}>
                                <FolderOpen aria-hidden />
                                未归类{filter.folder === "unsorted" ? <Check className="studio-menu-check" aria-hidden /> : null}
                            </button>
                            <button type="button" role="menuitemradio" aria-checked={filter.favorite} onClick={() => chooseScope({ favorite: true })}>
                                <Star aria-hidden />
                                收藏{filter.favorite ? <Check className="studio-menu-check" aria-hidden /> : null}
                            </button>
                            <StudioFolderSection current={filter.folder} onSelect={(folder) => chooseScope({ folder })} />
                        </div>
                    }
                >
                    <button type="button" className="studio-collection-pill" aria-haspopup="menu" aria-label="作品范围">
                        <ScopeIcon aria-hidden />
                        {scopeLabel}
                        <ChevronDown aria-hidden />
                    </button>
                </Popover>
                <Link to="/studio/templates" className="studio-toolbar-link">
                    <LayoutTemplate aria-hidden />
                    模板
                </Link>
                <span className="studio-toolbar-spacer" />
                {searchOpen || searchDraft ? (
                    <label className="studio-search is-compact">
                        <Search aria-hidden />
                        <input
                            id={`studio-search-${kind || "all"}`}
                            autoFocus
                            value={searchDraft}
                            placeholder="搜索提示词"
                            aria-label="搜索作品提示词"
                            onChange={(event) => setSearchDraft(event.target.value)}
                            onBlur={() => {
                                if (!searchDraft) setSearchOpen(false);
                            }}
                        />
                    </label>
                ) : null}
                <Popover
                    trigger="click"
                    placement="bottomRight"
                    arrow={false}
                    content={
                        <div className="studio-menu is-slider">
                            <div className="studio-menu-title">缩略图大小</div>
                            <div className="studio-size-row">
                                <span>S</span>
                                <input type="range" min={120} max={320} step={20} value={cardSize} aria-label="缩略图大小" onChange={(event) => changeCardSize(Number(event.target.value))} />
                                <span>L</span>
                            </div>
                        </div>
                    }
                >
                    <button type="button" className="studio-toolbar-icon" aria-label="缩略图大小" title="缩略图大小">
                        <SlidersHorizontal aria-hidden />
                    </button>
                </Popover>
                {!kind ? (
                    <Popover
                        trigger="click"
                        placement="bottomRight"
                        arrow={false}
                        open={typeOpen}
                        onOpenChange={setTypeOpen}
                        content={
                            <div className="studio-menu" role="menu">
                                <div className="studio-menu-title">类型</div>
                                {(["all", "image", "video", "audio"] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={filter.kind === value}
                                        onClick={() => {
                                            setFilter((current) => ({ ...current, kind: value }));
                                            setTypeOpen(false);
                                        }}
                                    >
                                        {value === "all" ? "全部作品" : KIND_LABELS[value]}
                                        {filter.kind === value ? <Check className="studio-menu-check" aria-hidden /> : null}
                                    </button>
                                ))}
                                <div className="studio-menu-title" title="AI Studio 和 AI Canvas 共用一个作品库">
                                    来源
                                </div>
                                {SOURCE_OPTIONS.map((option) => (
                                    <button
                                        key={option.label}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={filter.source === option.value}
                                        onClick={() => {
                                            setFilter((current) => ({ ...current, source: option.value }));
                                            setTypeOpen(false);
                                        }}
                                    >
                                        {option.label}
                                        {filter.source === option.value ? <Check className="studio-menu-check" aria-hidden /> : null}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <button type="button" className={`studio-toolbar-icon${filter.kind !== "all" || filter.source ? " is-active" : ""}`} aria-label="类型和来源筛选" title="类型和来源筛选">
                            <Filter aria-hidden />
                        </button>
                    </Popover>
                ) : null}
                <StudioLabelFilter current={filter.label} onSelect={(label) => setFilter((current) => ({ ...current, label }))} />
                <button
                    type="button"
                    className={`studio-toolbar-icon${filter.favorite ? " is-active" : ""}`}
                    aria-pressed={filter.favorite}
                    aria-label="只看收藏"
                    title="只看收藏"
                    onClick={() => setFilter((current) => ({ ...current, favorite: !current.favorite }))}
                >
                    <Star aria-hidden />
                </button>
                <button type="button" className="studio-toolbar-icon" aria-label="刷新作品库" title="刷新" onClick={() => void refresh()}>
                    <RefreshCw aria-hidden />
                </button>
                <button type="button" className={`studio-toolbar-icon${searchOpen || searchDraft ? " is-active" : ""}`} aria-label="搜索" title="搜索" onClick={() => setSearchOpen((value) => !value)}>
                    <Search aria-hidden />
                </button>
            </div>
            <div className="studio-library-scroll">
                {loading ? (
                    <div className="studio-empty">
                        <Spin />
                    </div>
                ) : error && !works.length ? (
                    <div className="studio-empty" role="alert">
                        <strong>作品读取失败</strong>
                        <span>{error}</span>
                        <button type="button" className="studio-mini-button" onClick={() => void refresh()}>
                            重试
                        </button>
                    </div>
                ) : !works.length ? (
                    <div className="studio-empty">
                        <strong>{filter.favorite ? "还没有收藏的作品" : filter.q ? "没有找到相关作品" : "还没有作品"}</strong>
                        <span>{filter.favorite || filter.q ? "换个条件试试。" : "在左边写下想法，点生成，作品会出现在这里。"}</span>
                    </div>
                ) : (
                    <>
                        <div className="studio-grid" style={{ ["--studio-card-min" as string]: `${cardSize}px` }}>
                            {works.flatMap((work) => studioWorkCardIndexes(work).map((mediaIndex) => (
                                <StudioWorkCard
                                    key={`${work.id}:${mediaIndex}`}
                                    work={work}
                                    mediaIndex={mediaIndex}
                                    selected={selected.has(work.id)}
                                    busy={busyId === work.id}
                                    onSelect={(shift) => toggleSelect(work, shift)}
                                    onPreview={(media) => setPreview({ work, media })}
                                    onFavorite={() => void toggleFavorite(work).catch((cause) => message.error(generationErrorMessage(cause)))}
                                    onDownload={() => void run(work.id, () => downloadStudioMedia(work, mediaIndex))}
                                    onUseAsReference={onUseAsReference && work.media[mediaIndex] ? () => onUseAsReference(work, work.media[mediaIndex]) : undefined}
                                    onReuseSettings={onReuseSettings && work.source !== "canvas" ? () => onReuseSettings(work) : undefined}
                                    onRetry={() =>
                                        void run(
                                            work.id,
                                            async () => {
                                                if (work.canRecoverMedia) await recoverGenerationTaskMedia(work.id);
                                                else await retryGenerationTask(work.id);
                                                notifyStudioWorksChanged();
                                            },
                                            work.canRecoverMedia ? "正在重新保存作品" : "已重新提交",
                                        )
                                    }
                                    onDelete={() => confirmDelete([work.id])}
                                    onPublish={work.status === "succeeded" && work.media.some((item) => item.storageKey?.startsWith("resource:")) ? () => setPublishTarget(work) : undefined}
                                    labels={(work.labelIds || []).flatMap((id) => labelsById.get(id) || [])}
                                    onSaveCharacter={work.status === "succeeded" && work.media[0]?.kind === "image" && resourceIdFromStorageKey(work.media[0].storageKey) ? () => setCharacterTarget(work) : undefined}
                                    onOpenCanvas={work.status === "succeeded" && work.media.length ? () => openInCanvas(work) : undefined}
                                />
                            )))}
                        </div>
                        {hasMore ? (
                            <div className="studio-load-more">
                                <button type="button" className="studio-mini-button" disabled={loadingMore} onClick={() => void loadMore()}>
                                    {loadingMore ? "加载中…" : "加载更多"}
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
            {selected.size ? (
                <div className="studio-selection-bar">
                    <span>已选 {selected.size} 个</span>
                    {onAddToChat ? (
                        <button
                            type="button"
                            className="studio-mini-button is-primary"
                            disabled={!selectedWorks.some((work) => work.status === "succeeded" && work.media.length)}
                            onClick={() => {
                                onAddToChat(selectedWorks.filter((work) => work.status === "succeeded" && work.media.length));
                                setSelected(new Set());
                            }}
                        >
                            <MessageSquarePlus aria-hidden />
                            加入对话
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="studio-mini-button"
                        onClick={() =>
                            void run("batch", async () => {
                                for (const work of selectedWorks) for (let index = 0; index < work.media.length; index += 1) await downloadStudioMedia(work, index);
                            })
                        }
                    >
                        <Download aria-hidden />
                        下载
                    </button>
                    <StudioMoveToFolder
                        works={selectedWorks}
                        onDone={() => {
                            setSelected(new Set());
                            void refresh();
                        }}
                    />
                    <StudioLabelWorks
                        works={selectedWorks}
                        onDone={() => {
                            setSelected(new Set());
                            void refresh();
                        }}
                    />
                    <button type="button" className="studio-mini-button" onClick={() => confirmDelete([...selected])}>
                        <Trash2 aria-hidden />
                        删除
                    </button>
                    <button type="button" className="studio-mini-button" onClick={() => setSelected(new Set())}>
                        取消选择
                    </button>
                </div>
            ) : null}
            {preview && (preview.media.kind === "image" || preview.media.kind === "video") ? (
                <StudioLightbox work={preview.work} media={preview.media} mediaSrc={studioMediaSrc} onDownload={(index) => void run(preview.work.id, () => downloadStudioMedia(preview.work, index))} onClose={() => setPreview(null)} />
            ) : null}
            <StudioPublishModal work={publishTarget} onClose={() => setPublishTarget(null)} />
            <StudioSaveCharacterModal work={characterTarget} onClose={() => setCharacterTarget(null)} />
        </section>
    );
}

/** 一次生成多张图（例如 Midjourney 每次 4 张）时，每张图各占一张卡片；删除、收藏、选择仍按整次生成。 */
function studioWorkCardIndexes(work: StudioWork) {
    return work.kind === "image" && work.media.length > 1 ? work.media.map((_, index) => index) : [0];
}

// 鉴权、渠道、上游、网络这类客户处理不了的技术性错误只显示「生成失败」，原文留在悬停提示里；
// 时长、素材数量等客户能自己改的提示照常显示。英文界面里错误已被翻译，所以中英文关键词都要匹配。
const TECHNICAL_ERROR_PATTERN = /声明式协议|媒体地址|鉴权|密钥|API ?Key|令牌|渠道|上游|协议|接口|HTTP|状态码|超时|连接|网络|服务器|内部错误|配置|provider|protocol|upstream|channel|endpoint|authenticat|token|status code|timed? ?out|network|connection|server|internal|configur|media URL/i;

type StudioWorkCardProps = {
    work: StudioWork;
    mediaIndex?: number;
    selected: boolean;
    busy: boolean;
    onSelect: (shift: boolean) => void;
    onPreview: (media: StudioMedia) => void;
    onFavorite: () => void;
    onDownload: () => void;
    onUseAsReference?: () => void;
    onReuseSettings?: () => void;
    onRetry: () => void;
    onDelete: () => void;
    onPublish?: () => void;
    onSaveCharacter?: () => void;
    onOpenCanvas?: () => void;
    labels?: StudioLabel[];
};

function StudioWorkCard({ work, mediaIndex = 0, selected, busy, onSelect, onPreview, onFavorite, onDownload, onUseAsReference, onReuseSettings, onRetry, onDelete, onPublish, onSaveCharacter, onOpenCanvas, labels = [] }: StudioWorkCardProps) {
    const media = work.media[mediaIndex];
    const split = studioWorkCardIndexes(work).length > 1;
    const active = studioWorkIsActive(work);
    const failed = work.status === "failed" || work.status === "cancelled";
    return (
        <article className={`studio-work${selected ? " is-selected" : ""}`} aria-label={studioWorkTitle(work)}>
            {media && !active ? <StudioWorkMedia work={work} media={media} onPreview={() => onPreview(media)} /> : null}
            {active ? (
                <div className="studio-work-state" role="status">
                    <Loader2 className="animate-spin" aria-hidden />
                    <p>{work.status === "succeeded" ? "正在保存作品" : work.status === "queued" ? "排队中" : work.stage || "生成中"}</p>
                    <div className="studio-progress" aria-hidden>
                        <i style={{ width: `${Math.max(5, Math.min(100, work.progress || 5))}%` }} />
                    </div>
                </div>
            ) : null}
            {failed ? (
                <div className="studio-work-state is-failed" role="alert" title={work.error || undefined}>
                    <p>{work.status === "cancelled" ? "已取消" : !work.error || TECHNICAL_ERROR_PATTERN.test(work.error) ? "生成失败" : work.error}</p>
                    <button type="button" className="studio-mini-button" disabled={busy} onClick={onRetry}>
                        {work.canRecoverMedia ? "重试保存" : "重试"}
                    </button>
                </div>
            ) : null}
            {!active && !failed && !media ? (
                <div className="studio-work-state">
                    <p>作品文件暂时不可用</p>
                </div>
            ) : null}
            <span className="studio-work-kind">
                {KIND_LABELS[work.kind]}
                {split ? ` ${mediaIndex + 1}/${work.media.length}` : work.media.length > 1 ? ` ×${work.media.length}` : ""}
            </span>
            {work.source === "canvas" ? (
                <span className="studio-work-source" title="在无限画布里生成">
                    Canvas
                </span>
            ) : null}
            {labels.length ? (
                <span className="studio-work-labels" title={labels.map((label) => label.name).join("、")}>
                    {labels.map((label) => (
                        <span key={label.id} className="studio-work-label">
                            <StudioLabelDot label={label} />
                            {label.name}
                        </span>
                    ))}
                </span>
            ) : null}
            <button type="button" className="studio-work-select" aria-pressed={selected} aria-label={selected ? "取消选择" : "选择作品"} onClick={(event) => onSelect(event.shiftKey)}>
                {selected ? <Check aria-hidden /> : null}
            </button>
            {!active ? (
                <div className="studio-work-actions">
                    {media ? (
                        <button type="button" aria-pressed={work.favorite} aria-label={work.favorite ? "取消收藏" : "收藏"} title={work.favorite ? "取消收藏" : "收藏"} onClick={onFavorite}>
                            <Star aria-hidden />
                        </button>
                    ) : null}
                    {media ? (
                        <button type="button" aria-label="下载" title="下载" disabled={busy} onClick={onDownload}>
                            <Download aria-hidden />
                        </button>
                    ) : null}
                    {media && onUseAsReference ? (
                        <button type="button" aria-label="作为参考" title="作为参考" onClick={onUseAsReference}>
                            <ImagePlus aria-hidden />
                        </button>
                    ) : null}
                    {onReuseSettings ? (
                        <button type="button" aria-label="用同样设置再生成" title="用同样设置再生成" onClick={onReuseSettings}>
                            <Wand2 aria-hidden />
                        </button>
                    ) : null}
                    {onPublish ? (
                        <button type="button" aria-label="发布到社区" title="发布到社区" onClick={onPublish}>
                            <Share2 aria-hidden />
                        </button>
                    ) : null}
                    {onSaveCharacter ? (
                        <button type="button" aria-label="存为角色" title="存为角色" onClick={onSaveCharacter}>
                            <UserPlus aria-hidden />
                        </button>
                    ) : null}
                    {onOpenCanvas ? (
                        <button type="button" aria-label="在无限画布中编辑" title="在无限画布中编辑" onClick={onOpenCanvas}>
                            <Layers aria-hidden />
                        </button>
                    ) : null}
                    <button type="button" aria-label="删除" title="删除" onClick={onDelete}>
                        <Trash2 aria-hidden />
                    </button>
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
