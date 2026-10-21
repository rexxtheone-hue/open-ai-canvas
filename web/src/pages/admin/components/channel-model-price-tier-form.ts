import type { ModelCapabilityChoice } from "@/components/model-protocol-picker";
import type { ModelCapabilityConfig } from "@/lib/model-capabilities";
import type { ImageCapabilityConfig } from "@/lib/model-capabilities";
import type { ChannelModel, ChannelModelPriceTier } from "@/services/api/wallet";
import type { CostCurrency } from "./billing-currency";

export type PriceTierMatchMode = "default" | "advanced";

// 与后端保存口径一致：上游键比较前剥掉一次 models/ 前缀，避免极旧存量行误报差异。
export function normalizeUpstreamModelKey(value: unknown): string {
    return String(value || "")
        .trim()
        .replace(/^models\//, "");
}

export type PriceTierFormValues = {
    imageSelector?: Record<string, string>;
    matchMode: PriceTierMatchMode;
    operation: string;
    imageResolution: string;
    quality: string;
    size: string;
    resolution: string;
    videoSeconds: number;
    videoGenerateAudio: string;
    /** 视频价格档是否要求带参考视频：* 任意，true 有，false 无。 */
    videoInput: string;
    imageCount: number;
    providerModelKey?: string;
    billingMode: ChannelModel["billingMode"];
    unitPrice: number;
    inputTokenPrice: number;
    outputTokenPrice: number;
    cachedTokenPrice: number;
    imageTokenPrice: number;
    costConfigured: boolean;
    /** 成本金额的填写币种；非积分时金额为原币，由后端按汇率换算成积分成本。 */
    costCurrency: CostCurrency;
    costUnitPrice: number;
    costInputTokenPrice: number;
    costOutputTokenPrice: number;
    costCachedTokenPrice: number;
    costExtraImagePrice: number;
    costExtraVideoSecondPrice: number;
    costImageTokenPrice: number;
    /** 附加费：前 N 张参考图免费，之后每张收费；参考视频按秒收费。 */
    surchargeFreeImages: number;
    surchargeImagePrice: number;
    surchargeVideoSecondPrice: number;
    priceConfigured: boolean;
    enabled: boolean;
};

export function defaultPriceTier(matchMode: PriceTierMatchMode = "default"): PriceTierFormValues {
    return {
        matchMode,
        operation: "*",
        imageResolution: "*",
        quality: "*",
        size: "*",
        resolution: "*",
        videoSeconds: 0,
        videoGenerateAudio: "*",
        videoInput: "*",
        imageCount: 0,
        providerModelKey: "",
        billingMode: "fixed_request",
        unitPrice: 0,
        inputTokenPrice: 0,
        outputTokenPrice: 0,
        cachedTokenPrice: 0,
        imageTokenPrice: 0,
        costConfigured: false,
        costCurrency: "CREDIT",
        costUnitPrice: 0,
        costInputTokenPrice: 0,
        costOutputTokenPrice: 0,
        costCachedTokenPrice: 0,
        costExtraImagePrice: 0,
        costExtraVideoSecondPrice: 0,
        costImageTokenPrice: 0,
        surchargeFreeImages: 0,
        surchargeImagePrice: 0,
        surchargeVideoSecondPrice: 0,
        priceConfigured: true,
        enabled: true,
    };
}

export function priceTierToForm(tier: ChannelModelPriceTier, image?: ImageCapabilityConfig, protocol?: string): PriceTierFormValues {
    const selector = { ...(tier.selector || {}) };
    const legacyResolution = selector.quality?.toLowerCase();
    const legacyResolutionProtocol = protocol === "grok-image" || protocol === "agnes-image";
    if (legacyResolutionProtocol && image?.resolution.supported && !image.quality.supported && legacyResolution && image.resolution.values.some((value) => value.toLowerCase() === legacyResolution) && !selector.imageResolution) {
        selector.imageResolution = legacyResolution;
        delete selector.quality;
    }
    const candidates = image?.parameters ? Object.values(selector) : [selector.operation, selector.imageResolution, selector.quality, selector.resolution, selector.size, selector.videoInput];
    const hasSpecificMatch = candidates.some((value) => value && value !== "*") || (tier.resolution && tier.resolution !== "*");
    return {
        matchMode: hasSpecificMatch ? "advanced" : "default",
        operation: selector.operation || "*",
        imageSelector: Object.fromEntries(Object.entries(selector).filter(([name]) => name !== "operation")),
        imageResolution: selector.imageResolution || "*",
        quality: selector.quality || "*",
        size: selector.size || "*",
        resolution: selector.resolution || tier.resolution || "*",
        videoSeconds: tier.videoSeconds || 0,
        videoGenerateAudio: selector.videoGenerateAudio || "*",
        videoInput: selector.videoInput || "*",
        imageCount: Number(selector.imageCount || 0),
        providerModelKey: tier.providerModelKey || "",
        billingMode: tier.billingMode,
        unitPrice: tier.unitPriceMicrocredits / 1_000_000,
        inputTokenPrice: tier.inputTokenPriceMicrocredits / 1_000_000,
        outputTokenPrice: tier.outputTokenPriceMicrocredits / 1_000_000,
        cachedTokenPrice: tier.cachedTokenPriceMicrocredits / 1_000_000,
        imageTokenPrice: (tier.imageTokenPriceMicrocredits ?? 0) / 1_000_000,
        costConfigured: tier.costPricing?.configured === true,
        ...costFormValues(tier),
        surchargeFreeImages: tier.surcharge?.freeImages ?? 0,
        surchargeImagePrice: (tier.surcharge?.imagePriceMicrocredits ?? 0) / 1_000_000,
        surchargeVideoSecondPrice: (tier.surcharge?.videoSecondPriceMicrocredits ?? 0) / 1_000_000,
        priceConfigured: tier.priceConfigured,
        enabled: tier.enabled,
    };
}

function costFormValues(
    tier: ChannelModelPriceTier,
): Pick<PriceTierFormValues, "costCurrency" | "costUnitPrice" | "costInputTokenPrice" | "costOutputTokenPrice" | "costCachedTokenPrice" | "costExtraImagePrice" | "costExtraVideoSecondPrice" | "costImageTokenPrice"> {
    const source = tier.costSource;
    if (source?.currency) {
        return {
            costCurrency: source.currency,
            costUnitPrice: source.unitPrice / 1_000_000,
            costInputTokenPrice: source.inputTokenPrice / 1_000_000,
            costOutputTokenPrice: source.outputTokenPrice / 1_000_000,
            costCachedTokenPrice: source.cachedTokenPrice / 1_000_000,
            costExtraImagePrice: (source.extraImagePrice ?? 0) / 1_000_000,
            costExtraVideoSecondPrice: (source.extraVideoSecondPrice ?? 0) / 1_000_000,
            costImageTokenPrice: (source.imageTokenPrice ?? 0) / 1_000_000,
        };
    }
    return {
        costCurrency: "CREDIT",
        costUnitPrice: (tier.costPricing?.unitPriceMicrocredits ?? 0) / 1_000_000,
        costInputTokenPrice: (tier.costPricing?.inputTokenPriceMicrocredits ?? 0) / 1_000_000,
        costOutputTokenPrice: (tier.costPricing?.outputTokenPriceMicrocredits ?? 0) / 1_000_000,
        costCachedTokenPrice: (tier.costPricing?.cachedTokenPriceMicrocredits ?? 0) / 1_000_000,
        costExtraImagePrice: (tier.costPricing?.extraImagePriceMicrocredits ?? 0) / 1_000_000,
        costExtraVideoSecondPrice: (tier.costPricing?.extraVideoSecondPriceMicrocredits ?? 0) / 1_000_000,
        costImageTokenPrice: (tier.costPricing?.imageTokenPriceMicrocredits ?? 0) / 1_000_000,
    };
}

export function legacyPriceTierToForm(item: ChannelModel): PriceTierFormValues {
    return {
        ...defaultPriceTier(),
        // 不预填顶层上游键：统一价格档保持“跟随模型默认上游 ID”，
        // 否则首次保存会把当时的上游键固化进档位，之后模型级重命名会被旧值遮蔽。
        billingMode: item.billingMode,
        unitPrice: item.unitPriceMicrocredits / 1_000_000,
        inputTokenPrice: item.inputTokenPriceMicrocredits / 1_000_000,
        outputTokenPrice: item.outputTokenPriceMicrocredits / 1_000_000,
        cachedTokenPrice: item.cachedTokenPriceMicrocredits / 1_000_000,
        priceConfigured: item.priceConfigured,
        enabled: item.enabled,
    };
}

export function skuSelectorFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues, capabilityConfig?: ModelCapabilityConfig) {
    if (tier.matchMode !== "advanced") return {};
    const selector: Record<string, string> = {};
    if (tier.operation && tier.operation !== "*") selector.operation = tier.operation;
    if (capability === "video") {
        if (tier.resolution && tier.resolution !== "*") selector.vquality = tier.resolution;
        if (tier.videoInput === "true" || tier.videoInput === "false") selector.videoInput = tier.videoInput;
    }
    if (capability === "image") {
        if (capabilityConfig?.image?.parameters) {
            for (const field of capabilityConfig.image.parameters) {
                if (field.enabled === false || !field.pricing) continue;
                const value = tier.imageSelector?.[field.name];
                if (value !== undefined && value !== "" && value !== "*") selector[field.name] = String(value);
            }
            return selector;
        }
        if (capabilityConfig?.image?.resolution.supported !== false && tier.imageResolution && tier.imageResolution !== "*") selector.imageResolution = tier.imageResolution;
        if (capabilityConfig?.image?.quality.supported !== false && tier.quality && tier.quality !== "*") selector.quality = tier.quality;
        if (tier.size && tier.size !== "*") selector.size = tier.size;
    }
    return selector;
}

export function priceTierResolutionFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues) {
    return capability === "video" && tier.matchMode === "advanced" ? tier.resolution || "*" : "*";
}

export function priceTierVideoSecondsFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues) {
    void capability;
    void tier;
    return 0;
}

export function priceTierPayloadFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues, upstreamModel: string, capabilityConfig?: ModelCapabilityConfig) {
    const videoTokens = capability === "video" && tier.billingMode === "token";
    const isVideo = capability === "video";
    const micro = (value: number | undefined) => (isVideo ? Math.round((value || 0) * 1_000_000) : 0);
    // 图片 Token 价只对按 Token 计费的图片模型有效，其它情况固定为 0，避免切换计费方式后残留。
    const imageTokens = capability === "image" && tier.billingMode === "token";
    const imageMicro = (value: number | undefined) => (imageTokens ? Math.round((value || 0) * 1_000_000) : 0);
    return {
        selector: skuSelectorFromForm(capability, tier, capabilityConfig),
        resolution: priceTierResolutionFromForm(capability, tier),
        videoSeconds: priceTierVideoSecondsFromForm(capability, tier),
        providerModelKey: tier.providerModelKey?.trim() || upstreamModel,
        billingMode: tier.billingMode,
        unitPriceMicrocredits: Math.round((tier.unitPrice || 0) * 1_000_000),
        inputTokenPriceMicrocredits: videoTokens ? 0 : Math.round((tier.inputTokenPrice || 0) * 1_000_000),
        outputTokenPriceMicrocredits: Math.round((tier.outputTokenPrice || 0) * 1_000_000),
        cachedTokenPriceMicrocredits: videoTokens || imageTokens ? 0 : Math.round((tier.cachedTokenPrice || 0) * 1_000_000),
        imageTokenPriceMicrocredits: imageMicro(tier.imageTokenPrice),
        costPricing: {
            configured: tier.costConfigured,
            unitPriceMicrocredits: Math.round(tier.costUnitPrice * 1_000_000),
            inputTokenPriceMicrocredits: videoTokens ? 0 : Math.round(tier.costInputTokenPrice * 1_000_000),
            outputTokenPriceMicrocredits: Math.round(tier.costOutputTokenPrice * 1_000_000),
            cachedTokenPriceMicrocredits: videoTokens ? 0 : Math.round(tier.costCachedTokenPrice * 1_000_000),
            extraImagePriceMicrocredits: micro(tier.costExtraImagePrice),
            extraVideoSecondPriceMicrocredits: micro(tier.costExtraVideoSecondPrice),
            imageTokenPriceMicrocredits: imageMicro(tier.costImageTokenPrice),
        },
        costSource: {
            currency: tier.costConfigured && tier.costCurrency && tier.costCurrency !== "CREDIT" ? tier.costCurrency : ("" as const),
            unitPrice: Math.round(tier.costUnitPrice * 1_000_000),
            inputTokenPrice: videoTokens ? 0 : Math.round(tier.costInputTokenPrice * 1_000_000),
            outputTokenPrice: Math.round(tier.costOutputTokenPrice * 1_000_000),
            cachedTokenPrice: videoTokens ? 0 : Math.round(tier.costCachedTokenPrice * 1_000_000),
            extraImagePrice: micro(tier.costExtraImagePrice),
            extraVideoSecondPrice: micro(tier.costExtraVideoSecondPrice),
            imageTokenPrice: imageMicro(tier.costImageTokenPrice),
        },
        surcharge: {
            freeImages: isVideo ? Math.max(0, Math.floor(tier.surchargeFreeImages || 0)) : 0,
            imagePriceMicrocredits: micro(tier.surchargeImagePrice),
            videoSecondPriceMicrocredits: micro(tier.surchargeVideoSecondPrice),
        },
        priceConfigured: tier.priceConfigured !== false,
        enabled: tier.enabled !== false,
    };
}
