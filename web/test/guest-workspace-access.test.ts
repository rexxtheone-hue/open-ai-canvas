import { describe, expect, test } from "bun:test";

import { isGuestWorkspacePath } from "../src/lib/guest-workspace";

describe("guest workspace route access", () => {
    test("allows only the public creation workspace routes", () => {
        expect(isGuestWorkspacePath("/")).toBe(true);
        expect(isGuestWorkspacePath("/create")).toBe(true);
        expect(isGuestWorkspacePath("/assets")).toBe(false);
        expect(isGuestWorkspacePath("/admin")).toBe(false);
        expect(isGuestWorkspacePath("/create/anything")).toBe(false);
    });

    test("guests can browse Studio tools but not personal pages", () => {
        for (const path of ["/studio", "/studio/create-image", "/studio/video", "/studio/tools", "/studio/tools/lip-sync", "/studio/pricing", "/studio/inspire", "/studio/u/rexx"]) {
            expect(isGuestWorkspacePath(path)).toBe(true);
        }
        for (const path of ["/studio/media", "/studio/canvas", "/studio/profile", "/studio/director/story-1", "/studio/brand", "/studio/u", "/studio/create-image/extra", "/canvas", "/settings"]) {
            expect(isGuestWorkspacePath(path)).toBe(false);
        }
    });
});
