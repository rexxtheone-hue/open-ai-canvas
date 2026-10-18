import { create } from "zustand";

import { DEFAULT_DRAWING_ENGINE, type CanvasDrawingEngineSetting } from "@/lib/canvas/canvas-drawing-engine";

export type StaffRole = "operator" | "support" | "finance";
export type UserRole = "admin" | "user" | StaffRole;

export const staffRoleLabels: Record<StaffRole, string> = { operator: "运营", support: "客服", finance: "财务" };

export const userRoleOptions: Array<{ label: string; value: UserRole }> = [
    { label: "超级管理员", value: "admin" },
    { label: "运营", value: "operator" },
    { label: "客服", value: "support" },
    { label: "财务", value: "finance" },
    { label: "普通用户", value: "user" },
];

export function userRoleLabel(role: string | undefined) {
    return userRoleOptions.find((option) => option.value === role)?.label || "普通用户";
}

export function isStaffRole(role: string | undefined): role is StaffRole {
    return role === "operator" || role === "support" || role === "finance";
}

export type LocalUser = {
    id: string;
    username: string;
    email?: string;
    phone?: string;
    emailVerifiedAt?: string;
    phoneVerifiedAt?: string;
    displayName: string;
    avatarUrl?: string;
    avatarMode?: "custom" | "default" | "";
    avatarPreset?: string;
    identityProvider?: string;
    identityId?: string;
    identityUsername?: string;
    role: UserRole;
    status: "active" | "disabled";
    lastLoginAt?: string;
    createdAt?: string;
    updatedAt?: string;
};

export type RuntimeLimits = {
    activeTaskLimit: number;
    resourceUploadMB: number;
    recycleBinRetentionDays?: number;
};

export type FeatureAvailability = {
    welcomeEnabled: boolean;
    shortDramaEnabled: boolean;
    taskCenterEnabled: boolean;
    creditsEnabled: boolean;
    customChannelsEnabled: boolean;
    frontendModelsEnabled: boolean;
    pluginCenterEnabled: boolean;
    systemPluginsVisibleToUsers: boolean;
    inspirationSourcesVisible: boolean;
    imageWorkbenchEnabled: boolean;
    videoWorkbenchEnabled: boolean;
    configured?: boolean;
    updatedBy?: string;
    updatedAt?: string;
};

export const defaultFeatureAvailability: FeatureAvailability = {
    welcomeEnabled: true,
    shortDramaEnabled: true,
    taskCenterEnabled: true,
    creditsEnabled: true,
    customChannelsEnabled: true,
    frontendModelsEnabled: false,
    pluginCenterEnabled: true,
    systemPluginsVisibleToUsers: true,
    inspirationSourcesVisible: true,
    imageWorkbenchEnabled: false,
    videoWorkbenchEnabled: false,
};

type UserStore = {
    hydrated: boolean;
    user: LocalUser | null;
    runtimeLimits: RuntimeLimits;
    drawingEngine: CanvasDrawingEngineSetting;
    features: FeatureAvailability;
    /** 员工角色可访问的管理接口前缀；超级管理员与普通用户为空。 */
    adminAccess: string[];
    setUser: (user: LocalUser | null) => void;
    setAdminAccess: (access?: string[]) => void;
    setRuntimeLimits: (limits?: RuntimeLimits) => void;
    setDrawingEngine: (setting?: CanvasDrawingEngineSetting) => void;
    setFeatures: (features?: FeatureAvailability) => void;
    setHydrated: (hydrated: boolean) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    hydrated: false,
    user: null,
    runtimeLimits: { activeTaskLimit: 5, resourceUploadMB: 50, recycleBinRetentionDays: 30 },
    drawingEngine: { defaultEngine: DEFAULT_DRAWING_ENGINE },
    features: defaultFeatureAvailability,
    adminAccess: [],
    setUser: (user) => set({ user }),
    setAdminAccess: (adminAccess) => set({ adminAccess: adminAccess || [] }),
    setRuntimeLimits: (runtimeLimits) => set({ runtimeLimits: runtimeLimits || { activeTaskLimit: 5, resourceUploadMB: 50, recycleBinRetentionDays: 30 } }),
    setDrawingEngine: (drawingEngine) => set({ drawingEngine: drawingEngine || { defaultEngine: DEFAULT_DRAWING_ENGINE } }),
    setFeatures: (features) => set({ features: features ? { ...defaultFeatureAvailability, ...features } : defaultFeatureAvailability }),
    setHydrated: (hydrated) => set({ hydrated }),
    clearSession: () => set({ user: null, adminAccess: [], runtimeLimits: { activeTaskLimit: 5, resourceUploadMB: 50, recycleBinRetentionDays: 30 }, drawingEngine: { defaultEngine: DEFAULT_DRAWING_ENGINE }, features: defaultFeatureAvailability }),
}));
