import { http, apiBaseURL, compactApiParams } from "@/services/api/request";
import { translateServerText } from "@/lib/i18n/runtime";

export type AdminStorageResource = {
    id: string;
    userId: string;
    userName: string;
    kind: "image" | "video" | "audio" | "file" | string;
    status: "pending" | "ready" | "failed" | "deleted" | string;
    provider: string;
    bucket?: string;
    objectKey: string;
    mimeType: string;
    size: number;
    physicalBytes: number;
    width: number;
    height: number;
    durationMs: number;
    fileUrl: string;
    createdAt: string;
    updatedAt: string;
    userDeletedAt?: string;
};

export type AdminResourcePage = {
    items: AdminStorageResource[];
    total: number;
    page: number;
    pageSize: number;
};

export type AdminStorageDimensionStat = {
    count: number;
    logicalBytes: number;
    physicalBytes: number;
};

export type AdminStorageStats = {
    resourceCount: number;
    readyCount: number;
    logicalBytes: number;
    physicalBytes: number;
    localBytes: number;
    remoteBytes: number;
    byKind: Array<AdminStorageDimensionStat & { kind: string }>;
    byProvider: Array<AdminStorageDimensionStat & { provider: string }>;
};

export type AdminResourceQuery = {
    keyword?: string;
    kind?: string;
    status?: string;
    provider?: string;
    user?: string;
    userId?: string;
    page?: number;
    pageSize?: number;
};

export type AdminResourceReference = {
    kind: string;
    id: string;
    title: string;
};

export type AdminResourceDeleteBlocked = {
    id: string;
    reason: string;
    references: AdminResourceReference[];
};

export type AdminResourceDeleteResult = {
    deleted: string[];
    blocked: AdminResourceDeleteBlocked[];
};

export async function listAdminResources(query: AdminResourceQuery, signal?: AbortSignal) {
    return http.get<AdminResourcePage>("/admin/resources", { params: compactApiParams(query), signal });
}

export async function getAdminStorageStats(signal?: AbortSignal) {
    const result = await http.get<{ stats: AdminStorageStats }>("/admin/storage/stats", { signal });
    return result.stats;
}

export function deleteAdminResources(resourceIds: string[], purgeAssets = false) {
    return http.post<AdminResourceDeleteResult>("/admin/resources/delete", { resourceIds, purgeAssets });
}

export function adminResourceFileUrl(id: string, download = false) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return `${base}/admin/resources/${encodeURIComponent(id)}/file${download ? "?download=1" : ""}`;
}

export async function downloadAdminResource(resource: AdminStorageResource) {
    // 文件在对象存储时后端会 302 到签名链接；同源请求不带凭据跟随跳转，否则跨域响应会因缺少 Allow-Credentials 被拦。
    const response = await fetch(adminResourceFileUrl(resource.id, true), { credentials: String(apiBaseURL).startsWith("/") ? "same-origin" : "include" });
    if (!response.ok) {
        let message = "下载资源失败";
        try {
            const body = (await response.json()) as { msg?: string };
            if (body.msg) message = translateServerText(body.msg);
        } catch {
            // 文件接口失败时不保证返回 JSON。
        }
        throw new Error(message);
    }
    return response.blob();
}
