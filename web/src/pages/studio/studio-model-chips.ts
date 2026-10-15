import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { SPECIALTY_VIDEO_OPERATIONS } from "@/lib/video-modes";
import type { AiConfig } from "@/stores/use-config-store";
import type { StudioKind } from "@/services/api/studio";

function range(values: string[]) {
    const clean = values.filter(Boolean);
    if (!clean.length) return "";
    return clean.length === 1 ? clean[0] : `${clean[0]}-${clean[clean.length - 1]}`;
}

/** 模型列表上的能力标签：参考、首尾帧、音频、分辨率、时长等，全部读模型能力配置。 */
export function studioModelChips(config: AiConfig, model: string, kind: StudioKind) {
    const profile = modelCapabilityConfigFor(config, model);
    const chips: string[] = [];
    if (kind === "video" && profile.video) {
        const video = profile.video;
        if (video.operations.includes("reference_to_video")) chips.push("全能参考");
        if (video.operations.includes("image_to_video") && video.references.maxImages >= 2) chips.push("首尾帧");
        else if (video.operations.includes("image_to_video")) chips.push("图生视频");
        if (video.generateAudio.supported) chips.push("音频");
        for (const item of SPECIALTY_VIDEO_OPERATIONS) if (video.operations.includes(item.value)) chips.push(item.label);
        const resolution = range(video.resolutions.map((value) => value.toLowerCase().replace(/^(\d+)$/, "$1p")));
        if (resolution) chips.push(resolution);
        const duration = video.duration.selection === "enum" ? range((video.duration.values || []).map(String)) : video.duration.min && video.duration.max ? `${video.duration.min}-${video.duration.max}` : "";
        if (duration) chips.push(`${duration}s`);
    }
    if (kind === "image" && profile.image) {
        const image = profile.image;
        if (image.references.maxImages > 0) chips.push(`参考图 ×${image.references.maxImages}`);
        if (image.resolution.supported) {
            const resolution = range(image.resolution.values.filter((value) => value !== "auto"));
            if (resolution) chips.push(resolution);
        }
        if (image.maxOutputs > 1) chips.push(`最多 ${image.maxOutputs} 张`);
    }
    return chips;
}
