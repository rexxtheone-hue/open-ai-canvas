import { describe, expect, test } from "bun:test";
import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";

describe("model family video defaults", () => {
    test("plugin protocols get family defaults from the model name", () => {
        const seedance = defaultModelCapabilityConfig("cloudwise-seedance", "dreamina-seedance-2-0-260128").video!;
        expect(seedance.references).toMatchObject({ maxImages: 9, maxVideos: 3, maxAudios: 3, maxVideoDurationSeconds: 15 });
        expect(seedance.generateAudio).toEqual({ supported: true, default: true });
        expect(seedance.operations).toContain("reference_to_video");
        const kling = defaultModelCapabilityConfig("cloudwise-kling-video", "kling-v3-omni").video!;
        expect(kling.resolutions).toEqual(["720p", "1080p", "4k"]);
        expect(defaultModelCapabilityConfig("modelverse-wan-video", "Wan-AI/Wan2.6-I2V").video!.duration).toEqual({ selection: "enum", values: [5, 10, 15], default: 5 });
    });

    test("protocol-owned defaults and unknown models are untouched", () => {
        expect(defaultModelCapabilityConfig("volcengine-ark-video", "doubao-seedance-2-0-260128").video!.references.maxVideoBytes).toBe(200 * 1024 * 1024);
        expect(defaultModelCapabilityConfig("cloudwise-unified-video", "mystery").video!.references.maxVideos).toBe(0);
    });
});
