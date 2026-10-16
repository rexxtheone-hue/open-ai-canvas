export const WORKSPACE_WALLET_OPEN_EVENT = "wallet:open";

export type WorkspaceWalletOpenDetail = {
    paymentOrderId?: string;
    paymentInvalid?: boolean;
    /** 会员页等入口打开钱包时预选的商品。 */
    productId?: string;
    /** 打开时直接显示的分页，例如账户菜单里的「积分记录」。 */
    tab?: "topup" | "redeem" | "history";
};

/** 工作台任意入口打开积分中心弹窗，不再进入独立钱包页。 */
export function openWorkspaceWallet(detail: WorkspaceWalletOpenDetail = {}) {
    window.dispatchEvent(new CustomEvent<WorkspaceWalletOpenDetail>(WORKSPACE_WALLET_OPEN_EVENT, { detail }));
}
