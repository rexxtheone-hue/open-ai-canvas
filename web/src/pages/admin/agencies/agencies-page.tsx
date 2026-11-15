import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Form, Input, Progress } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { createAgency, listAgencies, type AgencyTenant, type CreateAgencyRequest } from "@/services/api/tenant-admin";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty } from "../components/admin-ui";
import { AdminSwitch } from "../ui/controls";
import { AdminModal } from "../ui/overlays";
import { SSLBadge } from "./agency-components";
import { formatPoolCredits, formatRM, minimumProgress, tenantStatusLabels } from "./agency-format";
import "./agencies.css";

export const agenciesQueryKey = ["admin", "agencies"] as const;

type CreateFormValues = CreateAgencyRequest;

function slugFromName(name: string) {
    return name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

function CreateAgencyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<CreateFormValues>();
    const [saving, setSaving] = useState(false);
    const [slugTouched, setSlugTouched] = useState(false);
    const sendInvite = Form.useWatch("sendInvite", form) ?? true;

    return (
        <AdminModal
            title="开设代理商"
            open={open}
            width={620}
            okText="开设"
            cancelText="取消"
            confirmLoading={saving}
            onCancel={onClose}
            onOk={() => form.submit()}
            afterOpenChange={(visible) => {
                if (!visible) return;
                setSlugTouched(false);
                form.setFieldsValue({ name: "", slug: "", adminEmail: "", adminUsername: "", adminPassword: "", sendInvite: true });
            }}
        >
            <p className="mb-4 text-xs text-foreground/55">开设后立即可用：免月最低消费 2 个月，自动生成默认子域名（平台设置了默认域名时）。批发池初始为 0，需要先记录一笔充值，客户才能生成。</p>
            <Form<CreateFormValues>
                form={form}
                layout="vertical"
                requiredMark={false}
                initialValues={{ sendInvite: true }}
                onValuesChange={(changed) => {
                    if ("slug" in changed) setSlugTouched(true);
                    if ("name" in changed && !slugTouched) form.setFieldValue("slug", slugFromName(changed.name || ""));
                }}
                onFinish={async (values) => {
                    setSaving(true);
                    try {
                        const result = await createAgency({ ...values, name: values.name.trim(), slug: values.slug.trim(), adminEmail: values.adminEmail.trim(), adminUsername: values.adminUsername.trim(), adminPassword: values.sendInvite ? undefined : values.adminPassword });
                        if (result.inviteError) message.warning(`代理商已开设，但${result.inviteError}`);
                        else message.success(result.inviteSent ? "代理商已开设，邀请邮件已发出" : "代理商已开设");
                        onCreated(result.tenant.tenant.id);
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "开设失败");
                    } finally {
                        setSaving(false);
                    }
                }}
            >
                <div className="admin-agency-form-grid">
                    <Form.Item name="name" label="代理商名称" rules={[{ required: true, message: "请填写代理商名称" }]}>
                        <Input autoComplete="off" placeholder="例如 Coach Lim Studio" />
                    </Form.Item>
                    <Form.Item name="slug" label="短名" extra="用于默认子域名，开设后不能修改" rules={[{ required: true, pattern: /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, message: "小写字母、数字和连字符，1–40 位" }]}>
                        <Input autoComplete="off" placeholder="coach-lim" />
                    </Form.Item>
                    <Form.Item name="adminUsername" label="管理员用户名" rules={[{ required: true, message: "请填写管理员用户名" }]}>
                        <Input autoComplete="off" />
                    </Form.Item>
                    <Form.Item name="adminEmail" label="管理员邮箱" rules={[{ required: true, type: "email", message: "请填写有效邮箱" }]}>
                        <Input autoComplete="off" />
                    </Form.Item>
                </div>
                <Form.Item name="sendInvite" label="发送邀请邮件" valuePropName="checked" extra={sendInvite ? "管理员会收到邮件，在代理商网址的登录页用「忘记密码」设置密码。" : "由你设置初始密码，并自行转告代理商。"}>
                    <AdminSwitch aria-label="发送邀请邮件" />
                </Form.Item>
                {!sendInvite ? (
                    <Form.Item name="adminPassword" label="初始密码" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                ) : null}
            </Form>
        </AdminModal>
    );
}

export default function AgenciesPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [keyword, setKeyword] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const query = useQuery({ queryKey: agenciesQueryKey, queryFn: async ({ signal }) => (await listAgencies(signal)).tenants });
    const rows = useMemo(() => {
        const needle = keyword.trim().toLowerCase();
        const items = query.data || [];
        if (!needle) return items;
        return items.filter((item) => [item.tenant.name, item.tenant.slug, item.primaryDomain?.host].some((value) => value?.toLowerCase().includes(needle)));
    }, [keyword, query.data]);

    const columns: ColumnsType<AgencyTenant> = [
        {
            title: "代理商",
            width: 220,
            fixed: "left",
            render: (_, item) => (
                <div className="min-w-0">
                    <button type="button" className="admin-agency-name-link truncate" onClick={() => navigate(`/admin/agencies/${encodeURIComponent(item.tenant.id)}`)}>
                        {item.tenant.name || item.tenant.slug}
                    </button>
                    <div className="truncate text-xs text-foreground/50">
                        {item.tenant.slug} · {item.customerCount} 位客户
                    </div>
                </div>
            ),
        },
        {
            title: "主网址",
            width: 240,
            render: (_, item) =>
                item.primaryDomain ? (
                    <div className="min-w-0">
                        <div className="truncate">{item.primaryDomain.host}</div>
                        <SSLBadge status={item.primaryDomain.sslStatus} />
                    </div>
                ) : (
                    <span className="text-foreground/40">未设置</span>
                ),
        },
        { title: "状态", width: 96, render: (_, item) => <AdminStatusBadge label={tenantStatusLabels[item.tenant.status]?.label || item.tenant.status} tone={tenantStatusLabels[item.tenant.status]?.tone} /> },
        { title: "批发池余额", width: 140, align: "right", render: (_, item) => formatPoolCredits(item.availableMicrocredits) },
        { title: "欠款", width: 120, align: "right", render: (_, item) => (item.debtMicrocredits > 0 ? <span className="admin-agency-negative">{formatPoolCredits(item.debtMicrocredits)}</span> : "—") },
        {
            title: "本月用量",
            width: 200,
            render: (_, item) => (
                <div className="min-w-0">
                    <div className="tabular-nums">{formatRM(item.currentMonth.usageSen)}</div>
                    <Progress percent={minimumProgress(item.currentMonth.usageSen)} size="small" showInfo={false} aria-label="最低消费完成度" />
                </div>
            ),
        },
        { title: "月费预估", width: 130, align: "right", render: (_, item) => (item.currentMonth.feeFree ? <AdminStatusBadge label="免月费期" tone="info" /> : formatRM(item.currentMonth.feeSen)) },
        {
            title: "",
            width: 90,
            render: (_, item) => (
                <Button size="small" onClick={() => navigate(`/admin/agencies/${encodeURIComponent(item.tenant.id)}`)}>
                    管理
                </Button>
            ),
        },
    ];

    return (
        <AdminPageFrame
            title="代理商"
            description="开设与停用代理商，查看网址、批发池与本月用量"
            actions={
                <>
                    <Button icon={<RefreshCw className="size-4" />} loading={query.isFetching} onClick={() => void query.refetch()}>
                        刷新
                    </Button>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                        开设代理商
                    </Button>
                </>
            }
        >
            {query.error ? <Alert type="error" showIcon title="代理商列表读取失败" description={query.error instanceof Error ? query.error.message : String(query.error)} /> : null}
            <AdminDataTable<AgencyTenant>
                toolbar={<Input allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} placeholder="搜索名称、短名或网址" aria-label="搜索代理商" onChange={(event) => setKeyword(event.target.value)} />}
                empty={<AdminTableEmpty filtered={Boolean(keyword)} title={keyword ? "没有匹配的代理商" : "还没有代理商"} description={keyword ? undefined : "点击右上角「开设代理商」开设第一家。"} />}
                table={{ rowKey: (item) => item.tenant.id, dataSource: rows, columns, loading: query.isLoading, pagination: false, size: "small", scroll: { x: 1240 } }}
            />
            <CreateAgencyModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(id) => {
                    setCreateOpen(false);
                    void queryClient.invalidateQueries({ queryKey: agenciesQueryKey });
                    navigate(`/admin/agencies/${encodeURIComponent(id)}`);
                }}
            />
        </AdminPageFrame>
    );
}
