import { Navigate, useNavigate, useParams } from "react-router";

import type { StudioWork } from "@/services/api/studio";
import { STUDIO_REUSE_KEY } from "./studio-agent";
import { StudioLibrary } from "./studio-library";
import { StudioShell } from "./studio-shell";
import { studioSpecialtyToolById, studioToolById, studioToolForKind } from "./studio-tools";
import StudioToolPage from "./studio-tool-page";

export function StudioSpecialtyToolRoute() {
    const { toolId } = useParams<{ toolId: string }>();
    const tool = studioSpecialtyToolById(toolId);
    if (!tool) return <Navigate to="/studio/video" replace />;
    return <StudioToolPage key={tool.id} toolId={tool.id} />;
}

/** 旧地址 /studio/tools 进入视频工具清单。 */
export function StudioToolsPage() {
    return <Navigate to="/studio/video" replace />;
}

export function StudioMediaPage() {
    const navigate = useNavigate();
    const reuse = (work: StudioWork) => {
        const original = work.tool ? studioToolById(work.tool) : undefined;
        const tool = original && original.kind === work.kind ? original : studioToolForKind(work.kind);
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
