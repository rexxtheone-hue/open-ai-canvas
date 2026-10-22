import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { isGuestWorkspacePath } from "@/lib/guest-workspace";
import { useAuthGateStore } from "@/stores/use-auth-gate-store";
import { useUserStore } from "@/stores/use-user-store";

export function RequireAuth({ children, allowAnonymous = false }: { children: ReactNode; allowAnonymous?: boolean }) {
    const location = useLocation();
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);

    if (!hydrated) return <FullScreenLoader />;
    if (user || allowAnonymous || isGuestWorkspacePath(location.pathname)) return children;
    const target = location.pathname + location.search;
    // Studio 内的个人页面：访客留在原处，弹出注册窗口，注册后再进入；其他工作台仍走登录页。
    if (location.pathname.startsWith("/studio/")) return <StudioGuestGate target={target} />;
    return <Navigate to={`/login?next=${encodeURIComponent(target)}`} replace />;
}

function StudioGuestGate({ target }: { target: string }) {
    const navigate = useNavigate();
    const handled = useRef(false);
    useEffect(() => {
        // 开发模式会重复执行 effect，后退两次会离开站点。
        if (handled.current) return;
        handled.current = true;
        useAuthGateStore.getState().openAuth({ next: target });
        // 从侧栏点进来时退回上一页；直接打开链接时回到 Studio 首页。
        if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
        else navigate("/studio", { replace: true });
    }, [navigate, target]);
    return null;
}
