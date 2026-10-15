import { useEffect, useMemo, useState } from "react";

import { requestCreditCost } from "@/constant/credits";
import { modelQuoteRequest } from "@/lib/model-pricing";
import type { ModelRequirements } from "@/lib/model-selection";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { modelOptionName, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type GenerationCreditInput = {
    config: AiConfig;
    model: string;
    mode: "text" | "image" | "video" | "audio";
    count: string | number;
    seconds: string | number;
    requirements?: ModelRequirements;
};

/**
 * 生成按钮上的积分：后台报价优先（与实际扣费同源），报价不可用时退回渠道价格表的本地估算。
 * 创作页与 AI Studio 共用，保证两边显示的价格一致。
 */
export function useGenerationCredits({ config, model, mode, count, seconds, requirements }: GenerationCreditInput) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const priceChannel = resolveModelChannel(config, model);
    const quoteRequest = useMemo(() => (model ? modelQuoteRequest(config, model, mode, requirements) : null), [config, mode, model, requirements]);
    const [routeQuote, setRouteQuote] = useState<LogicalModelQuote | null>(null);
    const localCredits = model
        ? requestCreditCost({
              channelMode: priceChannel.scope === "system" ? "remote" : "local",
              modelCosts: priceChannel.modelCosts,
              model: modelOptionName(model),
              count: mode === "image" ? count : 1,
              seconds: mode === "video" ? seconds : 1,
              capability: mode,
              config,
              requirements,
          })
        : null;
    useEffect(() => {
        if (!creditsEnabled || !quoteRequest) {
            setRouteQuote(null);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(null);
        quoteModel(quoteRequest, controller.signal)
            .then(({ quote }) => setRouteQuote(quote))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(null);
            });
        return () => controller.abort();
    }, [creditsEnabled, quoteRequest]);
    const credits = routeQuote ? routeQuote.amountMicrocredits / 1_000_000 : localCredits;
    return {
        creditsEnabled,
        credits: credits === undefined ? null : credits,
        estimated: Boolean(routeQuote?.estimated),
        routeQuote,
    };
}
