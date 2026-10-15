import "./studio.css";
import type { StudioToolDefinition } from "./studio-tools";

/** 工具缩略图：优先管理员上传的封面，没有时用渐变底色加图标。 */
export function StudioToolThumb({ tool, cover, size = 64, className = "" }: { tool: StudioToolDefinition; cover?: string; size?: number; className?: string }) {
    const style = { width: size, height: size, ["--thumb-a" as string]: tool.gradient[0], ["--thumb-b" as string]: tool.gradient[1] };
    return (
        <span className={`studio-tool-thumb${className ? ` ${className}` : ""}`} style={style} aria-hidden>
            {cover ? <img src={cover} alt="" loading="lazy" /> : <tool.icon />}
        </span>
    );
}
