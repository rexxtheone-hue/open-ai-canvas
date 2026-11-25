import { useEffect, useState } from "react";

import { BrandLogo, BrandLogoFrame } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/use-appearance-store";

import "./brand-loader.css";

type FullScreenLoaderProps = {
    label?: string;
    detail?: string;
    className?: string;
};

const FRAME_RATE = 24;

/** 剪辑软件播放头那样的时间码：时:分:秒:帧，按 24 帧每秒往上跳。 */
function useTimecode() {
    const [frames, setFrames] = useState(0);
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const started = performance.now();
        const timer = window.setInterval(() => setFrames(Math.floor(((performance.now() - started) / 1000) * FRAME_RATE)), 1000 / FRAME_RATE);
        return () => window.clearInterval(timer);
    }, []);
    const pad = (value: number) => String(value).padStart(2, "0");
    const seconds = Math.floor(frames / FRAME_RATE);
    return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}:${pad(frames % FRAME_RATE)}`;
}

/** 品牌加载页：黑底白标志，下方像剪辑软件那样跑着的时间码和播放头。 */
export function FullScreenLoader({ label = "正在恢复工作区", detail = "同步账号、模型和项目数据", className }: FullScreenLoaderProps) {
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const timecode = useTimecode();
    return (
        <div data-full-screen-loader role="status" aria-live="polite" aria-label={`${label}，${detail}`} className={cn("brand-loader", className)}>
            <div className="brand-loader-stage">
                <span className="brand-loader-mark" aria-hidden="true">
                    <BrandLogo className="brand-loader-mark-image" alt="" fallback={<span className="brand-loader-mark-image" />} />
                </span>
                <p className="brand-loader-name">{brandName}</p>
                <p className="brand-loader-timecode" aria-hidden="true">
                    <i />
                    REC
                    <span>{timecode}</span>
                </p>
                <div className="brand-loader-copy">
                    <strong>{label}</strong>
                    <span>{detail}</span>
                </div>
                <span className="brand-loader-progress" aria-hidden="true">
                    <i />
                </span>
            </div>
        </div>
    );
}

export function WorkspaceRouteLoader({ label = "正在打开页面" }: { label?: string }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 140);
        return () => window.clearTimeout(timer);
    }, []);

    return (
        <section data-workspace-route-loader className={cn("workspace-route-loader", visible && "is-visible")} role="status" aria-live="polite" aria-label={label}>
            <div className="workspace-route-loader-content">
                <span className="workspace-route-loader-mark">
                    <BrandLogoFrame className="workspace-route-loader-logo" logoClassName="size-4" alt="" fallback={<span className="full-screen-loader-logo-fallback" />} />
                </span>
                <LoadingSignal />
                <span>{label}</span>
            </div>
        </section>
    );
}

function LoadingSignal() {
    return (
        <span className="loading-signal" aria-hidden="true">
            <i />
            <i />
            <i />
        </span>
    );
}
