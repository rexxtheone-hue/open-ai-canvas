import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { App, ConfigProvider, type ThemeConfig } from "antd";

import { AuthDialog } from "@/components/auth/auth-dialog";
import { AppWorkspaceShell } from "@/components/layout/app-top-nav";
import { cn } from "@/lib/utils";
import { isSpatialWorkbenchPath } from "@/lib/workspace-routes";
import { getAntThemeConfig, getWorkspaceAntThemeConfig } from "@/lib/app-theme";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useWorkspaceButtonFeedback } from "@/hooks/use-workspace-button-feedback";
import "@/styles/workspace-product.css";
import "@/styles/workspace-menus.css";

const workspaceTheme = getWorkspaceAntThemeConfig();

/** Studio 固定深色：Ant Design 的弹窗和消息也要用深色算法，否则会出现白底配浅色字。 */
function studioAntTheme(skinID: unknown): ThemeConfig {
    const dark = getAntThemeConfig(true, skinID);
    // 按组件逐项合并：工作台主题只改圆角等少数字段，不能整体覆盖深色主题里的背景色。
    const components: ThemeConfig["components"] = { ...dark.components };
    for (const [name, overrides] of Object.entries(workspaceTheme.components || {})) {
        (components as Record<string, object>)[name] = { ...(dark.components as Record<string, object> | undefined)?.[name], ...overrides };
    }
    return { ...dark, token: { ...dark.token, ...workspaceTheme.token }, components };
}

/**
 * AI Studio 固定使用深色界面。全站颜色变量（含 Ant Design 浮层）由 html 上的 dark 类驱动，
 * 进入 Studio 时临时加上，离开时恢复用户原来的主题；期间主题被其他逻辑改回时重新加上。
 */
function useStudioForcedDark(active: boolean) {
    useLayoutEffect(() => {
        if (!active) return;
        const root = document.documentElement;
        const hadDark = root.classList.contains("dark");
        root.classList.add("dark");
        root.dataset.studio = "true";
        const observer = new MutationObserver(() => {
            if (!root.classList.contains("dark")) root.classList.add("dark");
        });
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        return () => {
            observer.disconnect();
            delete root.dataset.studio;
            if (!hadDark) root.classList.remove("dark");
        };
    }, [active]);
}

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const adminWorkspace = pathname === "/admin" || pathname.startsWith("/admin/");
    // 界面选择页与 AI Studio 使用自己的外框，不套用工作台侧栏和顶栏。
    const ownChrome = pathname === "/" || pathname === "/studio" || pathname.startsWith("/studio/");
    const spatialWorkbench = isSpatialWorkbenchPath(pathname);
    const productWorkspace = !adminWorkspace && !/^\/canvas\/[^/]+(?:\/|$)/.test(pathname);
    useWorkspaceButtonFeedback(productWorkspace);
    const studioWorkspace = pathname === "/studio" || pathname.startsWith("/studio/");
    useStudioForcedDark(studioWorkspace);
    const activeSkin = useAppearanceStore((state) => state.appearance.activeSkin);

    useLayoutEffect(() => {
        // Ant Design 浮层挂载在 body，必须用路由级标记隔离用户工作台与画布编辑器、运营后台。
        document.body.classList.toggle("app-user-overlays", !adminWorkspace);
        document.body.classList.toggle("app-spatial-overlays", spatialWorkbench);
        document.body.classList.toggle("app-product-overlays", productWorkspace);
        return () => {
            document.body.classList.remove("app-user-overlays");
            document.body.classList.remove("app-spatial-overlays");
            document.body.classList.remove("app-product-overlays");
        };
    }, [adminWorkspace, spatialWorkbench, productWorkspace]);

    if (adminWorkspace) return children;

    return (
        <ConfigProvider
            theme={studioWorkspace ? studioAntTheme(activeSkin) : productWorkspace ? workspaceTheme : undefined}
            select={productWorkspace ? { classNames: { popup: { root: "workspace-quiet-popup" } } } : undefined}
            dropdown={productWorkspace ? { classNames: { root: "workspace-quiet-popup" } } : undefined}
            popover={productWorkspace ? { classNames: { root: "workspace-quiet-popup" } } : undefined}
        >
            <AuthDialog />
            {studioWorkspace ? (
                // 重新提供 App 上下文，让 Studio 里 App.useApp() 取到的 modal / message 继承深色主题。
                <App component={false} message={{ duration: 3, maxCount: 3 }} notification={{ duration: 4.5, maxCount: 3, placement: "topRight" }}>
                    {children}
                </App>
            ) : ownChrome ? (
                children
            ) : (
                <div className={cn("app-user-workspace h-dvh overflow-hidden text-foreground", spatialWorkbench && "app-spatial-workspace", productWorkspace && "app-product-workspace")}>
                    <AppWorkspaceShell>{children}</AppWorkspaceShell>
                </div>
            )}
        </ConfigProvider>
    );
}
