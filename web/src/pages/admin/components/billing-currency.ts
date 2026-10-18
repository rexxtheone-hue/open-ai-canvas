import { useEffect, useState } from "react";

import { getAdminBillingCurrencySetting, type BillingCurrencySetting } from "@/services/api/auth";

export type CostCurrency = "CREDIT" | "MYR" | "USD" | "CNY";

export const costCurrencyOptions: Array<{ value: CostCurrency; label: string }> = [
    { value: "CREDIT", label: "积分" },
    { value: "MYR", label: "马币 RM" },
    { value: "USD", label: "美元 US$" },
    { value: "CNY", label: "人民币 ¥" },
];

export const costCurrencySymbol: Record<Exclude<CostCurrency, "CREDIT">, string> = { MYR: "RM", USD: "US$", CNY: "¥" };

let cached: Promise<BillingCurrencySetting> | null = null;

export function loadBillingCurrency(force = false) {
    if (!cached || force) {
        cached = getAdminBillingCurrencySetting().then((result) => result.setting);
        cached.catch(() => {
            cached = null;
        });
    }
    return cached;
}

export function useBillingCurrency() {
    const [setting, setSetting] = useState<BillingCurrencySetting | null>(null);
    useEffect(() => {
        let active = true;
        loadBillingCurrency()
            .then((value) => active && setSetting(value))
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);
    return setting;
}

// 与后端换算口径一致：原币金额 × 兑马币汇率 ÷ 1 积分面值。
export function costSourceToCredits(setting: BillingCurrencySetting | null, currency: CostCurrency, amount: number) {
    if (currency === "CREDIT") return amount;
    if (!setting) return undefined;
    const rate = currency === "MYR" ? 1 : setting.rates[currency];
    if (!rate || !setting.creditValue) return undefined;
    return (amount * rate) / setting.creditValue;
}
