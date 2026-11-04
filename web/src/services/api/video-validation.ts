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

/** 单个参考素材的数量、大小、时长问题；没问题返回空字符串。Studio 提交前用它提示，提交时用它拦截。 */
export function videoReferenceError(profile: VideoCapabilityConfig, images: { bytes?: number }[], videos: (TimedMedia & { bytes?: number })[], audios: (TimedMedia & { bytes?: number })[], outputSeconds: number) {
    const refs = profile.references;
    if (images.length > refs.maxImages || videos.length > refs.maxVideos || audios.length > refs.maxAudios) return "参考素材数量超过当前模型限制";
    if (refs.maxImageBytes > 0 && images.some((image) => (image.bytes || 0) > refs.maxImageBytes)) return `参考图片超过 ${Math.round(refs.maxImageBytes / 1024 / 1024)} MB，当前模型放不下`;
    if (refs.maxVideoBytes > 0 && videos.some((video) => (video.bytes || 0) > refs.maxVideoBytes)) return `参考视频超过 ${Math.round(refs.maxVideoBytes / 1024 / 1024)} MB，当前模型放不下`;
    if (refs.maxVideoDurationSeconds > 0 && videos.some((video) => (video.durationMs || 0) > refs.maxVideoDurationSeconds * 1000 + 100)) return `单段参考视频最长 ${refs.maxVideoDurationSeconds} 秒，请剪短`;
    if (refs.maxAudioBytes > 0 && audios.some((audio) => (audio.bytes || 0) > refs.maxAudioBytes)) return `参考音频超过 ${Math.round(refs.maxAudioBytes / 1024 / 1024)} MB，当前模型放不下`;
    if (refs.maxAudioDurationSeconds > 0 && audios.some((audio) => (audio.durationMs || 0) > refs.maxAudioDurationSeconds * 1000 + 100)) return `单段参考音频最长 ${refs.maxAudioDurationSeconds} 秒，请剪短`;
    return videoReferenceTotalError(profile, videos, audios, outputSeconds);
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
    const totalError = videoReferenceTotalError(profile, videoReferences, audioReferences, Number(seconds) || 0);
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
