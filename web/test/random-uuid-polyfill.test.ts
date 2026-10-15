import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { randomUUIDFallback, sha256 } from "../src/lib/random-uuid-polyfill";

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

describe("http 访问时的 crypto 兼容实现", () => {
    test("randomUUID 生成标准 v4 UUID 且不重复", () => {
        const ids = new Set(Array.from({ length: 200 }, () => randomUUIDFallback()));
        expect(ids.size).toBe(200);
        for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test("SHA-256 与标准实现逐字节一致（含分块边界和中文）", () => {
        const samples = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "canvas-operation-generation\0agent\0会话\0节点", "x".repeat(10_000)];
        for (const sample of samples) {
            const bytes = new TextEncoder().encode(sample);
            expect(hex(sha256(bytes))).toBe(createHash("sha256").update(bytes).digest("hex"));
        }
    });
});
