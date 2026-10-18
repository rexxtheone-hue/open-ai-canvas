import { App, Button, InputNumber, Skeleton } from "antd";
import { AlertTriangle, ArrowRightLeft, Coins, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { updateAdminBillingCurrencySetting, type BillingCurrencySetting } from "@/services/api/auth";
import { loadBillingCurrency } from "../components/billing-currency";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";

type Draft = { creditValue: number | null; usd: number | null; cny: number | null };

const description = "积分以马币计价；供应商成本按原币填写，按这里的汇率换算成积分";

export default function BillingCurrencySettingsPage() {
    const { message, modal } = App.useApp();
    const [saved, setSaved] = useState<BillingCurrencySetting | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const setting = await loadBillingCurrency(true);
            setSaved(setting);
            setDraft(toDraft(setting));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "读取币种与汇率失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const dirty = Boolean(saved && draft && (draft.creditValue !== saved.creditValue || draft.usd !== saved.rates.USD || draft.cny !== saved.rates.CNY));
    const valid = Boolean(draft && positive(draft.creditValue) && positive(draft.usd) && positive(draft.cny));

    const save = () => {
        if (!draft || !valid || saving) return;
        modal.confirm({
            title: "保存并重算成本？",
            content: "所有按马币、美元、人民币填写的规格成本会按新汇率重算成积分。销售价不会自动改变，如需保持利润率请到渠道模型里用「统一调价」。",
            okText: "保存并重算",
            cancelText: "取消",
            onOk: async () => {
                setSaving(true);
                setError("");
                try {
                    const result = await updateAdminBillingCurrencySetting({ creditValue: draft.creditValue!, rates: { USD: draft.usd!, CNY: draft.cny! } });
                    setSaved(result.setting);
                    setDraft(toDraft(result.setting));
                    void loadBillingCurrency(true);
                    message.success(`已保存，重算了 ${result.setting.recomputed ?? 0} 个规格的成本`);
                } catch (cause) {
                    const text = cause instanceof Error ? cause.message : "保存失败";
                    setError(text);
                    message.error(text);
                } finally {
                    setSaving(false);
                }
            },
        });
    };

    if (loading && !draft) {
        return (
            <AdminPageFrame title="币种与汇率" description={description} scroll>
                <div className="admin-settings-stack">
                    <Skeleton active paragraph={{ rows: 6 }} />
                </div>
            </AdminPageFrame>
        );
    }

    if (!draft || !saved) {
        return (
            <AdminPageFrame title="币种与汇率" description={description} scroll>
                <div className="admin-settings-stack">
                    <div className="admin-drawing-load-error" role="alert">
                        <span className="admin-drawing-load-error-icon">
                            <AlertTriangle className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>无法读取币种与汇率</h2>
                            <p>{error || "请稍后重试。"}</p>
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
                            重新读取
                        </Button>
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    const creditsPerRinggit = positive(draft.creditValue) ? 1 / draft.creditValue! : null;

    return (
        <AdminPageFrame title="币种与汇率" description={description} scroll>
            <div className="admin-settings-stack admin-drawing-settings">
                <div className={dirty ? "admin-drawing-command-bar is-dirty" : "admin-drawing-command-bar"}>
                    <div className="admin-drawing-command-copy">
                        <div className="flex flex-wrap items-center gap-2">
                            <strong>{dirty ? "有调整待保存" : "配置已同步"}</strong>
                            <AdminStatusBadge label={dirty ? "尚未生效" : saved.configured ? "服务端配置" : "系统默认，请核对"} tone={dirty || !saved.configured ? "warning" : "neutral"} />
                        </div>
                    </div>
                    <div className="admin-drawing-command-actions">
                        <Button icon={<RefreshCw className="size-4" />} disabled={saving} onClick={() => void load()}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || !valid} onClick={save}>
                            保存修改
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="admin-drawing-inline-alert" role="alert">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                ) : null}

                <div className="admin-drawing-section-grid">
                    <SettingsSectionCard
                        icon={<Coins className="size-4" aria-hidden="true" />}
                        title="1. 积分面值"
                        description="1 积分等于多少马币。充值套餐也应按这个面值定价。"
                        status={<AdminStatusBadge label={creditsPerRinggit ? `RM1 = ${format(creditsPerRinggit)} 积分` : "未填写"} tone={creditsPerRinggit ? "info" : "warning"} />}
                    >
                        <label className="admin-currency-field">
                            <span>1 积分 =</span>
                            <InputNumber min={0.000001} max={1000} step={0.01} precision={6} value={draft.creditValue} addonBefore="RM" onChange={(value) => setDraft({ ...draft, creditValue: value })} disabled={saving} />
                        </label>
                    </SettingsSectionCard>

                    <SettingsSectionCard
                        icon={<ArrowRightLeft className="size-4" aria-hidden="true" />}
                        title="2. 成本汇率"
                        description="供应商用美元或人民币结算时，按这里换算成马币。建议比市场汇率略高，留出波动余量。"
                        status={<AdminStatusBadge label="手动维护" tone="neutral" />}
                    >
                        <div className="admin-currency-grid">
                            <label className="admin-currency-field">
                                <span>1 美元 USD =</span>
                                <InputNumber min={0.0001} max={100000} step={0.01} precision={4} value={draft.usd} addonBefore="RM" onChange={(value) => setDraft({ ...draft, usd: value })} disabled={saving} />
                            </label>
                            <label className="admin-currency-field">
                                <span>1 人民币 CNY =</span>
                                <InputNumber min={0.0001} max={100000} step={0.01} precision={4} value={draft.cny} addonBefore="RM" onChange={(value) => setDraft({ ...draft, cny: value })} disabled={saving} />
                            </label>
                        </div>
                        {positive(draft.creditValue) && positive(draft.usd) && positive(draft.cny) ? (
                            <p className="admin-currency-example">
                                示例：成本 US$0.05 ≈ {format((0.05 * draft.usd!) / draft.creditValue!)} 积分；成本 ¥0.30 ≈ {format((0.3 * draft.cny!) / draft.creditValue!)} 积分。
                            </p>
                        ) : null}
                    </SettingsSectionCard>
                </div>
            </div>
        </AdminPageFrame>
    );
}

function toDraft(setting: BillingCurrencySetting): Draft {
    return { creditValue: setting.creditValue, usd: setting.rates.USD ?? null, cny: setting.rates.CNY ?? null };
}

function positive(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function format(value: number) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
}
