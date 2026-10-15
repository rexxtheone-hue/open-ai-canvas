import type { LucideIcon } from "lucide-react";
import { AudioLines, Clapperboard, Image as ImageIcon, Languages, MicVocal, MonitorUp, PersonStanding, SunMedium, UserRound, Wallpaper, ZoomIn } from "lucide-react";

import type { StudioKind } from "@/services/api/studio";

/** 工具面板的分类标签，对应 /studio/<tab> 页面。 */
export type StudioToolTab = "video" | "image" | "audio" | "character";

export const STUDIO_TOOL_TABS: Array<{ id: StudioToolTab; label: string; listTitle: string; path: string; icon: LucideIcon }> = [
    { id: "video", label: "视频", listTitle: "视频工具", path: "/studio/video", icon: Clapperboard },
    { id: "image", label: "图片", listTitle: "图片工具", path: "/studio/image", icon: ImageIcon },
    { id: "audio", label: "音频", listTitle: "音频工具", path: "/studio/audio", icon: AudioLines },
    { id: "character", label: "角色", listTitle: "角色工具", path: "/studio/character", icon: UserRound },
];

export type StudioToolDefinition = {
    id: string;
    label: string;
    description: string;
    icon: LucideIcon;
    path: string;
    /** 出现在哪些分类标签里，第一个是主分类（工具页顶部高亮它）。 */
    tabs: StudioToolTab[];
    /** 生成类工具对应的作品类型；作品库按它筛选。 */
    kind: StudioKind;
    badge?: "HOT" | "NEW";
    /** 没有封面图时的渐变底色。 */
    gradient: [string, string];
    /** 专项工具：素材按槽位上传，提示词由固定指令拼出（见 studio-specialty.ts）。 */
    specialty?: boolean;
};

/** 已上线的工具。H6：后台没有可用模型的工具不出现在任何列表里（见 useAvailableStudioTools）。 */
export const STUDIO_TOOLS: StudioToolDefinition[] = [
    { id: "create-video", label: "生成视频", description: "文字、图片、首尾帧或全能参考生成视频", icon: Clapperboard, path: "/studio/create-video", tabs: ["video"], kind: "video", badge: "HOT", gradient: ["#ff5f9e", "#7b2ff7"] },
    { id: "create-image", label: "生成图片", description: "文字或参考图生成图片", icon: ImageIcon, path: "/studio/create-image", tabs: ["image"], kind: "image", badge: "HOT", gradient: ["#ffb347", "#ff5e62"] },
    { id: "create-audio", label: "配音", description: "把文案变成自然的人声", icon: AudioLines, path: "/studio/create-audio", tabs: ["audio"], kind: "audio", gradient: ["#43cea2", "#185a9d"] },
    { id: "video-dubbing", label: "视频配音翻译", description: "把视频对白翻译成其他语言并重新配音", icon: Languages, path: "/studio/tools/video-dubbing", tabs: ["video", "audio"], kind: "video", badge: "NEW", specialty: true, gradient: ["#f7971e", "#ffd200"] },
    { id: "lip-sync", label: "对口型", description: "让人像或人物视频按声音说话", icon: MicVocal, path: "/studio/tools/lip-sync", tabs: ["video", "character"], kind: "video", specialty: true, gradient: ["#ee0979", "#ff6a00"] },
    { id: "motion-sync", label: "动作同步", description: "让角色模仿参考视频里的动作", icon: PersonStanding, path: "/studio/tools/motion-sync", tabs: ["video", "character"], kind: "video", specialty: true, gradient: ["#00c6ff", "#0072ff"] },
    { id: "video-upscale", label: "视频高清", description: "把视频提升到更高清晰度", icon: MonitorUp, path: "/studio/tools/video-upscale", tabs: ["video"], kind: "video", specialty: true, gradient: ["#8e2de2", "#4a00e0"] },
    { id: "replace-background", label: "换背景", description: "主体不变，一句话换场景", icon: Wallpaper, path: "/studio/tools/replace-background", tabs: ["image"], kind: "image", specialty: true, gradient: ["#11998e", "#38ef7d"] },
    { id: "relight", label: "重新打光", description: "换一种光线氛围", icon: SunMedium, path: "/studio/tools/relight", tabs: ["image"], kind: "image", specialty: true, gradient: ["#f12711", "#f5af19"] },
    { id: "image-upscale", label: "图片高清", description: "放大并补全清晰细节", icon: ZoomIn, path: "/studio/tools/image-upscale", tabs: ["image"], kind: "image", specialty: true, gradient: ["#2193b0", "#6dd5ed"] },
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

export function studioToolTab(id: string | undefined) {
    return STUDIO_TOOL_TABS.find((tab) => tab.id === id);
}

export function studioToolsInTab(tools: StudioToolDefinition[], tab: StudioToolTab) {
    return tools.filter((tool) => tool.tabs.includes(tab));
}
