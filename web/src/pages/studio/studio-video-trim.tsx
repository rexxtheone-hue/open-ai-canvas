import { useEffect, useRef, useState } from "react";
import { App, Slider } from "antd";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { trimVideoSegment } from "@/lib/canvas/canvas-video-segment";
import { Loader2 } from "./studio-icons";

/**
 * 上传视频时裁剪：当前模型的参考视频有时长上限，超过上限的视频先选一段，在浏览器里剪好再上传。
 * 页面按所选模型设置上限；上传入口（素材面板、拖拽、文件按钮）统一走 uploadStudioFile。
 */
let trimLimitSeconds = 0;

/** 用户在裁剪窗口点了取消；上传入口据此静默跳过，不报错。 */
export class StudioTrimCancelled extends Error {}

export function setStudioVideoTrimLimit(seconds: number) {
    trimLimitSeconds = seconds > 0 ? seconds : 0;
}

type TrimRequest = { file: File; durationMs: number; maxMs: number; resolve: (file: File | null) => void };
let openTrim: ((request: TrimRequest) => void) | null = null;

function readVideoDuration(file: File) {
    return new Promise<number>((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(Number.isFinite(video.duration) ? video.duration * 1000 : 0);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(0);
        };
        video.src = url;
    });
}

/** 视频超过上限时弹出裁剪窗口；返回剪好的文件，没超就原样返回，用户取消时抛出。 */
export async function trimStudioVideoIfNeeded(file: File): Promise<File> {
    if (!trimLimitSeconds || !openTrim || !file.type.startsWith("video/")) return file;
    const durationMs = await readVideoDuration(file);
    const maxMs = trimLimitSeconds * 1000;
    if (!durationMs || durationMs <= maxMs + 100) return file;
    const result = await new Promise<File | null>((resolve) => openTrim?.({ file, durationMs, maxMs, resolve }));
    if (!result) throw new StudioTrimCancelled("已取消裁剪");
    return result;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** 裁剪窗口：预览视频，拖动选择片段（不超过上限），确认后剪成 MP4。 */
export function StudioVideoTrimHost() {
    const { message } = App.useApp();
    const [request, setRequest] = useState<TrimRequest | null>(null);
    const [range, setRange] = useState<[number, number]>([0, 0]);
    const [busy, setBusy] = useState(false);
    const [src, setSrc] = useState("");
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        openTrim = (next) => {
            setRequest(next);
            setRange([0, Math.min(next.maxMs, next.durationMs)]);
        };
        return () => {
            openTrim = null;
        };
    }, []);

    useEffect(() => {
        if (!request) return;
        const url = URL.createObjectURL(request.file);
        setSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [request]);

    // 预览只在选中的片段里循环播放。
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const loop = () => {
            if (video.currentTime * 1000 >= range[1] || video.currentTime * 1000 < range[0] - 200) video.currentTime = range[0] / 1000;
        };
        video.addEventListener("timeupdate", loop);
        return () => video.removeEventListener("timeupdate", loop);
    }, [range]);

    const close = (file: File | null) => {
        request?.resolve(file);
        setRequest(null);
        setBusy(false);
    };

    const confirm = async () => {
        if (!request) return;
        setBusy(true);
        try {
            const blob = await trimVideoSegment({ url: src }, { startMs: range[0], endMs: range[1] }, request.durationMs);
            close(new File([blob], request.file.name.replace(/\.[^.]+$/, "") + "-trim.mp4", { type: "video/mp4" }));
        } catch (cause) {
            setBusy(false);
            message.error(cause instanceof Error ? cause.message : "裁剪失败，请换一个视频");
        }
    };

    const onRange = (value: number[]) => {
        let [start, end] = value as [number, number];
        if (!request) return;
        // 超过上限时跟着拖动的那一端移动另一端，保持片段长度不超过上限。
        if (end - start > request.maxMs) {
            if (start !== range[0]) end = start + request.maxMs;
            else start = end - request.maxMs;
        }
        setRange([start, end]);
        if (videoRef.current) videoRef.current.currentTime = (start !== range[0] ? start : Math.max(start, end - 1000)) / 1000;
    };

    return (
        <AppModal rootClassName="studio-modal" open={Boolean(request)} width="min(720px, calc(100vw - 32px))" title="裁剪视频" footer={null} maskClosable={!busy} closable={!busy} onCancel={() => close(null)} destroyOnHidden>
            {request ? (
                <div className="studio-popup studio-trim">
                    <p className="studio-hint">当前模型的参考视频最长 {seconds(request.maxMs)}，这个视频有 {seconds(request.durationMs)}。拖动选择要使用的片段。</p>
                    <video ref={videoRef} className="studio-trim-video" src={src} autoPlay muted playsInline controls={false} onLoadedMetadata={(event) => { event.currentTarget.currentTime = range[0] / 1000; }} />
                    <Slider range min={0} max={Math.round(request.durationMs)} step={100} value={range} tooltip={{ formatter: (value) => seconds(value || 0) }} onChange={onRange} disabled={busy} />
                    <div className="studio-trim-meta">
                        <span>{seconds(range[0])} – {seconds(range[1])}</span>
                        <b>已选 {seconds(range[1] - range[0])}</b>
                    </div>
                    <div className="studio-voice-foot">
                        <span style={{ flex: 1 }} />
                        <button type="button" className="studio-mini-button" disabled={busy} onClick={() => close(null)}>取消</button>
                        <button type="button" className="studio-mini-button is-primary" disabled={busy || range[1] - range[0] < 1000} onClick={() => void confirm()}>
                            {busy ? <Loader2 className="studio-spin" aria-hidden /> : null}
                            {busy ? "正在裁剪…" : "裁剪并上传"}
                        </button>
                    </div>
                </div>
            ) : null}
        </AppModal>
    );
}
