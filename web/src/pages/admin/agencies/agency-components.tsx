// 代理商后台共用的展示组件：批发池概览、批次、流水、月结、网址与管理员表格。

import { App, Button, Form, Input, Popconfirm, Progress } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { Copy, Mail, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { TenantAdminUser, TenantAdminUserRequest, TenantAdminUserResult, TenantCreditLot, TenantDebt, TenantDomain, TenantLedgerEntry, TenantMonthlyFeePreview, TenantMonthlyUsage, TenantPoolSummary } from "@/services/api/tenant-admin";
import { AdminDataTable, AdminStatTile, AdminStatusBadge, AdminTableEmpty, PaginationBar, SettingsSectionCard } from "../components/admin-ui";
import { AdminSwitch } from "../ui/controls";
import { AdminModal } from "../ui/overlays";
import { MONTHLY_MINIMUM_SEN, formatPoolCredits, formatRM, ledgerTypeLabels, minimumProgress, sslStatusDisplay, usageAgainstMinimum } from "./agency-format";
import "./agencies.css";

export function formatTime(value?: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—";
}

export function AgencyStatGrid({ children }: { children: ReactNode }) {
    return <div className="admin-agency-stats">{children}</div>;
}

export function PoolStats({ summary }: { summary: TenantPoolSummary }) {
    const month = summary.currentMonth;
    return (
        <AgencyStatGrid>
            <AdminStatTile label="批发池可用" value={formatPoolCredits(summary.availableMicrocredits)} detail={summary.latestTopupMicrocredits ? `最近一次充值 ${formatPoolCredits(summary.latestTopupMicrocredits)} 积分` : "还没有充值"} />
            <AdminStatTile label="生成中预留" value={formatPoolCredits(summary.reservedMicrocredits)} detail="任务完成后按实际扣减" />
            <AdminStatTile label="未结欠款" value={formatPoolCredits(summary.debtMicrocredits)} detail={summary.debtMicrocredits > 0 ? "下次充值时自动抵扣" : "没有欠款"} trend={summary.debtMicrocredits > 0 ? { value: "有欠款", tone: "error" } : undefined} />
            <AdminStatTile label={`${month.period} 用量`} value={formatRM(month.usageSen)} detail={month.feeFree ? "免月最低消费期内" : `预估月费 ${formatRM(month.feeSen)}`} />
        </AgencyStatGrid>
    );
}

export function MonthlyMinimumCard({ month }: { month: TenantMonthlyFeePreview }) {
    const percent = minimumProgress(month.usageSen);
    const reached = month.usageSen >= MONTHLY_MINIMUM_SEN;
    return (
        <SettingsSectionCard
            title="本月最低消费"
            description="每月批发用量不足 RM 5,000 时，按差额的 30% 收取月费（最高 RM 1,500），从批发池扣除，不足部分记为欠款。"
            status={month.feeFree ? { label: "免月费期", color: "blue" } : reached ? { label: "已达标", color: "success" } : { label: "未达标", color: "warning" }}
            layout="stacked"
        >
            <div className="admin-agency-minimum">
                <div className="admin-agency-minimum-line">{usageAgainstMinimum(month.usageSen)}</div>
                <Progress percent={percent} showInfo={false} status={reached ? "success" : "active"} aria-label="本月最低消费完成度" />
                <div className="admin-agency-minimum-meta">
                    <span>{month.period}</span>
                    <span>{month.feeFree ? "本月不收月费" : reached ? "本月不收月费" : `按目前用量，月底预计收取 ${formatRM(month.feeSen)}`}</span>
                </div>
            </div>
        </SettingsSectionCard>
    );
}

export function LotsTable({ lots, loading }: { lots: TenantCreditLot[]; loading?: boolean }) {
    const columns: ColumnsType<TenantCreditLot> = [
        { title: "入账时间", width: 150, render: (_, lot) => formatTime(lot.createdAt) },
        { title: "来源", width: 120, render: (_, lot) => (lot.source === "topup" ? "银行转账" : lot.source === "adjust" ? "人工调账" : lot.source) },
        { title: "转账金额", width: 130, align: "right", render: (_, lot) => (lot.paymentAmountSen ? formatRM(lot.paymentAmountSen) : "—") },
        { title: "参考号", width: 160, render: (_, lot) => <span className="break-all font-mono text-xs">{lot.paymentReference || "—"}</span> },
        { title: "入池积分", width: 130, align: "right", render: (_, lot) => formatPoolCredits(lot.amountMicrocredits) },
        { title: "抵扣欠款", width: 120, align: "right", render: (_, lot) => (lot.debtSettledMicrocredits ? formatPoolCredits(lot.debtSettledMicrocredits) : "—") },
        { title: "剩余", width: 130, align: "right", render: (_, lot) => formatPoolCredits(lot.remainingMicrocredits) },
        {
            title: "到期",
            width: 150,
            render: (_, lot) => {
                const days = dayjs(lot.expiresAt).diff(dayjs(), "day");
                const expired = days < 0;
                return (
                    <div>
                        <div>{dayjs(lot.expiresAt).format("YYYY-MM-DD")}</div>
                        {lot.remainingMicrocredits > 0 ? <AdminStatusBadge label={expired ? "已过期" : `${days} 天后到期`} tone={expired ? "neutral" : days <= 30 ? "warning" : "success"} /> : null}
                    </div>
                );
            },
        },
        { title: "备注", width: 200, render: (_, lot) => <span className="line-clamp-2">{lot.note || "—"}</span> },
    ];
    return <AdminDataTable table={{ rowKey: "id", loading, columns, dataSource: lots, pagination: false, size: "small", scroll: { x: 1290 } }} empty={<AdminTableEmpty title="还没有充值批次" description="每次充值都会形成一个批次，入账后 12 个月有效，先到期的先扣。" />} />;
}

export function LedgerTable({ items, total, page, pageSize, loading, onPageChange }: { items: TenantLedgerEntry[]; total: number; page: number; pageSize: number; loading?: boolean; onPageChange: (page: number, pageSize: number) => void }) {
    const columns: ColumnsType<TenantLedgerEntry> = [
        { title: "时间", width: 150, render: (_, entry) => formatTime(entry.createdAt) },
        { title: "类型", width: 120, render: (_, entry) => ledgerTypeLabels[entry.type] || entry.type },
        {
            title: "可用变动",
            width: 130,
            align: "right",
            render: (_, entry) => <span className={entry.availableDeltaMicrocredits < 0 ? "admin-agency-negative" : entry.availableDeltaMicrocredits > 0 ? "admin-agency-positive" : undefined}>{entry.availableDeltaMicrocredits > 0 ? "+" : ""}{formatPoolCredits(entry.availableDeltaMicrocredits)}</span>,
        },
        { title: "预留变动", width: 120, align: "right", render: (_, entry) => (entry.reservedDeltaMicrocredits ? formatPoolCredits(entry.reservedDeltaMicrocredits) : "—") },
        { title: "变动后可用", width: 130, align: "right", render: (_, entry) => formatPoolCredits(entry.availableAfterMicrocredits) },
        { title: "模型", width: 150, render: (_, entry) => <span className="break-all">{entry.model || "—"}</span> },
        { title: "备注", width: 220, render: (_, entry) => <span className="line-clamp-2">{entry.note || "—"}</span> },
    ];
    return (
        <AdminDataTable
            table={{ rowKey: "id", loading, columns, dataSource: items, pagination: false, size: "small", scroll: { x: 1020 } }}
            empty={<AdminTableEmpty title="暂无流水" />}
            footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={total} onChange={onPageChange} />}
        />
    );
}

export function DebtsTable({ debts, loading }: { debts: TenantDebt[]; loading?: boolean }) {
    const columns: ColumnsType<TenantDebt> = [
        { title: "月份", width: 100, dataIndex: "period" },
        { title: "原因", width: 140, render: (_, debt) => (debt.reason === "monthly_fee" ? "月最低消费费" : debt.reason) },
        { title: "金额（积分）", width: 140, align: "right", render: (_, debt) => formatPoolCredits(debt.amountMicrocredits) },
        { title: "未还（积分）", width: 140, align: "right", render: (_, debt) => formatPoolCredits(debt.remainingMicrocredits) },
        { title: "状态", width: 110, render: (_, debt) => <AdminStatusBadge label={debt.status === "open" ? "未结清" : "已结清"} tone={debt.status === "open" ? "error" : "success"} /> },
        { title: "结清时间", width: 150, render: (_, debt) => formatTime(debt.settledAt) },
    ];
    return <AdminDataTable table={{ rowKey: "id", loading, columns, dataSource: debts, pagination: false, size: "small", scroll: { x: 780 } }} empty={<AdminTableEmpty title="没有欠款" />} />;
}

export function SettlementsTable({ items, loading, showTenant, tenantNames }: { items: TenantMonthlyUsage[]; loading?: boolean; showTenant?: boolean; tenantNames?: Record<string, string> }) {
    const columns: ColumnsType<TenantMonthlyUsage> = [
        { title: "月份", width: 100, dataIndex: "period" },
        ...(showTenant ? [{ title: "代理商", width: 180, render: (_: unknown, item: TenantMonthlyUsage) => tenantNames?.[item.tenantId] || item.tenantId }] : []),
        { title: "批发用量", width: 140, align: "right", render: (_, item) => formatRM(item.usageSen) },
        { title: "月费", width: 120, align: "right", render: (_, item) => (item.feeFree ? <AdminStatusBadge label="免月费" tone="info" /> : formatRM(item.feeSen)) },
        { title: "已从池扣除", width: 140, align: "right", render: (_, item) => formatPoolCredits(item.deductedMicrocredits) },
        { title: "记为欠款", width: 140, align: "right", render: (_, item) => (item.debtMicrocredits ? <span className="admin-agency-negative">{formatPoolCredits(item.debtMicrocredits)}</span> : "—") },
        { title: "结算时间", width: 150, render: (_, item) => formatTime(item.createdAt) },
    ];
    return <AdminDataTable table={{ rowKey: "id", loading, columns, dataSource: items, pagination: false, size: "small", scroll: { x: showTenant ? 1070 : 890 } }} empty={<AdminTableEmpty title="还没有月度结算" description="每月 1 日 00:30（吉隆坡时间）结算上个月。" />} />;
}

export function SSLBadge({ status }: { status: string }) {
    const display = sslStatusDisplay(status);
    return <AdminStatusBadge label={display.label} tone={display.tone} title={status} />;
}

function CopyText({ value }: { value: string }) {
    const { message } = App.useApp();
    return (
        <button
            type="button"
            className="admin-agency-copy"
            aria-label={`复制 ${value}`}
            onClick={() => {
                void navigator.clipboard
                    .writeText(value)
                    .then(() => message.success("已复制"))
                    .catch(() => message.error("复制失败，请手动选择"));
            }}
        >
            <span className="font-mono">{value}</span>
            <Copy className="size-3.5" aria-hidden="true" />
        </button>
    );
}

/** 自定义网址的 DNS 设置说明：CNAME 指向 Cloudflare 回源地址。 */
export function CnameInstruction({ domains }: { domains: TenantDomain[] }) {
    const custom = domains.filter((domain) => domain.managed);
    if (custom.length === 0) return null;
    const target = custom.find((domain) => domain.cnameTarget)?.cnameTarget;
    return (
        <div className="admin-agency-cname">
            <strong>DNS 设置</strong>
            <p>在网址的 DNS 服务商处添加一条 CNAME 记录，主机名填自己的网址，目标填下面的地址。证书会在 DNS 生效后自动签发，通常需要几分钟到几小时。</p>
            {target ? <CopyText value={target} /> : <span className="text-xs text-foreground/50">平台尚未配置 Cloudflare 回源地址，请联系平台。</span>}
        </div>
    );
}

export function DomainsTable({ domains, loading, actions }: { domains: TenantDomain[]; loading?: boolean; actions?: (domain: TenantDomain) => ReactNode }) {
    const columns: ColumnsType<TenantDomain> = [
        {
            title: "网址",
            width: 260,
            render: (_, domain) => (
                <div className="min-w-0">
                    <a href={`https://${domain.host}`} target="_blank" rel="noreferrer" className="break-all font-medium">
                        {domain.host}
                    </a>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                        {domain.isPrimary ? <AdminStatusBadge label="主网址" tone="info" /> : null}
                        <AdminStatusBadge label={domain.managed ? "自定义网址" : "默认子域名"} />
                    </div>
                </div>
            ),
        },
        {
            title: "证书",
            width: 200,
            render: (_, domain) => (
                <div>
                    <SSLBadge status={domain.sslStatus} />
                    {domain.verificationErrors?.length ? <div className="mt-1 text-xs text-[var(--admin-status-error)]">{domain.verificationErrors.join("；")}</div> : null}
                </div>
            ),
        },
        { title: "CNAME 目标", width: 230, render: (_, domain) => (domain.managed && domain.cnameTarget ? <span className="break-all font-mono text-xs">{domain.cnameTarget}</span> : <span className="text-foreground/40">无需设置</span>) },
        { title: "添加时间", width: 150, render: (_, domain) => formatTime(domain.createdAt) },
        ...(actions ? [{ title: "操作", width: 260, render: (_: unknown, domain: TenantDomain) => actions(domain) }] : []),
    ];
    return <AdminDataTable table={{ rowKey: "id", loading, columns, dataSource: domains, pagination: false, size: "small", scroll: { x: actions ? 1100 : 840 } }} empty={<AdminTableEmpty title="还没有网址" description="平台设置了默认域名时会自动生成 <短名>.<默认域名>。" />} />;
}

export function AdminsTable({ users, loading, currentUserId, onToggle }: { users: TenantAdminUser[]; loading?: boolean; currentUserId?: string; onToggle?: (user: TenantAdminUser, next: "active" | "disabled") => Promise<void> }) {
    const [busyId, setBusyId] = useState("");
    const columns: ColumnsType<TenantAdminUser> = [
        {
            title: "管理员",
            width: 220,
            render: (_, user) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{user.displayName || user.username}</div>
                    <div className="truncate text-xs text-foreground/50">@{user.username}</div>
                </div>
            ),
        },
        { title: "邮箱", width: 220, render: (_, user) => <span className="break-all">{user.email || "—"}</span> },
        { title: "状态", width: 100, render: (_, user) => <AdminStatusBadge label={user.status === "active" ? "正常" : "已停用"} tone={user.status === "active" ? "success" : "neutral"} /> },
        { title: "最近登录", width: 150, render: (_, user) => formatTime(user.lastLoginAt) },
        { title: "创建时间", width: 150, render: (_, user) => formatTime(user.createdAt) },
        ...(onToggle
            ? [
                  {
                      title: "操作",
                      width: 120,
                      render: (_: unknown, user: TenantAdminUser) =>
                          user.id === currentUserId ? (
                              <span className="text-xs text-foreground/40">当前账号</span>
                          ) : user.status === "active" ? (
                              <Popconfirm
                                  title="停用这个管理员？"
                                  description="停用后立即退出登录，不能再进入后台。"
                                  okText="停用"
                                  okButtonProps={{ danger: true }}
                                  cancelText="取消"
                                  onConfirm={async () => {
                                      setBusyId(user.id);
                                      await onToggle(user, "disabled").finally(() => setBusyId(""));
                                  }}
                              >
                                  <Button size="small" danger loading={busyId === user.id}>
                                      停用
                                  </Button>
                              </Popconfirm>
                          ) : (
                              <Button
                                  size="small"
                                  loading={busyId === user.id}
                                  onClick={async () => {
                                      setBusyId(user.id);
                                      await onToggle(user, "active").finally(() => setBusyId(""));
                                  }}
                              >
                                  恢复
                              </Button>
                          ),
                  },
              ]
            : []),
    ];
    return <AdminDataTable table={{ rowKey: "id", loading, columns, dataSource: users, pagination: false, size: "small", scroll: { x: onToggle ? 960 : 840 } }} empty={<AdminTableEmpty title="还没有管理员" />} />;
}

type AdminFormValues = { username: string; email: string; displayName?: string; password?: string; sendInvite: boolean };

/** 添加代理商管理员：可以直接设密码，也可以发邀请邮件让对方自己设置。 */
export function AddAdminModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (values: TenantAdminUserRequest) => Promise<TenantAdminUserResult> }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<AdminFormValues>();
    const [saving, setSaving] = useState(false);
    const sendInvite = Form.useWatch("sendInvite", form) ?? true;
    return (
        <AdminModal
            title="添加代理商管理员"
            open={open}
            width={520}
            okText="添加"
            cancelText="取消"
            confirmLoading={saving}
            onCancel={onClose}
            onOk={() => form.submit()}
            afterOpenChange={(visible) => {
                if (visible) form.setFieldsValue({ username: "", email: "", displayName: "", password: "", sendInvite: true });
            }}
        >
            <Form<AdminFormValues>
                form={form}
                layout="vertical"
                requiredMark={false}
                initialValues={{ sendInvite: true }}
                onFinish={async (values) => {
                    setSaving(true);
                    try {
                        const result = await onSubmit({ username: values.username.trim(), email: values.email.trim(), displayName: values.displayName?.trim(), password: values.sendInvite ? undefined : values.password, sendInvite: values.sendInvite });
                        if (result.inviteError) message.warning(`管理员已添加，但${result.inviteError}`);
                        else message.success(result.inviteSent ? "管理员已添加，邀请邮件已发出" : "管理员已添加");
                        onClose();
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "添加失败");
                    } finally {
                        setSaving(false);
                    }
                }}
            >
                <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请填写用户名" }]}>
                    <Input autoComplete="off" prefix={<UserPlus className="size-4 text-foreground/40" />} />
                </Form.Item>
                <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请填写有效邮箱" }]}>
                    <Input autoComplete="off" prefix={<Mail className="size-4 text-foreground/40" />} />
                </Form.Item>
                <Form.Item name="displayName" label="显示名称">
                    <Input autoComplete="off" placeholder="选填" />
                </Form.Item>
                <Form.Item name="sendInvite" label="发送邀请邮件" valuePropName="checked" extra={sendInvite ? "对方会收到邮件，在登录页用「忘记密码」设置自己的密码。" : "由你设置初始密码，并自行转告对方。"}>
                    <AdminSwitch aria-label="发送邀请邮件" />
                </Form.Item>
                {!sendInvite ? (
                    <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                ) : null}
            </Form>
        </AdminModal>
    );
}
