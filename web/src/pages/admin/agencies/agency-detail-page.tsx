import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Popconfirm, Space, Tabs } from "antd";
import { Ban, Globe, Plus, RefreshCw, RotateCcw, Star, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
    addAgencyAdmin,
    addAgencyDomain,
    adjustAgencyPool,
    getAgency,
    listAgencyDomains,
    listAgencyLedger,
    listAgencyLots,
    listMonthlySettlements,
    refreshAgencyDomain,
    removeAgencyDomain,
    setAgencyAdminStatus,
    setAgencyPrimaryDomain,
    topupAgencyPool,
    updateAgency,
    type AgencyTenantDetail,
    type TenantDomain,
    type TenantTopupResult,
} from "@/services/api/tenant-admin";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { AdminCallout, AdminSwitch } from "../ui/controls";
import { AddAdminModal, AdminsTable, CnameInstruction, DomainsTable, LedgerTable, LotsTable, MonthlyMinimumCard, PoolStats, SettlementsTable, formatTime } from "./agency-components";
import { formatPoolCredits, formatRM, ringgitToSen, tenantStatusLabels, topupEstimateMicrocredits } from "./agency-format";
import { agenciesQueryKey } from "./agencies-page";
import "./agencies.css";

function OverviewTab({ detail, onChanged }: { detail: AgencyTenantDetail; onChanged: () => void }) {
    const { message } = App.useApp();
    const [name, setName] = useState(detail.tenant.name);
    const [saving, setSaving] = useState(false);
    const tenant = detail.tenant;
    const suspended = tenant.status === "suspended";

    const save = async (body: { name?: string; status?: "active" | "suspended" }, success: string) => {
        setSaving(true);
        try {
            await updateAgency(tenant.id, body);
            message.success(success);
            onChanged();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="admin-agency-stack">
            <PoolStats summary={detail} />
            <MonthlyMinimumCard month={detail.currentMonth} />
            <SettingsSectionCard title="基本资料" layout="stacked" status={{ label: tenantStatusLabels[tenant.status]?.label || tenant.status, color: suspended ? "error" : "success" }}>
                <div className="px-4 py-4">
                    <Descriptions
                        size="small"
                        column={{ xs: 1, sm: 2, lg: 3 }}
                        items={[
                            { key: "slug", label: "短名", children: tenant.slug },
                            { key: "primary", label: "主网址", children: detail.primaryDomain?.host || "未设置" },
                            { key: "created", label: "开设时间", children: formatTime(tenant.createdAt) },
                            { key: "feeFree", label: "免月费截止", children: tenant.feeFreeUntil ? formatTime(tenant.feeFreeUntil) : "—" },
                            { key: "customers", label: "客户数", children: detail.customerCount.toLocaleString("en-US") },
                            { key: "admins", label: "管理员数", children: detail.adminCount },
                        ]}
                    />
                    <div className="admin-agency-inline-form !px-0 !pb-0">
                        <Input aria-label="代理商名称" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} style={{ maxWidth: 360 }} />
                        <Button disabled={!name.trim() || name.trim() === tenant.name} loading={saving} onClick={() => void save({ name: name.trim() }, "名称已更新")}>
                            保存名称
                        </Button>
                    </div>
                </div>
            </SettingsSectionCard>
            <SettingsSectionCard
                title={suspended ? "恢复代理商" : "停用代理商"}
                description={suspended ? "恢复后代理商网址、客户登录和生成立即恢复。" : "停用后代理商的所有网址整站返回「此网站已暂停服务」，客户和管理员都无法使用。数据和批发池保留。"}
                layout="stacked"
            >
                <div className="px-4 py-4">
                    {suspended ? (
                        <Button type="primary" icon={<RotateCcw className="size-4" />} loading={saving} onClick={() => void save({ status: "active" }, "代理商已恢复")}>
                            恢复代理商
                        </Button>
                    ) : (
                        <Popconfirm title={`停用 ${tenant.name}？`} description="代理商网址会立即停止服务。" okText="停用" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => save({ status: "suspended" }, "代理商已停用")}>
                            <Button danger icon={<Ban className="size-4" />} loading={saving}>
                                停用代理商
                            </Button>
                        </Popconfirm>
                    )}
                </div>
            </SettingsSectionCard>
        </div>
    );
}

function DomainsTab({ tenantId }: { tenantId: string }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const key = ["admin", "agency", tenantId, "domains"];
    const query = useQuery({ queryKey: key, queryFn: async ({ signal }) => (await listAgencyDomains(tenantId, signal)).domains });
    const [host, setHost] = useState("");
    const [primary, setPrimary] = useState(false);
    const [busy, setBusy] = useState("");

    const run = async (id: string, action: () => Promise<unknown>, success: string) => {
        setBusy(id);
        try {
            await action();
            message.success(success);
            await queryClient.invalidateQueries({ queryKey: key });
            void queryClient.invalidateQueries({ queryKey: agenciesQueryKey });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        } finally {
            setBusy("");
        }
    };

    const domains = query.data || [];
    return (
        <div className="admin-agency-stack">
            <SettingsSectionCard title="添加自定义网址" description="代理商自己的网址（例如 studio.agency.com）。添加后在 Cloudflare 登记并自动签发证书。" layout="stacked">
                <div className="admin-agency-inline-form">
                    <Input aria-label="自定义网址" placeholder="studio.example.com" value={host} onChange={(event) => setHost(event.target.value)} style={{ maxWidth: 360 }} prefix={<Globe className="size-4 text-foreground/40" />} />
                    <label className="flex items-center gap-2 text-sm">
                        <AdminSwitch size="sm" checked={primary} onChange={setPrimary} aria-label="设为主网址" />
                        设为主网址
                    </label>
                    <Button
                        type="primary"
                        icon={<Plus className="size-4" />}
                        disabled={!host.trim()}
                        loading={busy === "add"}
                        onClick={() =>
                            void run(
                                "add",
                                async () => {
                                    await addAgencyDomain(tenantId, host.trim(), primary);
                                    setHost("");
                                    setPrimary(false);
                                },
                                "网址已添加，请按下方说明设置 DNS",
                            )
                        }
                    >
                        添加网址
                    </Button>
                </div>
            </SettingsSectionCard>
            <CnameInstruction domains={domains} />
            {query.error ? <Alert type="error" showIcon title="网址读取失败" description={query.error instanceof Error ? query.error.message : String(query.error)} /> : null}
            <DomainsTable
                domains={domains}
                loading={query.isLoading}
                actions={(domain: TenantDomain) => (
                    <Space size={4} wrap>
                        {domain.managed ? (
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={busy === `refresh-${domain.id}`} onClick={() => void run(`refresh-${domain.id}`, () => refreshAgencyDomain(tenantId, domain.id), "证书状态已刷新")}>
                                刷新
                            </Button>
                        ) : null}
                        {!domain.isPrimary ? (
                            <Button size="small" icon={<Star className="size-3.5" />} loading={busy === `primary-${domain.id}`} onClick={() => void run(`primary-${domain.id}`, () => setAgencyPrimaryDomain(tenantId, domain.id), "已设为主网址")}>
                                设为主网址
                            </Button>
                        ) : null}
                        <Popconfirm title={`删除 ${domain.host}？`} description="删除后这个网址不再指向代理商。" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => run(`remove-${domain.id}`, () => removeAgencyDomain(tenantId, domain.id), "网址已删除")}>
                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} loading={busy === `remove-${domain.id}`}>
                                删除
                            </Button>
                        </Popconfirm>
                    </Space>
                )}
            />
        </div>
    );
}

type TopupValues = { amountRM: number; paymentReference: string; note?: string };
type AdjustValues = { credits: number; note: string };

function PoolTab({ tenantId, onChanged }: { tenantId: string; onChanged: () => void }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [topupForm] = Form.useForm<TopupValues>();
    const [adjustForm] = Form.useForm<AdjustValues>();
    const [topupResult, setTopupResult] = useState<TenantTopupResult | null>(null);
    const [saving, setSaving] = useState("");
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerSize, setLedgerSize] = useState(20);
    const lots = useQuery({ queryKey: ["admin", "agency", tenantId, "lots"], queryFn: async ({ signal }) => (await listAgencyLots(tenantId, signal)).lots });
    const ledger = useQuery({ queryKey: ["admin", "agency", tenantId, "ledger", ledgerPage, ledgerSize], queryFn: ({ signal }) => listAgencyLedger(tenantId, ledgerPage, ledgerSize, signal) });
    const amountRM = Form.useWatch("amountRM", topupForm);

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "agency", tenantId] });
        void queryClient.invalidateQueries({ queryKey: agenciesQueryKey });
        onChanged();
    };

    return (
        <div className="admin-agency-stack">
            <SettingsSectionCard title="记录银行转账充值" description="代理商转账到账后在这里入账：RM 0.773 = 100 批发积分。若有欠款，会先从这笔充值中抵扣。" layout="stacked">
                <Form<TopupValues>
                    form={topupForm}
                    layout="vertical"
                    requiredMark={false}
                    className="admin-agency-inline-form"
                    onFinish={async (values) => {
                        setSaving("topup");
                        try {
                            const result = await topupAgencyPool(tenantId, { amountSen: ringgitToSen(values.amountRM), paymentReference: values.paymentReference.trim(), note: values.note?.trim() || "" });
                            setTopupResult(result);
                            message.success("充值已入账");
                            topupForm.resetFields();
                            refresh();
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : "充值失败");
                        } finally {
                            setSaving("");
                        }
                    }}
                >
                    <Form.Item name="amountRM" label="转账金额（RM）" rules={[{ required: true, message: "请填写金额" }]}>
                        <InputNumber min={0.01} step={100} precision={2} style={{ width: 180 }} placeholder="5000.00" />
                    </Form.Item>
                    <Form.Item name="paymentReference" label="转账参考号" rules={[{ required: true, message: "请填写参考号" }]}>
                        <Input autoComplete="off" style={{ width: 220 }} />
                    </Form.Item>
                    <Form.Item name="note" label="备注">
                        <Input autoComplete="off" style={{ width: 240 }} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<Wallet className="size-4" />} loading={saving === "topup"}>
                        入账
                    </Button>
                </Form>
                {typeof amountRM === "number" && amountRM > 0 ? <div className="px-[18px] pb-3 text-xs text-foreground/55">约 {formatPoolCredits(topupEstimateMicrocredits(ringgitToSen(amountRM)))} 批发积分</div> : null}
                {topupResult ? (
                    <AdminCallout className="admin-agency-result" tone={topupResult.belowFirstTopupMinimum ? "warning" : "success"} title={topupResult.warning ? `${topupResult.warning}（仅提示，已入账）` : "充值已入账"}>
                        共 {formatPoolCredits(topupResult.grossMicrocredits)} 积分
                        {topupResult.debtSettledMicrocredits > 0 ? `，其中 ${formatPoolCredits(topupResult.debtSettledMicrocredits)} 积分用于抵扣欠款` : ""}，实际入池 {formatPoolCredits(topupResult.lot.amountMicrocredits)} 积分，{formatTime(topupResult.lot.expiresAt)} 到期。
                    </AdminCallout>
                ) : null}
            </SettingsSectionCard>
            <SettingsSectionCard title="人工调账" description="正数增加、负数扣减批发池积分；不能扣成负数。请写明原因，会记入审计日志。" layout="stacked">
                <Form<AdjustValues>
                    form={adjustForm}
                    layout="vertical"
                    requiredMark={false}
                    className="admin-agency-inline-form"
                    onFinish={async (values) => {
                        setSaving("adjust");
                        try {
                            await adjustAgencyPool(tenantId, { amountMicrocredits: Math.round(values.credits * 1_000_000), note: values.note.trim() });
                            message.success("调账已完成");
                            adjustForm.resetFields();
                            refresh();
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : "调账失败");
                        } finally {
                            setSaving("");
                        }
                    }}
                >
                    <Form.Item name="credits" label="积分" rules={[{ required: true, message: "请填写积分" }, { validator: (_, value) => (value === 0 ? Promise.reject(new Error("不能为 0")) : Promise.resolve()) }]}>
                        <InputNumber step={100} precision={2} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item name="note" label="原因" rules={[{ required: true, message: "请填写原因" }]}>
                        <Input autoComplete="off" style={{ width: 300 }} />
                    </Form.Item>
                    <Button htmlType="submit" loading={saving === "adjust"}>
                        调账
                    </Button>
                </Form>
            </SettingsSectionCard>
            <h3 className="admin-agency-section-title">充值批次</h3>
            <LotsTable lots={lots.data || []} loading={lots.isLoading} />
            <h3 className="admin-agency-section-title">批发池流水</h3>
            <LedgerTable
                items={ledger.data?.items || []}
                total={ledger.data?.total || 0}
                page={ledgerPage}
                pageSize={ledgerSize}
                loading={ledger.isLoading}
                onPageChange={(page, size) => {
                    setLedgerPage(size !== ledgerSize ? 1 : page);
                    setLedgerSize(size);
                }}
            />
        </div>
    );
}

function SettlementsTab({ tenantId }: { tenantId: string }) {
    const query = useQuery({ queryKey: ["admin", "agency", tenantId, "settlements"], queryFn: async ({ signal }) => (await listMonthlySettlements({ tenantId }, signal)).settlements });
    return (
        <div className="admin-agency-stack">
            <AdminCallout tone="info" title="月最低消费规则">
                每月批发用量不足 {formatRM(500_000)} 时，收取差额的 30%（最高 {formatRM(150_000)}）；开设后头 2 个月免收。月费先从批发池扣，不足的记为欠款，在下次充值时自动抵扣。
            </AdminCallout>
            <SettlementsTable items={query.data || []} loading={query.isLoading} />
        </div>
    );
}

function AdminsTab({ detail, onChanged }: { detail: AgencyTenantDetail; onChanged: () => void }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    return (
        <div className="admin-agency-stack">
            <div className="admin-agency-toolbar">
                <span className="text-xs text-foreground/55">代理商管理员只能管理本代理商的网址后台，不能访问平台功能。</span>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
                    添加管理员
                </Button>
            </div>
            <AdminsTable
                users={detail.admins}
                onToggle={async (user, next) => {
                    try {
                        await setAgencyAdminStatus(detail.tenant.id, user.id, next);
                        message.success(next === "active" ? "已恢复" : "已停用");
                        onChanged();
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "操作失败");
                    }
                }}
            />
            <AddAdminModal
                open={open}
                onClose={() => setOpen(false)}
                onSubmit={async (values) => {
                    const result = await addAgencyAdmin(detail.tenant.id, values);
                    onChanged();
                    return result;
                }}
            />
        </div>
    );
}

export default function AgencyDetailPage() {
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState("overview");
    const query = useQuery({ queryKey: ["admin", "agency", id, "detail"], queryFn: async ({ signal }) => (await getAgency(id, signal)).tenant, enabled: Boolean(id) });
    const detail = query.data;
    const reload = () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "agency", id, "detail"] });
        void queryClient.invalidateQueries({ queryKey: agenciesQueryKey });
    };

    return (
        <AdminPageFrame
            title={detail ? detail.tenant.name || detail.tenant.slug : "代理商详情"}
            description={detail ? `${detail.tenant.slug} · ${detail.primaryDomain?.host || "未设置网址"}` : undefined}
            back={{ label: "返回代理商列表", onClick: () => navigate("/admin/agencies") }}
            actions={detail ? <AdminStatusBadge label={tenantStatusLabels[detail.tenant.status]?.label || detail.tenant.status} tone={tenantStatusLabels[detail.tenant.status]?.tone} /> : null}
            scroll
        >
            {query.error ? <Alert type="error" showIcon title="代理商读取失败" description={query.error instanceof Error ? query.error.message : String(query.error)} /> : null}
            {detail ? (
                <Tabs
                    className="admin-agency-tabs"
                    activeKey={tab}
                    onChange={setTab}
                    items={[
                        { key: "overview", label: "概览", children: <OverviewTab key={detail.tenant.updatedAt} detail={detail} onChanged={reload} /> },
                        { key: "domains", label: "网址", children: <DomainsTab tenantId={detail.tenant.id} /> },
                        { key: "pool", label: "积分池", children: <PoolTab tenantId={detail.tenant.id} onChanged={reload} /> },
                        { key: "settlements", label: "月度结算", children: <SettlementsTab tenantId={detail.tenant.id} /> },
                        { key: "admins", label: "管理员", children: <AdminsTab detail={detail} onChanged={reload} /> },
                    ]}
                />
            ) : query.isLoading ? (
                <div className="p-8 text-sm" role="status">
                    正在读取代理商…
                </div>
            ) : null}
        </AdminPageFrame>
    );
}
