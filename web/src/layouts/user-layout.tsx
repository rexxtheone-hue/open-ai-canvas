import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ConfigProvider } from "antd";

import { AppWorkspaceShell } from "@/components/layout/app-top-nav";
import { cn } from "@/lib/utils";
import { isSpatialWorkbenchPath } from "@/lib/workspace-routes";
import { getWorkspaceAntThemeConfig } from "@/lib/app-theme";
import { useWorkspaceButtonFeedback } from "@/hooks/use-workspace-button-feedback";
import "@/styles/workspace-product.css";
import "@/styles/workspace-menus.css";

const workspaceTheme = getWorkspaceAntThemeConfig();

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
            theme={productWorkspace ? workspaceTheme : undefined}
            select={productWorkspace ? { classNames: { popup: { root: "workspace-quiet-popup" } } } : undefined}
            dropdown={productWorkspace ? { classNames: { root: "workspace-quiet-popup" } } : undefined}
            popover={productWorkspace ? { classNames: { root: "workspace-quiet-popup" } } : undefined}
        >
            {ownChrome ? (
                children
            ) : (
                <div className={cn("app-user-workspace h-dvh overflow-hidden text-foreground", spatialWorkbench && "app-spatial-workspace", productWorkspace && "app-product-workspace")}>
                    <AppWorkspaceShell>{children}</AppWorkspaceShell>
                </div>
            )}
        </ConfigProvider>
    );
}
