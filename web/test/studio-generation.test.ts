import { describe, expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { defaultConfig, type AiConfig, type ModelChannel } from "../src/stores/use-config-store";
import type { CreationAttachment } from "../src/pages/create/creation-assets";
import {
    admitStudioAttachments,
    studioBlockReason,
    studioGenerationConfig,
    studioMaxCount,
    studioOverflowAttachmentIds,
    studioPreferredModel,
    studioReferenceLimits,
    studioResolvedModel,
    studioSubmission,
    type StudioToolState,
} from "../src/pages/studio/studio-generation";

function studioConfig(): AiConfig {
    const image = defaultModelCapabilityConfig(undefined, "pic-pro");
    image.image!.references.maxImages = 2;
    image.image!.maxOutputs = 4;
    const video = defaultModelCapabilityConfig(undefined, "clip-pro");
    video.video!.operations = ["text_to_video", "image_to_video", "reference_to_video"];
    video.video!.references.maxImages = 3;
    video.video!.references.maxVideos = 1;
    video.video!.references.maxAudios = 1;
    video.video!.generateAudio = { supported: true, default: true };
    const mute = defaultModelCapabilityConfig(undefined, "clip-mute");
    mute.video!.generateAudio = { supported: false, default: false };
    const channel: ModelChannel = {
        id: "relay",
        name: "渠道",
        baseUrl: "https://api.example.com",
        apiKey: "k",
        apiFormat: "openai",
        models: ["pic-pro", "clip-pro", "clip-mute"],
        modelCosts: [
            { model: "pic-pro", displayName: "Pic Pro", capability: "image" as const, billingMode: "per_image" as const, unitPriceMicrocredits: 1, capabilityConfig: image },
            { model: "clip-pro", displayName: "Clip Pro", capability: "video" as const, billingMode: "per_second" as const, unitPriceMicrocredits: 1, capabilityConfig: video },
            { model: "clip-mute", displayName: "Clip Mute", capability: "video" as const, billingMode: "per_second" as const, unitPriceMicrocredits: 1, capabilityConfig: mute },
        ],
    };
    return { ...defaultConfig, channels: [channel], models: ["relay::pic-pro", "relay::clip-pro", "relay::clip-mute"], imageModels: ["relay::pic-pro"], videoModels: ["relay::clip-pro", "relay::clip-mute"], imageModel: "relay::pic-pro", videoModel: "relay::clip-pro" };
}

function attachment(id: string, type: string): CreationAttachment {
    return { id, type, name: id, previewUrl: `https://cdn.example/${id}`, dataUrl: `https://cdn.example/${id}`, url: `https://cdn.example/${id}` } as unknown as CreationAttachment;
}

function state(kind: StudioToolState["kind"], overrides: Partial<StudioToolState> = {}): StudioToolState {
    return {
        kind,
        tool: `create-${kind}`,
        model: kind === "image" ? "relay::pic-pro" : kind === "video" ? "relay::clip-pro" : "",
        prompt: "a red car",
        attachments: [],
        count: 1,
        image: { ratio: "1:1", quality: "auto", imageResolution: "auto", imageParameters: "{}" },
        video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: true },
        audio: { voice: "alloy", format: "mp3", speed: "1" },
        ...overrides,
    };
}

const ready = { loggedIn: true, creditsEnabled: true, availableCredits: 100, cost: 10 };

describe("AI Studio 生成规则", () => {
    test("T1 记住的模型失效时回落到渠道默认，再回落到第一个", () => {
        const config = studioConfig();
        expect(studioPreferredModel(config, "video", "relay::clip-mute")).toBe("relay::clip-mute");
        expect(studioPreferredModel(config, "video", "relay::gone")).toBe("relay::clip-pro");
        expect(studioPreferredModel({ ...config, videoModel: "" }, "video")).toBe("relay::clip-pro");
        expect(studioPreferredModel(config, "audio")).toBe("");
    });

    test("T2 素材按模型上限加入，超出的拒绝并说明原因", () => {
        const config = studioConfig();
        const limits = studioReferenceLimits(config, state("image"), "relay::pic-pro");
        expect(limits).toEqual({ maxImages: 2, maxVideos: 0, maxAudios: 0 });
        const result = admitStudioAttachments([], [attachment("a", "image/png"), attachment("b", "image/png"), attachment("c", "image/png"), attachment("v", "video/mp4")], limits);
        expect(result.accepted.map((item) => item.id)).toEqual(["a", "b"]);
        expect(result.rejected.map((item) => item.id)).toEqual(["c", "v"]);
        expect(result.reason).toContain("视频");
        const again = admitStudioAttachments(result.accepted, [attachment("a", "image/png")], limits);
        expect(again.accepted).toHaveLength(2);
        expect(again.rejected).toHaveLength(0);
    });

    test("T3 换模型后超出上限的素材不发送但保留", () => {
        const items = [attachment("a", "image/png"), attachment("b", "image/png"), attachment("c", "image/png")];
        const overflow = studioOverflowAttachmentIds(items, { maxImages: 1, maxVideos: 0, maxAudios: 0 });
        expect([...overflow]).toEqual(["b", "c"]);
        const config = studioConfig();
        const submission = studioSubmission(config, state("image", { attachments: items }), "relay::pic-pro", { maxImages: 1, maxVideos: 0, maxAudios: 0 });
        expect(submission.referenceImages.map((item) => item.id)).toEqual(["a"]);
    });

    test("T6 图片数量不超过模型最多出图数，配置里每个任务固定 1 张", () => {
        const config = studioConfig();
        expect(studioMaxCount(config, "image", "relay::pic-pro")).toBe(4);
        expect(studioMaxCount(config, "video", "relay::clip-pro")).toBe(1);
        const submission = studioSubmission(config, state("image", { count: 9 }), "relay::pic-pro", { maxImages: 2, maxVideos: 0, maxAudios: 0 });
        expect(submission.count).toBe(4);
        expect(submission.config.count).toBe("1");
        expect(submission.metadata).toEqual({ source: "studio", studioTool: "create-image" });
    });

    test("T7 T8 生成按钮置灰原因按优先级给出", () => {
        const config = studioConfig();
        expect(studioBlockReason(config, state("image"), "relay::pic-pro", { ...ready, loggedIn: false })).toBe("请先登录");
        expect(studioBlockReason(config, state("image"), "", ready)).toContain("没有可用的模型");
        expect(studioBlockReason(config, state("image", { prompt: "  " }), "relay::pic-pro", ready)).toBe("请输入提示词");
        expect(studioBlockReason(config, state("audio", { prompt: "" }), "x", ready)).toBe("请输入要朗读的文案");
        expect(studioBlockReason(config, state("image"), "relay::pic-pro", { ...ready, availableCredits: 3.5 })).toBe("积分不足，还差 6.5");
        expect(studioBlockReason(config, state("image"), "relay::pic-pro", { ...ready, creditsEnabled: false, availableCredits: 0 })).toBe("");
        expect(studioBlockReason(config, state("image"), "relay::pic-pro", { ...ready, cost: null })).toBe("");
        expect(studioBlockReason(config, state("image"), "relay::pic-pro", ready)).toBe("");
    });

    test("视频手动模式缺素材时不能提交", () => {
        const config = studioConfig();
        const reason = studioBlockReason(config, state("video", { video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: true, mode: "first_last_frame" }, attachments: [attachment("a", "image/png")] }), "relay::clip-pro", ready);
        expect(reason).toContain("两张");
    });

    test("视频手动模式只发送该模式用到的素材并标首尾帧", () => {
        const config = studioConfig();
        const items = [attachment("a", "image/png"), attachment("b", "image/png"), attachment("c", "image/png"), attachment("v", "video/mp4"), attachment("m", "audio/mpeg")];
        const limits = studioReferenceLimits(config, state("video"), "relay::clip-pro");
        const submission = studioSubmission(config, state("video", { attachments: items, video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: true, mode: "first_last_frame" } }), "relay::clip-pro", limits);
        expect(submission.referenceImages.map((item) => [item.id, (item as { role?: string }).role])).toEqual([["a", "first_frame"], ["b", "last_frame"]]);
        expect(submission.referenceVideos).toHaveLength(0);
        expect(submission.referenceAudios).toHaveLength(0);
        expect(submission.metadata).toMatchObject({ source: "studio", videoMode: "first_last_frame", videoEditOperation: "image_to_video" });
    });

    test("视频自动模式按素材推断操作并全部发送", () => {
        const config = studioConfig();
        const items = [attachment("a", "image/png"), attachment("v", "video/mp4")];
        const limits = studioReferenceLimits(config, state("video"), "relay::clip-pro");
        const submission = studioSubmission(config, state("video", { attachments: items }), "relay::clip-pro", limits);
        expect(submission.referenceImages).toHaveLength(1);
        expect(submission.referenceVideos).toHaveLength(1);
        expect(submission.metadata.videoMode).toBeUndefined();
        expect(submission.metadata.videoEditOperation).toBe("reference_to_video");
    });

    test("声音开关只在模型支持时生效", () => {
        const config = studioConfig();
        expect(studioGenerationConfig(config, state("video", { video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: false } }), "relay::clip-pro").videoGenerateAudio).toBe("false");
        expect(studioGenerationConfig(config, state("video"), "relay::clip-pro").videoGenerateAudio).toBe("true");
        expect(studioGenerationConfig(config, state("video", { model: "relay::clip-mute" }), "relay::clip-mute").videoGenerateAudio).toBe("false");
    });

    test("没有模型时解析结果为空，不会提交", () => {
        const config = studioConfig();
        expect(studioResolvedModel(config, state("audio"))).toBe("");
        expect(studioReferenceLimits(config, state("audio"), "")).toEqual({ maxImages: 0, maxVideos: 0, maxAudios: 0 });
    });
});
