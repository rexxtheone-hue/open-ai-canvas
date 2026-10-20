import type { VideoCapabilityConfig } from "./model-capabilities";

const MB = 1024 * 1024;

// 与后端 model_family_defaults.go 保持一致：这些协议已有逐项默认值，按模型名推断只用于插件和聚合渠道协议。
const PROTOCOL_OWNED_VIDEO_DEFAULTS = new Set([
    "volcengine-jimeng-video",
    "gemini-veo",
    "volcengine-ark-video",
    "volcengine-ark-agent-plan-video",
    "newapi-channel-1",
    "newapi-channel-2",
    "newapi",
    "xai-video",
    "novita-video",
    "minimax-video",
    "agnes-video",
]);

const STANDARD_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

function setReferences(video: VideoCapabilityConfig, images: number, imageMB: number, videos: number, videoMB: number, videoSeconds: number, audios: number, audioMB: number, audioSeconds: number) {
    Object.assign(video.references, {
        maxImages: images,
        maxImageBytes: imageMB * MB,
        maxVideos: videos,
        maxVideoBytes: videoMB * MB,
        maxVideoDurationSeconds: videoSeconds,
        maxAudios: audios,
        maxAudioBytes: audioMB * MB,
        maxAudioDurationSeconds: audioSeconds,
    });
}

function addOperations(video: VideoCapabilityConfig, ...operations: VideoCapabilityConfig["operations"]) {
    for (const operation of operations) if (!video.operations.includes(operation)) video.operations.push(operation);
}

const range = (min: number, max: number, value: number): VideoCapabilityConfig["duration"] => ({ selection: "range", min, max, step: 1, default: value });
const choices = (value: number, ...values: number[]): VideoCapabilityConfig["duration"] => ({ selection: "enum", values, default: value });

/** 按模型名识别常见视频模型家族（Seedance、Kling、MiniMax、Veo、Sora、万相），返回是否命中。 */
export function applyModelFamilyVideoDefaults(video: VideoCapabilityConfig, protocol: string | undefined, modelName: string) {
    if (protocol && PROTOCOL_OWNED_VIDEO_DEFAULTS.has(protocol.trim())) return false;
    const name = modelName.trim().toLowerCase();
    const has = (...parts: string[]) => parts.some((part) => name.includes(part));
    if (has("seedance-2", "seedance2", "seedance-v2")) {
        setReferences(video, 9, 30, 3, 50, 15, 3, 15, 15);
        video.duration = range(4, 15, 5);
        video.ratios = ["adaptive", ...STANDARD_RATIOS];
        video.defaultRatio = "16:9";
        video.resolutions = ["480p", "720p", "1080p"];
        video.defaultResolution = "720p";
        video.generateAudio = { supported: true, default: true };
        video.watermark = { supported: true, default: false };
        addOperations(video, "reference_to_video", "audio_to_video");
    } else if (has("seedance-1", "seedance1")) {
        setReferences(video, 2, 30, 0, 0, 0, 0, 0, 0);
        video.duration = range(2, 12, 5);
        video.resolutions = ["480p", "720p", "1080p"];
        video.defaultResolution = "720p";
        const audio = has("1.5", "1-5");
        video.generateAudio = { supported: audio, default: audio };
        video.watermark = { supported: true, default: false };
    } else if (has("kling")) {
        setReferences(video, 7, 10, 1, 200, 10, 0, 0, 0);
        video.duration = has("v3") ? range(3, 15, 5) : range(3, 10, 5);
        video.resolutions = has("v3") ? ["720p", "1080p", "4k"] : ["720p", "1080p"];
        video.defaultResolution = "1080p";
        video.ratios = ["16:9", "9:16", "1:1"];
        video.defaultRatio = "16:9";
        video.generateAudio = { supported: true, default: false };
        addOperations(video, "reference_to_video");
    } else if (has("minimax-h3", "minimax_h3")) {
        video.ratios = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
        video.defaultRatio = "16:9";
        if (has("max")) {
            setReferences(video, 2, 30, 0, 0, 0, 0, 0, 0);
            video.duration = range(5, 15, 5);
            video.resolutions = ["480P", "768P"];
        } else {
            setReferences(video, 9, 30, 3, 50, 15, 3, 15, 15);
            video.duration = range(4, 15, 5);
            video.resolutions = ["768P", "2K"];
            addOperations(video, "reference_to_video");
        }
        video.defaultResolution = "768P";
    } else if (has("hailuo")) {
        setReferences(video, 2, 20, 0, 0, 0, 0, 0, 0);
        video.duration = choices(6, 6, 10);
        video.resolutions = ["768P", "1080P"];
        video.defaultResolution = "768P";
    } else if (has("veo-3", "veo3")) {
        setReferences(video, 2, 20, 0, 0, 0, 0, 0, 0);
        video.duration = choices(8, 4, 6, 8);
        video.ratios = ["16:9", "9:16"];
        video.defaultRatio = "16:9";
        video.resolutions = ["720p", "1080p"];
        video.defaultResolution = "720p";
        video.generateAudio = { supported: true, default: true };
    } else if (has("sora-2", "sora2")) {
        setReferences(video, 1, 20, 0, 0, 0, 0, 0, 0);
        video.duration = choices(4, 4, 8, 12);
        video.ratios = ["16:9", "9:16"];
        video.defaultRatio = "16:9";
        video.resolutions = ["720p"];
        video.defaultResolution = "720p";
    } else if (has("wan3", "wan-3")) {
        setReferences(video, 10, 20, 3, 100, 15, 1, 15, 30);
        video.duration = range(2, 15, 5);
        video.ratios = ["adaptive", ...STANDARD_RATIOS.slice(0, 5)];
        video.defaultRatio = "16:9";
        video.resolutions = ["480p", "720p", "1080p"];
        video.defaultResolution = "1080p";
        video.generateAudio = { supported: true, default: false };
        video.watermark = { supported: true, default: false };
        addOperations(video, "reference_to_video");
    } else if (has("wan2.7", "wan2-7")) {
        setReferences(video, 5, 20, 1, 100, 10, 1, 15, 30);
        video.duration = range(2, 15, 5);
        video.ratios = STANDARD_RATIOS.slice(0, 5);
        video.defaultRatio = "16:9";
        video.resolutions = ["720p", "1080p"];
        video.defaultResolution = "1080p";
        video.watermark = { supported: true, default: false };
        addOperations(video, "reference_to_video");
    } else if (has("wan2.6", "wan2-6")) {
        setReferences(video, 1, 20, 0, 0, 0, 1, 15, 30);
        video.duration = choices(5, 5, 10, 15);
        video.resolutions = ["720p", "1080p"];
        video.defaultResolution = "1080p";
    } else if (has("wan2.5", "wan2-5")) {
        setReferences(video, 1, 20, 0, 0, 0, 1, 15, 30);
        video.duration = choices(5, 5, 10);
        video.resolutions = ["480p", "720p", "1080p"];
        video.defaultResolution = "1080p";
    } else if (has("wan2.2", "wan2-2")) {
        setReferences(video, 2, 20, 0, 0, 0, 0, 0, 0);
        video.duration = choices(5, 5, 8);
        video.resolutions = ["480p", "720p"];
        video.defaultResolution = "720p";
    } else {
        return false;
    }
    return true;
}
