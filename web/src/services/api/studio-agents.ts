import { http } from "@/services/api/request";
import type { StudioWork } from "@/services/api/studio";

// AI Studio 自有的角色库、对话模式和导演模式。数据只属于 Studio，与画布不互通。

export type StudioCharacter = {
    id: string;
    name: string;
    description: string;
    imageResourceIds: string[];
    voiceName?: string;
    updatedAt: string;
};

export type StudioCharacterInput = Pick<StudioCharacter, "name" | "description" | "imageResourceIds"> & { voiceName?: string };

export function listStudioCharacters() {
    return http.get<{ items: StudioCharacter[] }>("/studio/characters");
}

export function saveStudioCharacter(id: string | undefined, input: StudioCharacterInput) {
    return id ? http.put<StudioCharacter>(`/studio/characters/${encodeURIComponent(id)}`, input) : http.post<StudioCharacter>("/studio/characters", input);
}

export function deleteStudioCharacter(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/characters/${encodeURIComponent(id)}`);
}

export function lookupStudioWorks(ids: string[], signal?: AbortSignal) {
    return http.post<{ works: StudioWork[] }>("/studio/works/lookup", { ids }, { signal });
}

export type StudioChatSession = { id: string; mode: "chat" | "director"; storyId?: string; title: string; createdAt: string; updatedAt: string };

export type StudioChatMessage<Action = unknown, Attachment = unknown> = {
    id: string;
    role: "user" | "assistant";
    content: string;
    actions?: Action[];
    attachments?: Attachment[];
    taskId?: string;
    createdAt: string;
    updatedAt: string;
};

export type StudioChatInput<Action = unknown, Attachment = unknown> = { role: "user" | "assistant"; content: string; actions?: Action[]; attachments?: Attachment[]; taskId?: string };

export function listStudioChats(mode: "chat" | "director" = "chat") {
    return http.get<{ items: StudioChatSession[] }>("/studio/chats", { params: { mode } });
}

export function createStudioChat(title = "") {
    return http.post<StudioChatSession>("/studio/chats", { title });
}

export function getStudioChat<Action = unknown, Attachment = unknown>(id: string, signal?: AbortSignal) {
    return http.get<{ session: StudioChatSession; messages: Array<StudioChatMessage<Action, Attachment>> }>(`/studio/chats/${encodeURIComponent(id)}`, { signal });
}

export function renameStudioChat(id: string, title: string) {
    return http.patch<StudioChatSession>(`/studio/chats/${encodeURIComponent(id)}`, { title });
}

export function deleteStudioChat(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/chats/${encodeURIComponent(id)}`);
}

export function appendStudioChatMessage<Action = unknown, Attachment = unknown>(sessionId: string, input: StudioChatInput<Action, Attachment>) {
    return http.post<StudioChatMessage<Action, Attachment>>(`/studio/chats/${encodeURIComponent(sessionId)}/messages`, input);
}

export function updateStudioChatActions<Action = unknown, Attachment = unknown>(sessionId: string, messageId: string, actions: Action[]) {
    return http.put<StudioChatMessage<Action, Attachment>>(`/studio/chats/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/actions`, { actions });
}

export type StudioStorySummary = {
    id: string;
    title: string;
    ratio: string;
    durationSeconds: number;
    status: string;
    renderTaskId?: string;
    createdAt: string;
    updatedAt: string;
};

export type StudioScene = { id: string; storyId: string; sort: number; title: string; description: string };

export type StudioShot = {
    id: string;
    storyId: string;
    sceneId: string;
    sort: number;
    durationSeconds: number;
    fields?: Record<string, unknown>;
    activeImageVersionId?: string;
    activeVideoVersionId?: string;
    activeVoiceVersionId?: string;
};

export type StudioShotVersion = { id: string; shotId: string; storyId: string; kind: "image" | "video" | "audio"; taskId: string; createdAt: string; work?: StudioWork };

export type StudioStoryRender = { taskId: string; status: string; resourceId?: string; durationMs?: number; error?: string; progress?: number };

export type StudioStory = StudioStorySummary & {
    brief?: Record<string, unknown>;
    memory?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    sessionId?: string;
    scenes: StudioScene[];
    shots: StudioShot[];
    versions: StudioShotVersion[];
    render?: StudioStoryRender;
};

export type StudioStoryInput = {
    title: string;
    ratio: string;
    durationSeconds: number;
    brief?: Record<string, unknown>;
    memory?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    status?: string;
};

export type StudioScenePlanInput = { id?: string; title: string; description: string; shots: Array<{ id?: string; durationSeconds: number; fields: Record<string, unknown> }> };

export type StudioShotPatch = {
    durationSeconds?: number;
    fields?: Record<string, unknown>;
    activeImageVersionId?: string;
    activeVideoVersionId?: string;
    activeVoiceVersionId?: string;
};

export function listStudioStories() {
    return http.get<{ items: StudioStorySummary[] }>("/studio/stories");
}

export function createStudioStory(input: StudioStoryInput) {
    return http.post<StudioStory>("/studio/stories", input);
}

export function getStudioStory(id: string, signal?: AbortSignal) {
    return http.get<StudioStory>(`/studio/stories/${encodeURIComponent(id)}`, { signal });
}

export function updateStudioStory(id: string, input: StudioStoryInput) {
    return http.put<StudioStory>(`/studio/stories/${encodeURIComponent(id)}`, input);
}

export function deleteStudioStory(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/stories/${encodeURIComponent(id)}`);
}

export function replaceStudioStoryPlan(id: string, scenes: StudioScenePlanInput[]) {
    return http.put<StudioStory>(`/studio/stories/${encodeURIComponent(id)}/plan`, { scenes });
}

export function patchStudioShot(storyId: string, shotId: string, patch: StudioShotPatch) {
    return http.patch<StudioStory>(`/studio/stories/${encodeURIComponent(storyId)}/shots/${encodeURIComponent(shotId)}`, patch);
}

export function addStudioShotVersion(storyId: string, shotId: string, kind: "image" | "video" | "audio", taskId: string) {
    return http.post<StudioStory>(`/studio/stories/${encodeURIComponent(storyId)}/shots/${encodeURIComponent(shotId)}/versions`, { kind, taskId });
}

export function setStudioStoryRender(storyId: string, taskId: string) {
    return http.put<StudioStory>(`/studio/stories/${encodeURIComponent(storyId)}/render`, { taskId });
}

export type StudioUpload = {
    id: string;
    resourceId: string;
    kind: "image" | "video" | "audio";
    name: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    createdAt: string;
};

export function listStudioUploads(kind?: "image" | "video" | "audio", signal?: AbortSignal) {
    return http.get<{ items: StudioUpload[] }>("/studio/uploads", { params: { kind }, signal });
}

export function registerStudioUpload(resourceId: string, name: string) {
    return http.post<StudioUpload>("/studio/uploads", { resourceId, name });
}

export function deleteStudioUpload(id: string) {
    return http.delete<{ deleted: boolean }>(`/studio/uploads/${encodeURIComponent(id)}`);
}
