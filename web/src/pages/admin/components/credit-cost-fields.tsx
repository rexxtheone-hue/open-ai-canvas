import { Form, InputNumber, Select, Switch, type FormInstance } from "antd";
import { Link } from "react-router";
import { costCurrencyOptions, costCurrencySymbol, costSourceToCredits, useBillingCurrency, type CostCurrency } from "./billing-currency";
import type { ChannelModelFormValues } from "./channel-model-editor-form";

export function CreditCostFields({ index, form, billingMode, isVideo, isImage = false }: { index: number; form: FormInstance<ChannelModelFormValues>; billingMode: string; isVideo: boolean; isImage?: boolean }) {
    const configured = Form.useWatch(["priceTiers", index, "costConfigured"], form) === true;
    const currency: CostCurrency = Form.useWatch(["priceTiers", index, "costCurrency"], form) || "CREDIT";
    const billing = useBillingCurrency();
    const unit = currency === "CREDIT" ? "积分" : costCurrencySymbol[currency];
    const fields =
        billingMode === "token"
            ? isVideo
                ? [["costOutputTokenPrice", `${unit} / 百万视频 Token`]]
                : isImage
                  ? [
                        ["costInputTokenPrice", `输入 ${unit} / 百万 Token`],
                        ["costOutputTokenPrice", `文字与思考输出 ${unit} / 百万 Token`],
                        ["costImageTokenPrice", `图片输出 ${unit} / 百万 Token`],
                    ]
                  : [
                        ["costInputTokenPrice", `输入 ${unit} / 百万 Token`],
                        ["costOutputTokenPrice", `输出 ${unit} / 百万 Token`],
                        ["costCachedTokenPrice", `缓存 ${unit} / 百万 Token`],
                    ]
            : [["costUnitPrice", billingMode === "per_second" ? `${unit} / 秒` : `${unit} / 次`]];
    if (isVideo) {
        fields.push(["costExtraImagePrice", `超出免费张数后 ${unit} / 张参考图`], ["costExtraVideoSecondPrice", `${unit} / 秒参考视频`]);
    }
    return (
        <section className="admin-price-tier-cost-panel" aria-label="成本设置">
            <header className="admin-price-tier-cost-header">
                <div className="admin-price-tier-cost-heading">
                    <div className="admin-price-tier-cost-title">
                        <span>成本</span>
                        <span className="admin-price-tier-cost-badge">仅管理员可见</span>
                    </div>
                    <p>按供应商结算币种填写，系统按汇率换算成积分成本，不影响用户售价。</p>
                </div>
                <Form.Item className="admin-price-tier-cost-switch mb-0" name={[index, "costConfigured"]} valuePropName="checked">
                    <Switch aria-label="配置成本价" />
                </Form.Item>
            </header>
            {configured ? (
                <>
                    <Form.Item className="mb-3" name={[index, "costCurrency"]} label="成本币种" initialValue="CREDIT">
                        <Select options={costCurrencyOptions} className="w-full" style={{ maxWidth: 220 }} />
                    </Form.Item>
                    <div className={billingMode === "token" && !isVideo ? "admin-price-tier-cost-grid admin-price-tier-cost-token-grid" : "admin-price-tier-cost-grid"}>
                        {fields.map(([field, label]) => (
                            <Form.Item
                                key={field}
                                className="mb-0"
                                name={[index, field]}
                                label={label}
                                rules={field.startsWith("costExtra") ? undefined : [{ required: true, message: "请输入成本价" }]}
                                extra={currency === "CREDIT" ? undefined : <CreditHint form={form} index={index} field={field} currency={currency} billing={billing} />}
                            >
                                <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.01} />
                            </Form.Item>
                        ))}
                    </div>
                </>
            ) : null}
        </section>
    );
}

function CreditHint({ form, index, field, currency, billing }: { form: FormInstance<ChannelModelFormValues>; index: number; field: string; currency: CostCurrency; billing: ReturnType<typeof useBillingCurrency> }) {
    const amount = Form.useWatch(["priceTiers", index, field], form);
    const credits = costSourceToCredits(billing, currency, Number(amount) || 0);
    if (credits === undefined) {
        return <Link to="/admin/settings/billing-currency">请先配置汇率</Link>;
    }
    return <span>≈ {new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(credits)} 积分</span>;
}
