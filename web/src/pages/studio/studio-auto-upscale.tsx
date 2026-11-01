import { useEffect } from "react";

import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { listStudioWorks } from "@/services/api/studio";
import { selectableModelsByCapability, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { studioReferenceLimits, studioResolvedModel, studioSubmission, type StudioToolState } from "./studio-generation";
import { buildSpecialtyState, defaultSpecialtyOptions, studioSpecialtySpec } from "./studio-specialty";
import { studioAttachmentFromMedia } from "./use-studio-tool";
import { notifyStudioWorksChanged } from "./use-studio-works";

/**
 * 自动高清：生成视频时打开「自动高清」，任务完成后自动把成片交给视频高清模型再出一版。
 * 等待中的任务记在本机；Studio 打开时每隔一会儿检查一次，完成就提交高清任务。
 */
const KEY = "studio.auto-upscale.v1";
const POLL_MS = 15_000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Pending = { id: string; at: number };

function readPending(): Pending[] {
    try {
        const list = JSON.parse(window.localStorage.getItem(KEY) || "[]") as Pending[];
        return Array.isArray(list) ? list.filter((item) => item && typeof item.id === "string" && Date.now() - item.at < MAX_AGE_MS) : [];
    } catch {
        return [];
    }
}

function writePending(list: Pending[]) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
        // 本地存储不可用时只是不会自动高清。
    }
}

export function rememberAutoUpscale(taskId: string) {
    writePending([...readPending().filter((item) => item.id !== taskId), { id: taskId, at: Date.now() }]);
}

export function studioUpscaleModel(config: AiConfig) {
    return selectableModelsByCapability(config, "video").find((model) => modelCapabilityConfigFor(config, model).video?.operations.includes("video_upscale")) || "";
}

async function checkPending(config: AiConfig) {
    const pending = readPending();
    if (!pending.length) return;
    const { works } = await listStudioWorks({ kind: "video", pageSize: 60 });
    const remaining: Pending[] = [];
    for (const item of pending) {
        const work = works.find((candidate) => candidate.id === item.id);
        if (!work || work.status === "queued" || work.status === "running") {
            remaining.push(item);
            continue;
        }
        const media = work.media.find((entry) => entry.kind === "video");
        const model = studioUpscaleModel(config);
        const spec = studioSpecialtySpec("video-upscale");
        if (work.status !== "succeeded" || !media || !model || !spec) continue;
        const source = studioAttachmentFromMedia(work, media);
        const options = defaultSpecialtyOptions(spec);
        const state: StudioToolState = {
            kind: "video",
            tool: "video-upscale",
            model,
            prompt: "",
            attachments: [source],
            count: 1,
            image: { ratio: "1:1", quality: "auto", imageResolution: "auto", imageParameters: "{}" },
            video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: false },
            audio: { voice: "", format: "mp3", speed: "1" },
            specialty: buildSpecialtyState(spec, { source: [source] }, "", options),
        };
        const resolved = studioResolvedModel(config, state);
        const submission = studioSubmission(config, state, resolved, studioReferenceLimits(config, state, resolved));
        try {
            await submitBackendGenerationTask({ ...submission, metadata: { ...submission.metadata, autoUpscaleFrom: work.id }, clientOperationId: crypto.randomUUID() });
            notifyStudioWorksChanged();
            window.dispatchEvent(new CustomEvent("wallet:updated"));
        } catch {
            // 提交失败（积分不足等）不再重试，避免反复扣费尝试。
        }
    }
    writePending(remaining);
}

export function StudioAutoUpscaleWatcher() {
    const config = useEffectiveConfig();
    useEffect(() => {
        let busy = false;
        const tick = () => {
            if (busy || !readPending().length) return;
            busy = true;
            void checkPending(config).catch(() => undefined).finally(() => {
                busy = false;
            });
        };
        tick();
        const timer = window.setInterval(tick, POLL_MS);
        return () => window.clearInterval(timer);
    }, [config]);
    return null;
}
