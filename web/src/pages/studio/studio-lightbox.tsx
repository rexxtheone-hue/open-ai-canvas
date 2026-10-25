import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "./studio-icons";
import type { StudioMedia, StudioWork } from "@/services/api/studio";
import { studioWorkTitle } from "./studio-library-model";

/** 作品全屏预览：暗色背景、图片尽量放大；同一次生成的多张图可左右切换。 */
export function StudioLightbox({ work, media, mediaSrc, onDownload, onClose }: { work: StudioWork; media: StudioMedia; mediaSrc: (media: StudioMedia) => string; onDownload?: (index: number) => void; onClose: () => void }) {
    const items = work.media.filter((item) => item.kind === media.kind);
    const [index, setIndex] = useState(() => Math.max(0, items.indexOf(media)));
    const current = items[index] || media;
    const multiple = items.length > 1;

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            else if (multiple && event.key === "ArrowLeft") setIndex((value) => (value - 1 + items.length) % items.length);
            else if (multiple && event.key === "ArrowRight") setIndex((value) => (value + 1) % items.length);
        };
        window.addEventListener("keydown", onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
        };
    }, [items.length, multiple, onClose]);

    const step = (delta: number) => setIndex((value) => (value + delta + items.length) % items.length);
    return createPortal(
        <div className="studio-lightbox" role="dialog" aria-modal="true" aria-label={studioWorkTitle(work)} onClick={onClose}>
            <div className="studio-lightbox-actions" onClick={(event) => event.stopPropagation()}>
                {multiple ? <span className="studio-lightbox-count">{index + 1} / {items.length}</span> : null}
                {onDownload ? <button type="button" aria-label="下载" title="下载" onClick={() => onDownload(work.media.indexOf(current))}><Download aria-hidden /></button> : null}
                <button type="button" aria-label="关闭预览" title="关闭（Esc）" onClick={onClose}><X aria-hidden /></button>
            </div>
            {multiple ? <button type="button" className="studio-lightbox-nav is-prev" aria-label="上一张" onClick={(event) => { event.stopPropagation(); step(-1); }}><ChevronLeft aria-hidden /></button> : null}
            {current.kind === "video" ? (
                <video key={mediaSrc(current)} className="studio-lightbox-media" src={mediaSrc(current)} controls autoPlay playsInline onClick={(event) => event.stopPropagation()} />
            ) : (
                <img key={mediaSrc(current)} className="studio-lightbox-media" src={mediaSrc(current)} alt={studioWorkTitle(work)} draggable={false} onClick={(event) => event.stopPropagation()} />
            )}
            {multiple ? <button type="button" className="studio-lightbox-nav is-next" aria-label="下一张" onClick={(event) => { event.stopPropagation(); step(1); }}><ChevronRight aria-hidden /></button> : null}
            {work.prompt ? <p className="studio-lightbox-caption" onClick={(event) => event.stopPropagation()}>{work.prompt}</p> : null}
        </div>,
        document.body,
    );
}
