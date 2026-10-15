import { describe, expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";
import { studioModelChips } from "../src/pages/studio/studio-model-chips";
import { STUDIO_TOOL_TABS, STUDIO_TOOLS, studioToolForKind, studioToolsInTab, studioToolTab } from "../src/pages/studio/studio-tools";
import { studioSpecialtySpec } from "../src/pages/studio/studio-specialty";

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
        expect(studioToolsInTab(STUDIO_TOOLS, "character").map((tool) => tool.id)).toEqual(["lip-sync", "motion-sync"]);
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
