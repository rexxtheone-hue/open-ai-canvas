import { create } from "zustand";
import { DEFAULT_CANVAS_APPEARANCE, type CanvasAppearance } from "@/lib/canvas/agent-appearance";
import { DEFAULT_UPDATE_ANNOUNCEMENT, normalizeUpdateAnnouncement } from "@/lib/update-announcement";

import type { PublicAppearance } from "@/services/api/appearance";
import { applySkinTheme, DEFAULT_CLASSIC_SKIN, normalizeSkinDefinition } from "@/lib/skin-themes";
import { translateKnownText, translateServerText } from "@/lib/i18n/runtime";

/** 内置品牌：OmniMuse 标志、浏览器图标和分享预览图，放在 public/brand。 */
export const BUILTIN_LOGO_URL = "/brand/omnimuse-mark.png";
const BUILTIN_FAVICON_URL = "/brand/favicon.ico";
const BUILTIN_TOUCH_ICON_URL = "/brand/apple-touch-icon.png";
const BUILTIN_SOCIAL_IMAGE_URL = "/brand/og-image.jpg";

export const DEFAULT_PUBLIC_APPEARANCE: PublicAppearance = {
    updates: DEFAULT_UPDATE_ANNOUNCEMENT,
    canvas: DEFAULT_CANVAS_APPEARANCE,
    schemaVersion: 10,
    brandName: "OmniMuse",
    brandSlug: "open-ai-canvas",
    authHeroTitle: "一个想法，\n生成所有创作。",
    authHeroDescription: "",
    logoUrl: BUILTIN_LOGO_URL,
    darkLogoUrl: BUILTIN_LOGO_URL,
    logoFrameEnabled: false,
    authVideoUrl: "https://boss-shjd.biliapi.net/updream/aniforge/video/video_bbcb00bd-650d-4249-9346-5cd21fd2484c_m1hc-u0-1pu13x-3v1s.mp4",
    authVideoPosterUrl: "https://i0.hdslb.com/bfs/aitool/aniforge/image/02933f26-5f1b-49ff-a811-b7f95ee5e5b8_m1hc-u0-sau.jpg",
    authVideoAutoplay: true,
    skinId: "classic",
    activeSkin: DEFAULT_CLASSIC_SKIN,
    seoTitle: "OmniMuse",
    seoDescription: "OmniMuse，全能 AI 创作工作室：视频、图片、配音与广告，一站完成。",
    seoKeywords: "",
    footerCopyright: `© ${new Date().getFullYear()} OmniMuse. All rights reserved.`,
    icpFilingEnabled: false,
    icpFilingNumber: "",
    redeemPurchaseUrl: "",
    logoConfigured: false,
    darkLogoConfigured: false,
    authVideoConfigured: false,
    authVideoPosterConfigured: false,
    configured: false,
    revision: "builtin",
};

type AppearanceStore = {
    appearance: PublicAppearance;
    resolved: boolean;
    setAppearance: (appearance: PublicAppearance) => void;
};

export const useAppearanceStore = create<AppearanceStore>((set) => ({
    appearance: DEFAULT_PUBLIC_APPEARANCE,
    resolved: false,
    setAppearance: (appearance) => set({ appearance, resolved: true }),
}));

export function normalizePublicAppearance(value?: Partial<PublicAppearance> | null): PublicAppearance {
    const brandName = translateKnownText(String(value?.brandName || "").trim());
    const brandSlug = normalizeBrandSlug(value?.brandSlug);
    const authHeroTitle = normalizeAppearanceCopy(value?.authHeroTitle, DEFAULT_PUBLIC_APPEARANCE.authHeroTitle);
    const authHeroDescription = normalizeAppearanceCopy(value?.authHeroDescription, DEFAULT_PUBLIC_APPEARANCE.authHeroDescription, true);
    const customVideo = Boolean(value?.authVideoConfigured);
    const logoUrl = safeAppearanceURL(value?.logoUrl, DEFAULT_PUBLIC_APPEARANCE.logoUrl);
    const darkLogoUrl = safeAppearanceURL(value?.darkLogoUrl, logoUrl);
    const resolvedBrandName = brandName || DEFAULT_PUBLIC_APPEARANCE.brandName;
    // 后端默认文案里嵌着原品牌名，品牌名被翻译时同步替换。
    const rawBrandName = String(value?.brandName || "").trim();
    const withBrand = (text: string) => (rawBrandName && brandName !== rawBrandName ? translateServerText(text).replaceAll(rawBrandName, brandName) : text);
    const seoTitle = withBrand(normalizeAppearanceCopy(value?.seoTitle, resolvedBrandName));
    const seoDescription = withBrand(normalizeAppearanceCopy(value?.seoDescription, `${resolvedBrandName}，全能 AI 创作工作室：视频、图片、配音与广告，一站完成。`, true));
    const seoKeywords = normalizeAppearanceCopy(value?.seoKeywords, "", true);
    const footerCopyright = withBrand(normalizeAppearanceCopy(value?.footerCopyright, `© ${new Date().getFullYear()} ${resolvedBrandName}. All rights reserved.`));
    const icpFilingNumber = normalizeAppearanceCopy(value?.icpFilingNumber, "", true);
    const redeemPurchaseUrl = typeof value?.redeemPurchaseUrl === "string" ? safeAppearanceURL(value.redeemPurchaseUrl, "") : "";
    return {
        ...DEFAULT_PUBLIC_APPEARANCE,
        ...value,
        schemaVersion: 10,
        updates: normalizeUpdateAnnouncement(value?.updates),
        canvas: translateCanvasCopy({ ...DEFAULT_CANVAS_APPEARANCE, ...value?.canvas }),
        brandName: resolvedBrandName,
        brandSlug,
        authHeroTitle,
        authHeroDescription,
        logoUrl,
        darkLogoUrl,
        logoFrameEnabled: value?.logoFrameEnabled !== false,
        authVideoUrl: safeAppearanceURL(value?.authVideoUrl, DEFAULT_PUBLIC_APPEARANCE.authVideoUrl),
        authVideoPosterUrl: safeAppearanceURL(value?.authVideoPosterUrl, customVideo ? "" : DEFAULT_PUBLIC_APPEARANCE.authVideoPosterUrl),
        authVideoAutoplay: value?.authVideoAutoplay !== false,
        skinId: normalizeSkinDefinition(value?.activeSkin).id,
        activeSkin: normalizeSkinDefinition(value?.activeSkin),
        seoTitle,
        seoDescription,
        seoKeywords,
        footerCopyright,
        icpFilingEnabled: Boolean(value?.icpFilingEnabled && icpFilingNumber),
        icpFilingNumber,
        redeemPurchaseUrl,
        logoConfigured: Boolean(value?.logoConfigured),
        darkLogoConfigured: Boolean(value?.darkLogoConfigured),
        authVideoConfigured: customVideo,
        authVideoPosterConfigured: Boolean(value?.authVideoPosterConfigured),
        configured: Boolean(value?.configured),
        revision: String(value?.revision || DEFAULT_PUBLIC_APPEARANCE.revision),
    };
}

function translateCanvasCopy(canvas: CanvasAppearance): CanvasAppearance {
    return Object.fromEntries(Object.entries(canvas).map(([key, value]) => [key, typeof value === "string" ? translateKnownText(value) : value])) as CanvasAppearance;
}

function normalizeAppearanceCopy(value: unknown, fallback: string, allowEmpty = false) {
    if (typeof value !== "string") return fallback;
    const normalized = translateKnownText(value.replace(/\r\n?/g, "\n").trim());
    return normalized || (allowEmpty ? "" : fallback);
}

export function commitPublicAppearance(value?: Partial<PublicAppearance> | null) {
    const appearance = normalizePublicAppearance(value);
    useAppearanceStore.getState().setAppearance(appearance);
    applySkinTheme(appearance.activeSkin, typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light");
    applyAppearanceMetadata(appearance);
    return appearance;
}

export function applyAppearanceMetadata(appearance: PublicAppearance, targetDocument: Document | undefined = typeof document === "undefined" ? undefined : document) {
    if (!targetDocument) return;
    targetDocument.title = appearance.seoTitle || appearance.brandName;
    setMeta(targetDocument, "name", "description", appearance.seoDescription);
    setMeta(targetDocument, "name", "keywords", appearance.seoKeywords);
    setMeta(targetDocument, "property", "og:title", appearance.seoTitle || appearance.brandName);
    setMeta(targetDocument, "property", "og:description", appearance.seoDescription);
    setMeta(targetDocument, "property", "og:site_name", appearance.brandName);
    setMeta(targetDocument, "property", "og:type", "website");
    setMeta(targetDocument, "name", "twitter:card", "summary");
    setMeta(targetDocument, "name", "twitter:title", appearance.seoTitle || appearance.brandName);
    setMeta(targetDocument, "name", "twitter:description", appearance.seoDescription);
    const mode = targetDocument.documentElement.classList.contains("dark") ? "dark" : "light";
    setMeta(targetDocument, "name", "theme-color", appearance.activeSkin.tokens[mode].canvas);
    let favicon = targetDocument.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon) {
        favicon = targetDocument.createElement("link");
        favicon.rel = "icon";
        targetDocument.head.appendChild(favicon);
    }
    // 没有上传自定义 Logo 时用内置的圆角 App 图标，比透明标志在标签页里更清楚。
    favicon.href = appearance.logoConfigured ? appearanceLogoURL(appearance, mode) : BUILTIN_FAVICON_URL;
    let touchIcon = targetDocument.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!touchIcon) {
        touchIcon = targetDocument.createElement("link");
        touchIcon.rel = "apple-touch-icon";
        targetDocument.head.appendChild(touchIcon);
    }
    touchIcon.href = appearance.logoConfigured ? appearanceLogoURL(appearance, "light") : BUILTIN_TOUCH_ICON_URL;
    const origin = targetDocument.defaultView?.location?.origin || "";
    setMeta(targetDocument, "property", "og:image", appearance.logoConfigured ? "" : `${origin}${BUILTIN_SOCIAL_IMAGE_URL}`);

    const location = targetDocument.defaultView?.location;
    if (location && (location.protocol === "http:" || location.protocol === "https:")) {
        let canonical = targetDocument.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (!canonical) {
            canonical = targetDocument.createElement("link");
            canonical.rel = "canonical";
            targetDocument.head.appendChild(canonical);
        }
        canonical.href = `${location.origin}${location.pathname}`;
    }
}

function setMeta(targetDocument: Document, attribute: "name" | "property", key: string, content: string) {
    let element = targetDocument.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!content) {
        element?.remove();
        return;
    }
    if (!element) {
        element = targetDocument.createElement("meta");
        element.setAttribute(attribute, key);
        targetDocument.head.appendChild(element);
    }
    element.content = content;
}

export function appearanceLogoURL(appearance: PublicAppearance, theme: "light" | "dark") {
    return theme === "dark" ? appearance.darkLogoUrl || appearance.logoUrl : appearance.logoUrl || appearance.darkLogoUrl;
}

export function brandStudioLabel(appearance: PublicAppearance) {
    if (appearance.brandName === DEFAULT_PUBLIC_APPEARANCE.brandName && appearance.brandSlug === DEFAULT_PUBLIC_APPEARANCE.brandSlug) return "YINGCE STUDIO";
    return appearance.brandSlug.replace(/-+/g, " ").toLocaleUpperCase();
}

function normalizeBrandSlug(value: unknown) {
    const candidate = String(value || "")
        .trim()
        .toLocaleLowerCase();
    return /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(candidate) ? candidate : DEFAULT_PUBLIC_APPEARANCE.brandSlug;
}

function safeAppearanceURL(value: unknown, fallback: string) {
    const candidate = String(value || "").trim();
    if (!candidate) return fallback;
    if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol === "https:") return parsed.toString();
    } catch {
        // Invalid or unsafe asset locations fall back to the bundled appearance.
    }
    return fallback;
}
