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

/** 模型不支持时返回原因，用于下拉置灰提示。 */
export function videoModeUnavailableReason(profile: VideoCapabilityConfig | undefined, mode: VideoMode): string | undefined {
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

/** 选中的模式与已放素材不匹配时返回提示；返回空表示可以提交。 */
export function videoModeInputError(mode: VideoMode, input: VideoModeInput): string | undefined {
    const { imageCount, videoCount, audioCount } = input;
    switch (mode) {
        case "text_to_video":
            return imageCount + videoCount + audioCount > 0 ? "文生视频不使用参考素材，请移除素材，或切换到全能参考、图生视频" : undefined;
        case "image_to_video":
            if (imageCount < 1) return "图生视频需要一张图片作为首帧";
            return videoCount > 0 ? "图生视频不能使用参考视频，请切换到全能参考" : undefined;
        case "first_last_frame":
            if (imageCount < 2) return "首尾帧需要两张图片：第一张作为首帧，第二张作为尾帧";
            return videoCount > 0 ? "首尾帧不能使用参考视频，请切换到全能参考" : undefined;
        case "reference_to_video":
            return imageCount + videoCount + audioCount > 0 ? undefined : "全能参考至少需要一个参考素材";
        case "extend":
            return videoCount > 0 ? undefined : "视频续写需要先放入一段原视频";
        case "inpaint":
            return videoCount > 0 ? undefined : "视频编辑需要先放入一段原视频";
    }
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
