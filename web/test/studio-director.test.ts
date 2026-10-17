import { describe, expect, test } from "bun:test";

import {
    buildDirectorTimeline,
    DEFAULT_DIRECTOR_BRIEF,
    DIRECTOR_MUSIC_VOLUME,
    directorBriefError,
    directorHistory,
    directorImagePrompt,
    directorKickoffMessage,
    directorOrderedShots,
    directorStepTargets,
    directorStoryTitle,
    directorSystemPrompt,
    directorVisibleText,
    parseDirectorReply,
} from "../src/pages/studio/studio-director";
import { resolveStudioBrandKit } from "../src/pages/studio/use-studio-brand";
import type { StudioBrandKit, StudioWork } from "../src/services/api/studio";
import type { StudioShot, StudioShotVersion, StudioStory } from "../src/services/api/studio-agents";

const brief = { ...DEFAULT_DIRECTOR_BRIEF, subject: "暖杯保温杯", points: "保温 12 小时", style: "干净高级" };

function work(id: string, kind: "image" | "video" | "audio", status: StudioWork["status"] = "succeeded", durationMs?: number): StudioWork {
    return { id, kind, status, favorite: false, prompt: id, media: status === "succeeded" ? [{ kind, storageKey: `resource:${id}`, durationMs }] : [] } as unknown as StudioWork;
}

function story(shots: Array<Partial<StudioShot> & { id: string }>, versions: StudioShotVersion[] = []): StudioStory {
    return {
        id: "story",
        title: "暖杯",
        ratio: "9:16",
        durationSeconds: 12,
        status: "planning",
        createdAt: "",
        updatedAt: "",
        scenes: [{ id: "scene-b", storyId: "story", sort: 1, title: "B", description: "" }, { id: "scene-a", storyId: "story", sort: 0, title: "A", description: "" }],
        shots: shots.map((shot, index) => ({ storyId: "story", sceneId: "scene-a", sort: index, durationSeconds: 4, fields: { visual: `画面${index + 1}`, voiceover: `旁白${index + 1}`, subtitle: `字幕${index + 1}` }, ...shot })),
        versions,
    };
}

function version(id: string, shotId: string, kind: "image" | "video" | "audio", attached: StudioWork): StudioShotVersion {
    return { id, shotId, storyId: "story", kind, taskId: attached.id, createdAt: "", work: attached };
}

describe("AI 导演简报", () => {
    test("必填与范围检查", () => {
        expect(directorBriefError({ ...brief, subject: " " })).toBe("请填写产品");
        expect(directorBriefError({ ...brief, genre: "short-drama", subject: "" })).toBe("请填写故事");
        expect(directorBriefError({ ...brief, durationSeconds: 20 })).toBe("请选择成片时长");
        expect(directorBriefError({ ...brief, ratio: "4:3" })).toBe("请选择画面比例");
        expect(directorBriefError(brief)).toBe("");
    });

    test("开场消息带上类型、时长、角色和交付项；关掉的交付项不出现", () => {
        const text = directorKickoffMessage(brief, ["小雅"]);
        expect(text).toContain("产品广告：暖杯保温杯");
        expect(text).toContain("时长 30 秒 · 9:16 · 干净高级");
        expect(text).toContain("角色：小雅");
        expect(text).toContain("包含：旁白配音、字幕、背景音乐");
        expect(directorKickoffMessage({ ...brief, voiceover: false, subtitles: false, music: false })).not.toContain("包含：");
        expect(directorStoryTitle({ genre: "product-ad", subject: "" })).toBe("产品广告");
    });
});

describe("导演回复解析", () => {
    const ids = () => {
        let n = 0;
        return () => `id-${++n}`;
    };

    test("分镜与执行指令：去掉代码块，时长限制，未知角色丢弃，镜头编号按新分镜校验", () => {
        const reply = [
            "好的，分镜如下。",
            "```studio-plan",
            JSON.stringify({ title: "暖杯广告", memory: { decisions: ["暖色调"] }, scenes: [{ id: "scene-a", title: "开场", shots: [{ id: "s1", duration: 40, visual: "杯子特写", characters: ["小雅", "路人"] }, { visual: "" }, { duration: 3, visual: "倒热水" }] }] }),
            "```",
            "```studio-run",
            JSON.stringify({ step: "images", shots: [2, 9, 2] }),
            "```",
        ].join("\n");
        const parsed = parseDirectorReply(reply, { characterNames: ["小雅"], shotCount: 0, newId: ids() });
        expect(parsed.content).toBe("好的，分镜如下。");
        expect(parsed.plan?.title).toBe("暖杯广告");
        expect(parsed.plan?.memory?.decisions).toEqual(["暖色调"]);
        expect(parsed.plan?.scenes).toHaveLength(1);
        expect(parsed.plan?.scenes[0].id).toBe("scene-a");
        expect(parsed.plan?.scenes[0].shots).toHaveLength(2);
        expect(parsed.plan?.scenes[0].shots[0]).toMatchObject({ id: "s1", durationSeconds: 15, fields: { characters: ["小雅"] } });
        expect(parsed.run).toEqual({ id: "id-1", step: "images", shots: [2], status: "proposed" });
    });

    test("格式坏掉的分镜标记为无效，未知步骤忽略，流式时隐藏未完成代码块", () => {
        const parsed = parseDirectorReply("看看\n```studio-plan\n{bad json\n```\n```studio-run\n{\"step\":\"dance\"}\n```", { characterNames: [], shotCount: 3 });
        expect(parsed.plan).toBeNull();
        expect(parsed.planInvalid).toBe(true);
        expect(parsed.run).toBeNull();
        expect(directorVisibleText("先说明\n```studio-plan\n{\"sce")).toBe("先说明");
    });

    test("系统提示词带上当前分镜 ID、角色清单和品牌", () => {
        const prompt = directorSystemPrompt({ story: story([{ id: "s1" }]), characters: [{ name: "小雅", description: "短发" }], brand: "品牌：暖杯", kinds: ["image", "video"] });
        expect(prompt).toContain('"id":"s1"');
        expect(prompt).toContain("- 小雅：短发");
        expect(prompt).toContain("品牌：暖杯");
        expect(prompt).toContain("镜头画面（图片）、镜头视频");
        expect(prompt).not.toContain("旁白配音，");
    });

    test("历史以用户消息开头，执行指令写成摘要", () => {
        const history = directorHistory([
            { role: "assistant", content: "欢迎" },
            { role: "user", content: "开始" },
            { role: "assistant", content: "好", actions: [{ id: "a", step: "videos", shots: [1], status: "done" }] },
        ]);
        expect(history[0]).toEqual({ role: "user", content: "开始" });
        expect(history[1].content).toContain("[生成镜头视频：镜头 1｜已执行]");
    });
});

describe("导演生成与成片", () => {
    test("镜头按场景顺序编号；全部生成只补缺，点名镜头会重做，视频需要先有画面", () => {
        const image = work("img-1", "image");
        const value = story([{ id: "s1", sceneId: "scene-b", activeImageVersionId: "v1" }, { id: "s2" }, { id: "s3", activeImageVersionId: "v3" }], [version("v1", "s1", "image", image), version("v3", "s3", "image", work("img-3", "image", "running"))]);
        expect(directorOrderedShots(value).map((shot) => shot.id)).toEqual(["s2", "s3", "s1"]);
        expect(directorStepTargets(value, "images").map((shot) => shot.id)).toEqual(["s2"]);
        expect(directorStepTargets(value, "images", [3]).map((shot) => shot.id)).toEqual(["s1"]);
        expect(directorStepTargets(value, "videos").map((shot) => shot.id)).toEqual(["s1"]);
        expect(directorStepTargets(value, "voice").map((shot) => shot.id)).toEqual(["s2", "s3", "s1"]);
    });

    test("画面提示词带上出镜角色外形和风格", () => {
        const prompt = directorImagePrompt({ visual: "站在窗边", camera: "近景", characters: ["小雅"], voiceover: "", subtitle: "" }, [{ id: "c", name: "小雅", description: "短发白衬衫", imageResourceIds: [] }], "暖色调");
        expect(prompt).toContain("站在窗边");
        expect(prompt).toContain("镜头：近景");
        expect(prompt).toContain("小雅（短发白衬衫）");
        expect(prompt).toContain("风格：暖色调");
    });

    test("时间线：视频优先、短视频按实际长度、旁白裁到镜头内、音乐 0.2 音量、缺画面的镜头列出", () => {
        const value = story(
            [
                { id: "s1", activeImageVersionId: "i1", activeVideoVersionId: "v1", activeVoiceVersionId: "a1" },
                { id: "s2", activeImageVersionId: "i2" },
                { id: "s3" },
            ],
            [
                version("i1", "s1", "image", work("img-1", "image")),
                version("v1", "s1", "video", work("vid-1", "video", "succeeded", 3000)),
                version("a1", "s1", "audio", work("voice-1", "audio", "succeeded", 5000)),
                version("i2", "s2", "image", work("img-2", "image")),
            ],
        );
        const { timeline, missing, longVoice } = buildDirectorTimeline(value, { music: { storageKey: "resource:song" } });
        expect(missing).toEqual([3]);
        expect(longVoice).toEqual([1]);
        expect(timeline.width).toBe(1080);
        expect(timeline.height).toBe(1920);
        expect(timeline.mixAudioTracks).toBe(true);
        const visual = timeline.clips.filter((clip) => clip.trackId === "video");
        expect(visual.map((clip) => [clip.kind, clip.startMs, clip.durationMs, clip.directMedia?.storageKey])).toEqual([
            ["video", 0, 3000, "resource:vid-1"],
            ["image", 3000, 4000, "resource:img-2"],
        ]);
        expect(visual[0].volume).toBe(0.3);
        expect(visual[1].volume).toBe(1);
        const voice = timeline.clips.find((clip) => clip.trackId === "voiceover");
        expect(voice).toMatchObject({ startMs: 0, durationMs: 3000 });
        const music = timeline.clips.find((clip) => clip.trackId === "music");
        expect(music).toMatchObject({ startMs: 0, durationMs: 7000, volume: DIRECTOR_MUSIC_VOLUME });
        expect(timeline.clips.filter((clip) => clip.trackId === "subtitle").map((clip) => clip.text)).toEqual(["字幕1", "字幕2"]);
        expect(timeline.durationMs).toBe(7000);
        expect(buildDirectorTimeline(value, { subtitles: false }).timeline.clips.some((clip) => clip.trackId === "subtitle")).toBe(false);
    });
});

describe("品牌选择", () => {
    const kits = [
        { id: "a", name: "A", isDefault: false },
        { id: "b", name: "B", isDefault: true },
    ] as StudioBrandKit[];

    test("未选择时用默认套件，明确不使用时为空，已删除的选择回到默认", () => {
        // 默认不套用：没选过、选了「不使用」或套件已删除都不用品牌，默认套件也不会自动生效。
        expect(resolveStudioBrandKit(kits, undefined)).toBeUndefined();
        expect(resolveStudioBrandKit(kits, "a")?.id).toBe("a");
        expect(resolveStudioBrandKit(kits, "")).toBeUndefined();
        expect(resolveStudioBrandKit(kits, "gone")).toBeUndefined();
        expect(resolveStudioBrandKit([], undefined)).toBeUndefined();
    });
});
