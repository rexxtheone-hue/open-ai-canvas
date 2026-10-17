import { describe, expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { defaultConfig, type AiConfig, type ModelChannel } from "../src/stores/use-config-store";
import type { CreationAttachment } from "../src/pages/create/creation-assets";
import {
    admitStudioAttachments,
    studioBlockReason,
    studioBrandAvailable,
    studioBrandPrompt,
    studioFinalPrompt,
    studioGenerationConfig,
    studioMaxCount,
    studioModelRequirements,
    studioModelSupportsSpecialty,
    studioOverflowAttachmentIds,
    studioPreferredModel,
    studioReferenceLimits,
    studioResolvedModel,
    studioSubmission,
    type StudioToolState,
} from "../src/pages/studio/studio-generation";
import { buildSpecialtyState, defaultSpecialtyOptions, orderedSlotAttachments, restoreSpecialtyOptions, specialtyInputError, specialtyPrompt, studioSpecialtyAvailable, studioSpecialtySpec } from "../src/pages/studio/studio-specialty";
import { studioRemixAsWork, studioRemixToolPath } from "../src/pages/studio/studio-community";

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
        expect(studioMaxCount(config, "video", "relay::clip-pro")).toBe(8);
        expect(studioMaxCount(config, "audio", "relay::voice")).toBe(1);
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

describe("AI Studio 品牌套件", () => {
    const kit = { id: "kit-1", name: "暖杯", intro: "316 不锈钢保温杯", audience: "", tone: "温暖、简约", colors: ["#D9A441", "#0A0A0A"], slogan: "温暖随身", avoid: "竞品 Logo" };
    const brand = { id: kit.id, name: kit.name, prompt: studioBrandPrompt(kit) };

    test("品牌要求只输出填写过的字段", () => {
        expect(brand.prompt).toBe("品牌：暖杯\n品牌介绍：316 不锈钢保温杯\n品牌调性：温暖、简约\n品牌色：#D9A441、#0A0A0A\n品牌口号：温暖随身（画面需要文字时使用）\n避免：竞品 Logo");
        expect(studioBrandPrompt({ id: "k", name: " 极简 " })).toBe("品牌：极简");
        expect(studioBrandPrompt({ id: "k", name: "暖杯", typography: " 标题思源黑体 " })).toBe("品牌：暖杯\n字体规范：标题思源黑体（画面需要文字时遵循）");
    });

    test("图片和视频追加品牌要求，配音文案保持原样", () => {
        expect(studioFinalPrompt({ kind: "image", prompt: " 一杯咖啡 ", brand })).toBe(`一杯咖啡\n\n${brand.prompt}`);
        expect(studioFinalPrompt({ kind: "audio", prompt: "欢迎光临", brand })).toBe("欢迎光临");
        expect(studioFinalPrompt({ kind: "video", prompt: "  ", brand })).toBe("");
    });

    test("视频只带品牌色、调性和要避免的元素，不带口号、字体和介绍", () => {
        const videoBrand = { ...brand, videoPrompt: studioBrandPrompt(kit, "video") };
        expect(videoBrand.videoPrompt).toBe("品牌：暖杯\n品牌调性：温暖、简约\n品牌色：#D9A441、#0A0A0A\n避免：竞品 Logo");
        expect(studioFinalPrompt({ kind: "video", prompt: "倒一杯热咖啡", brand: videoBrand })).toBe(`倒一杯热咖啡\n\n${videoBrand.videoPrompt}`);
        // 只填了口号和字体的套件，视频里没有可用的部分，不追加任何品牌信息。
        const textOnly = { id: "k", name: "暖杯", prompt: "x", videoPrompt: studioBrandPrompt({ id: "k", name: "暖杯", slogan: "温暖随身", typography: "思源黑体" }, "video") };
        expect(studioFinalPrompt({ kind: "video", prompt: "倒一杯热咖啡", brand: textOnly })).toBe("倒一杯热咖啡");
    });

    test("品牌只在生成图片时提供", () => {
        expect(studioBrandAvailable("image", { maxImages: 0 })).toBe(true);
        expect(studioBrandAvailable("video", { maxImages: 0 })).toBe(false);
        expect(studioBrandAvailable("video", { maxImages: 3 })).toBe(false);
        expect(studioBrandAvailable("audio", { maxImages: 3 })).toBe(false);
    });

    test("提交带品牌时记录原始提示词和套件，长度按最终提示词检查", () => {
        const config = studioConfig();
        const submission = studioSubmission(config, state("image", { prompt: "一杯咖啡", brand }), "relay::pic-pro", { maxImages: 2, maxVideos: 0, maxAudios: 0 });
        expect(submission.prompt).toBe(`一杯咖啡\n\n${brand.prompt}`);
        expect(submission.metadata).toMatchObject({ brandKitId: "kit-1", studioPrompt: "一杯咖啡" });
        const plain = studioSubmission(config, state("image", { prompt: "一杯咖啡" }), "relay::pic-pro", { maxImages: 2, maxVideos: 0, maxAudios: 0 });
        expect(plain.metadata.brandKitId).toBeUndefined();
        expect(plain.metadata.studioPrompt).toBeUndefined();

        const limited = studioConfig();
        limited.channels[0].modelCosts![0].capabilityConfig!.image!.references.promptMaxChars = 10;
        expect(studioBlockReason(limited, state("image", { prompt: "一杯咖啡" }), "relay::pic-pro", ready)).toBe("");
        expect(studioBlockReason(limited, state("image", { prompt: "一杯咖啡", brand }), "relay::pic-pro", ready)).not.toBe("");
    });
});

describe("AI Studio 专项工具", () => {
    const lipConfig = () => {
        const config = studioConfig();
        const video = config.channels[0].modelCosts![1].capabilityConfig!.video!;
        video.operations = [...video.operations, "lip_sync"];
        return config;
    };

    test("只有勾选了该操作的模型才会被选中；都不支持时提示去后台配置", () => {
        const spec = studioSpecialtySpec("lip-sync")!;
        const empty = buildSpecialtyState(spec, {}, "", {});
        expect(studioPreferredModel(studioConfig(), "video", "", empty)).toBe("");
        expect(studioBlockReason(studioConfig(), state("video", { specialty: empty }), "", ready)).toBe("后台还没有支持「对口型」的模型，请管理员在模型能力里开启");
        expect(studioPreferredModel(lipConfig(), "video", "relay::clip-mute", empty)).toBe("relay::clip-pro");
        expect(studioSpecialtyAvailable(studioConfig(), "lip-sync")).toBe(false);
        expect(studioSpecialtyAvailable(lipConfig(), "lip-sync")).toBe(true);
        expect(studioSpecialtyAvailable(studioConfig(), "relight")).toBe(true);
    });

    test("必填素材和类型检查", () => {
        const spec = studioSpecialtySpec("lip-sync")!;
        expect(specialtyInputError(spec, {}, "")).toBe("请添加人物");
        expect(specialtyInputError(spec, { subject: attachment("v", "video/mp4") }, "")).toBe("请添加声音");
        expect(specialtyInputError(spec, { subject: attachment("m", "audio/mpeg"), voice: attachment("n", "audio/mpeg") }, "")).toBe("人物的文件类型不对");
        expect(specialtyInputError(spec, { subject: attachment("a", "image/png"), voice: attachment("m", "audio/mpeg") }, "")).toBe("");
        const background = studioSpecialtySpec("replace-background")!;
        expect(specialtyInputError(background, { subject: attachment("a", "image/png") }, " ")).toBe("请填写新背景");
        expect(specialtyInputError(background, { subject: attachment("a", "image/png") }, "海边")).toBe("");
    });

    test("指令包含选项和补充说明；素材按槽位顺序", () => {
        const relight = studioSpecialtySpec("relight")!;
        const text = specialtyPrompt(relight, "光从左边来", { lighting: "neon" });
        expect(text).toContain("霓虹");
        expect(text).toContain("补充要求：光从左边来");
        expect(specialtyPrompt(relight, "", defaultSpecialtyOptions(relight))).not.toContain("补充要求");
        const dubbing = studioSpecialtySpec("video-dubbing")!;
        expect(specialtyPrompt(dubbing, "", { language: "ms" })).toContain("马来语");
        const background = studioSpecialtySpec("replace-background")!;
        const ordered = orderedSlotAttachments(background, { background: attachment("bg", "image/png"), subject: attachment("main", "image/png") });
        expect(ordered.map((item) => item.id)).toEqual(["main", "bg"]);
    });

    test("对口型提交固定操作并发送全部素材，不追加品牌", () => {
        const config = lipConfig();
        const spec = studioSpecialtySpec("lip-sync")!;
        const values = { subject: attachment("a", "image/png"), voice: attachment("m", "audio/mpeg") };
        const specialty = buildSpecialtyState(spec, values, "微笑", {});
        const brand = { id: "kit", name: "暖杯", prompt: "品牌：暖杯" };
        const lip = state("video", { specialty, brand, attachments: orderedSlotAttachments(spec, values), video: { ratio: "16:9", seconds: "5", videoQuality: "720", generateAudio: true, mode: "first_last_frame" } });
        expect(studioModelRequirements(config, lip).videoOperation).toBe("lip_sync");
        expect(studioModelRequirements(config, lip).videoMode).toBeUndefined();
        expect(studioBlockReason(config, lip, "relay::clip-pro", ready)).toBe("");
        const submission = studioSubmission(config, lip, "relay::clip-pro", studioReferenceLimits(config, lip, "relay::clip-pro"));
        expect(submission.metadata).toMatchObject({ videoEditOperation: "lip_sync", studioPrompt: "微笑" });
        expect(submission.metadata.videoMode).toBeUndefined();
        expect(submission.metadata.brandKitId).toBeUndefined();
        expect(submission.prompt).toContain("补充要求：微笑");
        expect(submission.prompt).not.toContain("品牌");
        expect(submission.referenceImages.map((item) => item.id)).toEqual(["a"]);
        expect(submission.referenceAudios.map((item) => item.id)).toEqual(["m"]);
        expect((submission.referenceImages[0] as { role?: string }).role).toBeUndefined();
    });

    test("缺素材时生成按钮给出原因", () => {
        const config = lipConfig();
        const spec = studioSpecialtySpec("lip-sync")!;
        const specialty = buildSpecialtyState(spec, { subject: attachment("a", "image/png") }, "", {});
        expect(studioBlockReason(config, state("video", { specialty }), "relay::clip-pro", ready)).toBe("请添加声音");
    });

    test("图片专项工具选能放下参考图的模型", () => {
        const config = studioConfig();
        const spec = studioSpecialtySpec("replace-background")!;
        const specialty = buildSpecialtyState(spec, {}, "", {});
        expect(specialty.minImages).toBe(1);
        expect(studioModelSupportsSpecialty(config, "relay::pic-pro", specialty)).toBe(true);
        config.channels[0].modelCosts![0].capabilityConfig!.image!.references.maxImages = 0;
        expect(studioModelSupportsSpecialty(config, "relay::pic-pro", specialty)).toBe(false);
    });
});

describe("做同款与选项回填", () => {
    test("选项随作品保存，回填时只接受仍然有效的取值", () => {
        const spec = studioSpecialtySpec("relight")!;
        const specialty = buildSpecialtyState(spec, { subject: attachment("a", "image/png") }, "", { lighting: "neon" });
        const submission = studioSubmission(studioConfig(), state("image", { specialty, attachments: [attachment("a", "image/png")] }), "relay::pic-pro", { maxImages: 2, maxVideos: 0, maxAudios: 0 });
        expect(submission.metadata).toMatchObject({ studioPrompt: "", specialtyOptions: { lighting: "neon" } });
        expect(restoreSpecialtyOptions(spec, { lighting: "neon" })).toEqual({ lighting: "neon" });
        expect(restoreSpecialtyOptions(spec, { lighting: "gone", extra: "x" })).toEqual({ lighting: "golden" });
        expect(restoreSpecialtyOptions(spec, undefined)).toEqual({ lighting: "golden" });
    });

    test("做同款打开原工具；空的补充说明不会被完整指令覆盖", () => {
        expect(studioRemixToolPath({ kind: "image", tool: "relight" })).toBe("/studio/tools/relight");
        expect(studioRemixToolPath({ kind: "video", tool: "relight" })).toBe("/studio/create-video");
        expect(studioRemixToolPath({ kind: "image", tool: "gone" })).toBe("/studio/create-image");
        const work = studioRemixAsWork({ kind: "image", tool: "relight", prompt: "完整指令", settings: { userPrompt: "" } });
        expect(work.settings?.userPrompt).toBe("");
        const plain = studioRemixAsWork({ kind: "image", tool: "create-image", prompt: "一杯咖啡", settings: { size: "1:1" } });
        expect(plain.settings).toMatchObject({ userPrompt: "一杯咖啡", size: "1:1" });
    });
});
