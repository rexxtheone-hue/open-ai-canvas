import { describe, expect, test } from "bun:test";

import { MARKETER_EXPERT_IDS, MARKETER_QUICK_GROUPS, MARKETER_SHOWCASES, marketerExperts, pickExpertSkills, studioExpertPrompt } from "../src/pages/studio/studio-marketer";
import type { Skill, SkillExpert } from "../src/services/api/skills";

const skill = (skillId: string, skillName: string, description = "", isAdded = true) => ({ skillId, skillName, description, isAdded }) as Skill;

const expert = (expertId: string): SkillExpert => ({ expertId, name: expertId, scene: "ecommerce", tagline: "", persona: "persona", skillIds: [], cases: [] });

describe("pickExpertSkills", () => {
    const installed = [
        skill("a", "广告文案四步系统", "写广告文案"),
        skill("b", "TikTok网红带货视频", "UGC 带货短视频脚本"),
        skill("c", "定位与命名策略", "品牌定位"),
        skill("d", "小红书素人穿搭配方", "小红书种草笔记"),
        skill("e", "消费心理转化设计", "转化"),
        skill("f", "未安装", "带货", false),
    ];

    test("returns installed expert skills in order when under the limit", () => {
        expect(pickExpertSkills(installed, ["c", "a", "f"], "随便", 4).map((item) => item.skillId)).toEqual(["c", "a"]);
    });

    test("ranks by overlap with the prompt and keeps catalog order for ties", () => {
        const picked = pickExpertSkills(installed, ["a", "b", "c", "d", "e"], "帮我写 3 条 TikTok 带货视频脚本和小红书种草", 2);
        expect(picked.map((item) => item.skillId)).toEqual(["b", "d"]);
    });

    test("falls back to the first skills when nothing matches", () => {
        expect(pickExpertSkills(installed, ["a", "b", "c", "d", "e"], "zzz", 3).map((item) => item.skillId)).toEqual(["a", "b", "c"]);
    });
});

test("studioExpertPrompt includes the expert and the Studio adaptation note", () => {
    const text = studioExpertPrompt({ name: "营销总监", persona: "  你是营销总监。 " });
    expect(text.startsWith("# 当前专家：营销总监\n\n你是营销总监。")).toBe(true);
    expect(text).toContain("## 在 Studio 对话中工作");
});

test("marketerExperts puts the marketing team first", () => {
    const sorted = marketerExperts([expert("short-drama-expert"), expert("social-content-expert"), expert("marketing-expert")]);
    expect(sorted.map((item) => item.expertId)).toEqual(["marketing-expert", "social-content-expert", "short-drama-expert"]);
});

test("quick starts and showcases only point at marketing experts", () => {
    const used = [...MARKETER_QUICK_GROUPS.flatMap((group) => group.items.map((item) => item.expertId)), ...MARKETER_SHOWCASES.map((item) => item.expertId)];
    for (const id of used) expect(MARKETER_EXPERT_IDS).toContain(id);
});
