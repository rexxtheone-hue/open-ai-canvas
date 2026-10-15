import { describe, expect, test } from "bun:test";

import { isActiveTaskLimitError, submitWithSlotWait } from "../src/pages/studio/studio-agent";
import { ApiError } from "../src/services/api/request";

const limitError = () => new ApiError("同时排队或运行的任务最多 5 个，请等待已有任务完成", { status: 400, code: 400, details: { activeTaskLimit: 5 } });

describe("Agent 提交排队", () => {
    test("只认带 activeTaskLimit 的错误", () => {
        expect(isActiveTaskLimitError(limitError())).toBe(true);
        expect(isActiveTaskLimitError(new ApiError("积分不足"))).toBe(false);
        expect(isActiveTaskLimitError(new Error("x"))).toBe(false);
    });

    test("任务数满时等待后重试同一个，排队提示先开后关", async () => {
        let calls = 0;
        const states: boolean[] = [];
        const result = await submitWithSlotWait(2, async (batchIndex) => {
            calls += 1;
            if (calls <= 2) throw limitError();
            return { id: `t${batchIndex}` };
        }, { waitMs: 1, onWaiting: (value) => states.push(value) });
        expect(result).toEqual({ taskIds: ["t0", "t1"], error: "" });
        expect(calls).toBe(4);
        expect(states).toEqual([true, true, false, false]);
    });

    test("其他错误记下第一条并继续；离开页面停止排队", async () => {
        const mixed = await submitWithSlotWait(3, async (batchIndex) => {
            if (batchIndex === 1) throw new Error("积分不足");
            return { id: `t${batchIndex}` };
        }, { waitMs: 1 });
        expect(mixed).toEqual({ taskIds: ["t0", "t2"], error: "积分不足" });

        const controller = new AbortController();
        controller.abort();
        let calls = 0;
        const stopped = await submitWithSlotWait(1, async () => {
            calls += 1;
            throw limitError();
        }, { waitMs: 1, signal: controller.signal });
        expect(stopped).toEqual({ taskIds: [], error: "已停止排队" });
        expect(calls).toBe(1);
    });
});
