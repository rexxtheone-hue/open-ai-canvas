import SkillsPage from "@/pages/skills";
import "@/styles/workspace-product.css";
import { StudioShell } from "./studio-shell";

/** Skill 库：沿用工作台技能页，放进 Studio 外框并固定深色，对话里选用的 Skill 从这里添加。 */
export default function StudioSkillsPage() {
    return (
        <StudioShell title="Skill 库">
            {/* 技能页样式挂在 .app-product-workspace 下，深色变量要求 .dark 在它外层。 */}
            <div className="dark studio-canvas-library-host" style={{ height: "100%", minHeight: 480, overflow: "auto" }}>
                <div className="app-product-workspace" style={{ minHeight: "100%", padding: "20px 24px", background: "transparent" }}>
                    <SkillsPage />
                </div>
            </div>
        </StudioShell>
    );
}
