import { describe, expect, test } from "bun:test";

import { compileDirectorPrompt, DEFAULT_DIRECTOR_BRIEF, DIRECTOR_GENRES, DIRECTOR_TITLE_PREFIX, directorBriefError, directorProjectSubject, directorProjectTitle } from "../src/pages/studio/studio-director";
import { resolveStudioBrandKit } from "../src/pages/studio/use-studio-brand";
import type { StudioBrandKit } from "../src/services/api/studio";

const brief = { ...DEFAULT_DIRECTOR_BRIEF, subject: "暖杯保温杯", points: "保温 12 小时", style: "干净高级" };

describe("AI 导演简报", () => {
    test("必填与范围检查", () => {
        expect(directorBriefError({ ...brief, subject: " " })).toBe("请填写产品");
        expect(directorBriefError({ ...brief, genre: "short-drama", subject: "" })).toBe("请填写故事");
        expect(directorBriefError({ ...brief, durationSeconds: 20 })).toBe("请选择成片时长");
        expect(directorBriefError({ ...brief, ratio: "4:3" })).toBe("请选择画面比例");
        expect(directorBriefError({ ...brief, budgetCredits: Number.NaN })).not.toBe("");
        expect(directorBriefError({ ...brief, budgetCredits: 5 })).not.toBe("");
        expect(directorBriefError(brief)).toBe("");
    });

    test("开场指令先要方案和分镜确认，带上预算、角色、品牌和技能", () => {
        const { text, displayText } = compileDirectorPrompt(brief, { brand: { name: "暖杯", prompt: "品牌：暖杯" }, characters: [{ name: "小雅" }], skillIds: ["16000000000105"] });
        expect(displayText).toContain("【AI 导演】产品广告：暖杯保温杯");
        expect(displayText).toContain("时长 30 秒 · 9:16 · 干净高级");
        expect(displayText).toContain("角色：小雅");
        expect(displayText).toContain("预算上限：300 积分");
        expect(displayText).not.toContain("@[skill:");
        expect(text.startsWith(displayText)).toBe(true);
        expect(text).toContain("写完先停下来等我确认，不要直接生成");
        expect(text).toContain("必须使用对应角色卡");
        expect(text).toContain("不能超过 300 积分");
        expect(text).toContain("品牌要求（所有画面和文案都要符合）：\n品牌：暖杯");
        expect(text).toContain("@[skill:16000000000105]");
    });

    test("关掉的交付项不出现", () => {
        const { text, displayText } = compileDirectorPrompt({ ...brief, voiceover: false, subtitles: false, music: false });
        expect(displayText).not.toContain("包含：");
        expect(text).not.toContain("并补上");
    });

    test("每个类型都对应已知场景预设，标题带固定前缀", () => {
        const known = new Set(["", "ad-full-chain", "ai-performer", "brand-positioning", "short-drama-starter"]);
        for (const genre of DIRECTOR_GENRES) expect(known.has(genre.presetId)).toBe(true);
        expect(directorProjectTitle(brief)).toBe(`${DIRECTOR_TITLE_PREFIX}暖杯保温杯`);
        expect(directorProjectTitle({ ...brief, subject: "" })).toBe(`${DIRECTOR_TITLE_PREFIX}产品广告`);
        expect(directorProjectSubject(directorProjectTitle(brief))).toBe("暖杯保温杯");
        expect(directorProjectSubject("AI Director · Bottle")).toBe("Bottle");
        expect(directorProjectSubject("普通画布")).toBeNull();
    });
});

describe("品牌选择", () => {
    const kits = [
        { id: "a", name: "A", isDefault: false },
        { id: "b", name: "B", isDefault: true },
    ] as StudioBrandKit[];

    test("未选择时用默认套件，明确不使用时为空，已删除的选择回到默认", () => {
        expect(resolveStudioBrandKit(kits, undefined)?.id).toBe("b");
        expect(resolveStudioBrandKit(kits, "a")?.id).toBe("a");
        expect(resolveStudioBrandKit(kits, "")).toBeUndefined();
        expect(resolveStudioBrandKit(kits, "gone")?.id).toBe("b");
        expect(resolveStudioBrandKit([], undefined)).toBeUndefined();
    });
});
