import type { LucideIcon } from "./studio-icons";
import { AudioFill, AudioLines, Camera, CharacterFill, Clapperboard, Copy, Earth, Expand, FastForward, Film, Flame, Globe, Grid3x3, Image as ImageIcon, ImageFill, ImagePlay, Languages, Layers, Lightbulb, ListVideo, MicVocal, MonitorUp, MountainSnow, Music, Orbit, Palette, PenLine, PersonStanding, Replace, Rotate3d, ScanFace, Speaker, SunMedium, Type, UserPen, UserPlus, UserRound, VideoFill, Volume2, Wallpaper, WorldFill, ZoomIn } from "./studio-icons";

import type { VideoMode } from "@/lib/video-modes";
import type { StudioKind } from "@/services/api/studio";

/** 工具面板的分类标签，对应 /studio/<tab> 页面。 */
export type StudioToolTab = "video" | "image" | "audio" | "character" | "world";

export const STUDIO_TOOL_TABS: Array<{ id: StudioToolTab; label: string; listTitle: string; path: string; icon: LucideIcon }> = [
    { id: "video", label: "视频", listTitle: "视频工具", path: "/studio/video", icon: VideoFill },
    { id: "image", label: "图像", listTitle: "图像工具", path: "/studio/image", icon: ImageFill },
    { id: "audio", label: "音频", listTitle: "音频工具", path: "/studio/audio", icon: AudioFill },
    { id: "character", label: "角色", listTitle: "角色工具", path: "/studio/character", icon: CharacterFill },
    { id: "world", label: "世界", listTitle: "世界工具", path: "/studio/world", icon: WorldFill },
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
    /** 生成视频的预设模式（图生视频、文生视频入口），打开时直接选好。 */
    presetMode?: VideoMode;
};

/** 已上线的工具。全部显示；没有可用模型时工具页说明原因并禁止生成。 */
export const STUDIO_TOOLS: StudioToolDefinition[] = [
    // 视频
    { id: "create-video", label: "生成视频", description: "文字、图片、首尾帧或全能参考生成视频", icon: Clapperboard, path: "/studio/create-video", tabs: ["video"], kind: "video", badge: "HOT", gradient: ["#ff5f9e", "#7b2ff7"] },
    { id: "frame-to-video", label: "图生视频", description: "用首帧（和尾帧）图片生成视频", icon: ImagePlay, path: "/studio/frame-to-video", tabs: ["video"], kind: "video", presetMode: "image_to_video", gradient: ["#fc5c7d", "#6a82fb"] },
    { id: "text-to-video", label: "文生视频", description: "只用文字描述生成视频", icon: Type, path: "/studio/text-to-video", tabs: ["video"], kind: "video", presetMode: "text_to_video", gradient: ["#ff9966", "#ff5e62"] },
    { id: "smart-shot", label: "智能分镜", description: "一句话拆成多镜头，生成完整短片", icon: ListVideo, path: "/studio/tools/smart-shot", tabs: ["video"], kind: "video", specialty: true, badge: "NEW", gradient: ["#f953c6", "#b91d73"] },
    { id: "edit-video", label: "编辑视频", description: "用一句话修改已有视频", icon: PenLine, path: "/studio/tools/edit-video", tabs: ["video"], kind: "video", specialty: true, gradient: ["#7f00ff", "#e100ff"] },
    { id: "replace-character", label: "换角色", description: "把视频里的人换成你的角色", icon: Replace, path: "/studio/tools/replace-character", tabs: ["video", "character"], kind: "video", specialty: true, badge: "NEW", gradient: ["#e65c00", "#f9d423"] },
    { id: "restyle-video", label: "视频换风格", description: "动画、油画、乐高等风格一键转换", icon: Palette, path: "/studio/tools/restyle-video", tabs: ["video"], kind: "video", specialty: true, gradient: ["#ec008c", "#fc6767"] },
    { id: "extend-video", label: "延长视频", description: "从结尾自然往下续拍", icon: FastForward, path: "/studio/tools/extend-video", tabs: ["video"], kind: "video", specialty: true, gradient: ["#1fa2ff", "#12d8fa"] },
    { id: "camera-motion", label: "运镜重拍", description: "内容不变，换一种镜头运动", icon: Orbit, path: "/studio/tools/camera-motion", tabs: ["video"], kind: "video", specialty: true, gradient: ["#4568dc", "#b06ab3"] },
    { id: "motion-sync", label: "动作同步", description: "让角色模仿参考视频里的动作", icon: PersonStanding, path: "/studio/tools/motion-sync", tabs: ["video", "character"], kind: "video", specialty: true, gradient: ["#00c6ff", "#0072ff"] },
    { id: "lip-sync", label: "对口型", description: "让人像或人物视频按声音说话", icon: MicVocal, path: "/studio/tools/lip-sync", tabs: ["video", "character"], kind: "video", specialty: true, gradient: ["#ee0979", "#ff6a00"] },
    { id: "video-upscale", label: "视频高清", description: "把视频提升到更高清晰度", icon: MonitorUp, path: "/studio/tools/video-upscale", tabs: ["video"], kind: "video", specialty: true, gradient: ["#8e2de2", "#4a00e0"] },
    { id: "video-dubbing", label: "视频配音翻译", description: "把视频对白翻译成其他语言并重新配音", icon: Languages, path: "/studio/tools/video-dubbing", tabs: ["video", "audio"], kind: "video", badge: "NEW", specialty: true, gradient: ["#f7971e", "#ffd200"] },
    { id: "video-background", label: "视频换背景", description: "人物不变，替换视频背景", icon: Wallpaper, path: "/studio/tools/video-background", tabs: ["video"], kind: "video", specialty: true, gradient: ["#0cebeb", "#29ffc6"] },
    { id: "video-relight", label: "视频重新打光", description: "给视频换一种光线氛围", icon: Lightbulb, path: "/studio/tools/video-relight", tabs: ["video"], kind: "video", specialty: true, gradient: ["#f2994a", "#f2c94c"] },
    { id: "vfx", label: "视频特效", description: "火焰、传送门等特效加进视频", icon: Flame, path: "/studio/tools/vfx", tabs: ["video"], kind: "video", specialty: true, gradient: ["#ff512f", "#dd2476"] },
    { id: "add-sound-effect", label: "视频配音效", description: "按画面自动生成同步音效", icon: Volume2, path: "/studio/tools/add-sound-effect", tabs: ["video", "audio"], kind: "video", specialty: true, gradient: ["#3a1c71", "#d76d77"] },
    // 图片
    { id: "create-image", label: "生成图片", description: "文字或参考图生成图片", icon: ImageIcon, path: "/studio/create-image", tabs: ["image"], kind: "image", badge: "HOT", gradient: ["#ffb347", "#ff5e62"] },
    { id: "edit-image", label: "编辑图片", description: "用一句话修改图片", icon: PenLine, path: "/studio/tools/edit-image", tabs: ["image"], kind: "image", specialty: true, gradient: ["#c471f5", "#fa71cd"] },
    { id: "image-variations", label: "图片变体", description: "以原图为基础生成新版本", icon: Copy, path: "/studio/tools/image-variations", tabs: ["image"], kind: "image", specialty: true, gradient: ["#43e97b", "#38f9d7"] },
    { id: "expand-image", label: "扩图", description: "把画面往外延伸补全", icon: Expand, path: "/studio/tools/expand-image", tabs: ["image"], kind: "image", specialty: true, gradient: ["#30cfd0", "#330867"] },
    { id: "replace-background", label: "换背景", description: "主体不变，一句话换场景", icon: Wallpaper, path: "/studio/tools/replace-background", tabs: ["image"], kind: "image", specialty: true, gradient: ["#11998e", "#38ef7d"] },
    { id: "relight", label: "重新打光", description: "换一种光线氛围", icon: SunMedium, path: "/studio/tools/relight", tabs: ["image"], kind: "image", specialty: true, gradient: ["#f12711", "#f5af19"] },
    { id: "image-upscale", label: "图片高清", description: "放大并补全清晰细节", icon: ZoomIn, path: "/studio/tools/image-upscale", tabs: ["image"], kind: "image", specialty: true, gradient: ["#2193b0", "#6dd5ed"] },
    { id: "extract-layers", label: "拆分图层", description: "把平面图拆成主体和背景图层", icon: Layers, path: "/studio/tools/extract-layers", tabs: ["image"], kind: "image", specialty: true, badge: "NEW", gradient: ["#bdc3c7", "#2c3e50"] },
    { id: "multi-view", label: "多视角", description: "一张图生成九个角度", icon: Grid3x3, path: "/studio/tools/multi-view", tabs: ["image", "character"], kind: "image", specialty: true, gradient: ["#5f2c82", "#49a09d"] },
    { id: "camera-angle", label: "镜头角度", description: "换个机位重新拍这张图", icon: Rotate3d, path: "/studio/tools/camera-angle", tabs: ["image"], kind: "image", specialty: true, gradient: ["#00b09b", "#96c93d"] },
    { id: "face-swap", label: "换脸", description: "把图里的脸换成另一个人", icon: ScanFace, path: "/studio/tools/face-swap", tabs: ["image", "character"], kind: "image", specialty: true, gradient: ["#ff416c", "#ff4b2b"] },
    // 音频
    { id: "create-audio", label: "配音", description: "把文案变成自然的人声", icon: AudioLines, path: "/studio/create-audio", tabs: ["audio"], kind: "audio", gradient: ["#43cea2", "#185a9d"] },
    { id: "create-music", label: "生成音乐", description: "描述风格和情绪，生成配乐或歌曲", icon: Music, path: "/studio/tools/create-music", tabs: ["audio"], kind: "audio", specialty: true, gradient: ["#8360c3", "#2ebf91"] },
    { id: "create-sound-effect", label: "生成音效", description: "一句话生成任意音效", icon: Speaker, path: "/studio/tools/create-sound-effect", tabs: ["audio"], kind: "audio", specialty: true, gradient: ["#b24592", "#f15f79"] },
    { id: "voice-clone", label: "声音克隆", description: "用一段样本复刻声音来朗读文案", icon: MicVocal, path: "/studio/tools/voice-clone", tabs: ["audio"], kind: "audio", specialty: true, gradient: ["#1d976c", "#93f9b9"] },
    // 角色
    { id: "create-character", label: "创建角色", description: "描述或搭建一个原创角色，生成后存进角色库", icon: UserPlus, path: "/studio/tools/create-character", tabs: ["character"], kind: "image", specialty: true, gradient: ["#ee9ca7", "#ffdde1"] },
    { id: "character-image", label: "角色图片", description: "让你的角色出现在新画面里", icon: UserPen, path: "/studio/tools/character-image", tabs: ["character"], kind: "image", specialty: true, gradient: ["#f857a6", "#ff5858"] },
    { id: "character-video", label: "角色视频", description: "让你的角色动起来", icon: Film, path: "/studio/tools/character-video", tabs: ["character"], kind: "video", specialty: true, gradient: ["#6a3093", "#a044ff"] },
    { id: "cast-in-scene", label: "角色入景", description: "把角色放进任意场景", icon: MountainSnow, path: "/studio/tools/cast-in-scene", tabs: ["character", "world"], kind: "image", specialty: true, gradient: ["#2c3e50", "#4ca1af"] },
    // 世界
    { id: "create-pano", label: "全景世界", description: "生成 360° 全景场景", icon: Globe, path: "/studio/tools/create-pano", tabs: ["world"], kind: "image", specialty: true, badge: "NEW", gradient: ["#0f2027", "#2c5364"] },
    { id: "world-cam", label: "世界漫游镜头", description: "在全景或场景图里拍一段运镜", icon: Camera, path: "/studio/tools/world-cam", tabs: ["world"], kind: "video", specialty: true, gradient: ["#373b44", "#4286f4"] },
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

/** 分类里的工具：以该分类为主分类的排在前面，其余（从别的分类借来的）排在后面，各自保持定义顺序。 */
export function studioToolsInTab(tools: StudioToolDefinition[], tab: StudioToolTab) {
    const inTab = tools.filter((tool) => tool.tabs.includes(tab));
    return [...inTab.filter((tool) => tool.tabs[0] === tab), ...inTab.filter((tool) => tool.tabs[0] !== tab)];
}
