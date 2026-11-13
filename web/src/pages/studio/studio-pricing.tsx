import { useMutation, useQuery } from "@tanstack/react-query";
import { App } from "antd";
import { ChevronDown } from "./studio-icons";

import { TOPUP_FAQS, TopupOffers } from "@/components/topup-offers";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { createPaymentOrder, listPaymentProviders, listTopupProducts, type TopupProduct } from "@/services/api/payments";
import { useAuthGateStore } from "@/stores/use-auth-gate-store";
import { useUserStore } from "@/stores/use-user-store";
import { StudioShell } from "./studio-shell";

/** 充值页：访客也能看价格，购买前先注册；按钮直接下单跳到支付页，没有可跳转的渠道时退回积分中心。 */
export default function StudioPricingPage() {
    const user = useUserStore((state) => state.user);
    const productsQuery = useQuery({ queryKey: ["studio", "topup-products", user?.id || ""], queryFn: async () => (await listTopupProducts()).products });
    const { message } = App.useApp();
    const openAuth = useAuthGateStore((state) => state.openAuth);
    const checkout = useMutation({
        mutationFn: async (product: TopupProduct) => {
            const { providers } = await listPaymentProviders();
            const currency = (product.currency || "CNY").toUpperCase();
            const provider = providers.find((item) => item.enabled && item.pluginEnabled && item.configured && item.checkoutMode === "redirect" && (item.currency || "CNY").toUpperCase() === currency);
            if (!provider) return "";
            const { order } = await createPaymentOrder({ productId: product.id, providerId: provider.id, idempotencyKey: crypto.randomUUID() });
            return order.checkout.mode === "redirect" ? order.checkout.url || "" : "";
        },
        onSuccess: (url, product) => (url ? window.location.assign(url) : openWorkspaceWallet({ productId: product.id })),
        onError: (error) => message.error(error instanceof Error ? error.message : "创建支付订单失败"),
    });
    const buy = (product: TopupProduct) => (user ? checkout.mutate(product) : openAuth({ mode: "register", next: "/studio/pricing" }));
    const products = productsQuery.data || [];

    return (
        <StudioShell title="充值">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>充越多，送越多</h2>
                        <p>积分可用于所有图片、视频和音频模型。不订阅、不自动续费，到期前会提醒你。</p>
                    </div>
                </div>
                {productsQuery.isLoading ? <p className="studio-hint">正在读取…</p> : null}
                {productsQuery.isError ? (
                    <div className="studio-empty" role="alert">
                        <strong>充值包读取失败</strong>
                        <span>{productsQuery.error instanceof Error ? productsQuery.error.message : ""}</span>
                    </div>
                ) : null}
                {products.length ? <TopupOffers products={products} onBuy={buy} pendingId={checkout.isPending ? checkout.variables?.id : undefined} /> : null}
                <section className="studio-pricing-faq">
                    <div className="studio-pricing-faq-head">
                        <h2>常见问题</h2>
                        <p>关于积分有效期、扣费和付款的说明。</p>
                    </div>
                    <div className="studio-pricing-faq-list">
                        {TOPUP_FAQS.map((item) => (
                            <details key={item.q}>
                                <summary>
                                    {item.q}
                                    <ChevronDown aria-hidden />
                                </summary>
                                <p>{item.a}</p>
                            </details>
                        ))}
                    </div>
                </section>
            </div>
        </StudioShell>
    );
}
