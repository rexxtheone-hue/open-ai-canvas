import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import { runBackendGenerationTask } from "@/services/api/generation-task";
import type { StudioKind } from "@/services/api/studio";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";

/** 提示词工具：润色（扩写）、看图写提示词、运镜短语。润色和看图用后台的文本模型，按 token 计费。 */

/** 运镜：和 OpenArt 的镜头运动一致，另加手持、希区柯克变焦和固定镜头。coverId 供后台上传示意图。 */
export const CAMERA_MOVES = [
    { value: "pan-left", label: "向左平移", prompt: "镜头向左平稳平移" },
    { value: "pan-right", label: "向右平移", prompt: "镜头向右平稳平移" },
    { value: "tilt-up", label: "向上倾斜", prompt: "镜头由下向上倾斜摇起" },
    { value: "tilt-down", label: "向下俯拍", prompt: "镜头由上向下俯拍" },
    { value: "zoom-in", label: "放大", prompt: "镜头缓慢推近主体" },
    { value: "zoom-out", label: "缩小", prompt: "镜头缓慢拉远，展现环境" },
    { value: "tracking", label: "跟踪镜头", prompt: "镜头与主体平行，横向跟踪移动" },
    { value: "follow", label: "跟随镜头", prompt: "镜头在主体身后跟拍" },
    { value: "orbit", label: "Orbit 360", prompt: "镜头围绕主体 360 度环绕" },
    { value: "crane", label: "升降镜头", prompt: "镜头从低处缓缓升起，俯瞰全景" },
    { value: "jib", label: "吊臂镜头", prompt: "吊臂镜头从高处划过，缓缓下降到主体" },
    { value: "drone", label: "无人机穿越飞行", prompt: "无人机在空中平稳穿越飞行，俯瞰全景" },
    { value: "fpv", label: "FPV 无人机", prompt: "FPV 无人机高速穿梭飞行" },
    { value: "handheld", label: "手持", prompt: "手持拍摄，轻微自然晃动" },
    { value: "dolly-zoom", label: "希区柯克变焦", prompt: "希区柯克式推拉变焦，背景压缩变化" },
    { value: "static", label: "固定镜头", prompt: "固定机位，镜头不动" },
] as const;

export type StudioCameraMove = (typeof CAMERA_MOVES)[number];

export function cameraMoveCoverId(value: string) {
    return `camera-${value}`;
}

/** 把运镜短语追加到提示词末尾（已包含时不重复）。 */
export function appendCameraMove(prompt: string, move: string) {
    const text = prompt.trim();
    if (text.includes(move)) return text;
    return text ? `${text}${/[。.!！?？]$/.test(text) ? "" : "。"}${move}。` : `${move}。`;
}

/** 可用的文本模型：优先后台默认，看图时只考虑能接收图片的模型。 */
export function studioTextModel(config: AiConfig, needsVision = false) {
    const models = selectableModelsByCapability(config, "text").filter((model) => !needsVision || (modelCapabilityConfigFor(config, model).text?.references.maxImages || 0) > 0);
    if (!models.length) return "";
    return models.includes(config.textModel) ? config.textModel : models[0];
}

const KIND_GUIDE: Record<StudioKind, string> = {
    image: "这是一张图片的生成提示词。补全主体、环境、构图、光线、色调和风格细节。",
    video: "这是一段视频的生成提示词。补全主体动作、场景、镜头运动、节奏、光线和声音氛围。",
    audio: "这是一段配音文案。只修正错别字和语句通顺，不改意思。",
};

async function runText(config: AiConfig, model: string, systemPrompt: string, prompt: string, images: CreationAttachment[] = []) {
    const result = await runBackendGenerationTask({
        mode: "text",
        prompt,
        config: { ...config, model, textModel: model, systemPrompt },
        referenceImages: images.filter((item) => creationAttachmentKind(item) === "image") as never,
        metadata: { studioAgent: "prompt-tools" },
    });
    return (result.text || "").trim().replace(/^["“]|["”]$/g, "");
}

/** 润色：把简短描述扩写成完整的生成提示词，保持用户的语言和原意。 */
export async function enhanceStudioPrompt(config: AiConfig, kind: StudioKind, text: string) {
    const source = text.trim();
    if (!source) throw new Error("先写一点描述再润色");
    const model = studioTextModel(config);
    if (!model) throw new Error("后台还没有可用的文本模型");
    const system = `你是 AI 生成提示词助手。${KIND_GUIDE[kind]}保持用户的语言和原意，不要添加用户没提到的品牌、人物或文字。只输出改写后的提示词本身，不要解释、不要加引号。`;
    const output = await runText(config, model, system, source);
    if (!output) throw new Error("润色没有返回内容，请重试");
    return output;
}

/** 看图写提示词：让能看图的文本模型描述参考图，作为生成提示词的起点。 */
export async function promptFromImage(config: AiConfig, kind: StudioKind, image: CreationAttachment, hint = "") {
    if (creationAttachmentKind(image) !== "image") throw new Error("先添加一张图片");
    const model = studioTextModel(config, true);
    if (!model) throw new Error("后台还没有能看图的文本模型");
    const system = `你是 AI 生成提示词助手。仔细观察用户给的图片，写一段用于${kind === "video" ? "把这张图做成视频的提示词：描述画面主体、接下来的动作和镜头运动" : "生成类似画面的提示词：描述主体、环境、构图、光线和风格"}。用中文，只输出提示词本身。`;
    const output = await runText(config, model, system, hint.trim() || "请根据这张图写提示词。", [image]);
    if (!output) throw new Error("没有识别出内容，请重试");
    return output;
}

/** 智能分镜：把场景描述拆成若干镜头，每行一个镜头，用户可以再修改。 */
export async function planStudioShots(config: AiConfig, scene: string, shots: number, seconds: string) {
    const source = scene.trim();
    if (!source) throw new Error("先描述你的场景");
    const model = studioTextModel(config);
    if (!model) throw new Error("后台还没有可用的文本模型");
    const system = `你是分镜导演。把用户的场景拆成 ${shots} 个连续镜头，整段视频总长约 ${seconds} 秒。每个镜头一行，格式：「镜头N（约X秒）：景别 + 机位/运镜 + 画面内容 + 人物动作」。人物和场景前后一致，景别有变化，节奏流畅。用用户的语言，只输出镜头列表。`;
    const output = await runText(config, model, system, source);
    if (!output) throw new Error("没有生成分镜，请重试");
    return output;
}
