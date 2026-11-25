import type { ComponentType, SVGProps } from "react";
import ClaudeLogo from "@lobehub/icons/es/Claude/components/Mono";
import CursorLogo from "@lobehub/icons/es/Cursor/components/Mono";
import McpLogo from "@lobehub/icons/es/MCP/components/Mono";
import OpenAILogo from "@lobehub/icons/es/OpenAI/components/Mono";

export type StudioMcpAppId = "claude" | "chatgpt" | "cursor" | "other" | "cli";

type Logo = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export const STUDIO_MCP_APPS: Array<{ id: StudioMcpAppId; label: string; logo?: Logo; background: string; color: string }> = [
    { id: "claude", label: "Claude", logo: ClaudeLogo as Logo, background: "#d97757", color: "#ffffff" },
    { id: "chatgpt", label: "ChatGPT", logo: OpenAILogo as Logo, background: "#ffffff", color: "#0d0d0d" },
    { id: "cursor", label: "Cursor", logo: CursorLogo as Logo, background: "#ffffff", color: "#141414" },
    { id: "other", label: "其他 MCP", logo: McpLogo as Logo, background: "transparent", color: "#ffffff" },
    { id: "cli", label: "CLI", background: "transparent", color: "#ffffff" },
];

export function StudioMcpMark({ id, size = 28 }: { id: StudioMcpAppId; size?: number }) {
    const app = STUDIO_MCP_APPS.find((item) => item.id === id)!;
    const Logo = app.logo;
    return (
        <span className="studio-mcp-mark" style={{ width: size, height: size, background: app.background, color: app.color, fontSize: size * 0.42 }} aria-hidden>
            {Logo ? <Logo size={Math.round(size * (app.background === "transparent" ? 0.86 : 0.62))} /> : "</>"}
        </span>
    );
}
