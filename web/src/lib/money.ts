/** 金额以最小货币单位保存（分、仙、cent），这里统一按 1/100 显示并带上币种符号。 */
export function formatMoney(amountMinor: number, currency = "CNY") {
    const code = (currency || "CNY").toUpperCase();
    const value = amountMinor / 100;
    try {
        return new Intl.NumberFormat(code === "CNY" ? "zh-CN" : "en-MY", { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch {
        return `${code} ${value.toFixed(2)}`;
    }
}

export const TOPUP_CURRENCIES = ["CNY", "MYR", "USD", "SGD", "HKD", "EUR", "GBP", "AUD"] as const;
