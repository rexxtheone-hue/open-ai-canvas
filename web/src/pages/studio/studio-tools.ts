import type { LucideIcon } from "lucide-react";
import { AudioLines, Clapperboard, Image as ImageIcon } from "lucide-react";

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
};

/** 已上线的工具。H6：没上线的工具不出现在任何列表里。 */
export const STUDIO_TOOLS: StudioToolDefinition[] = [
    { id: "create-image", label: "生成图片", description: "文字或参考图生成图片", icon: ImageIcon, path: "/studio/create-image", category: "generate", kind: "image" },
    { id: "create-video", label: "生成视频", description: "文生、图生、首尾帧、全能参考", icon: Clapperboard, path: "/studio/create-video", category: "generate", kind: "video" },
    { id: "create-audio", label: "配音", description: "把文案变成自然的人声", icon: AudioLines, path: "/studio/create-audio", category: "audio", kind: "audio" },
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

export function studioToolForKind(kind: StudioKind) {
    return STUDIO_TOOLS.find((tool) => tool.kind === kind && tool.category !== "edit" && tool.category !== "character");
}
