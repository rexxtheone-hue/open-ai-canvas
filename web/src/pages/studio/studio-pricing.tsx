import { useQuery } from "@tanstack/react-query";
import { Check, Crown } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { formatMoney } from "@/lib/money";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { getStudioMembership, listStudioPlans } from "@/services/api/studio";
import { useUserStore } from "@/stores/use-user-store";
import { StudioShell } from "./studio-shell";

/** 会员套餐：展示权益和价格，购买走积分中心的统一支付流程。 */
export default function StudioPricingPage() {
    const user = useUserStore((state) => state.user);
    const plansQuery = useQuery({ queryKey: ["studio", "plans"], queryFn: async () => (await listStudioPlans()).plans });
    const membershipQuery = useQuery({ queryKey: ["studio", "membership", user?.id || ""], queryFn: getStudioMembership, enabled: Boolean(user) });
    const membership = membershipQuery.data;
    const plans = plansQuery.data || [];

    return (
        <StudioShell title="会员">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>会员套餐</h2>
                        <p>开通会员获得积分、更多同时生成的任务和商用授权。续费会在当前到期时间后顺延。</p>
                    </div>
                </div>
                <div className="studio-block studio-membership-status" role="status">
                    <Crown aria-hidden />
                    {membership?.active && membership.plan ? (
                        <div>
                            <strong>{membership.plan.name}</strong>
                            <span>有效期至 {membership.expiresAt ? new Date(membership.expiresAt).toLocaleString("zh-CN", { hour12: false }) : "—"} · 同时生成 {membership.activeTaskLimit} 个任务{membership.commercialLicense ? " · 含商用授权" : ""}</span>
                        </div>
                    ) : (
                        <div>
                            <strong>普通用户</strong>
                            <span>同时生成 {membership?.activeTaskLimit ?? "—"} 个任务{membership?.expiresAt ? ` · 上次会员已于 ${new Date(membership.expiresAt).toLocaleDateString("zh-CN")} 到期` : ""}</span>
                        </div>
                    )}
                </div>
                {plansQuery.isLoading ? <p className="studio-hint">正在读取…</p> : null}
                {plansQuery.isError ? <div className="studio-empty" role="alert"><strong>套餐读取失败</strong><span>{plansQuery.error instanceof Error ? plansQuery.error.message : ""}</span></div> : null}
                {!plansQuery.isLoading && !plansQuery.isError && !plans.length ? <div className="studio-empty"><strong>暂时没有在售的会员套餐</strong><span>需要积分可以直接在积分中心充值。</span><button type="button" className="studio-mini-button" onClick={() => openWorkspaceWallet()}>打开积分中心</button></div> : null}
                <div className="studio-plan-grid">
                    {plans.map((plan) => (
                        <article key={plan.id} className={`studio-plan-card${membership?.plan?.id === plan.id && membership.active ? " is-current" : ""}`}>
                            {plan.badge ? <span className="studio-post-badge">{plan.badge}</span> : null}
                            <h3>{plan.name}</h3>
                            {plan.description ? <p>{plan.description}</p> : null}
                            <ul>
                                <li><Check aria-hidden />有效期 {plan.durationDays} 天</li>
                                <li><Check aria-hidden />同时生成 {plan.activeTaskLimit > 0 ? plan.activeTaskLimit : "标准数量的"} 个任务</li>
                                {plan.commercialLicense ? <li><Check aria-hidden />作品可商用</li> : null}
                            </ul>
                            <div className="studio-plan-products">
                                {plan.products.map((product) => (
                                    <button key={product.id} type="button" className="studio-plan-buy" disabled={!product.canPurchase} onClick={() => openWorkspaceWallet({ productId: product.id })}>
                                        <strong>{formatMoney(product.amountFen, product.currency)}</strong>
                                        <span>{product.name} · 含 {formatCredits(product.creditsMicrocredits, 2)} 积分</span>
                                    </button>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </StudioShell>
    );
}
