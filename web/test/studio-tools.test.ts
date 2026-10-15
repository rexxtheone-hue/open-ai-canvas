import { describe, expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";
import { studioModelChips } from "../src/pages/studio/studio-model-chips";
import { STUDIO_TOOL_TABS, STUDIO_TOOLS, studioToolForKind, studioToolsInTab, studioToolTab } from "../src/pages/studio/studio-tools";
import { buildSpecialtyState, defaultSpecialtyOptions, studioSpecialtyAvailable, studioSpecialtySpec } from "../src/pages/studio/studio-specialty";

describe("AI Studio 工具分类", () => {
    test("工具 ID 唯一，每个工具至少属于一个分类，专项工具都有槽位定义", () => {
        const ids = STUDIO_TOOLS.map((tool) => tool.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const tool of STUDIO_TOOLS) {
            expect(tool.tabs.length).toBeGreaterThan(0);
            for (const tab of tool.tabs) expect(studioToolTab(tab)).toBeDefined();
            if (tool.specialty) {
                expect(studioSpecialtySpec(tool.id)).toBeDefined();
                expect(tool.path).toBe(`/studio/tools/${tool.id}`);
            }
        }
    });

    test("分类清单与生成工具对应", () => {
        expect(studioToolsInTab(STUDIO_TOOLS, "video").map((tool) => tool.id)).toContain("lip-sync");
        expect(studioToolsInTab(STUDIO_TOOLS, "character").map((tool) => tool.id)).toEqual(["character-image", "character-video", "cast-in-scene", "replace-character", "motion-sync", "lip-sync", "multi-view", "face-swap"]);
        expect(studioToolsInTab(STUDIO_TOOLS, "world").map((tool) => tool.id)).toEqual(["create-pano", "cast-in-scene"]);
        expect(studioToolsInTab(STUDIO_TOOLS, "audio").map((tool) => tool.id)).toEqual(["create-audio", "video-dubbing"]);
        expect(studioToolForKind("video")?.id).toBe("create-video");
        expect(studioToolForKind("image")?.id).toBe("create-image");
        expect(STUDIO_TOOL_TABS.every((tab) => tab.path === `/studio/${tab.id}`)).toBe(true);
    });
});

describe("模型能力标签", () => {
    test("视频模型按能力配置生成标签", () => {
        const video = defaultModelCapabilityConfig(undefined, "clip");
        video.video!.operations = ["text_to_video", "image_to_video", "reference_to_video", "lip_sync"];
        video.video!.references.maxImages = 3;
        video.video!.generateAudio = { supported: true, default: true };
        video.video!.resolutions = ["480p", "720p", "1080p"];
        video.video!.duration = { selection: "range", min: 4, max: 15, step: 1, default: 5 };
        const config: AiConfig = {
            ...defaultConfig,
            channels: [{ id: "c", name: "c", baseUrl: "https://x", apiKey: "k", apiFormat: "openai", models: ["clip"], modelCosts: [{ model: "clip", capability: "video", billingMode: "per_second", unitPriceMicrocredits: 1, capabilityConfig: video }] }],
        } as unknown as AiConfig;
        expect(studioModelChips(config, "c::clip", "video")).toEqual(["全能参考", "首尾帧", "音频", "对口型", "480p-1080p", "4-15s"]);
    });
});

function toolConfig(video: { operations: string[]; maxVideos: number; maxImages: number }, imageMaxRefs: number): AiConfig {
    const clip = defaultModelCapabilityConfig(undefined, "clip");
    clip.video!.operations = video.operations;
    clip.video!.references.maxVideos = video.maxVideos;
    clip.video!.references.maxImages = video.maxImages;
    const pic = defaultModelCapabilityConfig(undefined, "pic");
    pic.image!.references.maxImages = imageMaxRefs;
    return {
        ...defaultConfig,
        channels: [{
            id: "c", name: "c", baseUrl: "https://x", apiKey: "k", apiFormat: "openai", models: ["clip", "pic"],
            modelCosts: [
                { model: "clip", capability: "video", billingMode: "per_second", unitPriceMicrocredits: 1, capabilityConfig: clip },
                { model: "pic", capability: "image", billingMode: "fixed_request", unitPriceMicrocredits: 1, capabilityConfig: pic },
            ],
        }],
    } as unknown as AiConfig;
}

describe("新增专项工具", () => {
    test("视频编辑类只在模型勾选了对应操作、且能接收原视频时出现", () => {
        const none = toolConfig({ operations: ["text_to_video"], maxVideos: 1, maxImages: 1 }, 4);
        for (const id of ["edit-video", "replace-character", "restyle-video", "extend-video", "camera-motion", "character-video"]) expect(studioSpecialtyAvailable(none, id)).toBe(false);
        const noVideoSlot = toolConfig({ operations: ["extend", "inpaint"], maxVideos: 0, maxImages: 1 }, 4);
        expect(studioSpecialtyAvailable(noVideoSlot, "extend-video")).toBe(false);
        expect(studioSpecialtyAvailable(noVideoSlot, "edit-video")).toBe(false);
        const full = toolConfig({ operations: ["inpaint", "replace_element", "style_transfer", "camera_motion", "extend", "reference_to_video"], maxVideos: 1, maxImages: 1 }, 4);
        for (const id of ["edit-video", "replace-character", "restyle-video", "extend-video", "camera-motion", "character-video"]) expect(studioSpecialtyAvailable(full, id)).toBe(true);
        const noImageRef = toolConfig({ operations: ["replace_element"], maxVideos: 1, maxImages: 0 }, 4);
        expect(studioSpecialtyAvailable(noImageRef, "replace-character")).toBe(false);
    });

    test("图片工具按必需参考图数量筛选模型：换脸、角色入景要两张", () => {
        const one = toolConfig({ operations: [], maxVideos: 0, maxImages: 0 }, 1);
        expect(studioSpecialtyAvailable(one, "edit-image")).toBe(true);
        expect(studioSpecialtyAvailable(one, "face-swap")).toBe(false);
        expect(studioSpecialtyAvailable(one, "cast-in-scene")).toBe(false);
        expect(studioSpecialtyAvailable(toolConfig({ operations: [], maxVideos: 0, maxImages: 0 }, 2), "face-swap")).toBe(true);
        // 全景的参考图是可选的，纯文生图模型也能用。
        expect(studioSpecialtyAvailable(toolConfig({ operations: [], maxVideos: 0, maxImages: 0 }, 0), "create-pano")).toBe(true);
        expect(studioSpecialtySpec("create-pano")?.outputRatio).toBe("2:1");
    });

    test("必填说明、选项和指令内容", () => {
        const extend = studioSpecialtySpec("extend-video")!;
        expect(buildSpecialtyState(extend, {}, "", {}).inputError).toBe("请添加原视频");
        const video = { id: "v", name: "v.mp4", type: "video/mp4", url: "https://x/v.mp4", previewUrl: "" };
        expect(buildSpecialtyState(extend, { source: video }, " ", {}).inputError).toBe("请填写接下来发生什么");
        const state = buildSpecialtyState(extend, { source: video }, "她转身离开", {});
        expect(state).toMatchObject({ operation: "extend", operationLabel: "视频延长", inputError: "", minVideos: 1, minImages: 0 });
        expect(state.instruction).toContain("她转身离开");

        const angle = studioSpecialtySpec("camera-angle")!;
        const prompt = buildSpecialtyState(angle, {}, "", { yaw: "left45", pitch: "high30", lens: "close" }).instruction;
        expect(prompt).toContain("左前方 45 度");
        expect(prompt).toContain("30 度俯拍");
        expect(prompt).toContain("特写镜头");
        expect(defaultSpecialtyOptions(studioSpecialtySpec("restyle-video")!)).toEqual({ style: "lego" });
        expect(buildSpecialtyState(studioSpecialtySpec("face-swap")!, {}, "", {}).minImages).toBe(2);
    });

    test("图生视频、文生视频入口带预设模式并有独立路由", () => {
        const frame = STUDIO_TOOLS.find((tool) => tool.id === "frame-to-video")!;
        const text = STUDIO_TOOLS.find((tool) => tool.id === "text-to-video")!;
        expect(frame.presetMode).toBe("image_to_video");
        expect(text.presetMode).toBe("text_to_video");
        expect(frame.path).toBe("/studio/frame-to-video");
        expect(frame.specialty).toBeUndefined();
    });
});
