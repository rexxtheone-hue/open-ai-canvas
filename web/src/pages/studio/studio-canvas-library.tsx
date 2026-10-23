import CanvasPage from "@/pages/canvas";
import { StudioShell } from "./studio-shell";

/** 画布完整管理页与新建、作品带入画布的过渡页：沿用工作台画布库，放进 Studio 外框并固定深色。 */
export default function StudioCanvasLibraryPage() {
    return (
        <StudioShell title="无限画布">
            <div className="dark studio-canvas-library-host" style={{ height: "100%", minHeight: 480 }}>
                <CanvasPage />
            </div>
        </StudioShell>
    );
}
