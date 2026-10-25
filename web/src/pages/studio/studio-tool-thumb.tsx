import { useEffect, useRef, useState } from "react";

import "./studio.css";
import type { StudioToolDefinition } from "./studio-tools";

/** 视频封面的地址带 #video 标记（后端加的，片段不会发给服务器）。 */
export function isStudioVideoCover(src: string) {
    return src.endsWith("#video");
}

/**
 * 封面媒体：图片和 GIF 直接显示；视频封面先只显示第一帧，鼠标移到所在的卡片或按钮上才播放，移开停回第一帧。
 * 视频进入可视区域才开始加载，避免列表里几十个视频同时下载。play 为 false 时（很小的图标位）只显示第一帧。
 */
export function StudioCoverMedia({ src, play = true }: { src: string; play?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(false);
    const video = isStudioVideoCover(src);
    useEffect(() => {
        const element = ref.current;
        if (!video || !element || visible) return;
        if (typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
        }, { rootMargin: "200px" });
        observer.observe(element);
        return () => observer.disconnect();
    }, [video, visible]);
    useEffect(() => {
        const element = ref.current;
        if (!video || !element || !play) return;
        const host = element.closest<HTMLElement>("a, button, [role='button'], label") || element.parentElement;
        if (!host) return;
        const start = () => void element.play().catch(() => undefined);
        const stop = () => {
            element.pause();
            element.currentTime = 0;
        };
        host.addEventListener("pointerenter", start);
        host.addEventListener("pointerleave", stop);
        host.addEventListener("focusin", start);
        host.addEventListener("focusout", stop);
        return () => {
            host.removeEventListener("pointerenter", start);
            host.removeEventListener("pointerleave", stop);
            host.removeEventListener("focusin", start);
            host.removeEventListener("focusout", stop);
        };
    }, [play, video]);
    if (!video) return <img src={src} alt="" loading="lazy" />;
    // #t=0.1 让浏览器显示第一帧作为静态画面。
    return <video ref={ref} src={visible ? `${src.slice(0, -"#video".length)}#t=0.1` : undefined} muted loop playsInline preload="metadata" disablePictureInPicture />;
}

/** 工具缩略图：优先管理员上传的封面，没有时用渐变底色加图标。 */
export function StudioToolThumb({ tool, cover, size = 64, className = "" }: { tool: StudioToolDefinition; cover?: string; size?: number; className?: string }) {
    const style = { width: size, height: size, ["--thumb-a" as string]: tool.gradient[0], ["--thumb-b" as string]: tool.gradient[1] };
    return (
        <span className={`studio-tool-thumb${className ? ` ${className}` : ""}`} style={style} aria-hidden>
            {cover ? <StudioCoverMedia src={cover} play={size >= 48} /> : <tool.icon />}
        </span>
    );
}
