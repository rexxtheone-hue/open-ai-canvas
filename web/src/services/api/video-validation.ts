import { modelCapabilityConfigFor, videoDurationAllowed, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { resolveModelRequestConfig } from "@/stores/use-config-store";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { ReferenceImage } from "@/types/image";

import type { ResolvedAiConfig } from "./video-contracts";

type TimedMedia = { durationMs?: number };

const totalSeconds = (items: TimedMedia[]) => items.reduce((sum, item) => sum + (item.durationMs || 0), 0) / 1000;

/** 参考素材合计时长超限时返回提示，与后端 videoReferenceTotalError 保持一致；没问题返回空字符串。 */
export function videoReferenceTotalError(profile: VideoCapabilityConfig, videos: TimedMedia[], audios: TimedMedia[], outputSeconds: number) {
    const refs = profile.references;
    const videoSeconds = totalSeconds(videos);
    const audioSeconds = totalSeconds(audios);
    if (refs.maxTotalVideoDurationSeconds && videoSeconds > refs.maxTotalVideoDurationSeconds + 0.1) return `参考视频合计 ${videoSeconds.toFixed(1)} 秒，当前模型最多 ${refs.maxTotalVideoDurationSeconds} 秒，请剪短或删掉一段`;
    if (refs.maxTotalAudioDurationSeconds && audioSeconds > refs.maxTotalAudioDurationSeconds + 0.1) return `参考音频合计 ${audioSeconds.toFixed(1)} 秒，当前模型最多 ${refs.maxTotalAudioDurationSeconds} 秒，请剪短或删掉一段`;
    if (refs.maxCombinedVideoDurationSeconds && videoSeconds > 0 && videoSeconds + outputSeconds > refs.maxCombinedVideoDurationSeconds + 0.1) return `参考视频 ${videoSeconds.toFixed(1)} 秒加输出 ${outputSeconds} 秒超过当前模型的 ${refs.maxCombinedVideoDurationSeconds} 秒上限，请缩短输出时长或参考视频`;
    return "";
}

type ReferenceMedia = TimedMedia & { name?: string; type?: string; mimeType?: string; url?: string; width?: number; height?: number };

const MIME_FORMATS: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/pjpeg": "jpg",
    "video/quicktime": "mov", "video/x-matroska": "mkv", "video/3gpp": "3gp",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/x-mpeg": "mp3", "audio/mpeg3": "mp3",
    "audio/x-wav": "wav", "audio/wave": "wav", "audio/vnd.wave": "wav", "audio/x-pn-wav": "wav",
    "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac", "audio/x-aac": "aac",
};

const normalizeFormat = (value: string) => {
    const format = value.trim().replace(/^\./, "").toLowerCase();
    return format === "jpeg" ? "jpg" : format;
};

/** 优先按 MIME 判断文件格式，取不到再看文件名或地址的扩展名；与后端 referenceMediaFormat 一致。 */
export function referenceMediaFormat(media: ReferenceMedia) {
    for (const raw of [media.mimeType, media.type]) {
        const mime = (raw || "").split(";")[0].trim().toLowerCase();
        if (MIME_FORMATS[mime]) return MIME_FORMATS[mime];
        const subtype = mime.includes("/") ? mime.slice(mime.indexOf("/") + 1) : "";
        if (subtype && subtype !== "octet-stream" && !subtype.includes("*")) return normalizeFormat(subtype.replace(/^x-/, ""));
    }
    for (const name of [media.name || "", (media.url || "").split("?")[0].split("#")[0]]) {
        const dot = name.lastIndexOf(".");
        if (dot >= 0 && dot > name.lastIndexOf("/") && name.length - dot <= 6) return normalizeFormat(name.slice(dot + 1));
    }
    return "";
}

const mediaLabel = (kind: string, media: ReferenceMedia, index: number) => (media.name?.trim() ? `参考${kind}「${media.name.trim()}」` : `第 ${index + 1} 个参考${kind}`);

export function formatError(kind: string, items: ReferenceMedia[], allowed?: string[]) {
    if (!allowed?.length) return "";
    const names = allowed.map((item) => normalizeFormat(item).toUpperCase()).join("、");
    for (const [index, media] of items.entries()) {
        const format = referenceMediaFormat(media);
        if (format && !allowed.some((item) => normalizeFormat(item) === format)) return `${mediaLabel(kind, media, index)}是 ${format.toUpperCase()} 格式，当前模型只支持 ${names}，请转换后再上传`;
    }
    return "";
}

function minDurationError(kind: string, items: ReferenceMedia[], minSeconds?: number) {
    if (!minSeconds) return "";
    for (const [index, media] of items.entries()) {
        if (media.durationMs && media.durationMs < minSeconds * 1000 - 100) return `${mediaLabel(kind, media, index)}只有 ${(media.durationMs / 1000).toFixed(1)} 秒，当前模型每段至少 ${minSeconds} 秒`;
    }
    return "";
}

export function pixelError(kind: string, items: ReferenceMedia[], minSide = 0, maxLong = 0, maxShort = 0, maxAspect = 0) {
    for (const [index, media] of items.entries()) {
        const { width = 0, height = 0 } = media;
        if (width <= 0 || height <= 0) continue;
        const short = Math.min(width, height);
        const long = Math.max(width, height);
        const label = mediaLabel(kind, media, index);
        if (minSide && short < minSide) return `${label}尺寸 ${width}x${height} 太小，当前模型要求短边至少 ${minSide} 像素`;
        if (maxLong && long > maxLong) return `${label}尺寸 ${width}x${height} 太大，当前模型要求长边最多 ${maxLong} 像素，请缩小后再上传`;
        if (maxShort && short > maxShort) return `${label}尺寸 ${width}x${height} 太大，当前模型要求短边最多 ${maxShort} 像素，请缩小后再上传`;
        if (maxAspect && long / short > maxAspect + 0.01) return `${label}比例 ${width}x${height} 太长或太窄，当前模型要求长宽比不超过 ${maxAspect}:1`;
    }
    return "";
}

/** 参考素材的格式、最短时长、像素尺寸问题，与后端 videoReferenceMediaError 保持一致；没问题返回空字符串。 */
export function videoReferenceMediaError(profile: VideoCapabilityConfig, images: ReferenceMedia[], videos: ReferenceMedia[], audios: ReferenceMedia[]) {
    const refs = profile.references;
    return (
        formatError("图片", images, refs.imageFormats) ||
        formatError("视频", videos, refs.videoFormats) ||
        formatError("音频", audios, refs.audioFormats) ||
        minDurationError("视频", videos, refs.minVideoDurationSeconds) ||
        minDurationError("音频", audios, refs.minAudioDurationSeconds) ||
        pixelError("图片", images, refs.minImageSidePixels, refs.maxImageLongSidePixels, refs.maxImageShortSidePixels, refs.maxImageAspectRatio) ||
        pixelError("视频", videos, refs.minVideoSidePixels, refs.maxVideoLongSidePixels, refs.maxVideoShortSidePixels, refs.maxVideoAspectRatio)
    );
}

/** 单个参考素材的数量、大小、时长问题；没问题返回空字符串。Studio 提交前用它提示，提交时用它拦截。 */
export function videoReferenceError(profile: VideoCapabilityConfig, images: (ReferenceMedia & { bytes?: number })[], videos: (ReferenceMedia & { bytes?: number })[], audios: (ReferenceMedia & { bytes?: number })[], outputSeconds: number) {
    const refs = profile.references;
    if (images.length > refs.maxImages || videos.length > refs.maxVideos || audios.length > refs.maxAudios) return "参考素材数量超过当前模型限制";
    if (refs.maxImageBytes > 0 && images.some((image) => (image.bytes || 0) > refs.maxImageBytes)) return `参考图片超过 ${Math.round(refs.maxImageBytes / 1024 / 1024)} MB，当前模型放不下`;
    if (refs.maxVideoBytes > 0 && videos.some((video) => (video.bytes || 0) > refs.maxVideoBytes)) return `参考视频超过 ${Math.round(refs.maxVideoBytes / 1024 / 1024)} MB，当前模型放不下`;
    if (refs.maxVideoDurationSeconds > 0 && videos.some((video) => (video.durationMs || 0) > refs.maxVideoDurationSeconds * 1000 + 100)) return `单段参考视频最长 ${refs.maxVideoDurationSeconds} 秒，请剪短`;
    if (refs.maxAudioBytes > 0 && audios.some((audio) => (audio.bytes || 0) > refs.maxAudioBytes)) return `参考音频超过 ${Math.round(refs.maxAudioBytes / 1024 / 1024)} MB，当前模型放不下`;
    if (refs.maxAudioDurationSeconds > 0 && audios.some((audio) => (audio.durationMs || 0) > refs.maxAudioDurationSeconds * 1000 + 100)) return `单段参考音频最长 ${refs.maxAudioDurationSeconds} 秒，请剪短`;
    return videoReferenceTotalError(profile, videos, audios, outputSeconds) || videoReferenceMediaError(profile, images, videos, audios);
}

export function assertVideoCapability(
    profile: NonNullable<ReturnType<typeof modelCapabilityConfigFor>["video"]>,
    references: ReferenceImage[],
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    seconds: string,
) {
    if (references.length > profile.references.maxImages || videoReferences.length > profile.references.maxVideos || audioReferences.length > profile.references.maxAudios) throw new Error("参考素材数量超过当前模型限制");
    if (references.length < profile.references.minImages) throw new Error(`当前视频模型至少需要 ${profile.references.minImages} 张参考图`);
    if (!videoDurationAllowed(profile, Number(seconds))) throw new Error("视频时长不在当前模型支持范围内");
    if (profile.references.maxImageBytes > 0 && references.some((image) => (image.bytes || 0) > profile.references.maxImageBytes)) throw new Error("参考图片文件超过当前模型大小限制");
    for (const video of videoReferences) {
        if (profile.references.maxVideoBytes > 0 && (video.bytes || 0) > profile.references.maxVideoBytes) throw new Error("参考视频文件超过当前模型大小限制");
        if (profile.references.maxVideoDurationSeconds > 0 && (video.durationMs || 0) > profile.references.maxVideoDurationSeconds * 1000) throw new Error("参考视频时长超过当前模型限制");
    }
    for (const audio of audioReferences) {
        if (profile.references.maxAudioBytes > 0 && (audio.bytes || 0) > profile.references.maxAudioBytes) throw new Error("参考音频文件超过当前模型大小限制");
        if (profile.references.maxAudioDurationSeconds > 0 && (audio.durationMs || 0) > profile.references.maxAudioDurationSeconds * 1000) throw new Error("参考音频时长超过当前模型限制");
    }
    const totalError = videoReferenceTotalError(profile, videoReferences, audioReferences, Number(seconds) || 0) || videoReferenceMediaError(profile, references, videoReferences, audioReferences);
    if (totalError) throw new Error(totalError);
}

export function assertVideoConfig(config: ResolvedAiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini" && config.interfaceType !== "gemini-veo") throw new Error("当前 Gemini 文本协议不支持视频生成，请为该模型选择 Gemini Veo 协议");
}

export function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, seconds));
}

export function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = (value || "1280x720").trim().toLowerCase().replace("×", "x");
    if (/^\d+x\d+$/.test(size)) return size;
    const ratio = size.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!ratio) return "1280x720";
    const widthRatio = Number(ratio[1]);
    const heightRatio = Number(ratio[2]);
    if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) return "1280x720";
    const aspect = widthRatio / heightRatio;
    const width = aspect >= 1 ? 1280 : Math.max(256, Math.round((720 * aspect) / 2) * 2);
    const height = aspect >= 1 ? Math.max(256, Math.round((1280 / aspect) / 2) * 2) : 720;
    return `${width}x${height}`;
}

export function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    if (value.toLowerCase() === "2k") return "1440p";
    if (value.toLowerCase() === "4k") return "2160p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

export function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}
