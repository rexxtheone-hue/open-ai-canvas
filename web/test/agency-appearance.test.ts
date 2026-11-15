import { expect, test } from "bun:test";

import { brandStudioLabel, normalizePublicAppearance, withSiteBrand } from "../src/stores/use-appearance-store";

test("agency sites never fall back to built-in platform brand assets", () => {
    const appearance = normalizePublicAppearance({ isPlatform: false, brandName: "Acme Studio", brandSlug: "acme", logoUrl: "", darkLogoUrl: "" });

    expect(appearance.isPlatform).toBe(false);
    expect(appearance.logoUrl).toBe("");
    expect(appearance.darkLogoUrl).toBe("");
    expect(JSON.stringify(appearance).toLowerCase()).not.toContain("omnimuse");
    expect(brandStudioLabel(appearance)).toBe("ACME");
    expect(withSiteBrand("你是 OmniMuse 的通用创作助手", appearance)).toBe("你是 Acme Studio 的通用创作助手");
});

test("agency without a brand name gets a neutral fallback", () => {
    expect(normalizePublicAppearance({ isPlatform: false, brandName: "" }).brandName).toBe("Studio");
});

test("platform appearance keeps its built-in brand", () => {
    const appearance = normalizePublicAppearance({});
    expect(appearance.isPlatform).toBe(true);
    expect(appearance.brandName).toBe("OmniMuse");
    expect(appearance.logoUrl).toBe("/brand/omnimuse-mark.png");
    expect(withSiteBrand("OmniMuse", appearance)).toBe("OmniMuse");
});
