import { http } from "@/services/api/request";
import type { GenerationTask } from "@/services/api/task-center";
import type { TopupProduct } from "@/services/api/payments";

export type StudioKind = "image" | "video" | "audio";
export type StudioSurface = "studio" | "canvas";

export type StudioMedia = {
    kind: StudioKind;
    url?: string;
    storageKey?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

export type StudioWork = Omit<GenerationTask, "inputJson" | "resultJson" | "attempts"> & {
    kind: StudioKind;
    tool?: string;
    favorite: boolean;
    error?: string;
    media: StudioMedia[];
    settings?: Record<string, unknown>;
    attempts?: number;
};

export type StudioWorkPage = { works: StudioWork[]; nextCursor?: string };

export type StudioWorkQuery = {
    kind?: StudioKind | "all";
    favorite?: boolean;
    q?: string;
    activeOnly?: boolean;
    cursor?: string;
    pageSize?: number;
};

export function listStudioWorks(query: StudioWorkQuery = {}, signal?: AbortSignal) {
    return http.get<StudioWorkPage>("/studio/works", {
        params: {
            kind: query.kind && query.kind !== "all" ? query.kind : undefined,
            favorite: query.favorite ? "true" : undefined,
            q: query.q?.trim() || undefined,
            activeOnly: query.activeOnly ? "true" : undefined,
            cursor: query.cursor || undefined,
            pageSize: query.pageSize,
        },
        signal,
    });
}

export function setStudioWorkFavorite(id: string, favorite: boolean) {
    return http.put<{ favorite: boolean }>(`/studio/works/${encodeURIComponent(id)}/favorite`, { favorite });
}

export function deleteStudioWorks(ids: string[]) {
    return http.post<{ removed: number }>("/studio/works/delete", { ids });
}

export function getStudioPreference() {
    return http.get<{ surface?: StudioSurface | "" }>("/studio/preferences");
}

export function saveStudioPreference(surface: StudioSurface) {
    return http.put<{ surface: StudioSurface }>("/studio/preferences", { surface });
}

export type StudioBrandKit = {
    id: string;
    name: string;
    intro: string;
    audience: string;
    tone: string;
    slogan: string;
    colors: string[];
    logoResourceId?: string;
    logoUrl?: string;
    avoid: string;
    isDefault: boolean;
    updatedAt: string;
};

export type StudioBrandKitInput = Omit<StudioBrandKit, "id" | "logoUrl" | "updatedAt">;

export function listStudioBrandKits() {
    return http.get<{ brandKits: StudioBrandKit[] }>("/studio/brand-kits");
}

export function createStudioBrandKit(input: StudioBrandKitInput) {
    return http.post<StudioBrandKit>("/studio/brand-kits", input);
}

export function updateStudioBrandKit(id: string, input: StudioBrandKitInput) {
    return http.put<StudioBrandKit>(`/studio/brand-kits/${encodeURIComponent(id)}`, input);
}

export function deleteStudioBrandKit(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/brand-kits/${encodeURIComponent(id)}`);
}

export type StudioPostMedia = { kind: StudioKind; url: string; mimeType?: string; width?: number; height?: number; durationMs?: number };

export type StudioPost = {
    id: string;
    kind: StudioKind;
    tool: string;
    title: string;
    /** 作者没开放做同款时为空。 */
    prompt?: string;
    settings?: Record<string, unknown>;
    media: StudioPostMedia[];
    author: string;
    mine: boolean;
    liked: boolean;
    likeCount: number;
    remixCount: number;
    featured: boolean;
    isTemplate: boolean;
    allowRemix: boolean;
    hidden?: boolean;
    createdAt: string;
};

export type StudioPostPage = { posts: StudioPost[]; nextOffset?: number };

export type StudioCommunityQuery = {
    kind?: StudioKind | "all";
    sort?: "featured" | "latest" | "popular";
    templates?: boolean;
    featured?: boolean;
    mine?: boolean;
    q?: string;
    offset?: number;
    pageSize?: number;
};

function communityParams(query: StudioCommunityQuery) {
    return {
        kind: query.kind && query.kind !== "all" ? query.kind : undefined,
        sort: query.sort,
        templates: query.templates ? "true" : undefined,
        featured: query.featured ? "true" : undefined,
        mine: query.mine ? "true" : undefined,
        q: query.q?.trim() || undefined,
        offset: query.offset || undefined,
        pageSize: query.pageSize,
    };
}

export function listStudioCommunity(query: StudioCommunityQuery = {}, signal?: AbortSignal) {
    return http.get<StudioPostPage>("/studio/community", { params: communityParams(query), signal });
}

export function publishStudioWork(id: string, input: { title: string; allowRemix: boolean }) {
    return http.post<StudioPost>(`/studio/works/${encodeURIComponent(id)}/publish`, input);
}

export function likeStudioPost(id: string, liked: boolean) {
    return http.put<{ liked: boolean; likeCount: number }>(`/studio/community/${encodeURIComponent(id)}/like`, { liked });
}

export type StudioRemix = { kind: StudioKind; tool: string; prompt: string; settings: Record<string, unknown> };

export function remixStudioPost(id: string) {
    return http.post<StudioRemix>(`/studio/community/${encodeURIComponent(id)}/remix`);
}

export function deleteStudioPost(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/community/${encodeURIComponent(id)}`);
}

export type StudioPlan = {
    id: string;
    name: string;
    description: string;
    badge: string;
    durationDays: number;
    activeTaskLimit: number;
    commercialLicense: boolean;
    enabled: boolean;
    sortOrder: number;
};

export type StudioPlanOffer = StudioPlan & { products: TopupProduct[] };

export type StudioMembership = {
    active: boolean;
    plan?: StudioPlan;
    expiresAt?: string;
    activeTaskLimit: number;
    commercialLicense: boolean;
};

export function listStudioPlans() {
    return http.get<{ plans: StudioPlanOffer[] }>("/studio/plans");
}

export function getStudioMembership() {
    return http.get<StudioMembership>("/studio/membership");
}

export type StudioPlanInput = Omit<StudioPlan, "id">;

export function listAdminStudioPlans() {
    return http.get<{ plans: StudioPlan[] }>("/admin/studio/plans");
}

export function saveAdminStudioPlan(id: string | undefined, input: StudioPlanInput) {
    return id ? http.put<StudioPlan>(`/admin/studio/plans/${encodeURIComponent(id)}`, input) : http.post<StudioPlan>("/admin/studio/plans", input);
}

export function listAdminStudioCommunity(query: StudioCommunityQuery = {}) {
    return http.get<StudioPostPage>("/admin/studio/community", { params: communityParams(query) });
}

export function updateAdminStudioPost(id: string, input: { featured?: boolean; isTemplate?: boolean; hidden?: boolean }) {
    return http.patch<StudioPost>(`/admin/studio/community/${encodeURIComponent(id)}`, input);
}

export function listStudioToolCovers() {
    return http.get<{ covers: Record<string, string> }>("/studio/tool-covers");
}

export function setAdminStudioToolCover(toolId: string, resourceId: string) {
    return http.put<{ saved: boolean }>(`/admin/studio/tool-covers/${encodeURIComponent(toolId)}`, { resourceId });
}
