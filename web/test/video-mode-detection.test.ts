import { describe, expect, test } from "bun:test";

import { detectVideoMode, inferVideoOperation } from "../src/lib/model-selection";
import { applyVideoModeImageRoles } from "../src/lib/video-modes";
import type { VideoCapabilityConfig } from "../src/lib/model-capabilities";

const profile = (operations: string[], maxImages = 9) => ({ operations, references: { maxImages, maxVideos: 3, maxAudios: 3 } }) as unknown as VideoCapabilityConfig;
const seedance = profile(["text_to_video", "image_to_video", "reference_to_video", "audio_to_video"]);
const kling = profile(["text_to_video", "image_to_video"], 2);
const editor = profile(["text_to_video", "inpaint", "extend"]);
const input = (imageCount: number, videoCount = 0, audioCount = 0) => ({ imageCount, videoCount, audioCount });

describe("video mode detection", () => {
    test("Seedance-style models", () => {
        expect(detectVideoMode(seedance, input(0))).toBe("text_to_video");
        expect(detectVideoMode(seedance, input(1))).toBe("reference_to_video");
        expect(detectVideoMode(undefined, input(1))).toBe("image_to_video");
        expect(detectVideoMode(seedance, input(2))).toBe("reference_to_video");
        expect(detectVideoMode(seedance, input(4))).toBe("reference_to_video");
        expect(detectVideoMode(seedance, input(1, 0, 1))).toBe("reference_to_video");
        expect(detectVideoMode(seedance, input(0, 1))).toBe("reference_to_video");
        expect(detectVideoMode(seedance, input(1, 1, 1))).toBe("reference_to_video");
        expect(inferVideoOperation({ textCount: 1, imageCount: 0, videoCount: 0, audioCount: 1, characterCount: 0 }, seedance.operations)).toBe("audio_to_video");
    });

    test("models without universal reference fall back to what they support", () => {
        expect(detectVideoMode(kling, input(1))).toBe("image_to_video");
        expect(detectVideoMode(kling, input(2))).toBe("first_last_frame");
        expect(detectVideoMode(kling, input(1, 0, 1))).toBe("image_to_video");
        expect(detectVideoMode(editor, input(0, 1))).toBe("inpaint");
    });

    test("image to video marks the first image as the first frame", () => {
        expect(applyVideoModeImageRoles("image_to_video", [{ id: "a" }, { id: "b" }])).toEqual([{ id: "a", role: "first_frame" }, { id: "b" }]);
        expect(applyVideoModeImageRoles("reference_to_video", [{ id: "a" }])).toEqual([{ id: "a" }]);
    });
});
