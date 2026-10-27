import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Crown } from "./studio-icons";

import { formatCredits } from "@/constant/credits";
import { formatMoney } from "@/lib/money";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { listTopupProducts, type TopupProduct } from "@/services/api/payments";
import { getStudioMembership, listStudioPlans, type StudioPlanOffer } from "@/services/api/studio";
import { useUserStore } from "@/stores/use-user-store";
import { StudioShell } from "./studio-shell";

type Billing = "monthly" | "annual";

// 换算参考：Nano Banana 2.1 1K 一张 30 积分，Kling 3.0 720P 5 秒无声 315 积分。
const IMAGE_REFERENCE_CREDITS = 30;
const VIDEO_REFERENCE_CREDITS = 315;

const FAQS: { q: string; a: string }[] = [
    { q: "每月积分会累积到下个月吗？", a: "不会。会员积分按月发放、当月有效，到下一个发放日没用完的会员积分会清零，再发放新一个月的积分。例如 3 月 7 日开通 Pro，拿到 14,000 积分，用了 6,000；4 月 7 日剩下的 8,000 清零，重新发放 14,000。" },
    { q: "月付和年付有什么不同？", a: "权益完全一样，只是价格不同。年付比月付省约 15%，积分同样每月发放一次，共 12 个月。想先试试可以选月付，之后随时改成年付。" },
    { q: "加购积分是什么？", a: "会员积分不够用时，可以另外购买积分包。加购的积分不会在月底清零，扣积分时先用当月会员积分，用完才扣加购积分。积分包只开放给会员。" },
    { q: "升级套餐会怎样？", a: "购买更高的套餐后立即生效，马上发放新套餐的每月积分，原套餐没用完的会员积分保留到新周期结束。年付中途换套餐，旧套餐未发放的月份不会保留，有需要请先联系客服。" },
    { q: "到期或不续费会怎样？", a: "会员不会自动扣款。到期后回到普通用户权益，没用完的会员积分清零；加购的积分仍然可以继续使用，但不能再购买新的积分包。" },
];

function planProduct(plan: StudioPlanOffer, months: number) {
    return plan.products.find((product) => (product.planMonths || 0) === months);
}

function perMonthFen(product: TopupProduct) {
    return Math.round(product.amountFen / Math.max(1, product.planMonths || 1));
}

/** 会员套餐：参考 Higgsfield / OpenArt 的月付、年付切换和积分换算，购买走积分中心的统一支付流程。 */
export default function StudioPricingPage() {
    const user = useUserStore((state) => state.user);
    const [billing, setBilling] = useState<Billing>("annual");
    const plansQuery = useQuery({ queryKey: ["studio", "plans"], queryFn: async () => (await listStudioPlans()).plans });
    const membershipQuery = useQuery({ queryKey: ["studio", "membership", user?.id || ""], queryFn: getStudioMembership, enabled: Boolean(user) });
    const packsQuery = useQuery({ queryKey: ["studio", "addon-packs", user?.id || ""], queryFn: async () => (await listTopupProducts()).products.filter((product) => product.membersOnly && product.enabled), enabled: Boolean(user) });
    const membership = membershipQuery.data;
    const plans = plansQuery.data || [];
    const packs = packsQuery.data || [];
    const maxSavingPercent = plans.reduce((best, plan) => {
        const monthly = planProduct(plan, 1);
        const annual = planProduct(plan, 12);
        if (!monthly || !annual) return best;
        return Math.max(best, Math.round((1 - annual.amountFen / (monthly.amountFen * 12)) * 100));
    }, 0);

    return (
        <StudioShell title="会员">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>会员套餐</h2>
                        <p>每月发放积分，可以生成所有模型的图片、视频和音频。会员还能同时生成更多任务，作品可商用。</p>
                    </div>
                </div>
                <div className="studio-block studio-membership-status" role="status">
                    <Crown aria-hidden />
                    {membership?.active && membership.plan ? (
                        <div>
                            <strong>{membership.plan.name}</strong>
                            <span>
                                会员有效期至 {membership.expiresAt ? new Date(membership.expiresAt).toLocaleDateString("zh-CN") : "—"}
                                {membership.periodEndsAt ? ` · 本月积分 ${new Date(membership.periodEndsAt).toLocaleDateString("zh-CN")} 重置` : ""}
                                {membership.grantsRemaining ? ` · 还有 ${membership.grantsRemaining} 个月积分待发放` : ""}
                                {` · 同时生成 ${membership.activeTaskLimit} 个任务`}
                            </span>
                        </div>
                    ) : (
                        <div>
                            <strong>普通用户</strong>
                            <span>同时生成 {membership?.activeTaskLimit ?? "—"} 个任务{membership?.expiresAt ? ` · 上次会员已于 ${new Date(membership.expiresAt).toLocaleDateString("zh-CN")} 到期` : ""}</span>
                        </div>
                    )}
                </div>
                {plans.length ? (
                    <div className="studio-billing-toggle" role="radiogroup" aria-label="付款周期">
                        <button type="button" role="radio" aria-checked={billing === "monthly"} className={billing === "monthly" ? "is-active" : ""} onClick={() => setBilling("monthly")}>月付</button>
                        <button type="button" role="radio" aria-checked={billing === "annual"} className={billing === "annual" ? "is-active" : ""} onClick={() => setBilling("annual")}>
                            年付{maxSavingPercent > 0 ? <em>省 {maxSavingPercent}%</em> : null}
                        </button>
                    </div>
                ) : null}
                {plansQuery.isLoading ? <p className="studio-hint">正在读取…</p> : null}
                {plansQuery.isError ? <div className="studio-empty" role="alert"><strong>套餐读取失败</strong><span>{plansQuery.error instanceof Error ? plansQuery.error.message : ""}</span></div> : null}
                {!plansQuery.isLoading && !plansQuery.isError && !plans.length ? <div className="studio-empty"><strong>暂时没有在售的会员套餐</strong><span>需要积分可以直接在积分中心充值。</span><button type="button" className="studio-mini-button" onClick={() => openWorkspaceWallet()}>打开积分中心</button></div> : null}
                <div className="studio-plan-grid">
                    {plans.map((plan) => {
                        const monthly = planProduct(plan, 1);
                        const annual = planProduct(plan, 12);
                        const product = billing === "annual" ? annual || monthly : monthly || annual;
                        const legacy = !plan.monthlyCreditsMicrocredits;
                        const credits = plan.monthlyCreditsMicrocredits / 1_000_000;
                        const isCurrent = Boolean(membership?.active && membership.plan?.id === plan.id);
                        const saving = annual && monthly ? monthly.amountFen * 12 - annual.amountFen : 0;
                        return (
                            <article key={plan.id} className={`studio-plan-card${isCurrent ? " is-current" : ""}${plan.badge ? " is-featured" : ""}`}>
                                {plan.badge ? <span className="studio-post-badge">{plan.badge}</span> : null}
                                <h3>{plan.name}</h3>
                                {plan.description ? <p>{plan.description}</p> : null}
                                {product && !legacy ? (
                                    <div className="studio-plan-price">
                                        <div>
                                            {product.planMonths === 12 && monthly ? <s>{formatMoney(monthly.amountFen, monthly.currency)}</s> : null}
                                            <strong>{formatMoney(perMonthFen(product), product.currency)}</strong>
                                            <span>/月</span>
                                        </div>
                                        <small>{product.planMonths === 12 ? `按年付 ${formatMoney(product.amountFen, product.currency)}${saving > 0 ? ` · 比月付省 ${formatMoney(saving, product.currency)}` : ""}` : "按月付款，可随时改年付"}</small>
                                    </div>
                                ) : null}
                                {!legacy ? (
                                    <div className="studio-plan-credits">
                                        <strong>{credits.toLocaleString()} 积分/月</strong>
                                        <span>≈ {Math.floor(credits / IMAGE_REFERENCE_CREDITS).toLocaleString()} 张 Nano Banana 2.1 图片</span>
                                        <span>≈ {Math.floor(credits / VIDEO_REFERENCE_CREDITS).toLocaleString()} 条 Kling 3.0 5 秒视频</span>
                                        <small>每月发放，当月有效</small>
                                    </div>
                                ) : null}
                                <ul>
                                    {legacy ? <li><Check aria-hidden />有效期 {plan.durationDays} 天</li> : null}
                                    <li><Check aria-hidden />同时生成 {plan.activeTaskLimit > 0 ? plan.activeTaskLimit : "标准数量的"} 个任务</li>
                                    <li><Check aria-hidden />所有图片、视频、音频模型</li>
                                    {plan.commercialLicense ? <li><Check aria-hidden />作品可商用</li> : null}
                                    {!legacy ? <li><Check aria-hidden />积分不够可加购，加购积分不清零</li> : null}
                                </ul>
                                <div className="studio-plan-products">
                                    {legacy ? (
                                        plan.products.map((item) => (
                                            <button key={item.id} type="button" className="studio-plan-buy" disabled={!item.canPurchase} onClick={() => openWorkspaceWallet({ productId: item.id })}>
                                                <strong>{formatMoney(item.amountFen, item.currency)}</strong>
                                                <span>{item.name} · 含 {formatCredits(item.creditsMicrocredits, 2)} 积分</span>
                                            </button>
                                        ))
                                    ) : product ? (
                                        <button type="button" className="studio-plan-cta" disabled={!product.canPurchase} onClick={() => openWorkspaceWallet({ productId: product.id })}>
                                            {isCurrent ? "续费" : membership?.active ? `换成 ${plan.name}` : `开通 ${plan.name}`}
                                        </button>
                                    ) : (
                                        <span className="studio-hint">{billing === "annual" ? "暂无年付" : "暂无月付"}</span>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
                {packs.length ? (
                    <section className="studio-addon">
                        <div className="studio-section-head">
                            <div>
                                <h2>会员加购积分</h2>
                                <p>会员积分不够用时加购。加购的积分不会月底清零，扣积分时先用当月会员积分。</p>
                            </div>
                        </div>
                        <div className="studio-addon-grid">
                            {packs.map((pack) => (
                                <button key={pack.id} type="button" className="studio-plan-buy" disabled={!pack.canPurchase} onClick={() => openWorkspaceWallet({ productId: pack.id })}>
                                    <strong>{formatCredits(pack.creditsMicrocredits, 0)} 积分</strong>
                                    <span>{formatMoney(pack.amountFen, pack.currency)}{pack.saleStatus === "members_only" ? " · 开通会员后可购买" : ""}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                ) : null}
                {plans.length ? (
                    <section className="studio-faq">
                        <h2>常见问题</h2>
                        {FAQS.map((item) => (
                            <details key={item.q}>
                                <summary>{item.q}</summary>
                                <p>{item.a}</p>
                            </details>
                        ))}
                    </section>
                ) : null}
            </div>
        </StudioShell>
    );
}
