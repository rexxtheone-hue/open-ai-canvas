import { describe, expect, test } from "bun:test";

import { appendStudioPage, mergeStudioFirstPage, studioSelectionRange, studioWorkFileName, studioWorkIsActive } from "../src/pages/studio/studio-library-model";
import type { StudioWork } from "../src/services/api/studio";

function work(id: string, createdAt: string, overrides: Partial<StudioWork> = {}): StudioWork {
    return { id, type: "canvas_image", status: "succeeded", stage: "", progress: 100, prompt: "p", createdAt, updatedAt: createdAt, kind: "image", favorite: false, media: [{ kind: "image", url: "https://cdn/x.png" }], ...overrides } as StudioWork;
}

describe("AI Studio 作品库", () => {
    test("刷新第一页会加入新作品、去掉已删除的作品，并保留更早的分页", () => {
        const existing = [work("c", "2026-10-15T10:03:00Z"), work("b", "2026-10-15T10:02:00Z"), work("a", "2026-10-15T10:01:00Z"), work("old", "2026-10-15T09:00:00Z")];
        const merged = mergeStudioFirstPage(existing, { works: [work("d", "2026-10-15T10:04:00Z"), work("c", "2026-10-15T10:03:00Z", { favorite: true }), work("a", "2026-10-15T10:01:00Z")], nextCursor: "next" });
        expect(merged.map((item) => item.id)).toEqual(["d", "c", "a", "old"]);
        expect(merged[1].favorite).toBe(true);
    });

    test("没有下一页时第一页就是全部", () => {
        const merged = mergeStudioFirstPage([work("x", "2026-10-15T09:00:00Z")], { works: [work("y", "2026-10-15T10:00:00Z")] });
        expect(merged.map((item) => item.id)).toEqual(["y"]);
    });

    test("翻页追加时去掉重复", () => {
        const next = appendStudioPage([work("a", "2026-10-15T10:00:00Z")], { works: [work("a", "2026-10-15T10:00:00Z"), work("b", "2026-10-15T09:00:00Z")] });
        expect(next.map((item) => item.id)).toEqual(["a", "b"]);
    });

    test("排队、生成中和刚完成还在转存的作品需要继续刷新", () => {
        const now = Date.parse("2026-10-15T10:05:00Z");
        expect(studioWorkIsActive(work("a", "2026-10-15T10:00:00Z", { status: "running", media: [] }), now)).toBe(true);
        expect(studioWorkIsActive(work("b", "2026-10-15T10:00:00Z", { status: "succeeded", media: [], completedAt: "2026-10-15T10:04:00Z" }), now)).toBe(true);
        expect(studioWorkIsActive(work("c", "2026-10-15T09:00:00Z", { status: "succeeded", media: [], completedAt: "2026-10-15T09:01:00Z" }), now)).toBe(false);
        expect(studioWorkIsActive(work("d", "2026-10-15T10:00:00Z"), now)).toBe(false);
        expect(studioWorkIsActive(work("e", "2026-10-15T10:00:00Z", { status: "failed", media: [] }), now)).toBe(false);
    });

    test("L5 Shift 多选选中两次点击之间的全部作品", () => {
        const works = ["a", "b", "c", "d"].map((id, index) => work(id, `2026-10-15T10:0${index}:00Z`));
        expect([...studioSelectionRange(works, "d", "b", new Set())].sort()).toEqual(["b", "c", "d"]);
        expect([...studioSelectionRange(works, null, "c", new Set(["a"]))].sort()).toEqual(["a", "c"]);
    });

    test("下载文件名按类型给扩展名，并去掉非法字符", () => {
        expect(studioWorkFileName(work("abcdef123", "2026-10-15T10:00:00Z", { prompt: "a/b: c?", media: [{ kind: "video" }] }), 0)).toBe("a-b-c-abcdef.mp4");
        expect(studioWorkFileName(work("abcdef123", "2026-10-15T10:00:00Z", { prompt: "", media: [{ kind: "audio", mimeType: "audio/wav" }] }), 0)).toBe("studio-abcdef.wav");
    });
});
