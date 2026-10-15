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
