import type { VideoCapabilityConfig } from "@/lib/model-capabilities";

/** 用户在输入框里显式选择的视频生成模式；未选择时沿用按素材自动推断。 */
export type VideoMode = "text_to_video" | "image_to_video" | "first_last_frame" | "reference_to_video" | "extend" | "inpaint";

export type VideoModeInput = { imageCount: number; videoCount: number; audioCount: number };

export const VIDEO_MODES: Array<{ value: VideoMode; label: string; description: string }> = [
    { value: "text_to_video", label: "文生视频", description: "只用文字描述生成视频" },
    { value: "reference_to_video", label: "全能参考", description: "图片、视频、音频任意组合作为参考" },
    { value: "image_to_video", label: "图生视频", description: "用一张图片作为首帧" },
    { value: "first_last_frame", label: "首尾帧", description: "第一张图作为首帧，第二张作为尾帧" },
    { value: "inpaint", label: "视频编辑", description: "用文字修改一段已有视频" },
    { value: "extend", label: "视频续写", description: "在一段已有视频后继续生成" },
];

const EDIT_OPERATIONS = new Set(["inpaint", "replace_element", "style_transfer", "camera_motion"]);

export function isVideoMode(value: unknown): value is VideoMode {
    return typeof value === "string" && VIDEO_MODES.some((mode) => mode.value === value);
}

export function videoModeLabel(mode: VideoMode) {
    return VIDEO_MODES.find((item) => item.value === mode)?.label || mode;
}

/** 首尾帧在供应商侧仍是图生视频，区别只在图片角色。 */
export function videoModeOperation(mode: VideoMode) {
    return mode === "first_last_frame" ? "image_to_video" : mode;
}

export type VideoMaterialKind = "image" | "video" | "audio";

/** 每个模式实际使用的素材数量；超出部分在界面置灰，提交时不发送。 */
const MATERIAL_LIMITS: Record<VideoMode, Record<VideoMaterialKind, number>> = {
    text_to_video: { image: 0, video: 0, audio: 0 },
    reference_to_video: { image: Infinity, video: Infinity, audio: Infinity },
    image_to_video: { image: 1, video: 0, audio: 0 },
    first_last_frame: { image: 2, video: 0, audio: 0 },
    inpaint: { image: Infinity, video: 1, audio: 0 },
    extend: { image: 0, video: 1, audio: 0 },
};

/** 同类素材里第 index 个是否会被当前模式使用；未手动选择模式时全部使用。 */
export function videoModeUsesMaterial(mode: VideoMode | undefined, kind: VideoMaterialKind, index: number) {
    return !mode || index < MATERIAL_LIMITS[mode][kind];
}

/** 素材在当前模式里的角色标签，例如首尾帧的「首帧」「尾帧」；没有特定角色时返回空。 */
export function videoModeMaterialRole(mode: VideoMode | undefined, kind: VideoMaterialKind, index: number): string | undefined {
    if (kind === "image" && index === 0 && (mode === "image_to_video" || mode === "first_last_frame")) return "首帧";
    if (kind === "image" && index === 1 && mode === "first_last_frame") return "尾帧";
    if (kind === "video" && index === 0 && (mode === "extend" || mode === "inpaint")) return "原视频";
    return undefined;
}

/** 只保留当前模式会用到的素材，保持原有顺序。 */
export function pickVideoModeMaterials<T>(mode: VideoMode | undefined, kind: VideoMaterialKind, items: T[]): T[] {
    if (!mode) return items;
    const limit = MATERIAL_LIMITS[mode][kind];
    return limit >= items.length ? items : items.slice(0, limit);
}

/** 当前模式实际使用的素材数量。 */
export function videoModeUsedInput(mode: VideoMode | undefined, input: VideoModeInput): VideoModeInput {
    if (!mode) return input;
    const limits = MATERIAL_LIMITS[mode];
    return { imageCount: Math.min(input.imageCount, limits.image), videoCount: Math.min(input.videoCount, limits.video), audioCount: Math.min(input.audioCount, limits.audio) };
}

/** 有素材时不能文生视频；手动选的文生视频遇到素材会自动退回按素材判断。 */
export function videoModeMaterialConflict(mode: VideoMode, input: VideoModeInput | undefined): string | undefined {
    if (!input) return undefined;
    if (mode === "text_to_video" && input.imageCount + input.videoCount + input.audioCount > 0) return "已放入参考素材，请移除后再用文生视频";
    return undefined;
}

/** 模式缺少必需素材时返回原因。 */
export function videoModeMissingMaterial(mode: VideoMode, input: VideoModeInput | undefined): string | undefined {
    if (!input) return undefined;
    switch (mode) {
        case "image_to_video":
            return input.imageCount >= 1 ? undefined : "需要先放入一张图片";
        case "first_last_frame":
            return input.imageCount >= 2 ? undefined : "需要先放入两张图片";
        case "reference_to_video":
            return input.imageCount + input.videoCount + input.audioCount > 0 ? undefined : "需要先放入参考素材";
        case "extend":
        case "inpaint":
            return input.videoCount >= 1 ? undefined : "需要先放入一段视频";
        default:
            return undefined;
    }
}

/** 应该清除手动选择的情况：模型不支持，或已有素材却选着文生视频。缺素材时保留选择，等用户补素材。 */
export function videoModeShouldReset(profile: VideoCapabilityConfig | undefined, mode: VideoMode, input: VideoModeInput | undefined) {
    return Boolean(videoModeMaterialConflict(mode, input) || videoModeModelReason(profile, mode));
}

/** 模型不支持、与素材冲突或缺少必需素材时返回原因，用于下拉置灰提示。 */
export function videoModeUnavailableReason(profile: VideoCapabilityConfig | undefined, mode: VideoMode, input?: VideoModeInput): string | undefined {
    return videoModeMaterialConflict(mode, input) || videoModeModelReason(profile, mode) || videoModeMissingMaterial(mode, input);
}

function videoModeModelReason(profile: VideoCapabilityConfig | undefined, mode: VideoMode): string | undefined {
    if (!profile) return undefined;
    const operations = profile.operations || [];
    const references = profile.references;
    switch (mode) {
        case "text_to_video":
            return operations.includes("text_to_video") ? undefined : "当前模型不支持文生视频";
        case "image_to_video":
            return operations.includes("image_to_video") && references.maxImages >= 1 ? undefined : "当前模型不支持图生视频";
        case "first_last_frame":
            return operations.includes("image_to_video") && references.maxImages >= 2 ? undefined : "当前模型不支持首尾帧";
        case "reference_to_video":
            return operations.includes("reference_to_video") ? undefined : "当前模型不支持全能参考";
        case "extend":
            return operations.includes("extend") && references.maxVideos >= 1 ? undefined : "当前模型不支持视频续写";
        case "inpaint":
            return operations.some((operation) => EDIT_OPERATIONS.has(operation)) && references.maxVideos >= 1 ? undefined : "当前模型不支持视频编辑";
    }
}

/** 提交前的最终检查：按模式实际使用的素材判断；返回空表示可以提交。 */
export function videoModeInputError(mode: VideoMode, input: VideoModeInput): string | undefined {
    const used = videoModeUsedInput(mode, input);
    const missing = videoModeMissingMaterial(mode, used);
    if (missing) return missing;
    if (mode === "text_to_video" && input.imageCount + input.videoCount + input.audioCount > 0) return "文生视频不使用参考素材，请移除素材，或切换到全能参考、图生视频";
    return undefined;
}

/** 首尾帧模式：前两张图片分别标为首帧、尾帧；其他模式不改动已有角色。 */
export function applyVideoModeImageRoles<T extends { role?: string }>(mode: VideoMode | undefined, images: T[]): T[] {
    if (mode !== "first_last_frame") return images;
    return images.map((image, index) => (index === 0 ? { ...image, role: "first_frame" } : index === 1 ? { ...image, role: "last_frame" } : image));
}

/** 计费专属类别：全能参考、续写、编辑可以单独定价；其余沿用按素材归类。 */
export function videoPricingOperation(operation: string | undefined): string | undefined {
    if (!operation) return undefined;
    if (operation === "reference_to_video" || operation === "extend") return operation;
    if (EDIT_OPERATIONS.has(operation)) return "video_edit";
    return undefined;
}

/** 当前模型下的默认模式：优先保留用户已选模式，不可用时回落到第一个可用模式。 */
export function resolveSelectableVideoMode(profile: VideoCapabilityConfig | undefined, preferred: VideoMode | undefined): VideoMode | undefined {
    if (preferred && !videoModeUnavailableReason(profile, preferred)) return preferred;
    return VIDEO_MODES.find((mode) => !videoModeUnavailableReason(profile, mode.value))?.value;
}
