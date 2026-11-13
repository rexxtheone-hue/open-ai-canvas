import { formatMoney } from "@/lib/money";
import type { TopupProduct } from "@/services/api/payments";
import "./topup-offers.css";

// 按当前定价、最低规格算的每条积分。Seedance 2.5 30 秒 480p 1,817 积分，提交时多冻结 5%，所以最后一条要 1,908 才能提交。
const SEEDANCE_CREDITS = 1817;
const SEEDANCE_RESERVE_CREDITS = 1908;
const OTHER_MODELS = [
    { label: "Wan 3.0 · 30 秒", unit: "支视频", credits: 624 },
    { label: "Veo 3.1 Fast · 8 秒", unit: "支视频", credits: 151.2 },
    { label: "Nano Banana 2.1 图片", unit: "张图片", credits: 30 },
];
const TIER_NAMES = ["入门包", "标准包", "专业包", "团队包", "企业包"];

function credits(product: TopupProduct) {
    return Math.floor(product.creditsMicrocredits / 1_000_000);
}

function seedanceCount(total: number) {
    return total < SEEDANCE_RESERVE_CREDITS ? 0 : Math.floor((total - SEEDANCE_RESERVE_CREDITS) / SEEDANCE_CREDITS) + 1;
}

function price(product: TopupProduct) {
    const currency = (product.currency || "CNY").toUpperCase();
    if (currency === "MYR" && product.amountFen % 100 === 0) return `RM ${(product.amountFen / 100).toLocaleString("en-US")}`;
    return formatMoney(product.amountFen, currency);
}

function otherUses(total: number) {
    return OTHER_MODELS.map((model) => ({ label: model.label, count: `${Math.floor(total / model.credits).toLocaleString("en-US")} ${model.unit}` }));
}

export function isStarterPack(product: TopupProduct) {
    return product.saleStrategy === "periodic" && product.periodPurchaseLimit === 1;
}

/** 充值页：新手礼包 + 积分包，以 Seedance 2.5 30 秒视频为主要衡量，其他模型列在下面。 */
export function TopupOffers({ products, onBuy, pendingId }: { products: TopupProduct[]; onBuy: (product: TopupProduct) => void; pendingId?: string }) {
    const sellable = products.filter((item) => item.enabled && !item.planId && !item.planMonths && !item.membersOnly && item.saleStatus !== "purchase_limit" && item.saleStatus !== "disabled");
    const starter = sellable.find((item) => isStarterPack(item) && item.canPurchase);
    const packs = sellable.filter((item) => !isStarterPack(item)).sort((a, b) => a.amountFen - b.amountFen);
    const best = packs.reduce<TopupProduct | undefined>((winner, item) => (!winner || item.amountFen / credits(item) < winner.amountFen / credits(winner) - 1e-9 ? item : winner), undefined);
    const busy = (product: TopupProduct) => pendingId === product.id;

    return (
        <div className="topup-offers">
            {starter ? (
                <section className="topup-starter" aria-label="新手礼包">
                    <div className="topup-starter-main">
                        <div className="topup-starter-tags">
                            <span className="topup-badge">新手礼包</span>
                            <span>每个账号限购 1 次</span>
                        </div>
                        <h3>{price(starter)} 做 {seedanceCount(credits(starter))} 支 30 秒 Seedance 2.5 视频</h3>
                        <p>
                            {credits(starter).toLocaleString("en-US")} 积分{credits(starter) > starter.amountFen ? `，含赠送 ${(credits(starter) - starter.amountFen).toLocaleString("en-US")}` : ""}，任何模型都能用。也可以换成：
                        </p>
                        <div className="topup-chips">
                            {otherUses(credits(starter)).map((use) => (
                                <span key={use.label}>
                                    {use.label} <b>{use.count}</b>
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="topup-starter-buy">
                        <strong>{price(starter)}</strong>
                        <span>{credits(starter).toLocaleString("en-US")} 积分</span>
                        <button type="button" className="topup-button is-accent" disabled={busy(starter)} onClick={() => onBuy(starter)}>
                            {busy(starter) ? "正在跳转支付…" : "领取新手礼包"}
                        </button>
                    </div>
                </section>
            ) : null}

            <div className="topup-grid">
                {packs.map((pack, index) => {
                    const total = credits(pack);
                    const bonus = total - pack.amountFen;
                    const hero = pack === best && packs.length > 1;
                    const last = index === packs.length - 1 && pack.amountFen >= 400_000;
                    return (
                        <article key={pack.id} className={`topup-card${hero ? " is-hero" : ""}`}>
                            <div className="topup-card-head">
                                <span>{TIER_NAMES[index] || pack.name}</span>
                                {hero ? <span className="topup-badge">最划算</span> : null}
                            </div>
                            <div className="topup-card-price">
                                <strong>{price(pack)}</strong>
                                <span>{total.toLocaleString("en-US")} 积分</span>
                            </div>
                            <div className="topup-card-seedance">
                                <strong>{seedanceCount(total)} 支</strong>
                                <span>30 秒 Seedance 2.5 视频</span>
                            </div>
                            <div className="topup-card-uses">
                                <small>或者换成</small>
                                {otherUses(total).map((use) => (
                                    <div key={use.label}>
                                        <span>{use.label}</span>
                                        <b>{use.count}</b>
                                    </div>
                                ))}
                            </div>
                            <div className="topup-card-facts">
                                {bonus > 0 ? (
                                    <span>
                                        {pack.amountFen.toLocaleString("en-US")} + <b>送 {bonus.toLocaleString("en-US")}</b>
                                    </span>
                                ) : null}
                                <span>每 100 积分 RM {(pack.amountFen / total).toFixed(2)}</span>
                                {pack.creditValidMonths ? <span>{pack.creditValidMonths} 个月有效</span> : null}
                                {last ? <span>专人对接</span> : null}
                            </div>
                            <button type="button" className={`topup-button${hero ? " is-accent" : ""}`} disabled={busy(pack) || !pack.canPurchase} onClick={() => onBuy(pack)}>
                                {busy(pack) ? "正在跳转支付…" : `充值 ${price(pack)}`}
                            </button>
                        </article>
                    );
                })}
            </div>
            <p className="topup-note">数量为全部积分用在同一模型、最低规格时的估算，可以混合使用不同模型。</p>
        </div>
    );
}

export const TOPUP_FAQS: { q: string; a: string }[] = [
    { q: "积分什么时候到期？", a: "每次充值单独计算，从付款当天起算，有效期写在每个充值包上。再次充值不会缩短你已有积分的有效期。" },
    { q: "先扣哪一笔积分？", a: "系统自动先用最早到期的积分，尽量不浪费。" },
    { q: "会提醒我吗？", a: "会。到期前 30 天和 7 天，Studio 顶部会提示，也会发邮件提醒。" },
    { q: "积分怎么扣？", a: "生成图片、视频、音频都按次扣积分，提交前就会显示要扣多少。生成失败会自动退回积分。" },
    { q: "怎么付款？", a: "以马币计价，用银行卡一次性付款，不会自动续费。" },
];
