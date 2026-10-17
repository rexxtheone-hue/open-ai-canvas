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
    /** 作品来自哪个产品：AI Studio 和 AI Canvas 共用一个作品库。 */
    source?: "studio" | "canvas";
    tool?: string;
    favorite: boolean;
    error?: string;
    media: StudioMedia[];
    settings?: Record<string, unknown>;
    attempts?: number;
    /** 所在文件夹；未归类时为空。 */
    folderId?: string;
    labelIds?: string[];
};

export type StudioWorkPage = { works: StudioWork[]; nextCursor?: string };

export type StudioWorkQuery = {
    kind?: StudioKind | "all";
    /** 只看一个产品生成的作品，不填两边都看。 */
    source?: "studio" | "canvas";
    favorite?: boolean;
    q?: string;
    activeOnly?: boolean;
    /** 只看某个工具的作品，例如 create-pano（世界库）。 */
    tool?: string;
    /** 文件夹 ID；unsorted 表示没放进任何文件夹。 */
    folder?: string;
    label?: string;
    cursor?: string;
    pageSize?: number;
};

export function listStudioWorks(query: StudioWorkQuery = {}, signal?: AbortSignal) {
    return http.get<StudioWorkPage>("/studio/works", {
        params: {
            kind: query.kind && query.kind !== "all" ? query.kind : undefined,
            source: query.source || undefined,
            favorite: query.favorite ? "true" : undefined,
            q: query.q?.trim() || undefined,
            activeOnly: query.activeOnly ? "true" : undefined,
            tool: query.tool || undefined,
            folder: query.folder || undefined,
            label: query.label || undefined,
            cursor: query.cursor || undefined,
            pageSize: query.pageSize,
        },
        signal,
    });
}

export function setStudioWorkFavorite(id: string, favorite: boolean) {
    return http.put<{ favorite: boolean }>(`/studio/works/${encodeURIComponent(id)}/favorite`, { favorite });
}

export type StudioLabelColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";
export type StudioFolder = { id: string; name: string; count: number; createdAt: string };
export type StudioLabel = { id: string; name: string; color: StudioLabelColor; createdAt: string };

export function getStudioOrganize(signal?: AbortSignal) {
    return http.get<{ folders: StudioFolder[]; labels: StudioLabel[] }>("/studio/organize", { signal });
}

export function createStudioFolder(name: string) {
    return http.post<StudioFolder>("/studio/folders", { name });
}

export function renameStudioFolder(id: string, name: string) {
    return http.patch<{ updated: boolean }>(`/studio/folders/${encodeURIComponent(id)}`, { name });
}

export function deleteStudioFolder(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/folders/${encodeURIComponent(id)}`);
}

export function createStudioLabel(name: string, color: StudioLabelColor) {
    return http.post<StudioLabel>("/studio/labels", { name, color });
}

export function updateStudioLabel(id: string, input: { name?: string; color?: StudioLabelColor }) {
    return http.patch<{ updated: boolean }>(`/studio/labels/${encodeURIComponent(id)}`, input);
}

export function deleteStudioLabel(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/labels/${encodeURIComponent(id)}`);
}

/** 把作品放进文件夹；folderId 为空表示移出文件夹。 */
export function moveStudioWorks(taskIds: string[], folderId: string) {
    return http.post<{ moved: number }>("/studio/works/folder", { taskIds, folderId });
}

export function labelStudioWorks(taskIds: string[], labelId: string, add: boolean) {
    return http.post<{ updated: number }>("/studio/works/labels", { taskIds, labelId, add });
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
    /** 字体规范，例如「标题：思源黑体 Bold；正文：思源宋体」。 */
    typography: string;
    /** 品牌素材图（产品、包装、吉祥物等）。 */
    assetResourceIds: string[];
    /** 风格参考图。 */
    styleResourceIds: string[];
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
    /** 作者主页地址，链接到 /studio/u/:handle。 */
    authorHandle?: string;
    authorAvatar?: string;
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
    following?: boolean;
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
        following: query.following ? "true" : undefined,
        q: query.q?.trim() || undefined,
        offset: query.offset || undefined,
        pageSize: query.pageSize,
    };
}

export function listStudioCommunity(query: StudioCommunityQuery = {}, signal?: AbortSignal) {
    return http.get<StudioPostPage>("/studio/community", { params: communityParams(query), signal });
}

export type StudioProfileLinkKey = "website" | "instagram" | "tiktok" | "facebook" | "youtube" | "xiaohongshu" | "douyin";

export type StudioProfile = {
    handle: string;
    name: string;
    bio: string;
    location: string;
    specialties: string[];
    links: Partial<Record<StudioProfileLinkKey, string>>;
    avatarUrl?: string;
    coverUrl?: string;
    /** 只有自己的主页会返回，编辑时用。 */
    avatarResourceId?: string;
    coverResourceId?: string;
    stats: { works: number; likes: number; remixes: number; followers: number; following: number };
    mine: boolean;
    following: boolean;
    joinedAt: string;
};

export type StudioProfileInput = {
    handle: string;
    name: string;
    bio: string;
    location: string;
    specialties: string[];
    links: Partial<Record<StudioProfileLinkKey, string>>;
    avatarResourceId: string;
    coverResourceId: string;
};

export function getMyStudioProfile() {
    return http.get<StudioProfile>("/studio/profile");
}

export function updateStudioProfile(input: StudioProfileInput) {
    return http.put<StudioProfile>("/studio/profile", input);
}

export function getStudioProfile(handle: string, signal?: AbortSignal) {
    return http.get<StudioProfile>(`/studio/profiles/${encodeURIComponent(handle)}`, { signal });
}

export function listStudioProfilePosts(handle: string, tab: "works" | "liked", offset = 0, signal?: AbortSignal) {
    return http.get<StudioPostPage>(`/studio/profiles/${encodeURIComponent(handle)}/posts`, { params: { tab, offset: offset || undefined, pageSize: 24 }, signal });
}

export type StudioCreatorCard = {
    handle: string;
    name: string;
    bio: string;
    location: string;
    specialties: string[];
    avatarUrl?: string;
    stats: { works: number; likes: number; followers: number };
    mine: boolean;
    following: boolean;
    previews: StudioPostMedia[];
};

export type StudioCreatorQuery = {
    q?: string;
    specialty?: string;
    location?: string;
    sort?: "popular" | "followers" | "works" | "latest";
    offset?: number;
};

export function listStudioCreators(query: StudioCreatorQuery = {}, signal?: AbortSignal) {
    return http.get<{ creators: StudioCreatorCard[]; nextOffset?: number }>("/studio/creators", {
        params: {
            q: query.q?.trim() || undefined,
            specialty: query.specialty || undefined,
            location: query.location?.trim() || undefined,
            sort: query.sort,
            offset: query.offset || undefined,
            pageSize: 24,
        },
        signal,
    });
}

export function followStudioProfile(handle: string, following: boolean) {
    return http.put<StudioProfile>(`/studio/profiles/${encodeURIComponent(handle)}/follow`, { following });
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
