import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Trash2 } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";

/** 框选区域，坐标是占画面宽高的百分比（0–100）。 */
export type StudioRegion = { x: number; y: number; w: number; h: number };

const MAX_REGIONS = 5;

/** 区域写进提示词：按画面百分比描述每个矩形。 */
export function describeStudioRegions(regions: StudioRegion[]) {
    return regions.map((region, index) => {
        const right = Math.round(region.x + region.w);
        const bottom = Math.round(region.y + region.h);
        return `区域${index + 1}：从左上角（横向 ${Math.round(region.x)}%，纵向 ${Math.round(region.y)}%）到右下角（横向 ${right}%，纵向 ${bottom}%）`;
    }).join("；");
}

type MarkerProps = {
    open: boolean;
    title: string;
    hint: string;
    src: string;
    mediaKind: "image" | "video";
    value: StudioRegion[];
    onChange: (regions: StudioRegion[]) => void;
    onClose: () => void;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** 在图片或视频首帧上拖拽画框。 */
export function StudioRegionMarker({ open, title, hint, src, mediaKind, value, onChange, onClose }: MarkerProps) {
    const [regions, setRegions] = useState<StudioRegion[]>(value);
    const [draft, setDraft] = useState<StudioRegion | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) setRegions(value);
        // 只在打开时同步外部值。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const point = (event: ReactPointerEvent) => {
        const rect = surfaceRef.current!.getBoundingClientRect();
        return { x: clamp(((event.clientX - rect.left) / rect.width) * 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100) };
    };

    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(820px, calc(100vw - 32px))" title={title} footer={null} onCancel={onClose}>
            <div className="studio-popup studio-region">
                <p className="studio-hint">{hint}。按住拖动画框，最多 {MAX_REGIONS} 个。</p>
                <div
                    ref={surfaceRef}
                    className="studio-region-surface"
                    onPointerDown={(event) => {
                        if (regions.length >= MAX_REGIONS) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        startRef.current = point(event);
                        setDraft({ ...startRef.current, w: 0, h: 0 });
                    }}
                    onPointerMove={(event) => {
                        const start = startRef.current;
                        if (!start) return;
                        const current = point(event);
                        setDraft({ x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y) });
                    }}
                    onPointerUp={() => {
                        if (draft && draft.w > 2 && draft.h > 2) setRegions((current) => [...current, draft]);
                        startRef.current = null;
                        setDraft(null);
                    }}
                >
                    {mediaKind === "video" ? <video src={src} muted playsInline preload="auto" /> : <img src={src} alt="" draggable={false} />}
                    {[...regions, ...(draft ? [draft] : [])].map((region, index) => (
                        <span key={index} className="studio-region-box" style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%` }}>{index < regions.length ? index + 1 : ""}</span>
                    ))}
                </div>
                <div className="studio-region-bar">
                    <span>已框选 {regions.length} / {MAX_REGIONS}</span>
                    {regions.map((_, index) => (
                        <button key={index} type="button" className="studio-mini-button" aria-label={`删除区域${index + 1}`} onClick={() => setRegions((current) => current.filter((__, itemIndex) => itemIndex !== index))}><Trash2 aria-hidden />{index + 1}</button>
                    ))}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="studio-mini-button" disabled={!regions.length} onClick={() => setRegions([])}>清空</button>
                    <button type="button" className="studio-mini-button is-primary" onClick={() => { onChange(regions); onClose(); }}>确定</button>
                </div>
            </div>
        </AppModal>
    );
}
