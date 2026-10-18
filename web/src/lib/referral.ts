// 推广链接 ?ref=CODE：记住 30 天，注册或首次验证码登录时提交给后端做归属。
const STORAGE_KEY = "yc_referral";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;

export function captureReferralFromUrl() {
    try {
        const code = new URLSearchParams(window.location.search).get("ref")?.trim();
        if (!code || !CODE_PATTERN.test(code)) return;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
    } catch {
        // 无痕模式或禁用存储时不记录推广来源。
    }
}

export function readReferralCode(): string | undefined {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return undefined;
        const value = JSON.parse(raw) as { code?: unknown; at?: unknown };
        if (typeof value.code !== "string" || typeof value.at !== "number" || Date.now() - value.at > TTL_MS) return undefined;
        return value.code;
    } catch {
        return undefined;
    }
}

export function affiliateLink(code: string) {
    return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
}
