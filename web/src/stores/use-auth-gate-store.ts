import { create } from "zustand";

import { useUserStore } from "./use-user-store";

export type AuthGateMode = "login" | "register";

type AuthGateOptions = { mode?: AuthGateMode; next?: string };

type AuthGateStore = {
    open: boolean;
    mode: AuthGateMode;
    /** 登录成功后要前往的地址；不填则留在当前页面。 */
    next?: string;
    openAuth: (options?: AuthGateOptions) => void;
    setMode: (mode: AuthGateMode) => void;
    close: () => void;
};

/** 访客可以先浏览工作台，需要账号的操作再弹出注册 / 登录窗口，而不是整页跳转。 */
export const useAuthGateStore = create<AuthGateStore>((set) => ({
    open: false,
    mode: "register",
    next: undefined,
    openAuth: (options) => set({ open: true, mode: options?.mode ?? "register", next: options?.next }),
    setMode: (mode) => set({ mode }),
    close: () => set({ open: false, next: undefined }),
}));

/** 已登录返回 true；访客弹出注册窗口并返回 false。 */
export function requireUser(options?: AuthGateOptions) {
    if (useUserStore.getState().user) return true;
    useAuthGateStore.getState().openAuth(options);
    return false;
}
