import { creationAttachmentKind, splitCreationAttachments, type CreationAttachment } from "@/pages/create/creation-assets";
import { creationVideoConfig } from "@/pages/create/creation-generation-config";
import { audioGenerationPrompt, isDoubaoAudioConfig } from "@/lib/audio-generation";
import { imageParameterAccepts, imageParameterRequest } from "@/lib/image-parameters";
import { modelCapabilityConfigFor, normalizeImageValue, videoDurationAllowed } from "@/lib/model-capabilities";
import { inferVideoOperation, modelGroupReferenceLimits, modelPromptLengthError, resolveCompatibleModel, resolveModelVideoBooleanOptions, type ModelReferenceLimits, type ModelRequirements } from "@/lib/model-selection";
import { applyVideoModeImageRoles, pickVideoModeMaterials, videoModeInputError, videoModeOperation, videoModeUsedInput, type VideoMode } from "@/lib/video-modes";
import { resolveModelRequestConfig, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import type { StudioKind } from "@/services/api/studio";

/** Studio 生成工具的全部可编辑状态。模型值沿用渠道编码（channelId::model）。 */
export type StudioToolState = {
    kind: StudioKind;
    tool: string;
    model: string;
    prompt: string;
    attachments: CreationAttachment[];
    count: number;
    image: { ratio: string; quality: string; imageResolution: string; imageParameters: string };
    video: { ratio: string; seconds: string; videoQuality: string; generateAudio: boolean; mode?: VideoMode };
    audio: { voice: string; format: string; speed: string };
    /** 选中的品牌套件。配音不使用品牌（朗读文案必须原样）。 */
    brand?: StudioBrandContext;
    /** 专项工具：固定的视频操作、编译好的指令和素材检查结果。素材已按槽位顺序放在 attachments。 */
    specialty?: StudioSpecialtyState;
};

export type StudioSpecialtyState = {
    operation?: string;
    operationLabel: string;
    /** 还没有接入协议的能力：没有模型可用。 */
    unsupported?: boolean;
    /** 作品类型；没有专项操作的视频工具按视频模型的参考上限挑模型。 */
    kind?: StudioKind;
    /** 视频专项是否允许一次生成多个。 */
    allowCount?: boolean;
    instruction: string;
    /** 多条指令时每条提交一个任务（多语言、全部角度）。 */
    variants?: string[];
    /** 用户自己写的补充说明，作品库「再次生成」时填回。 */
    userText: string;
    /** 工具选项（光线、目标语言等），做同款时一起填回。 */
    options: Record<string, string>;
    inputError: string;
    /** 必填槽位需要的最少素材数，用来挑选能放下这些素材的模型。 */
    minImages: number;
    minVideos?: number;
    minAudios?: number;
};

/** prompt 用于图片；videoPrompt 是视频用的精简版。 */
export type StudioBrandContext = { id: string; name: string; prompt: string; videoPrompt?: string };

export type StudioBrandKitLike = { id: string; name: string; intro?: string; audience?: string; tone?: string; slogan?: string; colors?: string[]; avoid?: string; typography?: string };

/**
 * 品牌套件编译成追加在提示词后的一段要求；空字段不输出。
 * 视频只带对画面有用的品牌色、调性和要避免的元素：视频模型写不好画面文字，口号、字体、长介绍只会干扰。
 */
export function studioBrandPrompt(kit: StudioBrandKitLike, kind: "image" | "video" = "image") {
    if (kind === "video") {
        const lines = [
            kit.tone?.trim() ? `品牌调性：${kit.tone.trim()}` : "",
            kit.colors?.length ? `品牌色：${kit.colors.join("、")}` : "",
            kit.avoid?.trim() ? `避免：${kit.avoid.trim()}` : "",
        ].filter(Boolean);
        return lines.length ? [`品牌：${kit.name.trim()}`, ...lines].join("\n") : "";
    }
    const lines = [
        kit.intro?.trim() ? `品牌介绍：${kit.intro.trim()}` : "",
        kit.audience?.trim() ? `目标人群：${kit.audience.trim()}` : "",
        kit.tone?.trim() ? `品牌调性：${kit.tone.trim()}` : "",
        kit.colors?.length ? `品牌色：${kit.colors.join("、")}` : "",
        kit.slogan?.trim() ? `品牌口号：${kit.slogan.trim()}（画面需要文字时使用）` : "",
        kit.typography?.trim() ? `字体规范：${kit.typography.trim()}（画面需要文字时遵循）` : "",
        kit.avoid?.trim() ? `避免：${kit.avoid.trim()}` : "",
    ].filter(Boolean);
    return [`品牌：${kit.name.trim()}`, ...lines].join("\n");
}

/** 实际发送的提示词：图片和视频在用户提示词后追加品牌要求。 */
export function studioFinalPrompt(state: Pick<StudioToolState, "kind" | "prompt" | "brand" | "specialty">) {
    // 专项工具的指令已包含用户补充说明，不再追加品牌，避免改动换背景、高清等结果的主体。
    if (state.specialty) return state.specialty.instruction.trim();
    const prompt = state.prompt.trim();
    if (!prompt || state.kind === "audio" || !state.brand) return prompt;
    const brand = state.kind === "video" ? (state.brand.videoPrompt ?? state.brand.prompt) : state.brand.prompt;
    return brand ? `${prompt}\n\n${brand}` : prompt;
}

export type StudioReferenceLimits = { maxImages: number; maxVideos: number; maxAudios: number; exclusiveImageAudio?: boolean };

/**
 * 品牌套件只在生成图片时提供（和 OpenArt 一致）。视频里放在参考区会让人以为能把品牌带进视频，
 * 实际视频模型对品牌信息的还原很有限，所以视频不显示也不追加品牌。
 */
export function studioBrandAvailable(kind: StudioKind, _limits?: Pick<StudioReferenceLimits, "maxImages">) {
    return kind === "image";
}

/** 专项工具只考虑支持该操作（视频）或能放下必需参考图（图片）的模型。 */
export function studioModelSupportsSpecialty(config: AiConfig, model: string, specialty: StudioSpecialtyState | undefined) {
    if (!specialty) return true;
    if (specialty.unsupported) return false;
    if (specialty.kind === "audio") {
        // 配音专项（声音克隆）靠参考音频复刻音色，只有豆包流式语音接受参考音频。
        const maxAudios = isDoubaoAudioConfig({ ...config, model, audioModel: model }) ? 3 : 0;
        return maxAudios >= (specialty.minAudios || 0);
    }
    const profile = modelCapabilityConfigFor(config, model);
    if (specialty.kind === "video" && !specialty.operation) {
        // 普通视频生成（智能分镜、世界漫游）：有必需图片时模型要能图生视频或参考生视频。
        const video = profile.video;
        if (!video) return false;
        if (!specialty.minImages) return true;
        return video.references.maxImages >= specialty.minImages && (video.operations.includes("image_to_video") || video.operations.includes("reference_to_video"));
    }
    if (specialty.operation) {
        const video = profile.video;
        if (!video?.operations.includes(specialty.operation)) return false;
        // 延长、编辑等要把原视频发给模型，模型必须能接收足够的参考视频和图片。
        return video.references.maxVideos >= (specialty.minVideos || 0) && video.references.maxImages >= specialty.minImages;
    }
    return (profile.image?.references.maxImages || 0) >= specialty.minImages;
}

/** 图片模型是否真的接受某个比例（参数化配置看 size 字段的取值，旧配置看比例列表）。 */
export function studioImageRatioSupported(config: AiConfig, model: string, ratio: string) {
    const profile = modelCapabilityConfigFor(config, model).image;
    if (!profile) return false;
    if (profile.parameters) {
        const field = profile.parameters.find((item) => item.name === "size" && item.enabled !== false);
        return Boolean(field && imageParameterAccepts(field, ratio));
    }
    return profile.size.allowCustom || profile.size.values.includes(ratio);
}

/** 图片模型的默认比例（参数化配置取 size 字段默认值）。 */
export function studioImageDefaultRatio(config: AiConfig, model: string) {
    const profile = modelCapabilityConfigFor(config, model).image;
    if (!profile) return "1:1";
    const field = profile.parameters?.find((item) => item.name === "size" && item.enabled !== false);
    return String(field?.default ?? profile.size.default ?? "1:1");
}

/** T1：只列出后台已开启的模型；记住的模型失效时回落到渠道默认模型，再回落到第一个。 */
export function studioPreferredModel(config: AiConfig, kind: StudioKind, remembered?: string, specialty?: StudioSpecialtyState) {
    const options = selectableModelsByCapability(config, kind).filter((model) => studioModelSupportsSpecialty(config, model, specialty));
    if (!options.length) return "";
    if (remembered && options.includes(remembered)) return remembered;
    const configured = kind === "image" ? config.imageModel : kind === "video" ? config.videoModel : config.audioModel;
    if (configured && options.includes(configured)) return configured;
    return options[0];
}

function attachmentCounts(attachments: CreationAttachment[]) {
    let imageCount = 0;
    let videoCount = 0;
    let audioCount = 0;
    for (const attachment of attachments) {
        const kind = creationAttachmentKind(attachment);
        if (kind === "image") imageCount += 1;
        else if (kind === "video") videoCount += 1;
        else if (kind === "audio") audioCount += 1;
    }
    return { imageCount, videoCount, audioCount };
}

/** 与创作页一致的模型需求：手动选择视频模式时，只有该模式实际用到的素材参与筛选和计价。 */
export function studioModelRequirements(config: AiConfig, state: StudioToolState): ModelRequirements {
    const counts = attachmentCounts(state.attachments);
    const used = state.specialty ? counts : videoModeUsedInput(state.kind === "video" ? state.video.mode : undefined, counts);
    const input = { textCount: state.specialty || state.prompt.trim() ? 1 : 0, ...used, characterCount: 0 };
    if (state.kind === "image") {
        const profile = modelCapabilityConfigFor(config, state.model).image!;
        const values = { ...config, size: state.image.ratio, imageResolution: state.image.imageResolution, quality: state.image.quality, count: String(state.count), imageParameters: state.image.imageParameters };
        return { capability: "image", input, imageSize: state.image.ratio, options: imageParameterRequest(profile, values) ?? { size: state.image.ratio, imageResolution: state.image.imageResolution, quality: state.image.quality, count: state.count, transparentBackground: config.transparentBackground === "true" } };
    }
    if (state.kind === "video") {
        return { capability: "video", input, videoSeconds: state.video.seconds, ...(state.specialty?.operation ? { videoOperation: state.specialty.operation } : { videoMode: state.video.mode }), options: { size: state.video.ratio, videoSeconds: Number(state.video.seconds), vquality: state.video.videoQuality } };
    }
    return { capability: "audio", input, options: {} };
}

/** 同名模型可能拆成多条路由，按素材选出真正兼容的那一条。 */
export function studioResolvedModel(config: AiConfig, state: StudioToolState) {
    if (!state.model) return "";
    return resolveCompatibleModel(config, state.model, studioModelRequirements(config, state)) || state.model;
}

/** T2：参考素材上限读模型能力。视频用整个模型组的上限，提交时再由兼容路由收窄。 */
export function studioReferenceLimits(config: AiConfig, state: StudioToolState, resolvedModel: string): StudioReferenceLimits {
    if (!resolvedModel) return { maxImages: 0, maxVideos: 0, maxAudios: 0 };
    if (state.kind === "image") {
        return { maxImages: modelCapabilityConfigFor(config, resolvedModel).image!.references.maxImages, maxVideos: 0, maxAudios: 0 };
    }
    if (state.kind === "video") {
        const limits: ModelReferenceLimits | undefined = modelGroupReferenceLimits(config, state.model || resolvedModel, "video");
        return { maxImages: limits?.maxImages || 0, maxVideos: limits?.maxVideos || 0, maxAudios: limits?.maxAudios || 0 };
    }
    // 豆包流式语音支持最多 3 段参考音频或 1 张参考图，两者不能混用；其他语音模型不接受参考素材。
    return isDoubaoAudioConfig({ ...config, model: resolvedModel, audioModel: resolvedModel }) ? { maxImages: 1, maxVideos: 0, maxAudios: 3, exclusiveImageAudio: true } : { maxImages: 0, maxVideos: 0, maxAudios: 0 };
}

export type StudioAttachmentAdmission = { accepted: CreationAttachment[]; rejected: CreationAttachment[]; reason?: string };

/** 加入新素材时按上限截断，返回被拒绝的素材和原因；已有素材顺序不变。 */
export function admitStudioAttachments(current: CreationAttachment[], incoming: CreationAttachment[], limits: StudioReferenceLimits): StudioAttachmentAdmission {
    const accepted = [...current];
    const rejected: CreationAttachment[] = [];
    let reason: string | undefined;
    for (const attachment of incoming) {
        if (accepted.some((item) => item.id === attachment.id)) continue;
        const kind = creationAttachmentKind(attachment);
        const counts = attachmentCounts(accepted);
        const limit = kind === "image" ? limits.maxImages : kind === "video" ? limits.maxVideos : kind === "audio" ? limits.maxAudios : 0;
        const used = kind === "image" ? counts.imageCount : kind === "video" ? counts.videoCount : kind === "audio" ? counts.audioCount : 0;
        const label = kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文件";
        if (limit <= 0) {
            rejected.push(attachment);
            reason = `当前模型不支持${label}参考`;
            continue;
        }
        if (limits.exclusiveImageAudio && ((kind === "image" && counts.audioCount > 0) || (kind === "audio" && counts.imageCount > 0))) {
            rejected.push(attachment);
            reason = "当前模型的参考图片和参考音频不能同时使用";
            continue;
        }
        if (used >= limit) {
            rejected.push(attachment);
            reason = `当前模型最多 ${limit} 个${label}参考`;
            continue;
        }
        accepted.push(attachment);
    }
    return { accepted, rejected, reason };
}

/** T3：换模型后超出上限的素材不发送，但保留在面板里。返回不会发送的素材 ID。 */
export function studioOverflowAttachmentIds(attachments: CreationAttachment[], limits: StudioReferenceLimits) {
    const seen = { image: 0, video: 0, audio: 0 };
    const overflow = new Set<string>();
    for (const attachment of attachments) {
        const kind = creationAttachmentKind(attachment);
        if (kind === "file") {
            overflow.add(attachment.id);
            continue;
        }
        seen[kind] += 1;
        const limit = kind === "image" ? limits.maxImages : kind === "video" ? limits.maxVideos : limits.maxAudios;
        if (seen[kind] > limit) overflow.add(attachment.id);
    }
    return overflow;
}

/** 提交用的完整配置，与创作页、画布使用同一套参数规范化。 */
export function studioGenerationConfig(config: AiConfig, state: StudioToolState, model: string): AiConfig {
    if (state.kind === "image") {
        const profile = modelCapabilityConfigFor(config, model).image!;
        const raw = { size: state.image.ratio, quality: state.image.quality, imageResolution: state.image.imageResolution, imageParameters: state.image.imageParameters, count: "1" };
        const normalized = profile.parameters ? raw : normalizeImageValue(profile, raw, resolveModelRequestConfig(config, model).interfaceType);
        return {
            ...config,
            model,
            imageModel: model,
            size: normalized.size || state.image.ratio,
            quality: normalized.quality || state.image.quality,
            imageResolution: normalized.imageResolution || state.image.imageResolution,
            imageParameters: normalized.imageParameters || state.image.imageParameters,
            count: "1",
        };
    }
    if (state.kind === "video") {
        const base = creationVideoConfig(config, model, { ratio: state.video.ratio, seconds: state.video.seconds, videoQuality: state.video.videoQuality });
        return { ...base, ...resolveModelVideoBooleanOptions(config, model, { videoGenerateAudio: state.video.generateAudio ? "true" : "false" }, { videoWatermark: config.videoWatermark }) };
    }
    return { ...config, model, audioModel: model, audioVoice: state.audio.voice, audioFormat: state.audio.format, audioSpeed: state.audio.speed };
}

/** 视频生效模式：手动选择优先，否则按素材推断，和创作页显示一致。 */
export function studioEffectiveVideoMode(state: StudioToolState): VideoMode {
    if (state.video.mode) return state.video.mode;
    const operation = inferVideoOperation({ textCount: 1, ...attachmentCounts(state.attachments), characterCount: 0 });
    return operation === "text_to_video" || operation === "image_to_video" ? operation : "reference_to_video";
}

export type StudioBlockContext = {
    loggedIn: boolean;
    creditsEnabled: boolean;
    availableCredits: number | null;
    cost: number | null;
};

/** T4、T7、T8：生成按钮置灰的原因。返回空字符串表示可以提交。顺序即提示优先级。 */
export function studioBlockReason(config: AiConfig, state: StudioToolState, model: string, context: StudioBlockContext) {
    if (!context.loggedIn) return "请先登录";
    if (!model) return state.specialty ? `后台还没有支持「${state.specialty.operationLabel}」的模型，请管理员在模型能力里开启` : "后台还没有可用的模型";
    if (state.specialty?.inputError) return state.specialty.inputError;
    const prompt = studioFinalPrompt(state);
    if (!prompt) return state.kind === "audio" ? "请输入要朗读的文案" : "请输入提示词";
    if (state.kind === "image" || state.kind === "video") {
        const lengthError = modelPromptLengthError(config, model, state.kind, prompt);
        if (lengthError) return lengthError;
    }
    if (state.kind === "video") {
        const profile = modelCapabilityConfigFor(config, model).video!;
        if (!videoDurationAllowed(profile, Number(state.video.seconds))) return "当前模型不支持所选视频时长";
        if (state.video.mode && !state.specialty) {
            const counts = attachmentCounts(state.attachments);
            const error = videoModeInputError(state.video.mode, counts);
            if (error) return error;
        }
    }
    if (context.creditsEnabled && context.cost !== null && context.availableCredits !== null && context.cost > context.availableCredits) {
        const missing = Math.ceil((context.cost - context.availableCredits) * 100) / 100;
        return `积分不足，还差 ${missing.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
    }
    return "";
}

export type StudioSubmission = {
    mode: StudioKind;
    prompt: string;
    config: AiConfig;
    count: number;
    referenceImages: ReturnType<typeof splitCreationAttachments>["referenceImages"];
    referenceVideos: ReturnType<typeof splitCreationAttachments>["referenceVideos"];
    referenceAudios: ReturnType<typeof splitCreationAttachments>["referenceAudios"];
    metadata: Record<string, unknown>;
};

/** 组装一次提交。超出上限的素材、当前视频模式不用的素材都不发送。 */
export function studioSubmission(config: AiConfig, state: StudioToolState, model: string, limits: StudioReferenceLimits): StudioSubmission {
    const overflow = studioOverflowAttachmentIds(state.attachments, limits);
    const sendable = state.attachments.filter((attachment) => !overflow.has(attachment.id));
    const split = splitCreationAttachments(sendable);
    const generationConfig = studioGenerationConfig(config, state, model);
    const metadata: Record<string, unknown> = { source: "studio", studioTool: state.tool };
    const finalPrompt = studioFinalPrompt(state);
    if (state.specialty) {
        metadata.studioPrompt = state.specialty.userText.trim();
        if (Object.keys(state.specialty.options).length) metadata.specialtyOptions = state.specialty.options;
    } else if (state.kind !== "audio" && state.brand && finalPrompt !== state.prompt.trim()) {
        metadata.brandKitId = state.brand.id;
        metadata.studioPrompt = state.prompt.trim();
    }
    const videoCount = state.specialty && !state.specialty.allowCount ? 1 : Math.max(1, Math.min(studioMaxCount(config, "video", model), Math.floor(state.count) || 1));
    if (state.kind === "video" && state.specialty?.operation) {
        // 专项操作按槽位顺序发送全部素材，不走视频模式的素材挑选。
        metadata.videoEditOperation = state.specialty.operation;
        return { mode: "video", prompt: finalPrompt, config: generationConfig, count: videoCount, referenceImages: split.referenceImages, referenceVideos: split.referenceVideos, referenceAudios: split.referenceAudios, metadata };
    }
    if (state.kind === "video") {
        const mode = state.video.mode;
        const referenceImages = applyVideoModeImageRoles(mode, pickVideoModeMaterials(mode, "image", split.referenceImages));
        const referenceVideos = pickVideoModeMaterials(mode, "video", split.referenceVideos);
        const referenceAudios = pickVideoModeMaterials(mode, "audio", split.referenceAudios);
        const operation = mode ? videoModeOperation(mode) : inferVideoOperation({ textCount: 1, imageCount: referenceImages.length, videoCount: referenceVideos.length, audioCount: referenceAudios.length, characterCount: 0 });
        if (mode) metadata.videoMode = mode;
        metadata.videoEditOperation = operation;
        return { mode: "video", prompt: finalPrompt, config: generationConfig, count: videoCount, referenceImages, referenceVideos, referenceAudios, metadata };
    }
    if (state.kind === "image") {
        const maxOutputs = modelCapabilityConfigFor(config, model).image!.maxOutputs;
        const count = Math.max(1, Math.min(maxOutputs || 1, Math.floor(state.count) || 1));
        return { mode: "image", prompt: finalPrompt, config: generationConfig, count, referenceImages: split.referenceImages, referenceVideos: [], referenceAudios: [], metadata };
    }
    const prompt = audioGenerationPrompt(generationConfig, state.specialty ? finalPrompt : state.prompt.trim(), split.referenceAudios.length, split.referenceImages.length);
    return { mode: "audio", prompt, config: generationConfig, count: 1, referenceImages: split.referenceImages, referenceVideos: [], referenceAudios: split.referenceAudios, metadata };
}

/** 生成按钮上的数量上限：图片按模型最多出图数；视频最多 8 个（每个一个任务）；配音固定 1。 */
export function studioMaxCount(config: AiConfig, kind: StudioKind, model: string) {
    if (!model || kind === "audio") return 1;
    if (kind === "video") return 8;
    return Math.max(1, Math.min(8, modelCapabilityConfigFor(config, model).image!.maxOutputs || 1));
}
