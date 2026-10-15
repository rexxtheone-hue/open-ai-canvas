import { describe, expect, test } from "bun:test";

import { snapVideoSeconds } from "../src/pages/studio/studio-agent";
import { parseStudioChatReply, studioChatAssets, studioChatHistory, studioChatSystemPrompt, studioChatVisibleText, type StudioChatMessageLike } from "../src/pages/studio/studio-chat";
import type { StudioWork } from "../src/services/api/studio";
import type { VideoCapabilityConfig } from "../src/lib/model-capabilities";

const ids = () => {
    let n = 0;
    return () => `a${++n}`;
};

describe("对话模式回复解析", () => {
    test("取最后一个计划块，逐项校验并丢弃非法项", () => {
        const reply = [
            "我来安排两张海报。",
            "```studio-actions",
            JSON.stringify([
                { kind: "image", prompt: "咖啡海报", ratio: "9:16", count: 9, refs: [1, 5, 1] },
                { kind: "video", prompt: "旋转展示", seconds: 99, ratio: "7:3" },
                { kind: "audio", prompt: "欢迎光临" },
                { kind: "music", prompt: "x" },
                { kind: "image", prompt: "  " },
            ]),
            "```",
        ].join("\n");
        const parsed = parseStudioChatReply(reply, { kinds: ["image", "video"], assetCount: 2, newId: ids() });
        expect(parsed.content).toBe("我来安排两张海报。");
        expect(parsed.actions).toEqual([
            { id: "a1", kind: "image", prompt: "咖啡海报", ratio: "9:16", count: 4, refs: [1], status: "proposed" },
            { id: "a2", kind: "video", prompt: "旋转展示", seconds: 60, status: "proposed" },
        ]);
    });

    test("没有代码块或 JSON 损坏时只有正文；流式输出隐藏未写完的代码块", () => {
        expect(parseStudioChatReply("你想要什么风格？", { kinds: ["image"], assetCount: 0 }).actions).toEqual([]);
        const broken = parseStudioChatReply("好\n```studio-actions\n[{\n```", { kinds: ["image"], assetCount: 0 });
        expect(broken.actions).toEqual([]);
        expect(broken.content).toBe("好");
        expect(studioChatVisibleText("好的\n```studio-actions\n[{\"ki")).toBe("好的");
        const many = JSON.stringify(Array.from({ length: 6 }, (_, index) => ({ kind: "image", prompt: `p${index}` })));
        expect(parseStudioChatReply(`\`\`\`studio-actions\n${many}\n\`\`\``, { kinds: ["image"], assetCount: 0 }).actions).toHaveLength(4);
    });
});

describe("对话素材编号", () => {
    const messages: StudioChatMessageLike[] = [
        { role: "user", content: "参考这张", attachments: [{ id: "u1", kind: "image", name: "产品.png", url: "", storageKey: "resource:u1" }] },
        { role: "assistant", content: "好", actions: [{ id: "x", kind: "image", prompt: "海报", status: "submitted", taskIds: ["t1", "t2"] }, { id: "y", kind: "video", prompt: "视频", status: "proposed" }] },
        { role: "user", content: "第二张做成视频" },
    ];

    test("用户附件和每个生成任务各占一个编号，未完成的结果不能作为参考", () => {
        const works = new Map<string, StudioWork>([["t1", { id: "t1", kind: "image", status: "succeeded", media: [{ kind: "image", storageKey: "resource:r1" }] } as unknown as StudioWork], ["t2", { id: "t2", kind: "image", status: "running", media: [] } as unknown as StudioWork]]);
        const assets = studioChatAssets(messages, works);
        expect(assets.map((asset) => [asset.index, asset.kind, asset.status, asset.taskId])).toEqual([
            [1, "image", "ready", undefined],
            [2, "image", "ready", "t1"],
            [3, "image", "pending", "t2"],
        ]);
        expect(assets[1].attachment?.storageKey).toBe("resource:r1");
        expect(assets[2].attachment).toBeUndefined();
        const prompt = studioChatSystemPrompt({ kinds: ["image"], assets });
        expect(prompt).toContain("#3 生成的图片（海报）（生成中，暂不能引用）");
        expect(prompt).toContain("当前可以生成：图片。");
    });

    test("历史里附件写成编号、计划写成摘要", () => {
        const history = studioChatHistory(messages);
        expect(history[0].content).toContain("（附件：#1 图片）");
        expect(history[1].content).toContain("[图片｜已提交生成] 海报");
        expect(history[1].content).toContain("[视频｜等待用户确认] 视频");
    });
});

describe("视频时长取整", () => {
    const base = { duration: { selection: "enum", values: [5, 10], default: 5 } } as unknown as VideoCapabilityConfig;
    test("枚举取不短于需求的最近值，超出取最大；范围按步进向上取整", () => {
        expect(snapVideoSeconds(base, 4)).toBe(5);
        expect(snapVideoSeconds(base, 6)).toBe(10);
        expect(snapVideoSeconds(base, 30)).toBe(10);
        const range = { duration: { selection: "range", min: 2, max: 12, step: 2, default: 4 } } as unknown as VideoCapabilityConfig;
        expect(snapVideoSeconds(range, 5)).toBe(6);
        expect(snapVideoSeconds(range, 1)).toBe(2);
        expect(snapVideoSeconds(range, 40)).toBe(12);
    });
});
