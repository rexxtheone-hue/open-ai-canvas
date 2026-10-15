import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Clapperboard, FolderOpen, Home, Palette, Sparkles, UserRound, Waypoints, Wand2 } from "lucide-react";

import { WorkspaceAccountMenu } from "@/components/layout/workspace-account-menu";
import { WorkspaceWalletHost } from "@/components/layout/workspace-wallet-modal";
import { CreditSymbol } from "@/constant/credits";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { useUserStore } from "@/stores/use-user-store";
import { saveStudioPreference } from "@/services/api/studio";
import "./studio.css";

const NAV_ITEMS = [
    { to: "/studio", label: "首页", icon: Home, match: (path: string) => path === "/studio" || path === "/studio/" },
    { to: "/studio/agents", label: "Agents", icon: Sparkles, match: (path: string) => path.startsWith("/studio/agents") },
    { to: "/studio/director", label: "导演", icon: Clapperboard, match: (path: string) => path.startsWith("/studio/director") },
    { to: "/studio/tools", label: "工具", icon: Wand2, match: (path: string) => path.startsWith("/studio/tools") || path.startsWith("/studio/create-") },
    { to: "/studio/media", label: "素材", icon: FolderOpen, match: (path: string) => path.startsWith("/studio/media") },
    { to: "/studio/characters", label: "角色", icon: UserRound, match: (path: string) => path.startsWith("/studio/characters") },
    { to: "/studio/brand", label: "品牌", icon: Palette, match: (path: string) => path.startsWith("/studio/brand") },
];

export function StudioBrandName() {
    return <>AI Studio</>;
}

/** Studio 外框：左侧图标栏、顶栏（积分、升级、账号、切换到画布）和内容区。 */
export function StudioShell({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
    const { pathname } = useLocation();
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { availableMicrocredits } = useWalletBalance(user?.id, creditsEnabled);
    const balance = availableMicrocredits === null ? "--" : (availableMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    const switchToCanvas = () => {
        if (user) void saveStudioPreference("canvas").catch(() => undefined);
    };
    return (
        <div className="studio-root">
            <nav className="studio-rail" aria-label="AI Studio 导航">
                <Link to="/studio" className="studio-rail-brand" aria-label="AI Studio 首页">AI</Link>
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(pathname);
                    return (
                        <Link key={item.to} to={item.to} className="studio-rail-item" aria-current={active ? "page" : undefined}>
                            <Icon aria-hidden />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
                <span className="studio-rail-divider" aria-hidden />
                <Link to="/canvas" className="studio-rail-item" onClick={switchToCanvas} title="切换到 AI Canvas">
                    <Waypoints aria-hidden />
                    <span>Canvas</span>
                </Link>
            </nav>
            <div className="studio-main">
                <header className="studio-topbar">
                    <div className="studio-topbar-title">
                        <strong><StudioBrandName /></strong>
                        {title ? <span>{title}{subtitle ? ` · ${subtitle}` : ""}</span> : null}
                    </div>
                    <div className="studio-topbar-spacer" />
                    <Link to="/canvas" className="studio-chip-button studio-hide-narrow" onClick={switchToCanvas}>
                        <Waypoints aria-hidden />
                        切换到 AI Canvas
                    </Link>
                    {creditsEnabled ? (
                        <button type="button" className="studio-chip-button studio-credit-pill" aria-label={`打开积分中心，可用 ${balance} 积分`} onClick={() => openWorkspaceWallet()}>
                            <CreditSymbol />
                            <strong>{balance}</strong>
                        </button>
                    ) : null}
                    {creditsEnabled ? <button type="button" className="studio-upgrade-button" onClick={() => openWorkspaceWallet()}>充值</button> : null}
                    <WorkspaceAccountMenu />
                </header>
                <div className="studio-content">{children}</div>
            </div>
            <WorkspaceWalletHost />
        </div>
    );
}
