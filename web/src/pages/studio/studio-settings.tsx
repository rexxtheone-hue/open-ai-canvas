import SettingsPage from "@/pages/settings";
import { StudioShell } from "./studio-shell";

/** 账户与设置：沿用工作台的设置页，放进 Studio 外框并固定深色，避免跳出 Studio。 */
export default function StudioSettingsPage() {
    return (
        <StudioShell title="账户与设置">
            <div className="dark studio-settings-host" style={{ height: "100%", minHeight: 480 }}>
                <SettingsPage />
            </div>
        </StudioShell>
    );
}
