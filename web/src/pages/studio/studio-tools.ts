import type { LucideIcon } from "lucide-react";
import { AudioLines, Clapperboard, Image as ImageIcon, Languages, MicVocal, MonitorUp, PersonStanding, SunMedium, Wallpaper, ZoomIn } from "lucide-react";

import type { StudioKind } from "@/services/api/studio";

export type StudioToolCategory = "generate" | "edit" | "character" | "audio";

export type StudioToolDefinition = {
    id: string;
    label: string;
    description: string;
    icon: LucideIcon;
    path: string;
    category: StudioToolCategory;
    /** 生成类工具对应的作品类型；作品库按它筛选。 */
    kind: StudioKind;
    badge?: string;
    /** 专项工具：素材按槽位上传，提示词由固定指令拼出（见 studio-specialty.ts）。 */
    specialty?: boolean;
};

/** 已上线的工具。H6：没上线的工具不出现在任何列表里。 */
export const STUDIO_TOOLS: StudioToolDefinition[] = [
    { id: "create-image", label: "生成图片", description: "文字或参考图生成图片", icon: ImageIcon, path: "/studio/create-image", category: "generate", kind: "image" },
    { id: "create-video", label: "生成视频", description: "文生、图生、首尾帧、全能参考", icon: Clapperboard, path: "/studio/create-video", category: "generate", kind: "video" },
    { id: "create-audio", label: "配音", description: "把文案变成自然的人声", icon: AudioLines, path: "/studio/create-audio", category: "audio", kind: "audio" },
    { id: "replace-background", label: "换背景", description: "主体不变，一句话换场景", icon: Wallpaper, path: "/studio/tools/replace-background", category: "edit", kind: "image", specialty: true },
    { id: "relight", label: "重新打光", description: "换一种光线氛围", icon: SunMedium, path: "/studio/tools/relight", category: "edit", kind: "image", specialty: true },
    { id: "image-upscale", label: "图片高清", description: "放大并补全细节", icon: ZoomIn, path: "/studio/tools/image-upscale", category: "edit", kind: "image", specialty: true },
    { id: "lip-sync", label: "对口型", description: "人像或视频按声音说话", icon: MicVocal, path: "/studio/tools/lip-sync", category: "character", kind: "video", specialty: true },
    { id: "motion-sync", label: "动作同步", description: "让角色模仿视频里的动作", icon: PersonStanding, path: "/studio/tools/motion-sync", category: "character", kind: "video", specialty: true },
    { id: "video-upscale", label: "视频高清", description: "提升视频清晰度", icon: MonitorUp, path: "/studio/tools/video-upscale", category: "edit", kind: "video", specialty: true },
    { id: "video-dubbing", label: "视频配音翻译", description: "把对白翻译成其他语言并重配", icon: Languages, path: "/studio/tools/video-dubbing", category: "audio", kind: "video", specialty: true },
];

export const STUDIO_TOOL_CATEGORIES: Array<{ id: StudioToolCategory; label: string }> = [
    { id: "generate", label: "生成" },
    { id: "edit", label: "编辑" },
    { id: "character", label: "角色与数字人" },
    { id: "audio", label: "音频" },
];

export function studioToolById(id: string) {
    return STUDIO_TOOLS.find((tool) => tool.id === id);
}

/** 工具页路由 /studio/tools/:toolId 只接受专项工具；生成工具有自己的固定路径。 */
export function studioSpecialtyToolById(id: string | undefined) {
    const tool = id ? studioToolById(id) : undefined;
    return tool?.specialty ? tool : undefined;
}

export function studioToolForKind(kind: StudioKind) {
    return STUDIO_TOOLS.find((tool) => tool.kind === kind && !tool.specialty);
}
