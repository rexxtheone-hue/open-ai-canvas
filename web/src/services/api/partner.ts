import { http } from "./request";

export type PartnerKind = "creator" | "merchant" | "affiliate";
export type PartnerApplicationStatus = "pending" | "approved" | "rejected" | "revoked";

export const partnerKindLabels: Record<PartnerKind, string> = { creator: "认证创作者", merchant: "商家", affiliate: "推广者" };
export const partnerStatusLabels: Record<PartnerApplicationStatus, string> = { pending: "审核中", approved: "已通过", rejected: "未通过", revoked: "已撤销" };

export type PartnerApplication = {
    id: string;
    userId: string;
    kind: PartnerKind;
    status: PartnerApplicationStatus;
    message: string;
    contact: string;
    reviewNote: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export type AffiliateBalance = { currency: string; pending: number; available: number; inPayout: number; paidOut: number };

export type AffiliateCommission = {
    id: string;
    currency: string;
    orderAmountFen: number;
    rateBp: number;
    amountFen: number;
    availableAt: string;
    payoutId?: string;
    createdAt: string;
    referredName: string;
    available: boolean;
};

export type AffiliatePayoutStatus = "requested" | "paid" | "rejected" | "completed";

export type AffiliatePayout = {
    id: string;
    affiliateUserId: string;
    kind: "cash" | "credits";
    currency: string;
    amountFen: number;
    creditsMicrocredits: number;
    status: AffiliatePayoutStatus;
    payoutDetails: string;
    reviewNote: string;
    reviewedAt?: string;
    createdAt: string;
};

export type AffiliateSetting = { defaultRateBp: number; attributionDays: number; holdDays: number; minPayoutMyr: number; creditBonusBp: number };

export type AffiliateDashboard = {
    code: string;
    rateBp: number;
    referrals: number;
    balances: AffiliateBalance[];
    commissions: AffiliateCommission[];
    payouts: AffiliatePayout[];
    setting: AffiliateSetting;
    creditValueMyr: number;
    currencyRatesMyr: Record<string, number>;
};

export type PartnerStatus = { applications: PartnerApplication[]; affiliate?: AffiliateDashboard };

export const getPartnerStatus = () => http.get<PartnerStatus>("/partner/status");
export const submitPartnerApplication = (input: { kind: PartnerKind; message: string; contact: string }) => http.post<PartnerApplication>("/partner/applications", input);
export const requestAffiliatePayout = (input: { kind: "cash" | "credits"; currency: string; details?: string }) => http.post<AffiliatePayout>("/partner/affiliate/payouts", input);

export type AdminPartnerApplication = PartnerApplication & { username: string; displayName: string; email: string };
export type AdminAffiliate = { userId: string; code: string; commissionRateBp: number; status: "active" | "suspended"; createdAt: string; username: string; displayName: string; referrals: number; totalCommission: number };
export type AdminAffiliatePayout = AffiliatePayout & { username: string; displayName: string; code: string };

export const listAdminPartnerApplications = (params: { kind?: string; status?: string; offset?: number }) => http.get<{ items: AdminPartnerApplication[]; total: number }>("/admin/partner-applications", { params });
export const reviewPartnerApplication = (id: string, input: { action: "approve" | "reject" | "revoke"; note?: string; rateBp?: number }) => http.patch<PartnerApplication>(`/admin/partner-applications/${id}`, input);
export const listAdminAffiliates = (params: { q?: string; offset?: number }) => http.get<{ items: AdminAffiliate[]; total: number }>("/admin/affiliates", { params });
export const updateAdminAffiliate = (userId: string, input: { rateBp?: number; status?: "active" | "suspended" }) => http.patch<AdminAffiliate>(`/admin/affiliates/${userId}`, input);
export const listAdminAffiliatePayouts = (params: { status?: string; offset?: number }) => http.get<{ items: AdminAffiliatePayout[]; total: number }>("/admin/affiliate-payouts", { params });
export const reviewAffiliatePayout = (id: string, input: { action: "paid" | "reject"; note?: string }) => http.patch<AffiliatePayout>(`/admin/affiliate-payouts/${id}`, input);
export const getAdminAffiliateSetting = () => http.get<AffiliateSetting>("/admin/affiliate-settings");
export const updateAdminAffiliateSetting = (input: AffiliateSetting) => http.put<AffiliateSetting>("/admin/affiliate-settings", input);

export { formatMoney } from "@/lib/money";

export function formatRate(bp: number) {
    return `${(bp / 100).toLocaleString("en-MY", { maximumFractionDigits: 2 })}%`;
}
