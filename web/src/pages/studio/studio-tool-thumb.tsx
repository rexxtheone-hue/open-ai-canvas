import "./studio.css";
import type { StudioToolDefinition } from "./studio-tools";

/** 视频封面的地址带 #video 标记（后端加的，片段不会发给服务器）。 */
export function isStudioVideoCover(src: string) {
    return src.endsWith("#video");
}

/** 封面媒体：图片和 GIF 直接显示；视频封面静音循环播放，像 OpenArt 的动态缩略图。很小的图标位只显示第一帧。 */
export function StudioCoverMedia({ src, play = true }: { src: string; play?: boolean }) {
    if (!isStudioVideoCover(src)) return <img src={src} alt="" loading="lazy" />;
    return <video src={src.slice(0, -"#video".length)} muted loop playsInline autoPlay={play} preload={play ? "auto" : "metadata"} disablePictureInPicture />;
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
