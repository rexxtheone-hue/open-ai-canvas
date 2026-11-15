import { ApiError, apiBaseURL, compactApiParams, http } from "./request";
import { resourceIdFromStorageKey } from "./resources";
import type { StudioMedia, StudioWorkPage } from "./studio";

export type TenantStatus = "active" | "suspended" | "closed";

export type Tenant = {
    id: string;
    slug: string;
    name: string;
    status: TenantStatus;
    isPlatform: boolean;
    feeFreeUntil?: string;
    createdAt: string;
    updatedAt: string;
};

export type TenantDomain = {
    id: string;
    host: string;
    isPrimary: boolean;
    sslStatus: string;
    managed: boolean;
    cnameTarget?: string;
    verificationErrors?: string[];
    createdAt: string;
    updatedAt: string;
};

export type TenantMonthlyFeePreview = {
    period: string;
    usageMicrocredits: number;
    usageSen: number;
    feeSen: number;
    feeFree: boolean;
};

export type TenantPoolSummary = {
    tenant: Tenant;
    availableMicrocredits: number;
    reservedMicrocredits: number;
    debtMicrocredits: number;
    currentMonth: TenantMonthlyFeePreview;
    latestTopupMicrocredits: number;
};

export type AgencyTenant = TenantPoolSummary & {
    primaryDomain?: TenantDomain;
    domainCount: number;
    adminCount: number;
    customerCount: number;
};

export type TenantAdminUser = {
    id: string;
    username: string;
    email: string;
    displayName: string;
    status: "active" | "disabled";
    lastLoginAt?: string;
    createdAt: string;
};

export type AgencyTenantDetail = AgencyTenant & { domains: TenantDomain[]; admins: TenantAdminUser[] };

export type TenantCreditLot = {
    id: string;
    source: string;
    paymentAmountSen: number;
    paymentReference: string;
    note: string;
    grossMicrocredits: number;
    debtSettledMicrocredits: number;
    amountMicrocredits: number;
    remainingMicrocredits: number;
    expiresAt: string;
    createdAt: string;
};

export type TenantLedgerEntry = {
    id: string;
    type: "topup" | "adjust" | "reserve" | "consume" | "refund" | "lot_expire" | "monthly_fee" | "debt_settle";
    amountMicrocredits: number;
    availableDeltaMicrocredits: number;
    reservedDeltaMicrocredits: number;
    availableAfterMicrocredits: number;
    reservedAfterMicrocredits: number;
    billingOrderId?: string;
    userId?: string;
    model?: string;
    note?: string;
    createdAt: string;
};

export type TenantLedgerPage = { items: TenantLedgerEntry[]; total: number; page: number; limit: number };

export type TenantDebt = {
    id: string;
    period: string;
    reason: string;
    amountMicrocredits: number;
    remainingMicrocredits: number;
    status: "open" | "settled";
    settledAt?: string;
    createdAt: string;
};

export type TenantMonthlyUsage = {
    id: string;
    tenantId: string;
    period: string;
    usageMicrocredits: number;
    usageSen: number;
    feeSen: number;
    feeMicrocredits: number;
    deductedMicrocredits: number;
    debtMicrocredits: number;
    feeFree: boolean;
    createdAt: string;
};

export type TenantTopupResult = {
    lot: TenantCreditLot;
    grossMicrocredits: number;
    debtSettledMicrocredits: number;
    firstTopup: boolean;
    belowFirstTopupMinimum: boolean;
    warning?: string;
};

export type AgencyDiscountItem = {
    channelModelId: string;
    channelId: string;
    modelKey: string;
    displayName: string;
    capability: string;
    agencyDiscountPercent: number;
    poolFactorPercent: number;
};

export type TenantModelPriceRule = {
    id: string;
    channelModelId: string | null;
    priceTierId: string | null;
    multiplierBasisPoints: number;
    fixedUnitPriceMicrocredits: number | null;
    enabled: boolean;
};

export type TenantModelPriceTier = {
    id: string;
    selector?: Record<string, string>;
    resolution?: string;
    billingMode: string;
    platformUnitMicrocredits: number;
    poolUnitMicrocredits: number;
    retailUnitMicrocredits: number;
    hidden: boolean;
    ruleId?: string;
};

export type TenantModelPrice = {
    channelModelId: string;
    displayName: string;
    modelKey: string;
    capability: string;
    agencyDiscountPercent: number;
    hidden: boolean;
    ruleId?: string;
    multiplierBasisPoints: number;
    fixedUnitPriceMicrocredits?: number;
    tiers: TenantModelPriceTier[];
};

export type TenantModelPriceCatalog = { globalRule?: TenantModelPriceRule; models: TenantModelPrice[] };

export type CreateAgencyRequest = { name: string; slug: string; adminEmail: string; adminUsername: string; adminPassword?: string; sendInvite: boolean };
export type TenantAdminUserRequest = { username: string; email: string; displayName?: string; password?: string; sendInvite: boolean };
export type TenantAdminUserResult = { user: TenantAdminUser; inviteSent: boolean; inviteError?: string };

// ---- 平台管理员 ----

export function listAgencies(signal?: AbortSignal) {
    return http.get<{ tenants: AgencyTenant[] }>("/admin/tenants", { signal });
}

export function createAgency(body: CreateAgencyRequest) {
    return http.post<{ tenant: AgencyTenantDetail; inviteSent: boolean; inviteError?: string }>("/admin/tenants", body);
}

export function getAgency(id: string, signal?: AbortSignal) {
    return http.get<{ tenant: AgencyTenantDetail }>(`/admin/tenants/${encodeURIComponent(id)}`, { signal });
}

export function updateAgency(id: string, body: { name?: string; status?: "active" | "suspended" }) {
    return http.patch<{ tenant: AgencyTenantDetail }>(`/admin/tenants/${encodeURIComponent(id)}`, body);
}

export function addAgencyAdmin(id: string, body: TenantAdminUserRequest) {
    return http.post<TenantAdminUserResult>(`/admin/tenants/${encodeURIComponent(id)}/admins`, body);
}

export function setAgencyAdminStatus(id: string, userId: string, status: "active" | "disabled") {
    return http.patch<{ user: TenantAdminUser }>(`/admin/tenants/${encodeURIComponent(id)}/admins/${encodeURIComponent(userId)}`, { status });
}

export function listAgencyDomains(id: string, signal?: AbortSignal) {
    return http.get<{ domains: TenantDomain[] }>(`/admin/tenants/${encodeURIComponent(id)}/domains`, { signal });
}

export function addAgencyDomain(id: string, host: string, primary: boolean) {
    return http.post<{ domain: TenantDomain }>(`/admin/tenants/${encodeURIComponent(id)}/domains`, { host, primary });
}

export function refreshAgencyDomain(id: string, domainId: string) {
    return http.post<{ domain: TenantDomain }>(`/admin/tenants/${encodeURIComponent(id)}/domains/${encodeURIComponent(domainId)}/refresh`);
}

export function setAgencyPrimaryDomain(id: string, domainId: string) {
    return http.post<{ domains: TenantDomain[] }>(`/admin/tenants/${encodeURIComponent(id)}/domains/${encodeURIComponent(domainId)}/primary`);
}

export function removeAgencyDomain(id: string, domainId: string) {
    return http.delete<{ domains: TenantDomain[] }>(`/admin/tenants/${encodeURIComponent(id)}/domains/${encodeURIComponent(domainId)}`);
}

export function topupAgencyPool(id: string, body: { amountSen: number; paymentReference: string; note: string }) {
    return http.post<TenantTopupResult>(`/admin/tenant-billing/tenants/${encodeURIComponent(id)}/topups`, body);
}

export function adjustAgencyPool(id: string, body: { amountMicrocredits: number; note: string }) {
    return http.post<{ account: { availableMicrocredits: number; reservedMicrocredits: number } }>(`/admin/tenant-billing/tenants/${encodeURIComponent(id)}/adjustments`, body);
}

export function listAgencyLots(id: string, signal?: AbortSignal) {
    return http.get<{ lots: TenantCreditLot[] }>(`/admin/tenant-billing/tenants/${encodeURIComponent(id)}/lots`, { signal });
}

export function listAgencyLedger(id: string, page: number, pageSize: number, signal?: AbortSignal) {
    return http.get<TenantLedgerPage>(`/admin/tenant-billing/tenants/${encodeURIComponent(id)}/ledger`, { params: { page, pageSize }, signal });
}

export function listMonthlySettlements(params: { tenantId?: string; period?: string }, signal?: AbortSignal) {
    return http.get<{ settlements: TenantMonthlyUsage[] }>("/admin/tenant-billing/monthly-settlements", { params: compactApiParams(params), signal });
}

export function listAgencyDiscounts(signal?: AbortSignal) {
    return http.get<{ models: AgencyDiscountItem[] }>("/admin/tenant-billing/agency-discounts", { signal });
}

export function setAgencyDiscount(channelModelId: string, agencyDiscountPercent: number) {
    return http.put<{ agencyDiscountPercent: number }>(`/admin/tenant-billing/agency-discounts/${encodeURIComponent(channelModelId)}`, { agencyDiscountPercent });
}

// ---- 代理商管理员（只作用于当前网址的代理商）----

export type TenantPoolOverview = TenantPoolSummary & { debts: TenantDebt[] };

export function getOwnPool(signal?: AbortSignal) {
    return http.get<TenantPoolOverview>("/tenant-admin/billing/pool", { signal });
}

export function listOwnLots(signal?: AbortSignal) {
    return http.get<{ lots: TenantCreditLot[] }>("/tenant-admin/billing/lots", { signal });
}

export function listOwnLedger(page: number, pageSize: number, signal?: AbortSignal) {
    return http.get<TenantLedgerPage>("/tenant-admin/billing/ledger", { params: { page, pageSize }, signal });
}

export function listOwnDebts(signal?: AbortSignal) {
    return http.get<{ debts: TenantDebt[] }>("/tenant-admin/billing/debts", { signal });
}

export function getOwnMonthlyUsage(signal?: AbortSignal) {
    return http.get<{ currentMonth: TenantMonthlyFeePreview; settlements: TenantMonthlyUsage[] }>("/tenant-admin/billing/monthly-usage", { signal });
}

export function getOwnModelPrices(signal?: AbortSignal) {
    return http.get<TenantModelPriceCatalog>("/tenant-admin/billing/models", { signal });
}

export function listOwnPriceRules(signal?: AbortSignal) {
    return http.get<{ prices: TenantModelPriceRule[] }>("/tenant-admin/billing/prices", { signal });
}

export function saveOwnModelPrice(body: { channelModelId?: string; priceTierId?: string; multiplier?: number; fixedUnitPriceMicrocredits?: number; enabled?: boolean }) {
    return http.put<{ price: TenantModelPriceRule }>("/tenant-admin/billing/prices", body);
}

export function deleteOwnModelPrice(id: string) {
    return http.delete<{ deleted: boolean }>(`/tenant-admin/billing/prices/${encodeURIComponent(id)}`);
}

export function listOwnDomains(signal?: AbortSignal) {
    return http.get<{ domains: TenantDomain[] }>("/tenant/domains", { signal });
}

export function listOwnStaff(signal?: AbortSignal) {
    return http.get<{ users: TenantAdminUser[] }>("/tenant-admin/staff", { signal });
}

export function createOwnStaff(body: TenantAdminUserRequest) {
    return http.post<TenantAdminUserResult>("/tenant-admin/staff", body);
}

export function setOwnStaffStatus(userId: string, status: "active" | "disabled") {
    return http.patch<{ user: TenantAdminUser }>(`/tenant-admin/staff/${encodeURIComponent(userId)}`, { status });
}

export async function exportOwnCustomers() {
    try {
        const response = await http.raw<Blob>({ method: "get", url: "/tenant-admin/customers/export", responseType: "blob" });
        return response.data;
    } catch (error) {
        // 下载请求的错误信封也被包成 Blob，取出后端文案。
        const blob = error instanceof ApiError ? (error.cause as { response?: { data?: unknown } } | undefined)?.response?.data : undefined;
        if (blob instanceof Blob && error instanceof ApiError) {
            try {
                const envelope = JSON.parse(await blob.text()) as { msg?: string; code?: number };
                if (envelope.msg) throw new ApiError(envelope.msg, { status: error.status, code: envelope.code, cause: error });
            } catch (parsed) {
                if (parsed instanceof ApiError) throw parsed;
            }
        }
        throw error;
    }
}

// ---- 后台查看某个用户的作品（平台管理员与代理商管理员都按自己租户隔离）----

export function listAdminUserWorks(userId: string, cursor?: string, signal?: AbortSignal) {
    return http.get<StudioWorkPage>(`/admin/users/${encodeURIComponent(userId)}/works`, { params: compactApiParams({ cursor, limit: 24 }), signal });
}

/** 后台预览作品文件：走管理员资源接口，不能用用户自己的 /resources 地址。 */
export function adminWorkMediaUrl(media: StudioMedia) {
    const id = resourceIdFromStorageKey(media.storageKey);
    if (!id) return media.url || "";
    return `${String(apiBaseURL).replace(/\/+$/, "")}/admin/resources/${encodeURIComponent(id)}/file`;
}
