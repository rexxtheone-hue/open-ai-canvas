import { captureVideoFrames } from "@/lib/canvas/canvas-video-frame";
import type { ReferenceImage } from "@/types/image";
import { studioChatAttachmentToCreation, type StudioChatAttachment } from "./studio-chat";

const VIDEO_FRAMES = 6;
const FRAME_MAX_EDGE = 768;

export type StudioChatVisionInput = { images: ReferenceImage[]; notes: string[] };

/**
 * 把本轮附件交给对话模型：图片直接发送；视频在浏览器里按时间平均截几帧当图片，
 * 因为目前的文字模型都不收视频（Claude 本身也不支持），截帧也看不到连续动作、听不到声音。
 * labels 与 attachments 一一对应，是对话里的素材编号，例如「#2 视频」。
 */
export async function studioChatVisionInputs(attachments: StudioChatAttachment[], labels: string[], maxImages: number): Promise<StudioChatVisionInput> {
    const images: ReferenceImage[] = [];
    const notes: string[] = [];
    for (const [index, item] of attachments.entries()) {
        const label = labels[index] || item.name;
        const room = maxImages - images.length;
        if (item.kind === "audio") {
            notes.push(`${label} 是音频，你听不到内容；需要时请让用户提供文字稿。`);
            continue;
        }
        if (room <= 0) {
            notes.push(`${label} 超出当前模型一次能看的图片数量，没有附上。`);
            continue;
        }
        if (item.kind === "image") {
            const creation = studioChatAttachmentToCreation(item) as ReferenceImage & { previewUrl?: string };
            images.push({ id: creation.id, name: creation.name, type: creation.type, dataUrl: creation.dataUrl, url: creation.url, storageKey: creation.storageKey, width: creation.width, height: creation.height });
            notes.push(`${label} 是附上的第 ${images.length} 张图片。`);
            continue;
        }
        try {
            const frames = await videoFrames(item, Math.min(VIDEO_FRAMES, room));
            const first = images.length + 1;
            images.push(...frames.map((frame, frameIndex) => ({ id: `${item.id}:frame:${frameIndex}`, name: `${item.name} ${formatSeconds(frame.timeMs)}`, type: "image/jpeg", dataUrl: frame.dataUrl, width: frame.width, height: frame.height })));
            notes.push(`${label} 是视频${item.durationMs ? `（约 ${formatSeconds(item.durationMs)}）` : ""}，已按时间顺序截成第 ${first}–${images.length} 张图片（${frames.map((frame) => formatSeconds(frame.timeMs)).join("、")}）。你看不到帧与帧之间的动作，也听不到声音和对白；分析对白、配音或台词时请先向用户确认。`);
        } catch {
            notes.push(`${label} 是视频，但画面读取失败，你看不到内容；请让用户描述视频内容。`);
        }
    }
    return { images, notes };
}

async function videoFrames(item: StudioChatAttachment, count: number) {
    const url = studioChatAttachmentToCreation(item).url || item.url;
    const durationMs = item.durationMs || (await readDurationMs(url));
    // 避开片头片尾的黑场：取 5%–95% 之间平均分布的时间点。
    const times = Array.from({ length: count }, (_, index) => Math.round(durationMs * (0.05 + (0.9 * index) / Math.max(1, count - 1))));
    const result = await captureVideoFrames(url, count === 1 ? [Math.round(durationMs / 2)] : times);
    if (!result.frames.length) throw new Error("no frames");
    return Promise.all(result.frames.map(async (frame) => ({ timeMs: frame.timeMs, ...(await shrinkToJpeg(frame.blob)) })));
}

function readDurationMs(url: string) {
    return new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => (Number.isFinite(video.duration) && video.duration > 0 ? resolve(video.duration * 1000) : reject(new Error("unknown duration")));
        video.onerror = () => reject(new Error("video metadata failed"));
        video.src = url;
    });
}

async function shrinkToJpeg(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), width, height };
}

function formatSeconds(ms: number) {
    return `${(ms / 1000).toFixed(1)} 秒`;
}
