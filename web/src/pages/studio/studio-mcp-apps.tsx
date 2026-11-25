export type StudioMcpAppId = "claude" | "chatgpt" | "cursor" | "other" | "cli";

export const STUDIO_MCP_APPS: Array<{ id: StudioMcpAppId; label: string; mark: string; tone: string }> = [
    { id: "claude", label: "Claude", mark: "C", tone: "#d97757" },
    { id: "chatgpt", label: "ChatGPT", mark: "G", tone: "#10a37f" },
    { id: "cursor", label: "Cursor", mark: "▲", tone: "#3a3d42" },
    { id: "other", label: "其他 MCP", mark: "M", tone: "#6b5cff" },
    { id: "cli", label: "CLI", mark: "</>", tone: "#2b2e33" },
];

export function StudioMcpMark({ id, size = 28 }: { id: StudioMcpAppId; size?: number }) {
    const app = STUDIO_MCP_APPS.find((item) => item.id === id)!;
    return (
        <span className="studio-mcp-mark" style={{ width: size, height: size, background: app.tone, fontSize: app.mark.length > 1 ? size * 0.34 : size * 0.46 }} aria-hidden>
            {app.mark}
        </span>
    );
}
