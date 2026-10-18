import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, Megaphone, Store, UserCheck } from "./studio-icons";

import { formatCredits } from "@/constant/credits";
import { affiliateLink } from "@/lib/referral";
import { formatMoney, formatRate, getPartnerStatus, partnerStatusLabels, requestAffiliatePayout, submitPartnerApplication, type AffiliateBalance, type AffiliateDashboard, type PartnerApplication, type PartnerKind } from "@/services/api/partner";
import { useUserStore } from "@/stores/use-user-store";
import { StudioShell } from "./studio-shell";

const programs: Array<{ kind: PartnerKind; title: string; icon: typeof Store; summary: string; perks: string[]; placeholder: string }> = [
    {
        kind: "creator",
        title: "认证创作者",
        icon: UserCheck,
        summary: "主页显示认证标志，在创作者列表优先展示；之后开放的接单市场只对认证创作者开放。",
        perks: ["认证标志", "创作者列表优先展示", "可以接商家的单"],
        placeholder: "介绍你擅长的方向、过往作品或合作案例，主页里至少要有几件公开作品。",
    },
    {
        kind: "merchant",
        title: "商家",
        icon: Store,
        summary: "以商家身份发布需求、直接雇用认证创作者，费用由平台担保结算。",
        perks: ["发布创作需求", "直接雇用创作者", "平台担保结算"],
        placeholder: "公司或品牌名称、行业，以及你大概需要哪类内容。",
    },
    {
        kind: "affiliate",
        title: "推广者",
        icon: Megaphone,
        summary: "分享你的专属链接，被推荐的新用户充值后你获得佣金，可以提现或换成积分。",
        perks: ["专属推广链接", "按充值金额分佣", "现金提现或换积分（有加成）"],
        placeholder: "你打算在哪里推广（社群、TikTok、线下活动等），大概有多少受众。",
    },
];

/** 认证与推广：申请认证创作者 / 商家 / 推广者，推广者在这里看佣金和提现。 */
export default function StudioPartnerPage() {
    const user = useUserStore((state) => state.user);
    const query = useQuery({ queryKey: ["partner", "status", user?.id || ""], queryFn: getPartnerStatus, enabled: Boolean(user) });
    const applications = query.data?.applications || [];
    const affiliate = query.data?.affiliate;

    return (
        <StudioShell title="认证与推广">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>认证与推广</h2>
                        <p>申请成为认证创作者、商家或推广者，提交后由平台审核，结果会显示在这里。</p>
                    </div>
                </div>
                {query.isLoading ? <p className="studio-hint">正在读取…</p> : null}
                {query.isError ? (
                    <div className="studio-empty" role="alert">
                        <strong>读取失败</strong>
                        <span>{query.error instanceof Error ? query.error.message : ""}</span>
                    </div>
                ) : null}
                {affiliate ? <AffiliatePanel dashboard={affiliate} /> : null}
                <div className="studio-plan-grid">
                    {programs.map((program) => (
                        <ProgramCard key={program.kind} program={program} application={applications.find((item) => item.kind === program.kind)} />
                    ))}
                </div>
            </div>
        </StudioShell>
    );
}

function ProgramCard({ program, application }: { program: (typeof programs)[number]; application?: PartnerApplication }) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState(application?.message || "");
    const [contact, setContact] = useState(application?.contact || "");
    const submit = useMutation({
        mutationFn: () => submitPartnerApplication({ kind: program.kind, message: message.trim(), contact: contact.trim() }),
        onSuccess: async () => {
            setOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["partner", "status"] });
        },
    });
    const Icon = program.icon;
    const status = application?.status;
    const canApply = !status || status === "rejected" || status === "revoked";

    return (
        <article className={`studio-plan-card${status === "approved" ? " is-current" : ""}`}>
            {status ? <span className="studio-post-badge">{partnerStatusLabels[status]}</span> : null}
            <h3 className="studio-partner-title">
                <Icon aria-hidden />
                {program.title}
            </h3>
            <p>{program.summary}</p>
            <ul>
                {program.perks.map((perk) => (
                    <li key={perk}>
                        <Check aria-hidden />
                        {perk}
                    </li>
                ))}
            </ul>
            {application?.reviewNote && status !== "pending" ? <p className="studio-hint">审核备注：{application.reviewNote}</p> : null}
            {status === "pending" ? <p className="studio-hint">已提交，平台会尽快审核。</p> : null}
            {canApply && !open ? (
                <button type="button" className="studio-generate-button" onClick={() => setOpen(true)}>
                    {status ? "重新申请" : "申请"}
                </button>
            ) : null}
            {open ? (
                <form
                    className="studio-partner-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit.mutate();
                    }}
                >
                    <label className="studio-field">
                        <span>申请说明（10–1000 字）</span>
                        <textarea rows={4} maxLength={1000} value={message} placeholder={program.placeholder} onChange={(event) => setMessage(event.target.value)} />
                    </label>
                    <label className="studio-field">
                        <span>联系方式（WhatsApp / 邮箱，可选）</span>
                        <input maxLength={200} value={contact} onChange={(event) => setContact(event.target.value)} />
                    </label>
                    {submit.isError ? <p className="studio-error">{submit.error instanceof Error ? submit.error.message : "提交失败"}</p> : null}
                    <div className="studio-partner-actions">
                        <button type="button" className="studio-mini-button" onClick={() => setOpen(false)}>
                            取消
                        </button>
                        <button type="submit" className="studio-generate-button" disabled={submit.isPending || message.trim().length < 10}>
                            {submit.isPending ? "提交中…" : "提交申请"}
                        </button>
                    </div>
                </form>
            ) : null}
        </article>
    );
}

function AffiliatePanel({ dashboard }: { dashboard: AffiliateDashboard }) {
    const link = affiliateLink(dashboard.code);
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <section className="studio-block studio-affiliate">
            <div className="studio-affiliate-head">
                <div>
                    <strong>我的推广链接</strong>
                    <span>
                        佣金比例 {formatRate(dashboard.rateBp)} · 新用户注册后 {dashboard.setting.attributionDays} 天内的充值都算 · 冷却期 {dashboard.setting.holdDays} 天
                    </span>
                </div>
                <span className="studio-affiliate-count">已推荐 {dashboard.referrals} 人</span>
            </div>
            <div className="studio-affiliate-link">
                <code>{link}</code>
                <button type="button" className="studio-mini-button" onClick={() => void copy()}>
                    <Copy aria-hidden />
                    {copied ? "已复制" : "复制"}
                </button>
            </div>
            {dashboard.balances.length ? dashboard.balances.map((balance) => <BalanceRow key={balance.currency} balance={balance} dashboard={dashboard} />) : <p className="studio-hint">还没有佣金。被推荐的用户充值后，这里会显示收益。</p>}
            {dashboard.commissions.length ? (
                <details className="studio-affiliate-history">
                    <summary>佣金明细（最近 {dashboard.commissions.length} 笔）</summary>
                    <ul>
                        {dashboard.commissions.map((item) => (
                            <li key={item.id}>
                                <span>
                                    {item.referredName} 充值 {formatMoney(item.orderAmountFen, item.currency)}
                                </span>
                                <span>
                                    +{formatMoney(item.amountFen, item.currency)} · {item.payoutId ? "已提取" : item.available ? "可提取" : `${new Date(item.availableAt).toLocaleDateString("zh-CN")} 后可提取`}
                                </span>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
            {dashboard.payouts.length ? (
                <details className="studio-affiliate-history">
                    <summary>提取记录</summary>
                    <ul>
                        {dashboard.payouts.map((item) => (
                            <li key={item.id}>
                                <span>
                                    {new Date(item.createdAt).toLocaleDateString("zh-CN")} · {item.kind === "cash" ? "现金提现" : "换积分"} {formatMoney(item.amountFen, item.currency)}
                                </span>
                                <span>{item.status === "requested" ? "待打款" : item.status === "paid" ? "已打款" : item.status === "rejected" ? `已驳回：${item.reviewNote}` : `已到账 ${formatCredits(item.creditsMicrocredits, 0)} 积分`}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </section>
    );
}

function BalanceRow({ balance, dashboard }: { balance: AffiliateBalance; dashboard: AffiliateDashboard }) {
    const queryClient = useQueryClient();
    const [mode, setMode] = useState<"cash" | "credits" | null>(null);
    const [details, setDetails] = useState("");
    const payout = useMutation({
        mutationFn: (kind: "cash" | "credits") => requestAffiliatePayout({ kind, currency: balance.currency, details: kind === "cash" ? details.trim() : undefined }),
        onSuccess: async () => {
            setMode(null);
            setDetails("");
            await queryClient.invalidateQueries({ queryKey: ["partner", "status"] });
        },
    });
    const rate = dashboard.currencyRatesMyr[balance.currency] || 0;
    const credits = rate && dashboard.creditValueMyr ? (((balance.available / 100) * rate) / dashboard.creditValueMyr) * (1 + dashboard.setting.creditBonusBp / 10000) : 0;
    const minimumMinor = rate ? Math.ceil((dashboard.setting.minPayoutMyr * 100) / rate) : Infinity;

    return (
        <div className="studio-affiliate-balance">
            <div className="studio-affiliate-stats">
                <div>
                    <span>可提取</span>
                    <strong>{formatMoney(balance.available, balance.currency)}</strong>
                </div>
                <div>
                    <span>冷却中</span>
                    <strong>{formatMoney(balance.pending, balance.currency)}</strong>
                </div>
                <div>
                    <span>处理中</span>
                    <strong>{formatMoney(balance.inPayout, balance.currency)}</strong>
                </div>
                <div>
                    <span>已提取</span>
                    <strong>{formatMoney(balance.paidOut, balance.currency)}</strong>
                </div>
            </div>
            {balance.available > 0 && !mode ? (
                <div className="studio-partner-actions">
                    <button type="button" className="studio-mini-button" disabled={balance.available < minimumMinor} title={balance.available < minimumMinor ? `满 RM${dashboard.setting.minPayoutMyr} 可提现` : undefined} onClick={() => setMode("cash")}>
                        提现
                    </button>
                    <button type="button" className="studio-generate-button" disabled={!credits} onClick={() => setMode("credits")}>
                        换 {formatCredits(credits * 1_000_000, 0)} 积分
                    </button>
                </div>
            ) : null}
            {mode === "cash" ? (
                <form
                    className="studio-partner-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        payout.mutate("cash");
                    }}
                >
                    <label className="studio-field">
                        <span>收款信息（银行、户名、账号）</span>
                        <textarea rows={3} maxLength={500} value={details} onChange={(event) => setDetails(event.target.value)} />
                    </label>
                    <p className="studio-hint">提现 {formatMoney(balance.available, balance.currency)}，财务审核后转账。</p>
                    {payout.isError ? <p className="studio-error">{payout.error instanceof Error ? payout.error.message : "提交失败"}</p> : null}
                    <div className="studio-partner-actions">
                        <button type="button" className="studio-mini-button" onClick={() => setMode(null)}>
                            取消
                        </button>
                        <button type="submit" className="studio-generate-button" disabled={payout.isPending || details.trim().length < 6}>
                            {payout.isPending ? "提交中…" : "确认提现"}
                        </button>
                    </div>
                </form>
            ) : null}
            {mode === "credits" ? (
                <div className="studio-partner-form">
                    <p className="studio-hint">
                        把 {formatMoney(balance.available, balance.currency)} 换成约 {formatCredits(credits * 1_000_000, 0)} 积分（含 {formatRate(dashboard.setting.creditBonusBp)} 加成），立即到账，不能撤回。
                    </p>
                    {payout.isError ? <p className="studio-error">{payout.error instanceof Error ? payout.error.message : "兑换失败"}</p> : null}
                    <div className="studio-partner-actions">
                        <button type="button" className="studio-mini-button" onClick={() => setMode(null)}>
                            取消
                        </button>
                        <button type="button" className="studio-generate-button" disabled={payout.isPending} onClick={() => payout.mutate("credits")}>
                            {payout.isPending ? "兑换中…" : "确认兑换"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
