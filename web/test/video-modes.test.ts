import { describe, expect, test } from "bun:test";
import { applyVideoModeImageRoles, pickVideoModeMaterials, resolveSelectableVideoMode, videoModeMaterialRole, videoModeShouldReset, videoModeUsedInput, videoModeUsesMaterial, videoModeInputError, videoModeOperation, videoModeUnavailableReason, videoPricingOperation } from "../src/lib/video-modes";
import { resolveVideoOperation } from "../src/lib/model-selection";
import type { VideoCapabilityConfig } from "../src/lib/model-capabilities";

function profile(operations: string[], references: Partial<VideoCapabilityConfig["references"]> = {}) {
    return {
        operations,
        references: { promptMaxChars: 8000, minImages: 0, maxImages: 9, maxImageBytes: 0, maxVideos: 3, maxVideoBytes: 0, maxVideoDurationSeconds: 0, maxAudios: 3, maxAudioBytes: 0, maxAudioDurationSeconds: 0, ...references },
    } as unknown as VideoCapabilityConfig;
}

describe("video modes", () => {
    test("first/last frame is image-to-video with frame roles", () => {
        expect(videoModeOperation("first_last_frame")).toBe("image_to_video");
        const roles = applyVideoModeImageRoles("first_last_frame", [{ id: "a" }, { id: "b" }, { id: "c" }]).map((image) => (image as { role?: string }).role);
        expect(roles).toEqual(["first_frame", "last_frame", undefined]);
        expect(applyVideoModeImageRoles("reference_to_video", [{ id: "a" }])).toEqual([{ id: "a" }]);
    });

    test("availability follows the model's supported operations and limits", () => {
        const gemini = profile(["text_to_video", "image_to_video", "reference_to_video", "extend", "inpaint"]);
        for (const mode of ["text_to_video", "image_to_video", "first_last_frame", "reference_to_video", "extend", "inpaint"] as const) {
            expect(videoModeUnavailableReason(gemini, mode)).toBeUndefined();
        }
        const sd = profile(["text_to_video", "image_to_video", "reference_to_video"]);
        expect(videoModeUnavailableReason(sd, "extend")).toBeTruthy();
        expect(videoModeUnavailableReason(sd, "inpaint")).toBeTruthy();
        expect(videoModeUnavailableReason(profile(["image_to_video"], { maxImages: 1 }), "first_last_frame")).toBeTruthy();
        expect(resolveSelectableVideoMode(sd, "extend")).toBe("text_to_video");
    });

    test("attached media disables conflicting modes", () => {
        const gemini = profile(["text_to_video", "image_to_video", "reference_to_video", "extend", "inpaint"]);
        const oneImage = { imageCount: 1, videoCount: 0, audioCount: 0 };
        expect(videoModeUnavailableReason(gemini, "text_to_video", oneImage)).toBeTruthy();
        expect(videoModeUnavailableReason(gemini, "image_to_video", oneImage)).toBeUndefined();
        expect(videoModeUnavailableReason(gemini, "first_last_frame", oneImage)).toContain("两张");
        expect(videoModeUnavailableReason(gemini, "first_last_frame", { imageCount: 2, videoCount: 0, audioCount: 1 })).toBeUndefined();
        const oneVideo = { imageCount: 0, videoCount: 1, audioCount: 0 };
        expect(videoModeUnavailableReason(gemini, "image_to_video", oneVideo)).toBeTruthy();
        expect(videoModeUnavailableReason(gemini, "image_to_video", { imageCount: 1, videoCount: 1, audioCount: 1 })).toBeUndefined();
        expect(videoModeUnavailableReason(gemini, "extend", oneVideo)).toBeUndefined();
        expect(videoModeUnavailableReason(gemini, "text_to_video", { imageCount: 0, videoCount: 0, audioCount: 0 })).toBeUndefined();
    });

    test("each mode only uses its own materials", () => {
        const images = ["i1", "i2", "i3"];
        expect(pickVideoModeMaterials("image_to_video", "image", images)).toEqual(["i1"]);
        expect(pickVideoModeMaterials("first_last_frame", "image", images)).toEqual(["i1", "i2"]);
        expect(pickVideoModeMaterials("image_to_video", "audio", ["a1"])).toEqual([]);
        expect(pickVideoModeMaterials("extend", "image", images)).toEqual([]);
        expect(pickVideoModeMaterials("inpaint", "image", images)).toEqual(images);
        expect(pickVideoModeMaterials("reference_to_video", "audio", ["a1", "a2"])).toEqual(["a1", "a2"]);
        expect(pickVideoModeMaterials(undefined, "audio", ["a1"])).toEqual(["a1"]);
        expect(videoModeUsesMaterial("image_to_video", "audio", 0)).toBe(false);
        expect(videoModeUsedInput("image_to_video", { imageCount: 3, videoCount: 1, audioCount: 1 })).toEqual({ imageCount: 1, videoCount: 0, audioCount: 0 });
    });

    test("material role labels", () => {
        expect(videoModeMaterialRole("first_last_frame", "image", 0)).toBe("首帧");
        expect(videoModeMaterialRole("first_last_frame", "image", 1)).toBe("尾帧");
        expect(videoModeMaterialRole("image_to_video", "image", 0)).toBe("首帧");
        expect(videoModeMaterialRole("extend", "video", 0)).toBe("原视频");
        expect(videoModeMaterialRole("reference_to_video", "image", 0)).toBeUndefined();
        expect(videoModeMaterialRole(undefined, "image", 0)).toBeUndefined();
    });

    test("only model support or text-to-video conflicts reset a manual choice", () => {
        const gemini = profile(["text_to_video", "image_to_video", "reference_to_video", "extend", "inpaint"]);
        expect(videoModeShouldReset(gemini, "text_to_video", { imageCount: 1, videoCount: 0, audioCount: 0 })).toBe(true);
        expect(videoModeShouldReset(gemini, "first_last_frame", { imageCount: 0, videoCount: 0, audioCount: 0 })).toBe(false);
        expect(videoModeShouldReset(profile(["text_to_video"]), "extend", { imageCount: 0, videoCount: 1, audioCount: 0 })).toBe(true);
    });

    test("input errors block mismatched submissions", () => {
        expect(videoModeInputError("first_last_frame", { imageCount: 1, videoCount: 0, audioCount: 0 })).toContain("两张");
        expect(videoModeInputError("extend", { imageCount: 0, videoCount: 0, audioCount: 0 })).toBeTruthy();
        expect(videoModeInputError("extend", { imageCount: 0, videoCount: 1, audioCount: 0 })).toBeUndefined();
        expect(videoModeInputError("text_to_video", { imageCount: 1, videoCount: 0, audioCount: 0 })).toBeTruthy();
        expect(videoModeInputError("reference_to_video", { imageCount: 2, videoCount: 1, audioCount: 1 })).toBeUndefined();
    });

    test("explicit mode overrides material-based inference", () => {
        const input = { textCount: 1, imageCount: 0, videoCount: 1, audioCount: 0, characterCount: 0 };
        expect(resolveVideoOperation(input)).toBe("reference_to_video");
        expect(resolveVideoOperation(input, undefined, "extend")).toBe("extend");
        expect(resolveVideoOperation(input, undefined, "inpaint")).toBe("inpaint");
    });

    test("pricing categories for exclusive tiers", () => {
        expect(videoPricingOperation("reference_to_video")).toBe("reference_to_video");
        expect(videoPricingOperation("extend")).toBe("extend");
        expect(videoPricingOperation("inpaint")).toBe("video_edit");
        expect(videoPricingOperation("style_transfer")).toBe("video_edit");
        expect(videoPricingOperation("image_to_video")).toBeUndefined();
    });
});
