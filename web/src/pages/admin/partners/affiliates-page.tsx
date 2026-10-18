import { App, Button, Input, InputNumber, Modal, Table, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Select } from "@/pages/admin/ui/controls";
import {
    formatMoney,
    formatRate,
    getAdminAffiliateSetting,
    listAdminAffiliatePayouts,
    listAdminAffiliates,
    reviewAffiliatePayout,
    updateAdminAffiliate,
    updateAdminAffiliateSetting,
    type AdminAffiliate,
    type AdminAffiliatePayout,
    type AffiliatePayoutStatus,
    type AffiliateSetting,
} from "@/services/api/partner";
import { useUserStore } from "@/stores/use-user-store";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";

const payoutStatusLabels: Record<AffiliatePayoutStatus, string> = { requested: "待打款", paid: "已打款", rejected: "已驳回", completed: "已换积分" };
const payoutTone: Record<AffiliatePayoutStatus, "warning" | "success" | "error" | "info"> = { requested: "warning", paid: "success", rejected: "error", completed: "info" };

/** 推广分佣：推广者列表、提现审核与分佣规则。财务与超级管理员可操作，运营只读。 */
export default function AffiliatesPage() {
    const role = useUserStore((state) => state.user?.role);
    const canEdit = role === "admin" || role === "finance";
    const [tab, setTab] = useState("payouts");
    return (
        <AdminPageFrame title="推广分佣" description="被推荐人充值后按比例计佣，冷却期后可提现或换积分" scroll>
            <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                    { key: "payouts", label: "提现申请", children: <PayoutsPanel canEdit={canEdit} /> },
                    { key: "affiliates", label: "推广者", children: <AffiliatesPanel canEdit={canEdit} /> },
                    { key: "settings", label: "分佣规则", children: <SettingsPanel canEdit={canEdit} /> },
                ]}
            />
        </AdminPageFrame>
    );
}

function PayoutsPanel({ canEdit }: { canEdit: boolean }) {
    const { message } = App.useApp();
    const [status, setStatus] = useState<AffiliatePayoutStatus | "">("requested");
    const [items, setItems] = useState<AdminAffiliatePayout[]>([]);
    const [loading, setLoading] = useState(false);
    const [review, setReview] = useState<{ item: AdminAffiliatePayout; action: "paid" | "reject" } | null>(null);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems((await listAdminAffiliatePayouts({ status: status || undefined })).items);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "读取提现申请失败");
        } finally {
            setLoading(false);
        }
    }, [status, message]);

    useEffect(() => {
        void load();
    }, [load]);

    const submit = async () => {
        if (!review) return;
        setSaving(true);
        try {
            await reviewAffiliatePayout(review.item.id, { action: review.action, note: note.trim() });
            message.success(review.action === "paid" ? "已标记为已打款" : "已驳回，佣金已退回推广者余额");
            setReview(null);
            await load();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "操作失败");
        } finally {
            setSaving(false);
        }
    };

    const columns: ColumnsType<AdminAffiliatePayout> = [
        { title: "推广者", width: 170, render: (_, item) => `${item.displayName || item.username}（${item.code}）` },
        { title: "方式", dataIndex: "kind", width: 90, render: (value: string) => (value === "cash" ? "现金" : "换积分") },
        { title: "金额", width: 120, render: (_, item) => formatMoney(item.amountFen, item.currency) },
        { title: "收款信息", dataIndex: "payoutDetails", render: (value: string) => <span className="whitespace-pre-wrap break-words text-sm">{value || "—"}</span> },
        { title: "状态", dataIndex: "status", width: 100, render: (value: AffiliatePayoutStatus) => <AdminStatusBadge label={payoutStatusLabels[value]} tone={payoutTone[value]} /> },
        { title: "申请时间", dataIndex: "createdAt", width: 150, render: (value: string) => new Date(value).toLocaleString() },
        {
            title: "操作",
            width: 160,
            render: (_, item) =>
                canEdit && item.status === "requested" ? (
                    <div className="flex gap-2">
                        <Button size="small" type="primary" onClick={() => (setReview({ item, action: "paid" }), setNote(""))}>
                            已打款
                        </Button>
                        <Button size="small" danger onClick={() => (setReview({ item, action: "reject" }), setNote(""))}>
                            驳回
                        </Button>
                    </div>
                ) : (
                    <span className="text-xs opacity-70">{item.reviewNote}</span>
                ),
        },
    ];

    return (
        <div className="admin-settings-stack">
            <div className="flex items-center gap-3">
                <Select
                    aria-label="筛选提现状态"
                    className="w-36"
                    value={status || "all"}
                    onChange={(value: string) => setStatus(value === "all" ? "" : (value as AffiliatePayoutStatus))}
                    options={[{ value: "all", label: "全部状态" }, ...(Object.keys(payoutStatusLabels) as AffiliatePayoutStatus[]).map((value) => ({ value, label: payoutStatusLabels[value] }))]}
                />
                <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()} loading={loading}>
                    刷新
                </Button>
            </div>
            <Table rowKey="id" size="middle" loading={loading} columns={columns} dataSource={items} pagination={false} scroll={{ x: 900 }} />
            <Modal
                open={Boolean(review)}
                title={review?.action === "paid" ? `确认已打款 ${review ? formatMoney(review.item.amountFen, review.item.currency) : ""}` : "驳回提现"}
                okText={review?.action === "paid" ? "确认已打款" : "驳回"}
                okButtonProps={{ danger: review?.action === "reject", loading: saving }}
                onOk={() => void submit()}
                onCancel={() => setReview(null)}
                destroyOnHidden
            >
                <p className="mb-2 text-sm opacity-80">{review?.action === "paid" ? "请先按收款信息线下转账，再在这里确认。" : "驳回后佣金退回推广者的可提取余额。"}</p>
                <Input.TextArea rows={3} maxLength={500} placeholder={review?.action === "paid" ? "转账参考号（可选）" : "驳回原因（必填）"} value={note} onChange={(event) => setNote(event.target.value)} />
            </Modal>
        </div>
    );
}

function AffiliatesPanel({ canEdit }: { canEdit: boolean }) {
    const { message } = App.useApp();
    const [search, setSearch] = useState("");
    const [items, setItems] = useState<AdminAffiliate[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<AdminAffiliate | null>(null);
    const [rate, setRate] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems((await listAdminAffiliates({ q: search.trim() || undefined })).items);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "读取推广者失败");
        } finally {
            setLoading(false);
        }
    }, [search, message]);

    useEffect(() => {
        void load();
        // 搜索框回车或点刷新才重新查询。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const update = async (item: AdminAffiliate, input: { rateBp?: number; status?: "active" | "suspended" }) => {
        try {
            await updateAdminAffiliate(item.userId, input);
            message.success("已更新");
            setEditing(null);
            await load();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "更新失败");
        }
    };

    const columns: ColumnsType<AdminAffiliate> = [
        { title: "推广者", render: (_, item) => `${item.displayName || item.username}（@${item.username}）` },
        { title: "推广码", dataIndex: "code", width: 110 },
        { title: "佣金比例", dataIndex: "commissionRateBp", width: 110, render: (value: number) => (value ? formatRate(value) : "默认") },
        { title: "推荐用户", dataIndex: "referrals", width: 100 },
        { title: "累计佣金", dataIndex: "totalCommission", width: 120, render: (value: number) => formatMoney(value, "MYR") },
        { title: "状态", dataIndex: "status", width: 90, render: (value: string) => <AdminStatusBadge label={value === "active" ? "正常" : "已暂停"} tone={value === "active" ? "success" : "neutral"} /> },
        {
            title: "操作",
            width: 170,
            render: (_, item) =>
                canEdit ? (
                    <div className="flex gap-2">
                        <Button size="small" onClick={() => (setEditing(item), setRate(item.commissionRateBp ? item.commissionRateBp / 100 : null))}>
                            改比例
                        </Button>
                        <Button size="small" danger={item.status === "active"} onClick={() => void update(item, { status: item.status === "active" ? "suspended" : "active" })}>
                            {item.status === "active" ? "暂停" : "恢复"}
                        </Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="admin-settings-stack">
            <div className="flex items-center gap-3">
                <Input.Search className="max-w-xs" placeholder="用户名、昵称或推广码" value={search} onChange={(event) => setSearch(event.target.value)} onSearch={() => void load()} allowClear />
                <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()} loading={loading}>
                    刷新
                </Button>
            </div>
            <p className="text-xs opacity-70">累计佣金按马币显示；其他币种的订单佣金请在提现申请中按币种查看。</p>
            <Table rowKey="userId" size="middle" loading={loading} columns={columns} dataSource={items} pagination={false} scroll={{ x: 800 }} />
            <Modal open={Boolean(editing)} title="修改佣金比例" okText="保存" onOk={() => editing && void update(editing, { rateBp: rate ? Math.round(rate * 100) : 0 })} onCancel={() => setEditing(null)} destroyOnHidden>
                <InputNumber className="w-full" min={0} max={90} precision={2} addonAfter="%" placeholder="留空使用系统默认比例" value={rate} onChange={setRate} />
                <p className="mt-2 text-xs opacity-70">只影响之后入账的订单，已产生的佣金不变。</p>
            </Modal>
        </div>
    );
}

function SettingsPanel({ canEdit }: { canEdit: boolean }) {
    const { message } = App.useApp();
    const [setting, setSetting] = useState<AffiliateSetting | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getAdminAffiliateSetting()
            .then(setSetting)
            .catch((cause: unknown) => message.error(cause instanceof Error ? cause.message : "读取分佣规则失败"));
    }, [message]);

    if (!setting) return null;
    const field = (key: keyof AffiliateSetting, label: string, props: { min: number; max: number; precision: number; addonAfter?: string; addonBefore?: string; scale?: number }) => {
        const scale = props.scale ?? 1;
        return (
            <label className="admin-currency-field">
                <span>{label}</span>
                <InputNumber
                    min={props.min}
                    max={props.max}
                    precision={props.precision}
                    addonAfter={props.addonAfter}
                    addonBefore={props.addonBefore}
                    disabled={!canEdit || saving}
                    value={setting[key] / scale}
                    onChange={(value) => setSetting({ ...setting, [key]: Math.round((value ?? 0) * scale * 100) / 100 })}
                />
            </label>
        );
    };

    const save = async () => {
        setSaving(true);
        try {
            setSetting(await updateAdminAffiliateSetting({ ...setting, defaultRateBp: Math.round(setting.defaultRateBp), creditBonusBp: Math.round(setting.creditBonusBp) }));
            message.success("分佣规则已保存，对之后入账的订单生效");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsSectionCard title="分佣规则" description="修改只影响之后产生的佣金。">
            <div className="admin-currency-grid">
                {field("defaultRateBp", "默认佣金比例", { min: 0, max: 90, precision: 2, addonAfter: "%", scale: 100 })}
                {field("attributionDays", "推荐有效期", { min: 1, max: 3650, precision: 0, addonAfter: "天" })}
                {field("holdDays", "冷却期（防退款套利）", { min: 0, max: 180, precision: 0, addonAfter: "天" })}
                {field("minPayoutMyr", "现金最低提现", { min: 0, max: 100000, precision: 2, addonBefore: "RM" })}
                {field("creditBonusBp", "换积分额外加成", { min: 0, max: 100, precision: 2, addonAfter: "%", scale: 100 })}
            </div>
            {canEdit ? (
                <Button className="mt-4" type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void save()}>
                    保存
                </Button>
            ) : null}
        </SettingsSectionCard>
    );
}
