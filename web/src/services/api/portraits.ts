import { http } from "./request";

export type StudioPortraitStatus = "pending" | "verified" | "failed";
export type StudioPortraitPhotoStatus = "processing" | "active" | "failed";

export type StudioPortraitPhoto = {
    id: string;
    portraitId: string;
    resourceId: string;
    assetId: string;
    status: StudioPortraitPhotoStatus;
    error: string;
    url?: string;
    createdAt: string;
};

export type StudioPortrait = {
    id: string;
    name: string;
    h5Link: string;
    groupId: string;
    status: StudioPortraitStatus;
    error: string;
    createdAt: string;
    photos?: StudioPortraitPhoto[];
};

export const listStudioPortraits = () => http.get<{ available: boolean; portraits: StudioPortrait[] }>("/studio/portraits");
export const createStudioPortrait = (name: string) => http.post<StudioPortrait>("/studio/portraits", { name });
export const checkStudioPortrait = (id: string) => http.post<StudioPortrait>(`/studio/portraits/${id}/check`);
export const deleteStudioPortrait = (id: string) => http.delete<{ ok: boolean }>(`/studio/portraits/${id}`);
export const addStudioPortraitPhoto = (id: string, resourceId: string) => http.post<StudioPortraitPhoto>(`/studio/portraits/${id}/photos`, { resourceId });
export const deleteStudioPortraitPhoto = (id: string) => http.delete<{ ok: boolean }>(`/studio/portrait-photos/${id}`);
