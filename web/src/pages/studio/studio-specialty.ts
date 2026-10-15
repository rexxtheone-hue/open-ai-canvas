import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import type { SpecialtyVideoOperation } from "@/lib/video-modes";
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
    operation?: SpecialtyVideoOperation;
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

const relightOption: StudioSpecialtyOption = { key: "lighting", label: "光线", choices: RELIGHT_CHOICES };
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

export function defaultSpecialtyOptions(spec: StudioSpecialtySpec) {
    return Object.fromEntries((spec.options || []).map((option) => [option.key, option.choices[0].value]));
}

const OPERATION_LABELS: Record<string, string> = { lip_sync: "对口型", motion_transfer: "动作同步", video_upscale: "视频高清", dubbing: "视频配音翻译" };

/** 交给生成钩子的专项状态。槽位全空时不报错，等用户点生成前再提示。 */
export function buildSpecialtyState(spec: StudioSpecialtySpec, values: StudioSlotValues, userText: string, options: Record<string, string>): StudioSpecialtyState {
    return {
        operation: spec.operation,
        operationLabel: spec.operation ? OPERATION_LABELS[spec.operation] || spec.operation : "图片编辑",
        instruction: specialtyPrompt(spec, userText, options),
        userText,
        inputError: specialtyInputError(spec, values, userText),
        minImages: spec.slots.filter((slot) => slot.required && slot.accept === "image").length,
    };
}

/** 后台没有能用的模型时，这个工具不出现在任何列表里（H6）。 */
export function studioSpecialtyAvailable(config: AiConfig, toolId: string) {
    const spec = studioSpecialtySpec(toolId);
    if (!spec) return true;
    const probe = buildSpecialtyState(spec, {}, "", defaultSpecialtyOptions(spec));
    return selectableModelsByCapability(config, spec.kind).some((model) => studioModelSupportsSpecialty(config, model, probe));
}
