import { useEffect, useRef, useState } from "react";
import { Circle, Square } from "./studio-icons";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";

type RecorderProps = {
    open: boolean;
    kind: "audio" | "video";
    /** 最长录制秒数，到时自动停止。 */
    maxSeconds?: number;
    onDone: (file: File) => void;
    onClose: () => void;
};

function recorderMime(kind: "audio" | "video") {
    const candidates = kind === "video" ? ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"] : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

/** 用摄像头或麦克风直接录一段素材，录完交给上传流程。 */
export function StudioRecorder({ open, kind, maxSeconds = 60, onDone, onClose }: RecorderProps) {
    const [error, setError] = useState("");
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [result, setResult] = useState<File | null>(null);
    const [preview, setPreview] = useState("");
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const liveRef = useRef<HTMLVideoElement | null>(null);
    // 预览元素重录时会重新挂载，每次挂载都接上摄像头画面。
    const attachLive = (node: HTMLVideoElement | null) => {
        liveRef.current = node;
        if (node && streamRef.current && node.srcObject !== streamRef.current) node.srcObject = streamRef.current;
    };

    useEffect(() => {
        if (!open) return;
        setError("");
        setResult(null);
        setElapsed(0);
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setError("浏览器只允许在 HTTPS 网址下使用摄像头和麦克风，请改为上传文件。");
            return;
        }
        let cancelled = false;
        navigator.mediaDevices.getUserMedia(kind === "video" ? { video: true, audio: true } : { audio: true })
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (liveRef.current) liveRef.current.srcObject = stream;
            })
            .catch((cause) => setError(cause instanceof Error && cause.name === "NotAllowedError" ? "没有获得摄像头或麦克风权限，请在浏览器地址栏允许后重试。" : "无法打开摄像头或麦克风。"));
        return () => {
            cancelled = true;
            recorderRef.current?.state === "recording" && recorderRef.current.stop();
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, [kind, open]);

    useEffect(() => {
        if (!recording) return;
        const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, [recording]);

    useEffect(() => {
        if (recording && elapsed >= maxSeconds) recorderRef.current?.stop();
    }, [elapsed, maxSeconds, recording]);

    useEffect(() => {
        if (!result) return;
        const url = URL.createObjectURL(result);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [result]);

    const start = () => {
        const stream = streamRef.current;
        if (!stream) return;
        const mimeType = recorderMime(kind);
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
        recorder.onstop = () => {
            setRecording(false);
            const type = (recorder.mimeType || mimeType || (kind === "video" ? "video/webm" : "audio/webm")).split(";")[0];
            const extension = type.endsWith("mp4") ? (kind === "video" ? "mp4" : "m4a") : "webm";
            setResult(new File(chunks, `录制-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${extension}`, { type }));
        };
        recorderRef.current = recorder;
        setResult(null);
        setElapsed(0);
        recorder.start();
        setRecording(true);
    };

    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(560px, calc(100vw - 32px))" title={kind === "video" ? "录制视频" : "录制音频"} footer={null} onCancel={onClose} destroyOnHidden>
            <div className="studio-popup studio-recorder">
                {error ? <p className="studio-hint is-warn">{error}</p> : (
                    <>
                        {kind === "video" ? (
                            result ? <video src={preview} controls playsInline /> : <video ref={attachLive} autoPlay muted playsInline />
                        ) : result ? <audio src={preview} controls /> : <div className="studio-recorder-audio" data-recording={recording}>{recording ? "正在录音…" : "准备好后点开始"}</div>}
                        <div className="studio-recorder-bar">
                            <span>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")} / 最长 {maxSeconds} 秒</span>
                            {recording ? (
                                <button type="button" className="studio-mini-button" onClick={() => recorderRef.current?.stop()}><Square aria-hidden />停止</button>
                            ) : (
                                <button type="button" className="studio-mini-button" onClick={start}><Circle aria-hidden />{result ? "重录" : "开始"}</button>
                            )}
                            <button type="button" className="studio-mini-button is-primary" disabled={!result || recording} onClick={() => { if (result) onDone(result); onClose(); }}>使用这段</button>
                        </div>
                    </>
                )}
            </div>
        </AppModal>
    );
}
