import { Link, useNavigate } from "react-router";

import type { StudioWork } from "@/services/api/studio";
import { STUDIO_REUSE_KEY } from "./studio-agent";
import { StudioLibrary } from "./studio-library";
import { StudioShell } from "./studio-shell";
import { STUDIO_TOOL_CATEGORIES, STUDIO_TOOLS, studioToolForKind } from "./studio-tools";

export function StudioToolsPage() {
    return (
        <StudioShell title="工具">
            <div className="studio-home">
                {STUDIO_TOOL_CATEGORIES.map((category) => {
                    const tools = STUDIO_TOOLS.filter((tool) => tool.category === category.id);
                    if (!tools.length) return null;
                    return (
                        <section key={category.id} className="studio-section" aria-labelledby={`studio-tools-${category.id}`}>
                            <div className="studio-section-head"><h2 id={`studio-tools-${category.id}`}>{category.label}</h2></div>
                            <div className="studio-card-row">
                                {tools.map((tool) => (
                                    <Link key={tool.id} to={tool.path} className="studio-entry-card">
                                        <tool.icon className="studio-entry-icon" aria-hidden />
                                        {tool.badge ? <span className="studio-badge">{tool.badge}</span> : null}
                                        <strong>{tool.label}</strong>
                                        <span>{tool.description}</span>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </StudioShell>
    );
}

export function StudioMediaPage() {
    const navigate = useNavigate();
    const reuse = (work: StudioWork) => {
        const tool = studioToolForKind(work.kind);
        if (!tool) return;
        try {
            window.sessionStorage.setItem(STUDIO_REUSE_KEY, JSON.stringify(work));
        } catch {
            // 会话存储不可用时只打开工具页。
        }
        navigate(tool.path);
    };
    return (
        <StudioShell title="素材">
            <div style={{ height: "100%", minHeight: 480 }}>
                <StudioLibrary onReuseSettings={reuse} />
            </div>
        </StudioShell>
    );
}
