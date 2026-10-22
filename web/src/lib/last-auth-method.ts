// 记住这台设备上次用哪种方式登录，登录 / 注册窗口在对应按钮上标「上次使用」。
const KEY = "omnimuse:last-auth-method";

export type AuthMethod = "google" | "email";

export function readLastAuthMethod(): AuthMethod | null {
    try {
        const value = window.localStorage.getItem(KEY);
        return value === "google" || value === "email" ? value : null;
    } catch {
        return null;
    }
}

export function rememberAuthMethod(method: AuthMethod) {
    try {
        window.localStorage.setItem(KEY, method);
    } catch {
        // 存储不可用时只是不显示标记。
    }
}
