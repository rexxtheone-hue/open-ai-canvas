import { useRef, useState } from "react";
import { Link } from "react-router";

import { Puzzle } from "./studio-icons";
import { STUDIO_MCP_APPS, StudioMcpMark } from "./studio-mcp-apps";
import "./studio-mcp.css";

/** 侧栏「工具」里的「插件」：悬停弹出 MCP 应用和 CLI 列表，点进去是对应的接入教程。 */
export function StudioSidePlugins({ active }: { active: boolean }) {
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<number | undefined>(undefined);

    const open = () => {
        window.clearTimeout(closeTimer.current);
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const menuHeight = 330;
        setPosition({ left: rect.right + 10, top: Math.max(12, Math.min(rect.top - 40, window.innerHeight - menuHeight - 12)) });
    };
    const close = () => {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => setPosition(null), 140);
    };
    const mcpApps = STUDIO_MCP_APPS.filter((app) => app.id !== "cli");

    return (
        <div ref={ref} className="studio-side-plugins" data-open={Boolean(position)} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
            <Link to="/studio/mcp" aria-current={active ? "page" : undefined} aria-haspopup="menu">
                <Puzzle aria-hidden />
                插件
            </Link>
            <div className="studio-side-plugin-menu" role="menu" style={position ? { left: position.left, top: position.top } : undefined} onMouseEnter={open} onMouseLeave={close}>
                <small>连接你的 AI 助手</small>
                {mcpApps.map((app) => (
                    <Link key={app.id} role="menuitem" to={`/studio/mcp#${app.id}`} onClick={() => setPosition(null)}>
                        <StudioMcpMark id={app.id} size={26} />
                        {app.label}
                    </Link>
                ))}
                <span className="studio-side-plugin-divider" aria-hidden />
                <Link role="menuitem" to="/studio/mcp#cli" onClick={() => setPosition(null)}>
                    <StudioMcpMark id="cli" size={26} />
                    CLI 命令行
                </Link>
            </div>
        </div>
    );
}
