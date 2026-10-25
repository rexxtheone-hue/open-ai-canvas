import SkillsPage from "@/pages/skills";
import { StudioShell } from "./studio-shell";

/** Skill 库：沿用工作台技能页，放进 Studio 外框并固定深色，对话里选用的 Skill 从这里添加。 */
export default function StudioSkillsPage() {
    return (
        <StudioShell title="Skill 库">
            <div className="dark studio-canvas-library-host" style={{ height: "100%", minHeight: 480, overflow: "auto" }}>
                <SkillsPage />
            </div>
        </StudioShell>
    );
}
