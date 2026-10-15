import { http } from "@/services/api/request";
import type { GenerationTask } from "@/services/api/task-center";

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
