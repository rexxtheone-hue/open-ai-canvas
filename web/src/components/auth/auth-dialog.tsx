import { lazy, Suspense } from "react";
import { Modal, Spin } from "antd";
import { useLocation, useNavigate } from "react-router";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useAuthGateStore } from "@/stores/use-auth-gate-store";
import { useUserStore } from "@/stores/use-user-store";
import "@/pages/auth/auth-forms.css";

const LoginForm = lazy(() => import("@/pages/auth/login").then((module) => ({ default: module.LoginForm })));
const RegisterForm = lazy(() => import("@/pages/auth/register").then((module) => ({ default: module.RegisterForm })));

/** 工作台内的注册 / 登录弹窗：访客触发需要账号的操作时出现，完成后留在原页面继续操作。 */
export function AuthDialog() {
    const { open, mode, next, setMode, close } = useAuthGateStore();
    const user = useUserStore((state) => state.user);
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const location = useLocation();
    const navigate = useNavigate();
    const returnTo = next || location.pathname + location.search;
    const finish = () => {
        close();
        if (next && next !== location.pathname + location.search) navigate(next);
    };

    return (
        <Modal open={open && !user} onCancel={close} footer={null} width={440} centered destroyOnHidden className="workspace-modal auth-dialog" title={null}>
            <div className="auth-scene-card auth-dialog-body">
                <header className="mb-6 flex flex-col items-center gap-2 text-center">
                    <BrandLogo className="size-11" alt="" fallback={<span className="size-11" />} />
                    <h2 className="m-0 mt-1 text-[22px] font-semibold leading-tight tracking-tight">{mode === "register" ? `欢迎来到 ${brandName}` : "欢迎回来"}</h2>
                    <p className="auth-scene-muted m-0 text-sm">{mode === "register" ? "注册后即可生成视频、图片和配音" : "登录后继续你的创作"}</p>
                </header>
                <Suspense
                    fallback={
                        <div className="flex justify-center py-10">
                            <Spin />
                        </div>
                    }
                >
                    {mode === "login" ? <LoginForm next={returnTo} onSuccess={finish} onSwitch={() => setMode("register")} onNavigate={close} /> : <RegisterForm next={returnTo} onSuccess={finish} onSwitch={() => setMode("login")} />}
                </Suspense>
            </div>
        </Modal>
    );
}
