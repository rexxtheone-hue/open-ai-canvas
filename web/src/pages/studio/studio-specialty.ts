import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import type { SpecialtyVideoOperation } from "@/lib/video-modes";

/** 专项工具使用的视频操作：供应商专门支持的操作，以及视频编辑类和参考生视频（模型须在能力里勾选）。 */
export type StudioSpecialtyOperation = SpecialtyVideoOperation | "inpaint" | "replace_element" | "style_transfer" | "camera_motion" | "extend" | "reference_to_video";
import type { StudioKind } from "@/services/api/studio";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { studioModelSupportsSpecialty, type StudioSpecialtyState } from "./studio-generation";

/**
 * 专项工具：每个工具规定好要哪些素材、提示词怎么写。
 * 视频类走供应商专门支持的操作（模型必须在能力里勾选）；图片类用图片编辑模型 + 固定指令。
 */
export type StudioSlotAccept = "image" | "video" | "audio" | "image_or_video";

export type StudioSlot = {
    key: string;
    label: string;
    accept: StudioSlotAccept;
    required: boolean;
    hint: string;
};

export type StudioSpecialtyOption = {
    key: string;
    label: string;
    choices: Array<{ value: string; label: string; prompt: string }>;
};

export type StudioSpecialtySpec = {
    kind: Extract<StudioKind, "image" | "video">;
    /** 视频专项操作；图片工具为空。 */
    operation?: StudioSpecialtyOperation;
    /** 固定输出比例（例如全景图 2:1）；为空时用面板里选的比例。 */
    outputRatio?: string;
    slots: StudioSlot[];
    prompt: { label: string; placeholder: string; required: boolean };
    options?: StudioSpecialtyOption[];
    /** 把用户补充说明和选项拼成发送给模型的提示词。 */
    instruction: (userText: string, options: Record<string, string>) => string;
};

const RELIGHT_CHOICES = [
    { value: "golden", label: "黄金时刻", prompt: "温暖的黄金时刻侧逆光，柔和长阴影" },
    { value: "studio", label: "影棚柔光", prompt: "专业影棚柔光箱布光，均匀干净，阴影柔和" },
    { value: "neon", label: "霓虹夜景", prompt: "夜晚霓虹灯光，蓝紫与洋红色边缘光" },
    { value: "window", label: "窗边自然光", prompt: "窗边自然散射光，明亮通透" },
    { value: "dramatic", label: "电影感明暗", prompt: "电影感强明暗对比，单侧硬光，深色背景" },
    { value: "backlight", label: "逆光轮廓", prompt: "强烈逆光，主体有明亮轮廓光" },
];

const DUBBING_LANGUAGES = [
    { value: "zh", label: "中文", prompt: "中文（普通话）" },
    { value: "en", label: "English", prompt: "英语" },
    { value: "ms", label: "Bahasa Melayu", prompt: "马来语" },
    { value: "ja", label: "日本語", prompt: "日语" },
    { value: "ko", label: "한국어", prompt: "韩语" },
    { value: "id", label: "Bahasa Indonesia", prompt: "印尼语" },
    { value: "th", label: "ไทย", prompt: "泰语" },
    { value: "es", label: "Español", prompt: "西班牙语" },
];

function choicePrompt(option: StudioSpecialtyOption | undefined, value: string | undefined) {
    if (!option) return "";
    return (option.choices.find((choice) => choice.value === value) || option.choices[0]).prompt;
}

function withNote(base: string, userText: string) {
    const note = userText.trim();
    return note ? `${base}\n补充要求：${note}` : base;
}

const STYLE_CHOICES = [
    { value: "lego", label: "乐高积木", prompt: "乐高积木拼搭风格，塑料积木质感" },
    { value: "ghibli", label: "吉卜力动画", prompt: "吉卜力手绘动画风格，柔和水彩色调" },
    { value: "pixar", label: "3D 动画", prompt: "皮克斯式 3D 动画风格，圆润可爱，柔和光照" },
    { value: "anime", label: "日系动漫", prompt: "日系赛璐璐动漫风格，清晰线条" },
    { value: "ink", label: "水墨国风", prompt: "中国水墨画风格，留白与墨色晕染" },
    { value: "oil", label: "油画", prompt: "印象派油画风格，明显笔触" },
    { value: "clay", label: "黏土定格", prompt: "黏土定格动画风格，手工捏制质感" },
    { value: "cyberpunk", label: "赛博朋克", prompt: "赛博朋克风格，霓虹灯光与高科技城市感" },
];

const CAMERA_MOTION_CHOICES = [
    { value: "push", label: "缓慢推近", prompt: "镜头缓慢推近主体" },
    { value: "pull", label: "缓慢拉远", prompt: "镜头缓慢拉远，展现更多环境" },
    { value: "orbit", label: "环绕", prompt: "镜头围绕主体平稳环绕" },
    { value: "pan", label: "横移", prompt: "镜头平稳横向移动" },
    { value: "crane", label: "升降", prompt: "镜头由低处平稳升起" },
    { value: "handheld", label: "手持跟拍", prompt: "手持跟拍，轻微自然晃动" },
];

const YAW_CHOICES = [
    { value: "front", label: "正面", prompt: "正面" },
    { value: "left45", label: "向左 45°", prompt: "从主体左前方 45 度" },
    { value: "left90", label: "向左 90°", prompt: "从主体左侧 90 度" },
    { value: "right45", label: "向右 45°", prompt: "从主体右前方 45 度" },
    { value: "right90", label: "向右 90°", prompt: "从主体右侧 90 度" },
    { value: "back", label: "背面", prompt: "从主体正后方" },
];

const PITCH_CHOICES = [
    { value: "eye", label: "平视", prompt: "平视角度" },
    { value: "high30", label: "俯拍 30°", prompt: "从上方 30 度俯拍" },
    { value: "high60", label: "俯拍 60°", prompt: "从上方 60 度俯拍" },
    { value: "low30", label: "仰拍 30°", prompt: "从下方 30 度仰拍" },
];

const LENS_CHOICES = [
    { value: "default", label: "标准", prompt: "标准镜头" },
    { value: "wide", label: "广角", prompt: "广角镜头，展现更多环境" },
    { value: "close", label: "特写", prompt: "特写镜头，主体占满画面" },
];

const relightOption: StudioSpecialtyOption = { key: "lighting", label: "光线", choices: RELIGHT_CHOICES };
const styleOption: StudioSpecialtyOption = { key: "style", label: "风格", choices: STYLE_CHOICES };
const motionOption: StudioSpecialtyOption = { key: "motion", label: "运镜", choices: CAMERA_MOTION_CHOICES };
const yawOption: StudioSpecialtyOption = { key: "yaw", label: "左右角度", choices: YAW_CHOICES };
const pitchOption: StudioSpecialtyOption = { key: "pitch", label: "上下角度", choices: PITCH_CHOICES };
const lensOption: StudioSpecialtyOption = { key: "lens", label: "镜头", choices: LENS_CHOICES };
const languageOption: StudioSpecialtyOption = { key: "language", label: "目标语言", choices: DUBBING_LANGUAGES };

export const STUDIO_SPECIALTY_SPECS: Record<string, StudioSpecialtySpec> = {
    "lip-sync": {
        kind: "video",
        operation: "lip_sync",
        slots: [
            { key: "subject", label: "人物", accept: "image_or_video", required: true, hint: "一张正脸清晰的人像，或一段人物视频" },
            { key: "voice", label: "声音", accept: "audio", required: true, hint: "要说的话（录音或配音）" },
        ],
        prompt: { label: "补充说明", placeholder: "可选，例如：表情自然，微笑，轻微点头。", required: false },
        instruction: (text) => withNote("让人物按照参考音频说话，口型与声音精确同步，保持人物外貌和背景不变。", text),
    },
    "motion-sync": {
        kind: "video",
        operation: "motion_transfer",
        slots: [
            { key: "character", label: "角色", accept: "image", required: true, hint: "要动起来的角色图片" },
            { key: "motion", label: "动作视频", accept: "video", required: true, hint: "提供动作和表情的参考视频" },
        ],
        prompt: { label: "补充说明", placeholder: "可选，例如：保持服装不变，背景换成海边。", required: false },
        instruction: (text) => withNote("让图片中的角色完整模仿参考视频里的动作、表情和节奏，保持角色外貌一致。", text),
    },
    "video-upscale": {
        kind: "video",
        operation: "video_upscale",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "需要变清晰的视频" }],
        prompt: { label: "补充说明", placeholder: "可选，例如：保留胶片颗粒感。", required: false },
        instruction: (text) => withNote("提升视频清晰度和细节，去除噪点和压缩痕迹，保持画面内容、动作和时长不变。", text),
    },
    "video-dubbing": {
        kind: "video",
        operation: "dubbing",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "有人说话的视频" }],
        options: [languageOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：语气热情，保留原声音色。", required: false },
        instruction: (text, options) => withNote(`把视频中的对白翻译成${choicePrompt(languageOption, options.language)}并重新配音，保留说话人的音色和情绪，口型与新配音同步。`, text),
    },
    "replace-background": {
        kind: "image",
        slots: [
            { key: "subject", label: "主体图片", accept: "image", required: true, hint: "人物或商品图片" },
            { key: "background", label: "背景参考", accept: "image", required: false, hint: "可选，想要的背景图" },
        ],
        prompt: { label: "新背景", placeholder: "描述新背景，例如：阳光明媚的海边木栈道。", required: true },
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
        prompt: { label: "补充说明", placeholder: "可选，例如：加强皮肤质感。", required: false },
        instruction: (text) => withNote("以更高分辨率重新输出这张图片：内容、构图、颜色和人物外貌完全不变，补全清晰细节，去除模糊、噪点和压缩痕迹。", text),
    },

    // ---- 视频编辑类（模型须勾选对应操作，并能接收原视频） ----
    "edit-video": {
        kind: "video",
        operation: "inpaint",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "要修改的视频" }],
        prompt: { label: "怎么修改", placeholder: "例如：把天空换成晚霞，人物衣服换成红色。", required: true },
        instruction: (text) => `按以下要求修改这段视频，没提到的部分（人物外貌、动作、镜头运动、时长）保持不变：${text.trim()}`,
    },
    "replace-character": {
        kind: "video",
        operation: "replace_element",
        slots: [
            { key: "source", label: "原视频", accept: "video", required: true, hint: "要换人的视频" },
            { key: "character", label: "新角色", accept: "image", required: true, hint: "替换上去的角色图片" },
        ],
        prompt: { label: "补充说明", placeholder: "可选，例如：只替换穿白衣服的人。", required: false },
        instruction: (text) => withNote("把视频中的主要人物替换成参考图中的角色：新角色的脸、发型、服装和体型与参考图一致，保持原视频的动作、表情、镜头运动、光线和背景不变。", text),
    },
    "restyle-video": {
        kind: "video",
        operation: "style_transfer",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "要换风格的视频" }],
        options: [styleOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：色彩更鲜艳。", required: false },
        instruction: (text, options) => withNote(`把这段视频整体转换为${choicePrompt(styleOption, options.style)}，保持原视频的内容、构图、动作节奏和镜头运动不变。`, text),
    },
    "extend-video": {
        kind: "video",
        operation: "extend",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "要往后延长的视频" }],
        prompt: { label: "接下来发生什么", placeholder: "例如：女孩转身走向窗边，镜头慢慢跟上。", required: true },
        instruction: (text) => `从原视频最后一帧自然衔接继续生成：${text.trim()}。人物、场景、光线和画风与原视频保持一致，动作和镜头运动连贯不跳变。`,
    },
    "camera-motion": {
        kind: "video",
        operation: "camera_motion",
        slots: [{ key: "source", label: "原视频", accept: "video", required: true, hint: "要重新运镜的视频" }],
        options: [motionOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：运镜速度慢一点。", required: false },
        instruction: (text, options) => withNote(`保持视频内容和人物动作不变，把镜头运动改为：${choicePrompt(motionOption, options.motion)}，运镜平稳流畅。`, text),
    },

    // ---- 图片编辑类（支持参考图的图片模型即可） ----
    "edit-image": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "要修改的图片" }],
        prompt: { label: "怎么修改", placeholder: "例如：把杯子换成红色，去掉桌上的手机。", required: true },
        instruction: (text) => `按以下要求修改这张图片，没提到的部分保持完全不变：${text.trim()}`,
    },
    "image-variations": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "以这张图为基础做新版本" }],
        prompt: { label: "变化方向", placeholder: "可选，例如：换成秋天的氛围。", required: false },
        instruction: (text) => withNote("参考这张图片生成一个新版本：主体、风格和整体构图保持相近，在细节、姿态、角度或配色上做自然的变化。", text),
    },
    "expand-image": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "要往外扩展的图片" }],
        prompt: { label: "怎么补全", placeholder: "可选，例如：两边补成热闹的街道。", required: false },
        instruction: (text) => withNote("把这张图片向外扩展到当前输出画幅：原图内容完整保留在画面中间，不裁切、不变形、不修改；向四周自然延伸补全场景，光线、透视、色调和风格与原图无缝衔接。", text),
    },
    "multi-view": {
        kind: "image",
        slots: [{ key: "source", label: "参考图", accept: "image", required: true, hint: "一张主体清晰的图片" }],
        prompt: { label: "补充说明", placeholder: "可选，例如：背景用纯白色。", required: false },
        instruction: (text) => withNote("以参考图中的同一主体生成一张 3×3 九宫格图，九个格子依次为：正面、左前 45°、左侧 90°、右前 45°、右侧 90°、背面、俯视、仰视、面部特写。每格主体的外貌、服装和颜色完全一致，背景统一干净，格子之间用细白边分隔，不出现文字。", text),
    },
    "camera-angle": {
        kind: "image",
        slots: [{ key: "source", label: "原图", accept: "image", required: true, hint: "要换角度的图片" }],
        options: [yawOption, pitchOption, lensOption],
        prompt: { label: "补充说明", placeholder: "可选，例如：保持背景虚化。", required: false },
        instruction: (text, options) => withNote(`保持主体外貌、服装和场景内容不变，换一个机位重新拍这张图：${choicePrompt(yawOption, options.yaw)}，${choicePrompt(pitchOption, options.pitch)}，${choicePrompt(lensOption, options.lens)}。透视、光线和阴影随新机位合理变化。`, text),
    },
    "face-swap": {
        kind: "image",
        slots: [
            { key: "target", label: "原图", accept: "image", required: true, hint: "要换脸的图片" },
            { key: "face", label: "新的脸", accept: "image", required: true, hint: "提供脸部的人像" },
        ],
        prompt: { label: "补充说明", placeholder: "可选，例如：保留原图的表情。", required: false },
        instruction: (text) => withNote("把第一张图片中人物的脸换成第二张图片中人物的脸：保留第一张图的发型、身体、服装、姿势、光线和背景，脸部五官、肤色和年龄特征与第二张一致，边缘自然融合，没有拼接痕迹。", text),
    },

    // ---- 角色与世界 ----
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
        slots: [{ key: "reference", label: "参考图", accept: "image", required: false, hint: "可选，延续这张图的场景和风格" }],
        prompt: { label: "描述世界", placeholder: "例如：黄昏时分的江南水乡古镇，石桥和灯笼。", required: true },
        instruction: (text) => `生成一张 2:1 等距柱状投影（equirectangular）的 360° 全景图，左右边缘无缝衔接，地平线水平居中，没有文字和水印。场景：${text.trim()}。如果提供了参考图，延续参考图的场景和风格。`,
    },
};

export function studioSpecialtySpec(toolId: string): StudioSpecialtySpec | undefined {
    return STUDIO_SPECIALTY_SPECS[toolId];
}

export function slotAccepts(slot: StudioSlot, attachment: CreationAttachment) {
    const kind = creationAttachmentKind(attachment);
    if (slot.accept === "image_or_video") return kind === "image" || kind === "video";
    return kind === slot.accept;
}

export function slotAcceptAttribute(slot: StudioSlot) {
    if (slot.accept === "image") return "image/png,image/jpeg,image/webp";
    if (slot.accept === "video") return "video/mp4,video/quicktime,video/webm";
    if (slot.accept === "audio") return "audio/mpeg,audio/wav,audio/x-wav,audio/mp4";
    return "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm";
}

/** 槽位 → 素材。顺序就是发送顺序（第一张图是主体），所以提交时按槽位排列。 */
export type StudioSlotValues = Record<string, CreationAttachment | undefined>;

export function orderedSlotAttachments(spec: StudioSpecialtySpec, values: StudioSlotValues) {
    return spec.slots.map((slot) => values[slot.key]).filter((item): item is CreationAttachment => Boolean(item));
}

/** 缺少必填素材或素材类型不对时返回原因。 */
export function specialtyInputError(spec: StudioSpecialtySpec, values: StudioSlotValues, userText: string) {
    for (const slot of spec.slots) {
        const value = values[slot.key];
        if (!value) {
            if (slot.required) return `请添加${slot.label}`;
            continue;
        }
        if (!slotAccepts(slot, value)) return `${slot.label}的文件类型不对`;
    }
    if (spec.prompt.required && !userText.trim()) return `请填写${spec.prompt.label}`;
    return "";
}

export function specialtyPrompt(spec: StudioSpecialtySpec, userText: string, options: Record<string, string>) {
    return spec.instruction(userText, options);
}

/** 从作品设置里恢复选项，只接受当前工具仍然存在的选项和取值。 */
export function restoreSpecialtyOptions(spec: StudioSpecialtySpec, saved: unknown) {
    const next = defaultSpecialtyOptions(spec);
    if (!saved || typeof saved !== "object") return next;
    for (const option of spec.options || []) {
        const value = (saved as Record<string, unknown>)[option.key];
        if (typeof value === "string" && option.choices.some((choice) => choice.value === value)) next[option.key] = value;
    }
    return next;
}

export function defaultSpecialtyOptions(spec: StudioSpecialtySpec) {
    return Object.fromEntries((spec.options || []).map((option) => [option.key, option.choices[0].value]));
}

const OPERATION_LABELS: Record<string, string> = {
    lip_sync: "对口型",
    motion_transfer: "动作同步",
    video_upscale: "视频高清",
    dubbing: "视频配音翻译",
    inpaint: "视频编辑",
    replace_element: "换角色",
    style_transfer: "视频换风格",
    camera_motion: "运镜重拍",
    extend: "视频延长",
    reference_to_video: "参考生视频",
};

/** 交给生成钩子的专项状态。槽位全空时不报错，等用户点生成前再提示。 */
export function buildSpecialtyState(spec: StudioSpecialtySpec, values: StudioSlotValues, userText: string, options: Record<string, string>): StudioSpecialtyState {
    return {
        operation: spec.operation,
        operationLabel: spec.operation ? OPERATION_LABELS[spec.operation] || spec.operation : "图片编辑",
        instruction: specialtyPrompt(spec, userText, options),
        userText,
        options,
        inputError: specialtyInputError(spec, values, userText),
        minImages: spec.slots.filter((slot) => slot.required && slot.accept === "image").length,
        minVideos: spec.slots.filter((slot) => slot.required && slot.accept === "video").length,
    };
}

/** 后台没有能用的模型时，这个工具不出现在任何列表里（H6）。 */
export function studioSpecialtyAvailable(config: AiConfig, toolId: string) {
    const spec = studioSpecialtySpec(toolId);
    if (!spec) return true;
    const probe = buildSpecialtyState(spec, {}, "", defaultSpecialtyOptions(spec));
    return selectableModelsByCapability(config, spec.kind).some((model) => studioModelSupportsSpecialty(config, model, probe));
}
