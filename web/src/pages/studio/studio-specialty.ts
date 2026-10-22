import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import type { SpecialtyVideoOperation } from "@/lib/video-modes";
import type { StudioKind } from "@/services/api/studio";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { studioModelSupportsSpecialty, type StudioSpecialtyState } from "./studio-generation";

/** 专项工具使用的视频操作：供应商专门支持的操作，以及视频编辑类和参考生视频（模型须在能力里勾选）。 */
export type StudioSpecialtyOperation = SpecialtyVideoOperation | "inpaint" | "replace_element" | "style_transfer" | "camera_motion" | "extend" | "reference_to_video";

/**
 * 专项工具：每个工具规定好要哪些素材、有哪些选项、提示词怎么写。
 * 视频类走供应商专门支持的操作（模型必须在能力里勾选）；图片类用图片编辑模型 + 固定指令；
 * 还没有接入协议的能力（音乐、音效、声音克隆等）标记 unsupported，面板完整可用，生成按钮说明原因。
 */
export type StudioSlotAccept = "image" | "video" | "audio" | "image_or_video" | "audio_or_video";

export type StudioSlot = {
    key: string;
    label: string;
    accept: StudioSlotAccept;
    required: boolean;
    hint: string;
    /** 上传限制说明，例如「MP4 / MOV，最长 10 秒」。 */
    constraint?: string;
    /** 最多放几个素材，默认 1。 */
    max?: number;
    /** 支持直接用摄像头或麦克风录制。 */
    record?: "audio" | "video";
};

export type StudioOptionChoice = { value: string; label: string; prompt: string; group?: string };

export type StudioSpecialtyOption = {
    key: string;
    label: string;
    /** chips：平铺按钮；select：弹出列表（可分组）；multi：多选列表；slider：数值滑块；toggle：开关。 */
    type?: "chips" | "select" | "multi" | "slider" | "toggle";
    choices: StudioOptionChoice[];
    default?: string;
    /** 多选是否至少选一个。 */
    required?: boolean;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    minLabel?: string;
    maxLabel?: string;
    info?: string;
};

/** 指令拼装时页面额外提供的内容：预览过的分镜、框选的区域。 */
export type StudioSpecialtyContext = { plan?: string; regions?: string };

export type StudioSpecialtySpec = {
    kind: StudioKind;
    /** 视频专项操作；图片工具和普通视频生成为空。 */
    operation?: StudioSpecialtyOperation;
    /** 还没有接入的能力名称；设置后没有模型能用，生成按钮显示原因。 */
    unsupported?: string;
    /** 固定输出比例（例如全景图 2:1）；为空时用面板里选的比例。 */
    outputRatio?: string;
    /** 取值是输出比例的选项（扩图、多视角），选中后同步到输出设置；original 表示不改。 */
    ratioOption?: string;
    slots: StudioSlot[];
    prompt: { label: string; placeholder: string; required: boolean; maxChars?: number };
    /** 提示词下方的快捷标签：append 追加到末尾，replace 替换整段（示例文案）。 */
    promptChips?: Array<{ label: string; text: string; mode: "append" | "replace" }>;
    options?: StudioSpecialtyOption[];
    /** 在某个槽位的素材上框选区域（保留区或修改区）。 */
    region?: { slot: string; label: string; hint: string };
    /** 智能分镜：先用文本模型预览分镜，再按分镜生成。 */
    shotPlan?: boolean;
    /** 视频专项是否允许一次生成多个。 */
    count?: boolean;
    /** 一次提交多条不同指令（多语言配音、全部角度），每条一个任务。 */
    variants?: (userText: string, options: Record<string, string>, context: StudioSpecialtyContext) => string[] | undefined;
    /** 把用户补充说明和选项拼成发送给模型的提示词。 */
    instruction: (userText: string, options: Record<string, string>, context: StudioSpecialtyContext) => string;
};

function choicePrompt(option: StudioSpecialtyOption | undefined, value: string | undefined) {
    if (!option || !option.choices.length) return "";
    return (option.choices.find((choice) => choice.value === value) || option.choices.find((choice) => choice.value === option.default) || option.choices[0]).prompt;
}

function multiValues(option: StudioSpecialtyOption, value: string | undefined) {
    const picked = (value || "").split(",").filter(Boolean);
    return option.choices.filter((choice) => picked.includes(choice.value));
}

function withNote(base: string, userText: string) {
    const note = userText.trim();
    return note ? `${base}\n补充要求：${note}` : base;
}

function withRegions(base: string, regions: string | undefined, intro: string) {
    return regions ? `${base}\n${intro}${regions}` : base;
}

/** 选项值是「比例@用途」时取比例部分。 */
export function ratioOfChoice(value: string | undefined) {
    return (value || "").split("@")[0];
}

const RELIGHT_CHOICES = [
    { value: "golden", label: "黄金时刻", prompt: "温暖的黄金时刻侧逆光，柔和长阴影" },
    { value: "studio", label: "影棚柔光", prompt: "专业影棚柔光箱布光，均匀干净，阴影柔和" },
    { value: "neon", label: "霓虹夜景", prompt: "夜晚霓虹灯光，蓝紫与洋红色边缘光" },
    { value: "window", label: "窗边自然光", prompt: "窗边自然散射光，明亮通透" },
    { value: "dramatic", label: "电影感明暗", prompt: "电影感强明暗对比，单侧硬光，深色背景" },
    { value: "backlight", label: "逆光轮廓", prompt: "强烈逆光，主体有明亮轮廓光" },
];

const VIDEO_LIGHT_CHOICES = [
    { value: "golden", label: "黄金时刻", prompt: "温暖的黄金时刻阳光，柔和高光、长长的影子，讨喜的电影感光晕" },
    { value: "studio", label: "影棚柔光", prompt: "专业影棚柔光，均匀干净，阴影柔和，适合口播和产品展示" },
    { value: "neon", label: "霓虹夜景", prompt: "夜晚霓虹灯光，蓝紫与洋红色边缘光，赛博感氛围" },
    { value: "moonlight", label: "清冷月光", prompt: "清冷的蓝色月光，低照度，柔和对比" },
    { value: "candle", label: "烛光暖调", prompt: "温暖摇曳的烛光，局部照明，温馨私密的氛围" },
    { value: "noir", label: "黑色电影", prompt: "黑色电影式硬光，百叶窗投影，强烈明暗对比" },
    { value: "overcast", label: "阴天柔光", prompt: "阴天漫射光，没有硬阴影，色调平和" },
    { value: "sunset", label: "日落逆光", prompt: "日落时分的强烈逆光，人物带金色轮廓光" },
];

const VIDEO_BACKGROUND_CHOICES = [
    { value: "creator", label: "干净的创作者工作室", prompt: "干净的创作者工作室：柔和的中性色背景墙、少量精致道具、适合短视频的明亮布光" },
    { value: "office", label: "现代办公室", prompt: "现代办公室：落地窗、简洁家具、明亮自然光" },
    { value: "cafe", label: "咖啡馆", prompt: "温馨的咖啡馆：木质桌椅、暖色灯光、虚化的吧台" },
    { value: "city", label: "城市夜景", prompt: "城市夜景：高楼灯火、虚化的霓虹光斑" },
    { value: "beach", label: "海边日落", prompt: "海边日落：金色海面、柔和的天空渐变" },
    { value: "forest", label: "森林", prompt: "清晨的森林：阳光穿过树叶，淡淡薄雾" },
    { value: "living", label: "温馨客厅", prompt: "温馨客厅：沙发、绿植、柔和的落地灯光" },
    { value: "solid", label: "纯色背景", prompt: "干净的纯色浅灰背景，无任何物体" },
];

const DUBBING_LANGUAGES: StudioOptionChoice[] = [
    { value: "en", label: "英语（美国）", prompt: "英语" },
    { value: "zh", label: "中文", prompt: "中文（普通话）" },
    { value: "ms", label: "马来语", prompt: "马来语" },
    { value: "ja", label: "日语", prompt: "日语" },
    { value: "ko", label: "韩语", prompt: "韩语" },
    { value: "pt", label: "葡萄牙语", prompt: "葡萄牙语" },
    { value: "pt-br", label: "葡萄牙语（巴西）", prompt: "巴西葡萄牙语" },
    { value: "es", label: "西班牙语", prompt: "西班牙语" },
    { value: "es-419", label: "西班牙语（拉丁美洲）", prompt: "拉丁美洲西班牙语" },
    { value: "de", label: "德语", prompt: "德语" },
    { value: "fr", label: "法语", prompt: "法语" },
    { value: "it", label: "意大利语", prompt: "意大利语" },
    { value: "ru", label: "俄语", prompt: "俄语" },
    { value: "th", label: "泰语", prompt: "泰语" },
    { value: "ar", label: "阿拉伯语", prompt: "阿拉伯语" },
    { value: "tr", label: "土耳其语", prompt: "土耳其语" },
    { value: "vi", label: "越南语", prompt: "越南语" },
    { value: "id", label: "印尼语", prompt: "印尼语" },
    { value: "ta", label: "泰米尔语（印度）", prompt: "泰米尔语" },
    { value: "ml", label: "马拉雅拉姆语（印度）", prompt: "马拉雅拉姆语" },
    { value: "kn", label: "卡纳达语（印度）", prompt: "卡纳达语" },
    { value: "gu", label: "古吉拉特语（印度）", prompt: "古吉拉特语" },
    { value: "pa", label: "旁遮普语（印度）", prompt: "旁遮普语" },
    { value: "sd", label: "信德语（印度）", prompt: "信德语" },
    { value: "hi", label: "印地语（印度）", prompt: "印地语" },
];

const STYLE_CHOICES: StudioOptionChoice[] = [
    { value: "lego", label: "乐高积木", prompt: "乐高积木拼搭风格，塑料积木质感", group: "热门" },
    { value: "ghibli", label: "吉卜力动画", prompt: "吉卜力手绘动画风格，柔和水彩色调", group: "热门" },
    { value: "oil", label: "油画", prompt: "印象派油画风格，明显笔触", group: "写实与经典艺术" },
    { value: "watercolor", label: "水彩", prompt: "清透水彩画风格，颜色晕染" },
    { value: "ink", label: "水墨国风", prompt: "中国水墨画风格，留白与墨色晕染" },
    { value: "sketch", label: "铅笔素描", prompt: "黑白铅笔素描风格，排线明暗" },
    { value: "anime", label: "日系动漫", prompt: "日系赛璐璐动漫风格，清晰线条", group: "日系动漫" },
    { value: "shinkai", label: "新海诚", prompt: "新海诚动画电影风格，通透天空和细腻光影" },
    { value: "retro-anime", label: "90 年代动漫", prompt: "90 年代复古日本动画风格，胶片颗粒" },
    { value: "cyberpunk", label: "赛博朋克", prompt: "赛博朋克风格，霓虹灯光与高科技城市感", group: "奇幻与科幻" },
    { value: "steampunk", label: "蒸汽朋克", prompt: "蒸汽朋克风格，黄铜齿轮与维多利亚时代机械" },
    { value: "dark-fantasy", label: "暗黑奇幻", prompt: "暗黑奇幻风格，阴郁色调与魔幻氛围" },
    { value: "pixar", label: "3D 动画", prompt: "皮克斯式 3D 动画风格，圆润可爱，柔和光照", group: "卡通与动画" },
    { value: "cartoon", label: "美式卡通", prompt: "美式卡通风格，粗轮廓线和明快配色" },
    { value: "disney", label: "经典手绘动画", prompt: "经典迪士尼式手绘二维动画风格" },
    { value: "clay", label: "黏土定格", prompt: "黏土定格动画风格，手工捏制质感", group: "材质与雕塑" },
    { value: "marble", label: "大理石雕塑", prompt: "白色大理石雕塑质感，古典雕刻" },
    { value: "chrome", label: "液态金属", prompt: "镜面液态金属质感，高反光铬合金" },
    { value: "felt", label: "羊毛毡", prompt: "羊毛毡手作质感，柔软绒毛", group: "手作与玩具" },
    { value: "papercut", label: "剪纸", prompt: "多层剪纸艺术风格，纸张层次与投影" },
    { value: "knit", label: "针织", prompt: "毛线针织质感，编织纹理" },
    { value: "pixel", label: "像素风", prompt: "8-bit 像素游戏风格", group: "复古与风格化" },
    { value: "vhs", label: "80 年代录像带", prompt: "80 年代 VHS 录像带风格，扫描线与色偏" },
    { value: "silent", label: "黑白默片", prompt: "黑白默片风格，胶片划痕与闪烁" },
];

const CAMERA_MOTION_CHOICES = [
    { value: "push", label: "缓慢推近", prompt: "镜头缓慢推近主体" },
    { value: "pull", label: "缓慢拉远", prompt: "镜头缓慢拉远，展现更多环境" },
    { value: "orbit", label: "环绕", prompt: "镜头围绕主体平稳环绕" },
    { value: "pan", label: "横移", prompt: "镜头平稳横向移动" },
    { value: "crane", label: "升降", prompt: "镜头由低处平稳升起" },
    { value: "handheld", label: "手持跟拍", prompt: "手持跟拍，轻微自然晃动" },
];

const WORLD_PATH_CHOICES = [
    { value: "forward", label: "向前穿行", prompt: "镜头沿着场景向前平稳穿行，像第一人称漫步" },
    { value: "orbit", label: "原地环视", prompt: "镜头在场景中央原地缓慢旋转 360 度环视" },
    { value: "rise", label: "升空俯瞰", prompt: "镜头从地面缓缓升空，最后俯瞰整个场景" },
    { value: "truck", label: "横向平移", prompt: "镜头沿场景横向平稳移动，展现全貌" },
    { value: "fpv", label: "FPV 飞越", prompt: "FPV 无人机高速飞越整个场景，穿过空隙" },
];

const ASPECT_CHOICES = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"].map((ratio) => ({ value: ratio, label: ratio, prompt: ratio }));

const EXPAND_RATIO_CHOICES: StudioOptionChoice[] = [
    { value: "original", label: "原图比例", prompt: "", group: "常用比例" },
    ...["9:16", "2:3", "3:4", "1:1", "4:3", "3:2", "16:9"].map((ratio) => ({ value: ratio, label: ratio, prompt: ratio })),
    { value: "9:16@ig-story", label: "Instagram 快拍 9:16", prompt: "9:16", group: "社交媒体" },
    { value: "1:1@ig-square", label: "Instagram 方图 1:1", prompt: "1:1" },
    { value: "4:5@ig-post", label: "Instagram 帖子 4:5", prompt: "4:5" },
    { value: "16:9@yt-thumb", label: "YouTube 缩略图 16:9", prompt: "16:9" },
    { value: "9:16@tiktok", label: "TikTok / 抖音 9:16", prompt: "9:16" },
    { value: "2:1@fb-post", label: "Facebook 帖子 2:1", prompt: "2:1" },
    { value: "9:16@fb-story", label: "Facebook 快拍 9:16", prompt: "9:16" },
    { value: "16:9@x-post", label: "X 帖子 16:9", prompt: "16:9" },
    { value: "3:1@x-header", label: "X 头图 3:1", prompt: "3:1" },
    { value: "1:1@profile", label: "头像 1:1", prompt: "1:1" },
];

const relightOption: StudioSpecialtyOption = { key: "lighting", label: "光线", choices: RELIGHT_CHOICES };
const videoLightOption: StudioSpecialtyOption = { key: "lighting", label: "光线", type: "select", choices: VIDEO_LIGHT_CHOICES };
const videoBackgroundOption: StudioSpecialtyOption = { key: "background", label: "背景", type: "select", choices: VIDEO_BACKGROUND_CHOICES };
const styleOption: StudioSpecialtyOption = { key: "style", label: "风格", type: "select", choices: STYLE_CHOICES };
const strengthOption: StudioSpecialtyOption = { key: "strength", label: "强度", type: "slider", choices: [], min: 0.5, max: 2, step: 0.1, default: "1.2", minLabel: "轻微", maxLabel: "强烈" };
const motionOption: StudioSpecialtyOption = { key: "motion", label: "运镜", choices: CAMERA_MOTION_CHOICES };
const languageOption: StudioSpecialtyOption = { key: "language", label: "目标语言", type: "multi", required: true, choices: DUBBING_LANGUAGES };
const dubLipOption: StudioSpecialtyOption = { key: "lipsync", label: "对口型", type: "toggle", choices: [], default: "on" };
const yawOption: StudioSpecialtyOption = { key: "yaw", label: "左右旋转", type: "slider", choices: [], min: -90, max: 90, step: 5, default: "0", unit: "°" };
const pitchOption: StudioSpecialtyOption = { key: "pitch", label: "上下旋转", type: "slider", choices: [], min: -45, max: 45, step: 5, default: "0", unit: "°" };
const lensOption: StudioSpecialtyOption = {
    key: "lens",
    label: "镜头类型",
    choices: [
        { value: "default", label: "标准", prompt: "标准镜头" },
        { value: "wide", label: "广角", prompt: "广角镜头，展现更多环境" },
        { value: "close", label: "特写", prompt: "特写镜头，主体占满画面" },
    ],
};
const angleModeOption: StudioSpecialtyOption = {
    key: "mode",
    label: "模式",
    choices: [
        { value: "fast", label: "快速", prompt: "" },
        { value: "ultra", label: "精细", prompt: "细节丰富、边缘清晰、材质准确。" },
    ],
};
const allAnglesOption: StudioSpecialtyOption = { key: "all", label: "一次生成全部角度", type: "toggle", choices: [], default: "off", info: "按 6 个常用机位各生成一张，忽略上面的角度设置" };
const replaceScopeOption: StudioSpecialtyOption = {
    key: "scope",
    label: "替换方式",
    choices: [
        { value: "body", label: "替换全身", prompt: "替换主要人物的整个身体：脸、发型、服装和体型都与参考角色一致" },
        { value: "face", label: "只换脸", prompt: "只替换主要人物的脸，发型、服装和体型保持原视频不变" },
    ],
};
const lipQualityOption: StudioSpecialtyOption = {
    key: "quality",
    label: "质量",
    choices: [
        { value: "fast", label: "快速", prompt: "" },
        { value: "pro", label: "专业", prompt: "面部细节和牙齿清晰自然，表情与语气匹配。" },
    ],
};
const upscaleResolutionOption: StudioSpecialtyOption = {
    key: "resolution",
    label: "分辨率",
    type: "select",
    default: "1440",
    choices: [
        { value: "720", label: "720p", prompt: "720p" },
        { value: "1080", label: "1080p 高清", prompt: "1080p" },
        { value: "1440", label: "1440p 2K", prompt: "1440p（2K）" },
        { value: "2160", label: "4K", prompt: "2160p（4K）" },
    ],
};
const fpsOption: StudioSpecialtyOption = {
    key: "fps",
    label: "帧率",
    type: "select",
    choices: [
        { value: "30", label: "30fps", prompt: "30fps" },
        { value: "60", label: "60fps", prompt: "60fps，补帧让动作更顺滑" },
        { value: "120", label: "120fps", prompt: "120fps，补帧让动作极其顺滑" },
    ],
};
const upscaleModeOption: StudioSpecialtyOption = {
    key: "mode",
    label: "模式",
    choices: [
        { value: "standard", label: "标准", prompt: "" },
        { value: "pro", label: "专业", prompt: "重点修复人脸和文字细节。" },
    ],
};
const imageUpscaleModeOption: StudioSpecialtyOption = {
    key: "mode",
    label: "放大方式",
    choices: [
        { value: "precise", label: "精确", prompt: "严格忠于原图，只提升清晰度，不添加原图没有的细节" },
        { value: "generative", label: "生成式", prompt: "在忠于原图的前提下补全合理的纹理和细节" },
        { value: "creative", label: "创意", prompt: "允许重新诠释细节，让画面更精致丰富，但主体和构图不变" },
    ],
};
const faceModeOption: StudioSpecialtyOption = {
    key: "mode",
    label: "替换范围",
    choices: [
        { value: "face", label: "换脸", prompt: "只替换脸部五官和肤色，保留第一张图的发型" },
        { value: "head", label: "换头", prompt: "替换整个头部，包括脸、发型和头部轮廓" },
    ],
};
const layerOption: StudioSpecialtyOption = {
    key: "layer",
    label: "提取图层",
    choices: [
        { value: "subject", label: "主体", prompt: "subject" },
        { value: "background", label: "背景", prompt: "background" },
        { value: "both", label: "主体 + 背景", prompt: "both" },
    ],
};
const shotPlanOption: StudioSpecialtyOption = {
    key: "detail",
    label: "分镜细度",
    info: "分镜越细，镜头越多，节奏越快",
    default: "standard",
    choices: [
        { value: "basic", label: "基础", prompt: "3" },
        { value: "standard", label: "标准", prompt: "5" },
        { value: "pro", label: "专业", prompt: "8" },
    ],
};
const keepSoundOption: StudioSpecialtyOption = { key: "keep", label: "保留原声", type: "toggle", choices: [], default: "off" };
const worldPathOption: StudioSpecialtyOption = { key: "path", label: "镜头路径", choices: WORLD_PATH_CHOICES };
const musicLengthOption: StudioSpecialtyOption = {
    key: "length",
    label: "时长",
    choices: [
        { value: "clip", label: "短片段 · 30 秒", prompt: "30 秒" },
        { value: "full", label: "完整歌曲 · 约 3 分钟", prompt: "约 3 分钟" },
    ],
};
const instrumentalOption: StudioSpecialtyOption = { key: "instrumental", label: "纯音乐", type: "toggle", choices: [], default: "off" };
const bpmOption: StudioSpecialtyOption = {
    key: "bpm",
    label: "BPM",
    type: "select",
    info: "每分钟节拍数：慢一点更放松，快一点更有能量。",
    choices: [{ value: "auto", label: "自动", prompt: "" }, ...[60, 70, 80, 90, 100, 110, 120, 130, 140, 160, 180].map((bpm) => ({ value: String(bpm), label: String(bpm), prompt: `${bpm} BPM` }))],
};
const intensityOption: StudioSpecialtyOption = {
    key: "intensity",
    label: "强度",
    type: "select",
    info: "音乐的力度，从安静舒缓到响亮有冲击力。",
    choices: [
        { value: "auto", label: "自动", prompt: "" },
        { value: "calm", label: "舒缓", prompt: "安静舒缓" },
        { value: "moderate", label: "适中", prompt: "力度适中" },
        { value: "energetic", label: "激昂", prompt: "响亮有冲击力" },
    ],
};
const keyOption: StudioSpecialtyOption = {
    key: "key",
    label: "调式",
    type: "select",
    info: "大调听起来明亮愉快，小调更暗、更有情绪。",
    choices: [{ value: "auto", label: "自动", prompt: "" }, ...["C", "D", "E", "F", "G", "A", "B"].flatMap((note) => [{ value: `${note}maj`, label: `${note} 大调`, prompt: `${note} 大调` }, { value: `${note}min`, label: `${note} 小调`, prompt: `${note} 小调` }])],
};
const loopOption: StudioSpecialtyOption = { key: "loop", label: "可循环", type: "toggle", choices: [], default: "off" };
const sfxDurationOption: StudioSpecialtyOption = {
    key: "duration",
    label: "时长",
    type: "select",
    info: "短音效适合点击、硬币声；长音效适合环境声。自动由模型决定，费用随时长变化。",
    choices: [{ value: "auto", label: "自动", prompt: "" }, ...[1, 2, 3, 5, 10, 15, 22].map((seconds) => ({ value: String(seconds), label: `${seconds} 秒`, prompt: `${seconds} 秒` }))],
};
const influenceOption: StudioSpecialtyOption = { key: "influence", label: "贴合提示词", type: "slider", choices: [], min: 0, max: 1, step: 0.05, default: "0.3", minLabel: "宽松", maxLabel: "严格", info: "越高越贴合描述；越低越自由，每次结果差异越大。" };
const voiceOption: StudioSpecialtyOption = {
    key: "voice",
    label: "目标声音",
    type: "select",
    choices: [
        { value: "female-young", label: "年轻女声 · 亲切", prompt: "年轻女声", group: "女声" },
        { value: "female-mature", label: "成熟女声 · 自信", prompt: "成熟女声" },
        { value: "female-news", label: "播音女声 · 清晰", prompt: "播音女声" },
        { value: "male-young", label: "年轻男声 · 阳光", prompt: "年轻男声", group: "男声" },
        { value: "male-mature", label: "成熟男声 · 稳重", prompt: "成熟男声" },
        { value: "male-story", label: "讲故事男声 · 低沉", prompt: "低沉的讲故事男声" },
        { value: "child", label: "童声", prompt: "童声", group: "其他" },
        { value: "elder", label: "老年声", prompt: "老年人声音" },
    ],
};
const stabilityOption: StudioSpecialtyOption = { key: "stability", label: "稳定度", type: "slider", choices: [], min: 0, max: 1, step: 0.05, default: "0.5", minLabel: "更多变化", maxLabel: "更稳定" };
const similarityOption: StudioSpecialtyOption = { key: "similarity", label: "相似度", type: "slider", choices: [], min: 0, max: 1, step: 0.05, default: "0.75", minLabel: "低", maxLabel: "高" };
const exaggerationOption: StudioSpecialtyOption = { key: "style", label: "风格夸张度", type: "slider", choices: [], min: 0, max: 1, step: 0.05, default: "0" };

function finiteOr(value: string | undefined, fallback: number) {
    const number = Number(value);
    return value !== undefined && value !== "" && Number.isFinite(number) ? number : fallback;
}

function angleWords(yaw: number, pitch: number) {
    const horizontal = yaw === 0 ? "正面" : `${yaw > 0 ? "向右" : "向左"}绕主体旋转 ${Math.abs(yaw)} 度`;
    const vertical = pitch === 0 ? "平视" : pitch > 0 ? `从上方 ${pitch} 度俯拍` : `从下方 ${Math.abs(pitch)} 度仰拍`;
    return `${horizontal}，${vertical}`;
}

function cameraAngleInstruction(text: string, options: Record<string, string>, yaw: number, pitch: number) {
    return withNote(`保持主体外貌、服装和场景内容不变，换一个机位重新拍这张图：${angleWords(yaw, pitch)}，${choicePrompt(lensOption, options.lens)}。透视、光线和阴影随新机位合理变化。${choicePrompt(angleModeOption, options.mode)}`, text);
}

const ALL_ANGLES: Array<[number, number]> = [[-45, 0], [-90, 0], [45, 0], [90, 0], [0, 30], [0, -30]];

function dubbingInstruction(language: string, options: Record<string, string>, text: string) {
    const lip = options.lipsync === "off" ? "保持原画面不变" : "口型与新配音同步";
    return withNote(`把视频中的对白翻译成${language}并重新配音，保留说话人的音色和情绪，${lip}。`, text);
}

function extractInstruction(layer: string, text: string) {
    return layer === "background"
        ? withNote("去掉图片中的主体（人物或主要物体），把被遮挡的背景自然补全，得到一张干净的纯背景图层，其余内容保持不变。", text)
        : withNote("只保留图片中的主体（人物或主要物体），完整抠出，边缘干净，背景替换为纯白色，主体本身保持完全不变。", text);
}

export const STUDIO_SPECIALTY_SPECS: Record<string, StudioSpecialtySpec> = {
    // ---- 视频 ----
    "smart-shot": {
        kind: "video",
        shotPlan: true,
        slots: [
            { key: "characters", label: "角色与物体", accept: "image", required: false, max: 3, hint: "人物、商品或道具" },
            { key: "environment", label: "环境", accept: "image", required: false, hint: "场景图" },
        ],
        options: [shotPlanOption],
        prompt: { label: "描述你的场景", placeholder: "例如：雨夜街头，侦探撑伞走进霓虹灯下的小巷，发现地上的线索。", required: true },
        instruction: (text, options, context) => {
            const refs = "如果提供了参考图：角色与物体的外貌保持与参考图一致，环境参考最后一张图。";
            if (context.plan?.trim()) return `按以下分镜生成一段多镜头视频，镜头之间衔接自然，人物和场景前后一致。${refs}\n${context.plan.trim()}`;
            return `把下面的场景拆成 ${choicePrompt(shotPlanOption, options.detail)} 个镜头，生成一段多镜头视频：景别和机位有变化，镜头之间衔接自然，人物和场景前后一致。${refs}\n场景：${text.trim()}`;
        },
    },
    "edit-video": {
        kind: "video",
        operation: "inpaint",
        slots: [
            { key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "MP4 / MOV，100MB 以内，1–10 秒，720–2160px" },
            { key: "refs", label: "参考图", accept: "image", required: false, max: 3, hint: "可选，要换上的物体或风格" },
        ],
        prompt: { label: "描述你想怎么修改", placeholder: "例如：把天空换成晚霞，人物衣服换成红色。", required: true },
        instruction: (text) => `按以下要求修改这段视频，没提到的部分（人物外貌、动作、镜头运动、时长）保持不变：${text.trim()}。如果提供了参考图，按参考图的外观修改。`,
    },
    "video-background": {
        kind: "video",
        operation: "inpaint",
        count: true,
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "MP4 / MOV，最多 240 帧（30fps 约 8 秒）" }],
        options: [videoBackgroundOption],
        prompt: { label: "描述你的想法", placeholder: "可选，不填就用上面选的背景。", required: false, maxChars: 500 },
        instruction: (text, options) => `保持视频中的人物和前景（外貌、动作、口型、时长）完全不变，只把背景替换为：${text.trim() || choicePrompt(videoBackgroundOption, options.background)}。人物边缘干净，光线和色调与新背景自然融合。`,
    },
    "video-relight": {
        kind: "video",
        operation: "inpaint",
        count: true,
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "MP4 / MOV，最多 240 帧（30fps 约 8 秒）" }],
        options: [videoLightOption],
        prompt: { label: "描述你的想法", placeholder: "可选，不填就用上面选的光线。", required: false, maxChars: 500 },
        instruction: (text, options) => `保持视频内容、人物外貌、动作和镜头运动完全不变，只把光线改为：${text.trim() || choicePrompt(videoLightOption, options.lighting)}。阴影、高光和色温随新光线自然变化，前后帧光线稳定不闪烁。`,
    },
    vfx: {
        kind: "video",
        operation: "inpaint",
        count: true,
        slots: [
            { key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "MP4 / MOV，最多 240 帧（30fps 约 8 秒）" },
            { key: "look", label: "目标效果", accept: "image", required: false, hint: "可选，最终画面要变成的样子" },
        ],
        region: { slot: "source", label: "保留区域", hint: "在画面上框出不需要改动的区域" },
        prompt: { label: "描述你的想法", placeholder: "例如：让整条街燃起火焰，天空出现巨大的传送门。", required: true },
        instruction: (text, _options, context) => withRegions(`给这段视频加上特效：${text.trim()}。如果提供了目标效果图，最终画面向它靠拢。人物动作、镜头运动和时长保持不变，特效随画面运动自然贴合。`, context.regions, "以下区域保持完全不变，不加任何特效："),
    },
    "replace-character": {
        kind: "video",
        operation: "replace_element",
        slots: [
            { key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "最长 30 秒" },
            { key: "character", label: "替换角色", accept: "image", required: true, hint: "上传图片或选择角色" },
        ],
        options: [replaceScopeOption],
        prompt: { label: "提示词", placeholder: "可选，例如：只替换穿白衣服的人。", required: false },
        instruction: (text, options) => withNote(`把视频中的主要人物替换成参考图中的角色：${choicePrompt(replaceScopeOption, options.scope)}，保持原视频的动作、表情、镜头运动、光线和背景不变。`, text),
    },
    "restyle-video": {
        kind: "video",
        operation: "style_transfer",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "最长 30 秒" }],
        options: [styleOption, strengthOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：色彩更鲜艳。", required: false },
        instruction: (text, options) => {
            const strength = finiteOr(options.strength, 1.2);
            const degree = strength < 1 ? "轻度风格化，保留较多原视频质感" : strength <= 1.5 ? "中等强度的风格化" : "强烈的风格化，彻底转换质感";
            return withNote(`把这段视频整体转换为${choicePrompt(styleOption, options.style)}（${degree}），保持原视频的内容、构图、动作节奏和镜头运动不变。`, text);
        },
    },
    "extend-video": {
        kind: "video",
        operation: "extend",
        slots: [
            { key: "source", label: "原视频", accept: "video", required: true, hint: "要延长的视频", constraint: "2–30 秒" },
            { key: "refs", label: "视觉参考", accept: "image", required: false, max: 4, hint: "可选，新出现的人物或物体", constraint: "JPEG / PNG / WEBP，30MB 以内" },
        ],
        prompt: { label: "描述视频接下来怎么发展", placeholder: "例如：女孩转身走向窗边，镜头慢慢跟上。", required: true },
        instruction: (text) => `从原视频最后一帧自然衔接继续生成：${text.trim()}。人物、场景、光线和画风与原视频保持一致，动作和镜头运动连贯不跳变。如果提供了参考图，新出现的人物或物体按参考图的外观。`,
    },
    "camera-motion": {
        kind: "video",
        operation: "camera_motion",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "要重新运镜的视频" }],
        options: [motionOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：运镜速度慢一点。", required: false },
        instruction: (text, options) => withNote(`保持视频内容和人物动作不变，把镜头运动改为：${choicePrompt(motionOption, options.motion)}，运镜平稳流畅。`, text),
    },
    "motion-sync": {
        kind: "video",
        operation: "motion_transfer",
        slots: [
            { key: "character", label: "主角", accept: "image", required: true, hint: "上传图片或选择角色" },
            { key: "motion", label: "动作参考", accept: "video", required: true, hint: "上传或录制一段动作视频", constraint: "MP4 / MOV，100MB 以内，3–30 秒，边长 340–3850px", record: "video" },
        ],
        prompt: { label: "补充说明", placeholder: "可选，例如：保持服装不变，背景换成海边。", required: false },
        instruction: (text) => withNote("视频中唯一的人物是参考图片中的角色（脸、发型、服装都按图片）。完整复制参考视频里的身体动作、手势、头部动作和节奏，但不要使用参考视频里的人物，要把那个人完全替换成图片中的角色。保留参考视频的背景、构图和光线。", text),
    },
    "lip-sync": {
        kind: "video",
        operation: "lip_sync",
        slots: [
            { key: "subject", label: "人物", accept: "image_or_video", required: true, hint: "图片、视频或选择角色" },
            { key: "voice", label: "声音", accept: "audio", required: true, hint: "选择或录制音频", constraint: "1–60 秒", record: "audio" },
        ],
        options: [lipQualityOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：表情自然，微笑，轻微点头。", required: false },
        instruction: (text, options) => withNote(`让人物对着镜头说出参考音频里的原话，口型与声音精确同步；直接使用参考音频作为人物的声音，不要改变音色和内容，不要添加音频里没有的道具。保持人物外貌和背景不变。${choicePrompt(lipQualityOption, options.quality)}`, text),
    },
    "video-upscale": {
        kind: "video",
        operation: "video_upscale",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "需要变清晰的视频", constraint: "MP4 / MOV，300MB 以内，最长 1 分钟" }],
        options: [upscaleResolutionOption, fpsOption, upscaleModeOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：保留胶片颗粒感。", required: false },
        instruction: (text, options) => withNote(`把视频提升到 ${choicePrompt(upscaleResolutionOption, options.resolution)}、${choicePrompt(fpsOption, options.fps)}，增强细节，去除噪点和压缩痕迹，保持画面内容、动作和时长不变。${choicePrompt(upscaleModeOption, options.mode)}`, text),
    },
    "video-dubbing": {
        kind: "video",
        operation: "dubbing",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "有人说话的视频", constraint: "MP4 / MOV，300MB 以内，最长 3 分钟" }],
        options: [languageOption, dubLipOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：语气热情，保留原声音色。", required: false },
        instruction: (text, options) => dubbingInstruction(multiValues(languageOption, options.language)[0]?.prompt || "目标语言", options, text),
        variants: (text, options) => {
            const languages = multiValues(languageOption, options.language);
            return languages.length > 1 ? languages.map((language) => dubbingInstruction(language.prompt, options, text)) : undefined;
        },
    },
    "add-sound-effect": {
        kind: "video",
        operation: "video_sfx",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "上传或选择一段视频", constraint: "MP4 / MOV，200MB 以内，最长 60 秒" }],
        options: [keepSoundOption],
        prompt: { label: "描述音效", placeholder: "可选，例如：脚步声、远处的雷声、风吹树叶。", required: false },
        instruction: (text, options) => withNote(`根据画面内容为视频生成匹配的音效，与动作精确同步。${options.keep === "on" ? "保留原视频的声音并混合新音效。" : "替换原视频的声音。"}`, text),
    },

    // ---- 图片 ----
    "edit-image": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "要修改的图片" }],
        region: { slot: "source", label: "修改区域", hint: "可选，框出只允许修改的区域" },
        prompt: { label: "描述你想怎么修改", placeholder: "例如：把杯子换成红色，去掉桌上的手机。", required: true },
        instruction: (text, _options, context) => withRegions(`按以下要求修改这张图片，没提到的部分保持完全不变：${text.trim()}`, context.regions, "只修改以下区域，区域外保持像素级不变："),
    },
    "image-variations": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "以这张图为基础做新版本" }],
        prompt: { label: "描述你的变化", placeholder: "可选，例如：换成秋天的氛围。", required: false },
        instruction: (text) => withNote("参考这张图片生成一个新版本：主体、风格和整体构图保持相近，在细节、姿态、角度或配色上做自然的变化。", text),
    },
    "expand-image": {
        kind: "image",
        ratioOption: "ratio",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "要往外扩展的图片" }],
        options: [{ key: "ratio", label: "画幅", type: "select", choices: EXPAND_RATIO_CHOICES }],
        prompt: { label: "描述怎么补全", placeholder: "可选，例如：两边补成热闹的街道。", required: false },
        instruction: (text, options) => withNote(options.ratio && options.ratio !== "original"
            ? `把这张图片向外扩展到 ${ratioOfChoice(options.ratio)} 画幅：原图内容完整保留，不裁切、不变形、不修改；向四周自然延伸补全场景，光线、透视、色调和风格与原图无缝衔接。`
            : "保持原图比例，把原图内容整体缩小放在画面中间，向四周自然延伸补全更大范围的场景，原图内容不裁切、不变形、不修改，光线、透视、色调和风格无缝衔接。", text),
    },
    "replace-background": {
        kind: "image",
        slots: [
            { key: "subject", label: "原图", accept: "image", required: true, hint: "人物或商品图片" },
            { key: "background", label: "背景参考", accept: "image", required: false, hint: "可选，想要的背景图" },
        ],
        prompt: { label: "新背景", placeholder: "上传背景参考图，或描述新背景，例如：阳光明媚的海边木栈道。", required: true },
        instruction: (text) => `保持第一张图片中的主体（外形、颜色、细节、比例）完全不变，只把背景替换为：${text.trim()}。如果提供了第二张图片，参考它的背景风格。让主体的光线、阴影和透视与新背景自然融合。`,
    },
    relight: {
        kind: "image",
        slots: [{ key: "subject", label: "原图", accept: "image", required: true, hint: "要重新打光的图片" }],
        options: [relightOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：光从左边来。", required: false },
        instruction: (text, options) => withNote(`保持图片内容、构图和人物外貌完全不变，只改变光线为：${choicePrompt(relightOption, options.lighting)}。阴影、高光和色温随新光线自然变化。`, text),
    },
    "image-upscale": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "需要放大变清晰的图片" }],
        options: [imageUpscaleModeOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：加强皮肤质感。", required: false },
        instruction: (text, options) => withNote(`以更高分辨率重新输出这张图片：内容、构图、颜色和人物外貌不变，去除模糊、噪点和压缩痕迹。${choicePrompt(imageUpscaleModeOption, options.mode)}。`, text),
    },
    "extract-layers": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "把一张平面图拆成图层" }],
        options: [layerOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：主体是左边的女孩。", required: false },
        instruction: (text, options) => extractInstruction(options.layer === "background" ? "background" : "subject", text),
        variants: (text, options) => (options.layer === "both" ? [extractInstruction("subject", text), extractInstruction("background", text)] : undefined),
    },
    "multi-view": {
        kind: "image",
        ratioOption: "ratio",
        slots: [{ key: "source", label: "参考图", accept: "image", required: true, hint: "一张主体清晰的图片", constraint: "JPEG / PNG / WEBP，20MB 以内" }],
        options: [{ key: "ratio", label: "画幅", type: "select", default: "1:1", choices: ASPECT_CHOICES }],
        prompt: { label: "补充说明", placeholder: "可选，例如：背景用纯白色。", required: false },
        instruction: (text) => withNote("以参考图中的同一主体生成一张 3×3 九宫格图，九个格子依次为：正面、左前 45°、左侧 90°、右前 45°、右侧 90°、背面、俯视、仰视、面部特写。每格主体的外貌、服装和颜色完全一致，背景统一干净，格子之间用细白边分隔，不出现文字。", text),
    },
    "camera-angle": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "要换角度的图片" }],
        options: [yawOption, pitchOption, lensOption, angleModeOption, allAnglesOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：保持背景虚化。", required: false },
        instruction: (text, options) => cameraAngleInstruction(text, options, finiteOr(options.yaw, 0), finiteOr(options.pitch, 0)),
        variants: (text, options) => (options.all === "on" ? ALL_ANGLES.map(([yaw, pitch]) => cameraAngleInstruction(text, options, yaw, pitch)) : undefined),
    },
    "face-swap": {
        kind: "image",
        slots: [
            { key: "target", label: "要换脸的图片", accept: "image", required: true, hint: "这张图里的脸会被替换" },
            { key: "face", label: "新的脸", accept: "image", required: true, hint: "你想用的脸" },
        ],
        options: [faceModeOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：保留原图的表情。", required: false },
        instruction: (text, options) => withNote(`把第一张图片中人物的脸换成第二张图片中人物的脸：${choicePrompt(faceModeOption, options.mode)}；保留第一张图的身体、服装、姿势、光线和背景，五官、肤色和年龄特征与第二张一致，边缘自然融合，没有拼接痕迹。`, text),
    },

    // ---- 音频（尚未接入协议） ----
    "create-music": {
        kind: "audio",
        unsupported: "音乐生成",
        slots: [{ key: "refs", label: "视觉参考", accept: "image", required: false, max: 10, hint: "可选，用图片影响音乐情绪", constraint: "JPEG / PNG / WEBP，20MB 以内" }],
        options: [musicLengthOption, instrumentalOption, bpmOption, intensityOption, keyOption],
        promptChips: [
            { label: "流行", text: "流行", mode: "append" },
            { label: "Lo-fi", text: "Lo-fi", mode: "append" },
            { label: "电影配乐", text: "电影配乐", mode: "append" },
            { label: "电子", text: "电子音乐", mode: "append" },
        ],
        prompt: { label: "描述你的歌曲", placeholder: "写清风格、情绪、乐器和结构，也可以用 [主歌] [副歌] 标出段落和歌词。", required: true },
        instruction: (text, options) => [text.trim(), `时长：${choicePrompt(musicLengthOption, options.length)}`, options.instrumental === "on" ? "纯音乐，无人声" : "", choicePrompt(bpmOption, options.bpm), choicePrompt(intensityOption, options.intensity), choicePrompt(keyOption, options.key)].filter(Boolean).join("；"),
    },
    "create-sound-effect": {
        kind: "audio",
        unsupported: "音效生成",
        slots: [],
        options: [loopOption, sfxDurationOption, influenceOption],
        promptChips: [
            { label: "嗖", text: "快速划过的嗖声", mode: "append" },
            { label: "魔法", text: "闪亮的魔法音效", mode: "append" },
            { label: "游戏", text: "复古游戏音效", mode: "append" },
            { label: "爆炸", text: "低沉的爆炸声", mode: "append" },
        ],
        prompt: { label: "描述声音", placeholder: "写清声源、情绪和音色，例如：汽水罐打开后冒泡的嘶嘶声。", required: true },
        instruction: (text, options) => [text.trim(), options.loop === "on" ? "可无缝循环" : "", choicePrompt(sfxDurationOption, options.duration)].filter(Boolean).join("；"),
    },
    "voice-clone": {
        kind: "audio",
        slots: [{ key: "voice", label: "声音样本", accept: "audio", required: true, hint: "上传或录制一段清晰的人声", constraint: "最长 90 秒", record: "audio" }],
        prompt: { label: "配音文案", placeholder: "输入要用这个声音朗读的文案。", required: true, maxChars: 5000 },
        instruction: (text) => text.trim(),
    },
    "voice-changer": {
        kind: "audio",
        unsupported: "变声",
        slots: [{ key: "source", label: "原声音", accept: "audio_or_video", required: true, hint: "上传音频或视频", constraint: "音频或视频，100MB 以内", record: "audio" }],
        options: [voiceOption, stabilityOption, similarityOption, exaggerationOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：语气更温柔。", required: false },
        instruction: (text, options) => withNote(`把这段声音转换成${choicePrompt(voiceOption, options.voice)}，保留原来的内容、语速和停顿。`, text),
    },

    // ---- 角色与世界 ----
    "create-character": {
        kind: "image",
        slots: [{ key: "reference", label: "参考图", accept: "image", required: false, hint: "可选，参考这张图的长相或风格" }],
        options: [
            { key: "gender", label: "性别", choices: [{ value: "any", label: "不限", prompt: "" }, { value: "female", label: "女性", prompt: "女性" }, { value: "male", label: "男性", prompt: "男性" }] },
            { key: "age", label: "年龄", type: "select", choices: [{ value: "any", label: "不限", prompt: "" }, { value: "child", label: "儿童", prompt: "儿童" }, { value: "teen", label: "少年", prompt: "十几岁的少年" }, { value: "young", label: "青年", prompt: "二十多岁的青年" }, { value: "adult", label: "中年", prompt: "四十岁左右的中年人" }, { value: "senior", label: "老年", prompt: "六十岁以上的老人" }] },
            { key: "style", label: "画风", type: "select", choices: [{ value: "realistic", label: "写实照片", prompt: "写实摄影风格" }, { value: "anime", label: "日系动漫", prompt: "日系动漫风格" }, { value: "3d", label: "3D 动画", prompt: "3D 动画角色风格" }, { value: "illustration", label: "插画", prompt: "精致插画风格" }] },
            { key: "framing", label: "画面", choices: [{ value: "sheet", label: "角色设定图", prompt: "角色设定图：同一角色的正面、侧面、背面全身三视图并排，加一张面部特写" }, { value: "portrait", label: "半身像", prompt: "清晰的正面半身像" }, { value: "full", label: "全身像", prompt: "正面全身站姿" }] },
        ],
        prompt: { label: "描述你的角色", placeholder: "例如：齐肩黑发，戴圆框眼镜，穿米色风衣，温柔的笑容。", required: false },
        instruction: (text, options) => {
            const pick = (key: string, value: string | undefined) => CREATE_CHARACTER_OPTIONS.find((option) => option.key === key)?.choices.find((choice) => choice.value === value)?.prompt || "";
            const traits = [pick("gender", options.gender), pick("age", options.age)].filter(Boolean).join("，");
            return `设计一个原创角色，${pick("framing", options.framing || "sheet") || "角色设定图"}，纯白或浅灰干净背景，光线均匀，五官和服装细节清晰，方便之后在其他画面里保持同一个角色。${pick("style", options.style || "realistic")}。${traits ? `角色：${traits}。` : ""}${text.trim() ? `外形：${text.trim()}。` : ""}如果提供了参考图，参考它的长相或风格。不出现文字。`;
        },
    },
    "character-image": {
        kind: "image",
        slots: [{ key: "character", label: "角色", accept: "image", required: true, hint: "角色形象图，可以从角色库带入" }],
        prompt: { label: "画面内容", placeholder: "例如：她坐在咖啡店窗边看书，午后阳光。", required: true },
        instruction: (text) => `以参考图中的角色为主角生成新画面：角色的脸、发型、服装和体型与参考图保持一致。画面内容：${text.trim()}`,
    },
    "character-video": {
        kind: "video",
        operation: "reference_to_video",
        slots: [{ key: "character", label: "角色", accept: "image", required: true, hint: "角色形象图，可以从角色库带入" }],
        prompt: { label: "视频内容", placeholder: "例如：她在海边奔跑，回头微笑。", required: true },
        instruction: (text) => `以参考图中的角色为主角生成视频：角色的脸、发型、服装和体型与参考图保持一致。视频内容：${text.trim()}`,
    },
    "cast-in-scene": {
        kind: "image",
        slots: [
            { key: "character", label: "角色", accept: "image", required: true, hint: "要放进场景的角色" },
            { key: "scene", label: "场景", accept: "image", required: true, hint: "场景或全景图" },
        ],
        prompt: { label: "补充说明", placeholder: "可选，例如：角色坐在长椅上。", required: false },
        instruction: (text) => withNote("把第一张图片中的角色自然地放进第二张图片的场景里：角色外貌和服装保持不变，场景内容保持不变，调整角色的大小、位置、光线和阴影，让角色像真实处在这个场景中。", text),
    },
    "create-pano": {
        kind: "image",
        outputRatio: "2:1",
        slots: [{ key: "reference", label: "参考图", accept: "image", required: false, max: 4, hint: "可选，延续这些图的场景和风格" }],
        prompt: { label: "描述世界", placeholder: "例如：黄昏时分的江南水乡古镇，石桥和灯笼。", required: true },
        instruction: (text) => `生成一张 2:1 等距柱状投影（equirectangular）的 360° 全景图，左右边缘无缝衔接，地平线水平居中，没有文字和水印。场景：${text.trim()}。如果提供了参考图，延续参考图的场景和风格。`,
    },
    "world-cam": {
        kind: "video",
        slots: [{ key: "world", label: "世界", accept: "image", required: true, hint: "全景图或场景图" }],
        options: [worldPathOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：傍晚，路灯慢慢亮起。", required: false },
        instruction: (text, options) => withNote(`以这张图为起始画面，在这个场景里拍一段连续的镜头：${choicePrompt(worldPathOption, options.path)}。场景结构、光线和风格保持一致，画面稳定，没有人物突然出现。`, text),
    },
};

const CREATE_CHARACTER_OPTIONS = STUDIO_SPECIALTY_SPECS["create-character"].options || [];

export function studioSpecialtySpec(toolId: string): StudioSpecialtySpec | undefined {
    return STUDIO_SPECIALTY_SPECS[toolId];
}

export function slotAccepts(slot: StudioSlot, attachment: CreationAttachment) {
    const kind = creationAttachmentKind(attachment);
    if (slot.accept === "image_or_video") return kind === "image" || kind === "video";
    if (slot.accept === "audio_or_video") return kind === "audio" || kind === "video";
    return kind === slot.accept;
}

export function slotAcceptAttribute(slot: StudioSlot) {
    const image = "image/png,image/jpeg,image/webp";
    const video = "video/mp4,video/quicktime,video/webm";
    const audio = "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/webm";
    if (slot.accept === "image") return image;
    if (slot.accept === "video") return video;
    if (slot.accept === "audio") return audio;
    if (slot.accept === "audio_or_video") return `${audio},${video}`;
    return `${image},${video}`;
}

/** 槽位 → 素材。多素材槽位存数组。顺序就是发送顺序（第一张图是主体），所以提交时按槽位排列。 */
export type StudioSlotValues = Record<string, CreationAttachment | CreationAttachment[] | undefined>;

export function slotItems(values: StudioSlotValues, key: string): CreationAttachment[] {
    const value = values[key];
    return Array.isArray(value) ? value : value ? [value] : [];
}

export function orderedSlotAttachments(spec: StudioSpecialtySpec, values: StudioSlotValues) {
    return spec.slots.flatMap((slot) => slotItems(values, slot.key));
}

/** 缺少必填素材、素材类型不对或必选项没选时返回原因。 */
export function specialtyInputError(spec: StudioSpecialtySpec, values: StudioSlotValues, userText: string, options: Record<string, string> = {}) {
    for (const slot of spec.slots) {
        const items = slotItems(values, slot.key);
        if (!items.length) {
            if (slot.required) return `请添加${slot.label}`;
            continue;
        }
        if (items.some((item) => !slotAccepts(slot, item))) return `${slot.label}的文件类型不对`;
        if (items.length > (slot.max || 1)) return `${slot.label}最多 ${slot.max || 1} 个`;
    }
    for (const option of spec.options || []) {
        if (option.type === "multi" && option.required && !multiValues(option, options[option.key]).length) return `请选择${option.label}`;
    }
    if (spec.prompt.required && !userText.trim()) return spec.prompt.label.startsWith("描述") ? `请${spec.prompt.label}` : `请填写${spec.prompt.label}`;
    if (spec.prompt.maxChars && Array.from(userText).length > spec.prompt.maxChars) return `${spec.prompt.label}最多 ${spec.prompt.maxChars} 字`;
    return "";
}

export function specialtyPrompt(spec: StudioSpecialtySpec, userText: string, options: Record<string, string>, context: StudioSpecialtyContext = {}) {
    return spec.instruction(userText, options, context);
}

function validOptionValue(option: StudioSpecialtyOption, value: unknown) {
    if (typeof value !== "string") return false;
    if (option.type === "toggle") return value === "on" || value === "off";
    if (option.type === "slider") {
        const number = Number(value);
        return value !== "" && Number.isFinite(number) && number >= (option.min ?? 0) && number <= (option.max ?? 1);
    }
    if (option.type === "multi") return value.split(",").filter(Boolean).every((item) => option.choices.some((choice) => choice.value === item));
    return option.choices.some((choice) => choice.value === value);
}

/** 从作品设置里恢复选项，只接受当前工具仍然存在的选项和取值。 */
export function restoreSpecialtyOptions(spec: StudioSpecialtySpec, saved: unknown) {
    const next = defaultSpecialtyOptions(spec);
    if (!saved || typeof saved !== "object") return next;
    for (const option of spec.options || []) {
        const value = (saved as Record<string, unknown>)[option.key];
        if (validOptionValue(option, value)) next[option.key] = value as string;
    }
    return next;
}

export function defaultSpecialtyOptions(spec: StudioSpecialtySpec) {
    return Object.fromEntries((spec.options || []).map((option) => [option.key, option.default ?? (option.type === "multi" ? "" : option.type === "toggle" ? "off" : option.choices[0]?.value ?? String(option.min ?? 0))]));
}

const OPERATION_LABELS: Record<string, string> = {
    lip_sync: "对口型",
    motion_transfer: "动作同步",
    video_upscale: "视频高清",
    dubbing: "视频配音翻译",
    video_sfx: "视频配音效",
    inpaint: "视频编辑",
    replace_element: "换角色",
    style_transfer: "视频换风格",
    camera_motion: "运镜重拍",
    extend: "视频延长",
    reference_to_video: "参考生视频",
};

/** 交给生成钩子的专项状态。槽位全空时不报错，等用户点生成前再提示。 */
export function buildSpecialtyState(spec: StudioSpecialtySpec, values: StudioSlotValues, userText: string, options: Record<string, string>, context: StudioSpecialtyContext = {}): StudioSpecialtyState {
    const requiredCount = (accept: StudioSlotAccept) => spec.slots.filter((slot) => slot.required && slot.accept === accept).length;
    return {
        operation: spec.operation,
        operationLabel: spec.unsupported || (spec.operation ? OPERATION_LABELS[spec.operation] || spec.operation : spec.kind === "video" ? "视频生成" : spec.kind === "audio" ? "声音克隆" : "图片编辑"),
        unsupported: Boolean(spec.unsupported),
        kind: spec.kind,
        allowCount: Boolean(spec.count),
        instruction: specialtyPrompt(spec, userText, options, context),
        variants: spec.variants?.(userText, options, context),
        userText,
        options,
        inputError: specialtyInputError(spec, values, userText, options),
        minImages: requiredCount("image"),
        minVideos: requiredCount("video"),
        minAudios: requiredCount("audio"),
    };
}

/** 后台有没有能用的模型；没有时工具页说明原因并禁止生成。 */
export function studioSpecialtyAvailable(config: AiConfig, toolId: string) {
    const spec = studioSpecialtySpec(toolId);
    if (!spec) return true;
    const probe = buildSpecialtyState(spec, {}, "", defaultSpecialtyOptions(spec));
    return selectableModelsByCapability(config, spec.kind).some((model) => studioModelSupportsSpecialty(config, model, probe));
}
