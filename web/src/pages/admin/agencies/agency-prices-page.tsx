// 代理商管理员设置客户看到的零售价：全局倍率、单个模型的倍率或固定价，以及隐藏模型。

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Input, InputNumber } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw, RotateCcw, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Select } from "@/components/ui/base/select";
import { deleteOwnModelPrice, getOwnModelPrices, listOwnPriceRules, saveOwnModelPrice, type TenantModelPrice, type TenantModelPriceRule, type TenantModelPriceTier } from "@/services/api/tenant-admin";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty, SettingsSectionCard } from "../components/admin-ui";
import { AdminCallout, AdminSwitch } from "../ui/controls";
import { capabilityLabel, formatPoolCredits, priceUnitLabel } from "./agency-format";
import "./agencies.css";

type PriceMode = "global" | "multiplier" | "fixed";
type RowDraft = { mode: PriceMode; multiplier: number; fixedCredits: number; visible: boolean };

const queryKeys = { catalog: ["agency", "prices", "catalog"], rules: ["agency", "prices", "rules"] };

function modelRule(rules: TenantModelPriceRule[], channelModelId: string) {
    return rules.find((rule) => rule.channelModelId === channelModelId && !rule.priceTierId);
}

function draftFor(item: TenantModelPrice, rule: TenantModelPriceRule | undefined): RowDraft {
    if (!rule) return { mode: "global", multiplier: 1, fixedCredits: (item.tiers[0]?.retailUnitMicrocredits || 0) / 1_000_000, visible: true };
    const fixed = typeof rule.fixedUnitPriceMicrocredits === "number";
    return { mode: fixed ? "fixed" : "multiplier", multiplier: rule.multiplierBasisPoints / 10_000, fixedCredits: (rule.fixedUnitPriceMicrocredits || 0) / 1_000_000, visible: rule.enabled };
}

function sameDraft(a: RowDraft, b: RowDraft) {
    return a.mode === b.mode && a.visible === b.visible && (a.mode !== "multiplier" || a.multiplier === b.multiplier) && (a.mode !== "fixed" || a.fixedCredits === b.fixedCredits);
}

function TierPrices({ tier }: { tier: TenantModelPriceTier }) {
    const unit = priceUnitLabel(tier.billingMode);
    return (
        <div className="admin-agency-price-cell">
            <span>
                平台 {formatPoolCredits(tier.platformUnitMicrocredits)} · 批发池 {formatPoolCredits(tier.poolUnitMicrocredits)} · 客户 <strong>{formatPoolCredits(tier.retailUnitMicrocredits)}</strong>
            </span>
            <small>
                {[tier.resolution && tier.resolution !== "*" ? tier.resolution : "", ...Object.entries(tier.selector || {}).map(([key, value]) => `${key}=${value}`)].filter(Boolean).join(" · ") || "默认规格"} {unit}
                {tier.hidden ? " · 已隐藏" : ""}
            </small>
        </div>
    );
}

export default function AgencyPricesPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const catalog = useQuery({ queryKey: queryKeys.catalog, queryFn: ({ signal }) => getOwnModelPrices(signal) });
    const rules = useQuery({ queryKey: queryKeys.rules, queryFn: async ({ signal }) => (await listOwnPriceRules(signal)).prices || [] });
    const [keyword, setKeyword] = useState("");
    const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
    const [globalMultiplier, setGlobalMultiplier] = useState<number>(1);
    const [saving, setSaving] = useState("");
    const queryError = catalog.error || rules.error;
    const globalRule = (rules.data || []).find((rule) => !rule.channelModelId && !rule.priceTierId);

    useEffect(() => {
        setGlobalMultiplier(globalRule ? globalRule.multiplierBasisPoints / 10_000 : 1);
    }, [globalRule?.id, globalRule?.multiplierBasisPoints]);

    const models = useMemo(() => {
        const needle = keyword.trim().toLowerCase();
        const items = catalog.data?.models || [];
        return needle ? items.filter((item) => [item.displayName, item.modelKey].some((value) => value?.toLowerCase().includes(needle))) : items;
    }, [catalog.data, keyword]);

    const reload = async () => {
        await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.catalog }), queryClient.invalidateQueries({ queryKey: queryKeys.rules })]);
    };

    const run = async (key: string, action: () => Promise<unknown>, success: string) => {
        setSaving(key);
        try {
            await action();
            message.success(success);
            await reload();
            setDrafts((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving("");
        }
    };

    const saveRow = (item: TenantModelPrice, draft: RowDraft) => {
        const rule = modelRule(rules.data || [], item.channelModelId);
        return run(
            item.channelModelId,
            async () => {
                if (draft.mode === "global" && draft.visible) {
                    if (rule) await deleteOwnModelPrice(rule.id);
                    return;
                }
                if (draft.mode === "fixed") {
                    await saveOwnModelPrice({ channelModelId: item.channelModelId, fixedUnitPriceMicrocredits: Math.round(draft.fixedCredits * 1_000_000), enabled: draft.visible });
                    return;
                }
                // 跟随全局但隐藏时，倍率沿用当前全局倍率，客户本来就看不到这个模型。
                await saveOwnModelPrice({ channelModelId: item.channelModelId, multiplier: draft.mode === "multiplier" ? draft.multiplier : globalMultiplier, enabled: draft.visible });
            },
            `${item.displayName} 已保存`,
        );
    };

    const columns: ColumnsType<TenantModelPrice> = [
        {
            title: "模型",
            width: 230,
            fixed: "left",
            render: (_, item) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{item.displayName}</div>
                    <div className="truncate text-xs text-foreground/50">
                        {capabilityLabel(item.capability)} · 拿货折扣 {item.agencyDiscountPercent}%
                    </div>
                </div>
            ),
        },
        {
            title: "每单位积分（平台 · 批发池 · 客户）",
            width: 360,
            render: (_, item) => (
                <div className="flex flex-col gap-1.5">
                    {item.tiers.slice(0, 3).map((tier) => (
                        <TierPrices key={tier.id} tier={tier} />
                    ))}
                    {item.tiers.length > 3 ? <span className="text-xs text-foreground/45">另有 {item.tiers.length - 3} 个规格，按同一规则计价</span> : null}
                </div>
            ),
        },
        {
            title: "零售规则",
            width: 270,
            render: (_, item) => {
                const base = draftFor(item, modelRule(rules.data || [], item.channelModelId));
                const draft = drafts[item.channelModelId] || base;
                const update = (patch: Partial<RowDraft>) => setDrafts((current) => ({ ...current, [item.channelModelId]: { ...draft, ...patch } }));
                return (
                    <div className="flex flex-wrap items-center gap-2">
                        <Select<PriceMode>
                            aria-label={`${item.displayName} 的定价方式`}
                            value={draft.mode}
                            style={{ width: 118 }}
                            options={[
                                { value: "global", label: "跟随全局" },
                                { value: "multiplier", label: "单独倍率" },
                                { value: "fixed", label: "固定价" },
                            ]}
                            onChange={(mode) => update({ mode })}
                        />
                        {draft.mode === "multiplier" ? <InputNumber aria-label="倍率" min={0.01} max={100} step={0.1} precision={2} value={draft.multiplier} addonAfter="×" style={{ width: 120 }} onChange={(value) => update({ multiplier: Number(value) || 1 })} /> : null}
                        {draft.mode === "fixed" ? <InputNumber aria-label="固定价（积分）" min={0} step={1} precision={2} value={draft.fixedCredits} addonAfter="积分" style={{ width: 140 }} onChange={(value) => update({ fixedCredits: Number(value) || 0 })} /> : null}
                    </div>
                );
            },
        },
        {
            title: "对客户显示",
            width: 110,
            render: (_, item) => {
                const base = draftFor(item, modelRule(rules.data || [], item.channelModelId));
                const draft = drafts[item.channelModelId] || base;
                return <AdminSwitch size="sm" checked={draft.visible} aria-label={`${item.displayName} 对客户显示`} onChange={(visible) => setDrafts((current) => ({ ...current, [item.channelModelId]: { ...draft, visible } }))} />;
            },
        },
        {
            title: "",
            width: 110,
            render: (_, item) => {
                const base = draftFor(item, modelRule(rules.data || [], item.channelModelId));
                const draft = drafts[item.channelModelId];
                const dirty = Boolean(draft && !sameDraft(draft, base));
                return dirty ? (
                    <Button size="small" type="primary" icon={<Save className="size-3.5" />} loading={saving === item.channelModelId} onClick={() => void saveRow(item, draft!)}>
                        保存
                    </Button>
                ) : item.hidden ? (
                    <AdminStatusBadge label="已隐藏" />
                ) : null;
            },
        },
    ];

    return (
        <AdminPageFrame
            title="模型零售价"
            description="客户生成时按这里的价格扣客户积分；批发池按平台积分与拿货折扣扣减，与零售价无关"
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={catalog.isFetching || rules.isFetching} onClick={() => void reload()}>
                    刷新
                </Button>
            }
            scroll
        >
            <div className="admin-agency-stack">
                <AdminCallout tone="info" title="价格怎么算">
                    「平台」是平台标价，「批发池」是每次生成从你的批发池扣的积分（已按拿货折扣计算），「客户」是客户实际支付的积分。零售价没有下限，低于批发池扣减时差额由你承担。
                </AdminCallout>
                {queryError ? <Alert type="error" showIcon title="读取价格失败" description={queryError instanceof Error ? queryError.message : String(queryError)} /> : null}
                <SettingsSectionCard title="全局倍率" description="没有单独设置的模型，客户价 = 平台积分 × 全局倍率。" layout="stacked" status={globalRule ? { label: `当前 ${(globalRule.multiplierBasisPoints / 10_000).toFixed(2)}×`, color: "blue" } : { label: "未设置（1.00×）" }}>
                    <div className="admin-agency-inline-form">
                        <InputNumber aria-label="全局倍率" min={0.01} max={100} step={0.1} precision={2} value={globalMultiplier} addonAfter="×" style={{ width: 160 }} onChange={(value) => setGlobalMultiplier(Number(value) || 1)} />
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving === "global"} disabled={globalMultiplier === (globalRule ? globalRule.multiplierBasisPoints / 10_000 : 1)} onClick={() => void run("global", () => saveOwnModelPrice({ multiplier: globalMultiplier }), "全局倍率已保存")}>
                            保存
                        </Button>
                        {globalRule ? (
                            <Button icon={<RotateCcw className="size-4" />} loading={saving === "global-reset"} onClick={() => void run("global-reset", () => deleteOwnModelPrice(globalRule.id), "已恢复为 1.00×")}>
                                恢复 1.00×
                            </Button>
                        ) : null}
                    </div>
                </SettingsSectionCard>
                <AdminDataTable<TenantModelPrice>
                    toolbar={<Input allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} placeholder="搜索模型" aria-label="搜索模型" onChange={(event) => setKeyword(event.target.value)} />}
                    empty={<AdminTableEmpty filtered={Boolean(keyword)} title={keyword ? "没有匹配的模型" : "暂无可售模型"} />}
                    table={{ rowKey: "channelModelId", dataSource: models, columns, loading: catalog.isLoading || rules.isLoading, pagination: false, size: "small", scroll: { x: 1080 } }}
                />
            </div>
        </AdminPageFrame>
    );
}
