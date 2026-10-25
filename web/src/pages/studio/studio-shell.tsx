import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { ChatFill, ChevronDown, ChevronRight, Clapperboard, Compass, Crown, DirectorFill, FolderOpen, Grid2x2, Home, Layers, LayoutTemplate, Library, Megaphone, MessageSquareText, Palette, PanelLeft, Pin, UserPen, UserRound, Users, Wand2 } from "./studio-icons";

import "@fontsource-variable/space-grotesk/index.css";

import { WorkspaceAccountMenu } from "@/components/layout/workspace-account-menu";
import { StudioGiftCenter, StudioHelpMenu } from "./studio-help";
import { WorkspaceWalletHost } from "@/components/layout/workspace-wallet-modal";
import { CreditSymbol } from "@/constant/credits";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { useUserStore } from "@/stores/use-user-store";
import { useAuthGateStore } from "@/stores/use-auth-gate-store";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { BrandLogo } from "@/components/brand/brand-logo";
import { StudioToolThumb } from "./studio-tool-thumb";
import { STUDIO_TOOL_TABS, STUDIO_TOOLS, studioToolById } from "./studio-tools";
import { useStudioPins, useStudioToolCovers } from "./use-studio-tool-meta";
import "./studio.css";

export function StudioBrandName() {
    return <>{useAppearanceStore((state) => state.appearance.brandName)}</>;
}

const COLLAPSE_KEY = "studio.sidebar.collapsed.v1";
const SECTIONS_KEY = "studio.sidebar.sections.v1";

type SectionId = "agents" | "tools" | "assets" | "inspire" | "pinned";

function readJSON<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function writeJSON(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // 浏览器存储不可用时只在本页生效。
    }
}

const isActive = (pathname: string, search: string, to: string) => {
    const [path, query] = to.split("?");
    if (query) return pathname === path && search.includes(query);
    if (path === "/studio") return pathname === "/studio" || pathname === "/studio/";
    return pathname === path || pathname.startsWith(`${path}/`);
};

/** 当前页面属于哪个工具分类：工具页、生成页都归到它的主分类，侧栏和面板标签据此高亮。 */
export function useStudioActiveTab() {
    const { pathname } = useLocation();
    const direct = STUDIO_TOOL_TABS.find((tab) => pathname === tab.path);
    if (direct) return direct.id;
    return STUDIO_TOOLS.find((tool) => tool.path === pathname)?.tabs[0];
}

/** Studio 外框：可收起的分组侧栏、带面包屑的顶栏和内容区。 */
/** 侧栏「工具」的排列和 OpenArt 一致：视频、图像、世界、角色、音频。 */
const SIDEBAR_TAB_ORDER = ["video", "image", "world", "character", "audio"] as const;

export function StudioShell({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
    const { pathname, search } = useLocation();
    const user = useUserStore((state) => state.user);
    const openAuth = useAuthGateStore((state) => state.openAuth);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { availableMicrocredits } = useWalletBalance(user?.id, creditsEnabled);
    const balance = availableMicrocredits === null ? "--" : (availableMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    const [collapsed, setCollapsed] = useState(() => readJSON(COLLAPSE_KEY, false));
    // 弹窗、下拉、提示消息挂在 body 上，不在 .studio-root 里；进入 Studio 时整页切到 OpenArt 的系统字体。
    useEffect(() => {
        document.documentElement.classList.add("studio-active");
        return () => document.documentElement.classList.remove("studio-active");
    }, []);
    const [closed, setClosed] = useState<SectionId[]>(() => readJSON(SECTIONS_KEY, []));
    const activeTab = useStudioActiveTab();
    const { pins } = useStudioPins();
    const covers = useStudioToolCovers();
    const pinnedTools = pins.map((id) => studioToolById(id)).filter((tool) => tool !== undefined);

    const toggleCollapsed = () => {
        setCollapsed((value) => {
            writeJSON(COLLAPSE_KEY, !value);
            return !value;
        });
    };
    const toggleSection = (id: SectionId) => {
        setClosed((current) => {
            const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
            writeJSON(SECTIONS_KEY, next);
            return next;
        });
    };
    const link = (to: string, label: string, Icon: typeof Home, extra = "") => (
        <Link to={to} className={`studio-side-link${extra}`} aria-current={isActive(pathname, search, to) ? "page" : undefined}>
            <Icon aria-hidden />
            <span>{label}</span>
        </Link>
    );
    const section = (id: SectionId, label: string, body: ReactNode) => (
        <div className="studio-side-section">
            <button type="button" className="studio-side-heading" aria-expanded={!closed.includes(id)} onClick={() => toggleSection(id)}>
                {closed.includes(id) ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
                {label}
            </button>
            {closed.includes(id) ? null : body}
        </div>
    );

    return (
        <div className={`studio-root${collapsed ? " is-collapsed" : ""}`}>
            <nav className="studio-sidebar" aria-label="AI Studio 导航">
                <div className="studio-side-top">
                    <Link to="/studio" className="studio-side-brand" aria-label="AI Studio 首页">
                        <BrandLogo className="studio-side-logo" alt="" fallback={<span className="studio-side-logo" />} />
                        {collapsed ? null : (
                            <strong>
                                <StudioBrandName />
                            </strong>
                        )}
                    </Link>
                    <button type="button" className="studio-side-collapse" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={toggleCollapsed}>
                        <PanelLeft aria-hidden />
                    </button>
                </div>
                {collapsed ? (
                    <div className="studio-rail-list">
                        {[
                            { to: "/studio", label: "首页", icon: Home, active: isActive(pathname, search, "/studio") },
                            { to: "/studio/agents", label: "智能体", icon: MessageSquareText, active: pathname.startsWith("/studio/agents") || pathname.startsWith("/studio/director") },
                            { to: "/studio/video", label: "工具", icon: Wand2, active: Boolean(activeTab) },
                            { to: "/studio/canvas", label: "无限画布", icon: Layers, active: pathname.startsWith("/studio/canvas") },
                            { to: "/studio/skills", label: "Skill 库", icon: Library, active: pathname.startsWith("/studio/skills") },
                            { to: "/studio/media", label: "素材", icon: FolderOpen, active: ["/studio/media", "/studio/characters", "/studio/brand"].some((path) => pathname.startsWith(path)) },
                            { to: "/studio/inspire", label: "灵感", icon: Compass, active: pathname.startsWith("/studio/inspire") || pathname.startsWith("/studio/pricing") },
                        ].map((item) => (
                            <Link key={item.to} to={item.to} className="studio-rail-item" aria-current={item.active ? "page" : undefined}>
                                <item.icon aria-hidden />
                                <span>{item.label}</span>
                            </Link>
                        ))}
                        {pinnedTools.length ? <span className="studio-rail-divider" aria-hidden /> : null}
                        {pinnedTools.map((tool) => (
                            <Link key={tool.id} to={tool.path} className="studio-rail-pin" title={tool.label} aria-label={tool.label} aria-current={pathname === tool.path ? "page" : undefined}>
                                <StudioToolThumb tool={tool} cover={covers[tool.id]} size={32} />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="studio-side-scroll">
                        {link("/studio", "首页", Home)}
                        {section(
                            "agents",
                            "智能体",
                            <div className="studio-side-cards">
                                <Link to="/studio/agents" className="studio-side-card" aria-current={pathname.startsWith("/studio/agents") ? "page" : undefined}>
                                    <span className="studio-side-card-icon">
                                        <ChatFill aria-hidden />
                                    </span>
                                    <span>
                                        <b>聊天模式</b>
                                        <small>说一句话，AI 帮你做</small>
                                    </span>
                                </Link>
                                <Link to="/studio/director" className="studio-side-card" aria-current={pathname.startsWith("/studio/director") ? "page" : undefined}>
                                    <span className="studio-side-card-icon">
                                        <DirectorFill aria-hidden />
                                    </span>
                                    <span>
                                        <b>导演模式</b>
                                        <small>从方案到成片</small>
                                    </span>
                                </Link>
                            </div>,
                        )}
                        {section(
                            "tools",
                            "工具",
                            <div className="studio-side-tools">
                                {SIDEBAR_TAB_ORDER.flatMap((id) => STUDIO_TOOL_TABS.filter((tab) => tab.id === id)).map((tab) => (
                                    <Link key={tab.id} to={tab.path} aria-current={activeTab === tab.id ? "page" : undefined}>
                                        <tab.icon aria-hidden />
                                        {tab.label}
                                    </Link>
                                ))}
                            </div>,
                        )}
                        {section(
                            "assets",
                            "素材",
                            <div className="studio-side-links">
                                {link("/studio/canvas", "无限画布", Layers)}
                                {link("/studio/director#studio-director-projects", "导演项目", Clapperboard)}
                                {link("/studio/characters", "角色与世界", UserRound)}
                                {link("/studio/skills", "Skill 库", Library)}
                                {link("/studio/brand", "品牌套件", Palette)}
                                {link("/studio/media", "媒体", FolderOpen)}
                            </div>,
                        )}
                        {section(
                            "inspire",
                            "获取灵感",
                            <div className="studio-side-links">
                                {link("/studio/templates", "模板", LayoutTemplate)}
                                {link("/studio/inspire", "灵感社区", Compass)}
                                {link("/studio/creators", "创作者", Users)}
                                {link("/studio/profile", "我的主页", UserPen)}
                                {link("/studio/pricing", "会员", Crown)}
                                {link("/studio/partner", "认证与推广", Megaphone)}
                            </div>,
                        )}
                        {section(
                            "pinned",
                            "已固定工具",
                            <div className="studio-side-links">
                                <Link to="/studio/video" className="studio-side-link">
                                    <Grid2x2 aria-hidden />
                                    <span>全部工具</span>
                                    <ChevronRight className="studio-side-trail" aria-hidden />
                                </Link>
                                {pinnedTools.length ? (
                                    pinnedTools.map((tool) => (
                                        <Link key={tool.id} to={tool.path} className="studio-side-link is-tool" aria-current={pathname === tool.path ? "page" : undefined}>
                                            <StudioToolThumb tool={tool} cover={covers[tool.id]} size={22} />
                                            <span>{tool.label}</span>
                                        </Link>
                                    ))
                                ) : (
                                    <p className="studio-side-empty">
                                        <Pin aria-hidden />
                                        在工具列表里点图钉，常用工具会出现在这里。
                                    </p>
                                )}
                            </div>,
                        )}
                    </div>
                )}
            </nav>
            <div className="studio-main">
                <header className="studio-topbar">
                    <div className="studio-topbar-title">
                        {title ? (
                            <strong>{title}</strong>
                        ) : (
                            <strong>
                                <StudioBrandName />
                            </strong>
                        )}
                        {subtitle ? <span>· {subtitle}</span> : null}
                    </div>
                    <div className="studio-topbar-spacer" />
                    <StudioHelpMenu />
                    {user ? (
                        <>
                            <StudioGiftCenter />
                            {creditsEnabled ? (
                                <button type="button" className="studio-credit-pill" aria-label={`打开积分中心，可用 ${balance} 积分`} onClick={() => openWorkspaceWallet()}>
                                    <CreditSymbol />
                                    <strong>{balance}</strong>
                                </button>
                            ) : null}
                            {creditsEnabled ? (
                                <Link to="/studio/pricing" className="studio-upgrade-button">
                                    升级
                                </Link>
                            ) : null}
                            <WorkspaceAccountMenu studio />
                        </>
                    ) : (
                        <>
                            <button type="button" className="studio-login-button" onClick={() => openAuth({ mode: "login" })}>
                                登录
                            </button>
                            <button type="button" className="studio-upgrade-button" onClick={() => openAuth({ mode: "register" })}>
                                免费注册
                            </button>
                        </>
                    )}
                </header>
                <div className="studio-content">{children}</div>
            </div>
            <WorkspaceWalletHost />
        </div>
    );
}
