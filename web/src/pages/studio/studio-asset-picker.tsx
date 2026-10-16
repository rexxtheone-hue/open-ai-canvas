import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Check, Clapperboard, Image as ImageIcon, Loader2, Upload, UserRound, X } from "lucide-react";

import type { CreationAttachment } from "@/pages/create/creation-assets";
import { resolveResourceUrl } from "@/services/api/resources";
import { listStudioWorks, type StudioKind, type StudioWork } from "@/services/api/studio";
import { listStudioUploads, type StudioUpload } from "@/services/api/studio-agents";
import { useStudioCharacters } from "./studio-character-picker";
import { studioCharacterAttachments, studioCharacterCover } from "./studio-characters";
import { studioMediaSrc } from "./studio-library";
import { onStudioUploadsChanged, studioAttachmentFromMedia, uploadStudioFile } from "./use-studio-tool";

export type StudioPickerKind = "character" | StudioKind;
type Source = "creations" | "uploads" | "favorites";

const KIND_META: Record<StudioPickerKind, { label: string; icon: typeof ImageIcon; empty: string; upload: string; accept: string }> = {
    character: { label: "角色与世界", icon: UserRound, empty: "角色库还是空的，先去建一个角色。", upload: "", accept: "" },
    image: { label: "图片", icon: ImageIcon, empty: "还没有生成的图片，先去生成一些吧。", upload: "上传图片", accept: "image/png,image/jpeg,image/webp" },
    video: { label: "视频", icon: Clapperboard, empty: "还没有生成的视频，先去生成一些吧。", upload: "上传视频", accept: "video/mp4,video/quicktime,video/webm" },
    audio: { label: "音频", icon: AudioLines, empty: "还没有生成的音频，先去生成一些吧。", upload: "上传音频", accept: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4" },
};

const SOURCES: Array<{ id: Source; label: string }> = [
    { id: "creations", label: "作品" },
    { id: "uploads", label: "上传" },
    { id: "favorites", label: "收藏" },
];

function uploadAttachment(item: StudioUpload): CreationAttachment {
    const storageKey = `resource:${item.resourceId}`;
    const url = resolveResourceUrl(storageKey, "");
    const id = `upload:${item.resourceId}`;
    if (item.kind === "image") return { id, name: item.name, type: item.mimeType || "image/png", dataUrl: url, url, storageKey, width: item.width, height: item.height, previewUrl: url };
    if (item.kind === "video") return { id, name: item.name, type: item.mimeType || "video/mp4", url, storageKey, width: item.width, height: item.height, durationMs: item.durationMs, previewUrl: url };
    return { id, name: item.name, type: item.mimeType || "audio/mpeg", url, storageKey, durationMs: item.durationMs, previewUrl: url };
}

type PickerProps = {
    open: boolean;
    /** 可选的素材类型，顺序即标签顺序。 */
    kinds: StudioPickerKind[];
    initialKind?: StudioPickerKind;
    /** 最多可选几个；1 表示点一下就选中并关闭。 */
    max?: number;
    title?: string;
    notice?: string;
    onPick: (items: CreationAttachment[]) => void;
    onClose: () => void;
};

/** 「添加参考」面板：覆盖在作品库上，从作品、上传、收藏或角色库里挑素材，也可以直接上传。 */
export function StudioAssetPicker({ open, kinds, initialKind, max = 1, title = "添加参考", notice, onPick, onClose }: PickerProps) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [kind, setKind] = useState<StudioPickerKind>(initialKind && kinds.includes(initialKind) ? initialKind : kinds[0]);
    const [source, setSource] = useState<Source>("creations");
    const [selected, setSelected] = useState<CreationAttachment[]>([]);
    const [uploading, setUploading] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setKind(initialKind && kinds.includes(initialKind) ? initialKind : kinds[0]);
        setSelected([]);
        // 只在打开时重置；kinds 每次渲染都是新数组。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialKind]);

    useEffect(() => onStudioUploadsChanged(() => void queryClient.invalidateQueries({ queryKey: ["studio", "uploads"] })), [queryClient]);

    const mediaKind = kind === "character" ? undefined : kind;
    const worksQuery = useQuery({
        queryKey: ["studio", "picker-works", mediaKind, source],
        queryFn: async ({ signal }) => (await listStudioWorks({ kind: mediaKind, favorite: source === "favorites", pageSize: 60 }, signal)).works.filter((work) => work.status === "succeeded" && work.media.length),
        enabled: open && Boolean(mediaKind) && source !== "uploads",
    });
    const uploadsQuery = useQuery({
        queryKey: ["studio", "uploads", mediaKind],
        queryFn: async ({ signal }) => (await listStudioUploads(mediaKind, signal)).items,
        enabled: open && Boolean(mediaKind) && source === "uploads",
    });
    const charactersQuery = useStudioCharacters(open && kind === "character");

    const items = useMemo(() => {
        if (kind === "character") {
            return (charactersQuery.data || []).filter((item) => item.imageResourceIds.length).map((character) => ({ key: `c:${character.id}`, label: character.name, preview: studioCharacterCover(character), previewKind: "image" as const, attachment: studioCharacterAttachments(character, 1)[0] }));
        }
        if (source === "uploads") {
            return (uploadsQuery.data || []).map((item) => ({ key: `u:${item.id}`, label: item.name, preview: resolveResourceUrl(`resource:${item.resourceId}`, ""), previewKind: item.kind, attachment: uploadAttachment(item) }));
        }
        return (worksQuery.data || []).map((work: StudioWork) => ({ key: `w:${work.id}`, label: work.prompt, preview: studioMediaSrc(work.media[0]), previewKind: work.media[0].kind, attachment: studioAttachmentFromMedia(work, work.media[0]) }));
    }, [charactersQuery.data, kind, source, uploadsQuery.data, worksQuery.data]);

    const loading = kind === "character" ? charactersQuery.isLoading : source === "uploads" ? uploadsQuery.isLoading : worksQuery.isLoading;

    if (!open) return null;

    const finish = (list: CreationAttachment[]) => {
        if (!list.length) return;
        onPick(list.slice(0, max));
        onClose();
    };

    const toggle = (attachment: CreationAttachment) => {
        if (max <= 1) {
            finish([attachment]);
            return;
        }
        setSelected((current) => {
            if (current.some((item) => item.id === attachment.id)) return current.filter((item) => item.id !== attachment.id);
            if (current.length >= max) {
                message.warning(`最多选 ${max} 个`);
                return current;
            }
            return [...current, attachment];
        });
    };

    const upload = async (files: File[]) => {
        setUploading((count) => count + files.length);
        const done: CreationAttachment[] = [];
        for (const file of files) {
            try {
                done.push(await uploadStudioFile(file));
            } catch (cause) {
                message.error(`${file.name}：${cause instanceof Error ? cause.message : "上传失败"}`);
            } finally {
                setUploading((count) => Math.max(0, count - 1));
            }
        }
        if (!done.length) return;
        if (max <= 1) finish(done.slice(0, 1));
        else setSelected((current) => [...current, ...done].slice(0, max));
        setSource("uploads");
    };

    const meta = KIND_META[kind];

    return (
        <aside className="studio-picker" aria-label={title}>
            <header className="studio-picker-head">
                <strong>{title}</strong>
                <button type="button" className="studio-icon-button" aria-label="关闭" onClick={onClose}><X aria-hidden /></button>
            </header>
            {notice ? <p className="studio-picker-notice">{notice}</p> : null}
            {kinds.length > 1 ? (
                <div className="studio-picker-kinds" role="tablist" aria-label="素材类型">
                    {kinds.map((item) => {
                        const Icon = KIND_META[item].icon;
                        return (
                            <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => { setKind(item); setSource("creations"); }}>
                                <Icon aria-hidden />
                                <span>{KIND_META[item].label}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
            {kind !== "character" ? (
                <div className="studio-picker-sources" role="tablist" aria-label="素材来源">
                    {SOURCES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={source === item.id} onClick={() => setSource(item.id)}>{item.label}</button>)}
                </div>
            ) : null}
            <div className="studio-picker-scroll">
                <div className="studio-picker-grid">
                    {kind !== "character" ? (
                        <button type="button" className="studio-picker-upload" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
                            {uploading ? <Loader2 className="studio-spin" aria-hidden /> : <Upload aria-hidden />}
                            <span>{uploading ? "上传中…" : meta.upload}</span>
                        </button>
                    ) : null}
                    {items.map((item) => {
                        const isSelected = selected.some((entry) => entry.id === item.attachment?.id);
                        if (!item.attachment) return null;
                        return (
                            <button key={item.key} type="button" className="studio-picker-item" aria-pressed={isSelected} title={item.label} onClick={() => toggle(item.attachment!)}>
                                {item.previewKind === "video" ? <video src={item.preview} muted playsInline preload="metadata" /> : item.previewKind === "audio" ? <span className="studio-picker-audio"><AudioLines aria-hidden />{item.label.slice(0, 30)}</span> : <img src={item.preview} alt="" loading="lazy" />}
                                {kind === "character" ? <span className="studio-picker-label">{item.label}</span> : null}
                                {isSelected ? <span className="studio-picker-check"><Check aria-hidden /></span> : null}
                            </button>
                        );
                    })}
                </div>
                {!loading && !items.length ? <p className="studio-picker-empty">{kind === "character" ? meta.empty : source === "uploads" ? "还没有上传过，点左上角上传。" : source === "favorites" ? "还没有收藏。" : meta.empty}</p> : null}
                {loading ? <div className="studio-picker-empty"><Loader2 className="studio-spin" aria-hidden /></div> : null}
            </div>
            {max > 1 ? (
                <footer className="studio-picker-foot">
                    <span>已选 {selected.length} / {max}</span>
                    <button type="button" className="studio-mini-button is-primary" disabled={!selected.length} onClick={() => finish(selected)}>加入</button>
                </footer>
            ) : null}
            <input ref={fileRef} type="file" hidden multiple={max > 1} accept={meta.accept} onChange={(event) => {
                const files = [...(event.target.files || [])];
                event.target.value = "";
                if (files.length) void upload(files);
            }} />
        </aside>
    );
}
