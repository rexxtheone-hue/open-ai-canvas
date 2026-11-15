import type { AdminStatusTone } from "../components/admin-ui";
import type { TenantLedgerEntry, TenantStatus } from "@/services/api/tenant-admin";

/** 代理商每月最低消费 RM 5,000（以仙为单位）。 */
export const MONTHLY_MINIMUM_SEN = 500_000;
export const AGENCY_DISCOUNT_OPTIONS = [15, 25, 30, 40] as const;

/** 金额统一显示为 RM 并保留两位小数，例如 RM 1,234.50。 */
export function formatRM(sen: number) {
    const value = (sen || 0) / 100;
    const sign = value < 0 ? "-" : "";
    return `${sign}RM ${Math.abs(value).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 积分带千分位，最多两位小数。 */
export function formatPoolCredits(microcredits: number) {
    return ((microcredits || 0) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** 把 RM 金额（元）换成仙；非法输入返回 0。 */
export function ringgitToSen(value: number | null | undefined) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * 100);
}

/** 与后端一致：批发积分 = 仙 × 10^9 / 773（向下取整，单位微积分）。 */
export function topupEstimateMicrocredits(sen: number) {
    return sen > 0 ? Math.floor((sen * 1_000_000_000) / 773) : 0;
}

export function minimumProgress(usageSen: number) {
    return Math.max(0, Math.min(100, Math.round(((usageSen || 0) / MONTHLY_MINIMUM_SEN) * 100)));
}

export function usageAgainstMinimum(usageSen: number) {
    return `本月已用 ${formatRM(usageSen)} / 最低消费 ${formatRM(MONTHLY_MINIMUM_SEN)}`;
}

export const tenantStatusLabels: Record<TenantStatus, { label: string; tone: AdminStatusTone }> = {
    active: { label: "正常", tone: "success" },
    suspended: { label: "已停用", tone: "error" },
    closed: { label: "已关闭", tone: "neutral" },
};

export function sslStatusDisplay(status: string): { label: string; tone: AdminStatusTone } {
    switch (status) {
        case "active":
            return { label: "证书已生效", tone: "success" };
        case "pending_validation":
        case "pending_issuance":
        case "pending_deployment":
        case "initializing":
        case "pending":
            return { label: "等待验证", tone: "warning" };
        case "missing":
            return { label: "Cloudflare 上已不存在", tone: "error" };
        case "":
            return { label: "未知", tone: "neutral" };
        default:
            return status.includes("fail") || status.includes("error") || status.includes("timed_out") ? { label: "验证失败", tone: "error" } : { label: status, tone: "neutral" };
    }
}

export const ledgerTypeLabels: Record<TenantLedgerEntry["type"], string> = {
    topup: "充值",
    adjust: "人工调账",
    reserve: "生成预留",
    consume: "生成扣减",
    refund: "退回",
    lot_expire: "批次过期",
    monthly_fee: "月最低消费费",
    debt_settle: "欠款抵扣",
};

export function capabilityLabel(capability: string) {
    return ({ image: "图片", video: "视频", audio: "音频", text: "文本", chat: "文本" } as Record<string, string>)[capability] || capability || "其他";
}

export function priceUnitLabel(billingMode: string) {
    return billingMode === "token" ? "/ 百万输出 token" : billingMode === "per_second" ? "/ 秒" : "/ 次";
}
