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

/** 品牌加载页：发光标志 + 旋转光环 + 渐变进度条，配色取自 OmniMuse 标志的青、紫、粉。 */
export function FullScreenLoader({ label = "正在恢复工作区", detail = "同步账号、模型和项目数据", className }: FullScreenLoaderProps) {
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    return (
        <div data-full-screen-loader role="status" aria-live="polite" aria-label={`${label}，${detail}`} className={cn("brand-loader", className)}>
            <div className="brand-loader-stage">
                <div className="brand-loader-emblem" aria-hidden="true">
                    <span className="brand-loader-halo" />
                    <span className="brand-loader-track" />
                    <span className="brand-loader-ring" />
                    <span className="brand-loader-mark">
                        <BrandLogo className="brand-loader-mark-image" alt="" fallback={<span className="brand-loader-mark-image" />} />
                    </span>
                </div>
                <p className="brand-loader-name">{brandName}</p>
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
