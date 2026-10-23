import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";

// Studio → 画布：素材放进 sessionStorage，URL 只带一次性令牌，避免长 URL 和刷新后重复插入。
const STORAGE_PREFIX = "studio-canvas-handoff:";
export const STUDIO_HANDOFF_PARAM = "studio";

export function studioCanvasHandoffPath(payloads: InsertAssetPayload[]) {
    if (!payloads.length) return undefined;
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
        window.sessionStorage.setItem(STORAGE_PREFIX + token, JSON.stringify(payloads));
    } catch {
        return undefined;
    }
    return `/studio/canvas/library?mode=handoff&${STUDIO_HANDOFF_PARAM}=${token}`;
}

export function readStudioCanvasHandoff(token: string): InsertAssetPayload[] {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_PREFIX + token);
        const value = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(value) ? (value as InsertAssetPayload[]) : [];
    } catch {
        return [];
    }
}

export function clearStudioCanvasHandoff(token: string) {
    try {
        window.sessionStorage.removeItem(STORAGE_PREFIX + token);
    } catch {
        // 存储不可用时令牌本来就读不到。
    }
}
