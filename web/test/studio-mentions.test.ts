import { describe, expect, test } from "bun:test";

import type { CreationAttachment } from "../src/pages/create/creation-assets";
import { splitStudioMentions, studioMentions, studioModelPrompt, syncStudioPromptMentions } from "../src/pages/studio/studio-mentions";

const image = (id: string) => ({ id, name: id, type: "image/png", dataUrl: `https://a/${id}.png`, previewUrl: `https://a/${id}.png` }) as CreationAttachment;
const video = (id: string) => ({ id, name: id, type: "video/mp4", url: `https://a/${id}.mp4`, previewUrl: `https://a/${id}.mp4` }) as CreationAttachment;

describe("studio prompt mentions", () => {
    test("numbers mentions per kind in attachment order", () => {
        expect(studioMentions([image("a"), video("v"), image("b")]).map((item) => item.token)).toEqual(["@图片1", "@视频1", "@图片2"]);
    });

    test("adding attachments appends their tokens", () => {
        expect(syncStudioPromptMentions("女主角唱歌", [], [image("a"), video("v")], "zh")).toBe("女主角唱歌 @图片1 @视频1");
        expect(syncStudioPromptMentions("", [], [image("a")], "en")).toBe("@Image1");
    });

    test("removing an attachment drops its token and renumbers later ones", () => {
        const prompt = "@图片1 走进 @图片2 的房间，拿起 @图片3";
        expect(syncStudioPromptMentions(prompt, [image("a"), image("b"), image("c")], [image("a"), image("c")], "zh")).toBe("@图片1 走进 的房间，拿起 @图片2");
    });

    test("hand-typed tokens without a matching attachment stay as typed", () => {
        expect(syncStudioPromptMentions("参考 @图片5", [image("a")], [image("a")], "zh")).toBe("参考 @图片5");
    });

    test("model prompt converts English tokens to the canvas Chinese form", () => {
        expect(studioModelPrompt("@Image1 dances with @Video2 and @audio1")).toBe("@图片1 dances with @视频2 and @音频1");
    });

    test("splits text into plain and mention parts for highlighting", () => {
        expect(splitStudioMentions("看 @图片1 和@视频2。")).toEqual([
            { text: "看 ", mention: false },
            { text: "@图片1", mention: true },
            { text: " 和", mention: false },
            { text: "@视频2", mention: true },
            { text: "。", mention: false },
        ]);
    });
});
