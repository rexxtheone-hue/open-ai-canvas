import { useCallback, useEffect, useState } from "react";
import { App, Button, Drawer, Form, Input, InputNumber, Table, Tabs, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Plus, RefreshCw } from "lucide-react";

import { Switch } from "@/pages/admin/ui/controls";
import { listAdminStudioCommunity, listAdminStudioPlans, saveAdminStudioPlan, updateAdminStudioPost, type StudioPlan, type StudioPlanInput, type StudioPost } from "@/services/api/studio";
import { AdminPageFrame } from "../components/admin-shell";

const EMPTY_PLAN: StudioPlanInput = { name: "", description: "", badge: "", durationDays: 30, activeTaskLimit: 10, commercialLicense: true, enabled: true, sortOrder: 0 };

/** AI Studio 运营：会员套餐（售价在「支付充值」的商品里绑定）和灵感社区审核。 */
export default function StudioAdminPage() {
    const { message } = App.useApp();
    const [plans, setPlans] = useState<StudioPlan[]>([]);
    const [posts, setPosts] = useState<StudioPost[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<StudioPlan | "new" | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<StudioPlanInput>();

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [planResult, postResult] = await Promise.all([listAdminStudioPlans(), listAdminStudioCommunity({ pageSize: 60 })]);
            setPlans(planResult.plans);
            setPosts(postResult.posts);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "读取失败");
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const openPlan = (plan: StudioPlan | "new") => {
        form.resetFields();
        form.setFieldsValue(plan === "new" ? { ...EMPTY_PLAN, sortOrder: plans.length * 10 } : plan);
        setEditing(plan);
    };

    const savePlan = async () => {
        if (!editing) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
            await saveAdminStudioPlan(editing === "new" ? undefined : editing.id, { ...EMPTY_PLAN, ...values, badge: values.badge || "", description: values.description || "" });
            message.success("套餐已保存");
            setEditing(null);
            await refresh();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const updatePost = async (post: StudioPost, patch: { featured?: boolean; isTemplate?: boolean; hidden?: boolean }) => {
        try {
            const updated = await updateAdminStudioPost(post.id, patch);
            setPosts((current) => current.map((item) => (item.id === post.id ? updated : item)));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "操作失败");
        }
    };

    const planColumns: ColumnsType<StudioPlan> = [
        { title: "套餐", dataIndex: "name", render: (_, plan) => <div><div className="font-medium">{plan.name}{plan.badge ? <Tag className="ml-2">{plan.badge}</Tag> : null}</div><div className="text-xs text-foreground/45">{plan.description || "无说明"}</div></div> },
        { title: "时长", dataIndex: "durationDays", width: 100, render: (value) => `${value} 天` },
        { title: "并发任务", dataIndex: "activeTaskLimit", width: 110, render: (value) => (value > 0 ? `${value} 个` : "沿用默认") },
        { title: "商用授权", dataIndex: "commercialLicense", width: 100, render: (value) => (value ? "含" : "不含") },
        { title: "状态", dataIndex: "enabled", width: 90, render: (value) => (value ? <Tag color="green">上架</Tag> : <Tag>停用</Tag>) },
        { title: "", key: "actions", width: 90, render: (_, plan) => <Button size="small" onClick={() => openPlan(plan)}>编辑</Button> },
    ];

    const postColumns: ColumnsType<StudioPost> = [
        {
            title: "作品",
            key: "work",
            render: (_, post) => (
                <div className="flex items-center gap-3">
                    <div className="size-14 shrink-0 overflow-hidden rounded-md bg-foreground/5">
                        {post.media[0]?.kind === "image" ? <img src={post.media[0].url} alt="" className="size-full object-cover" /> : post.media[0]?.kind === "video" ? <video src={post.media[0].url} muted className="size-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-medium">{post.title}</div>
                        <div className="text-xs text-foreground/45">{post.author} · {new Date(post.createdAt).toLocaleString("zh-CN", { hour12: false })}</div>
                    </div>
                </div>
            ),
        },
        { title: "点赞 / 同款", key: "stats", width: 120, render: (_, post) => `${post.likeCount} / ${post.remixCount}` },
        { title: "精选", key: "featured", width: 80, render: (_, post) => <Switch aria-label="精选" checked={post.featured} onChange={(checked) => void updatePost(post, { featured: checked })} /> },
        { title: "模板", key: "template", width: 80, render: (_, post) => <Switch aria-label="设为模板" checked={post.isTemplate} onChange={(checked) => void updatePost(post, { isTemplate: checked })} /> },
        { title: "隐藏", key: "hidden", width: 80, render: (_, post) => <Switch aria-label="隐藏" checked={Boolean(post.hidden)} onChange={(checked) => void updatePost(post, { hidden: checked })} /> },
    ];

    return (
        <AdminPageFrame
            title="AI Studio"
            description="会员套餐与灵感社区。套餐的售价在「支付充值 → 充值商品」里绑定套餐后生效。"
            actions={<Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>刷新</Button>}
        >
            <Tabs
                items={[
                    {
                        key: "plans",
                        label: "会员套餐",
                        children: (
                            <>
                                <div className="mb-3 flex justify-end"><Button type="primary" icon={<Plus className="size-4" />} onClick={() => openPlan("new")}>新增套餐</Button></div>
                                <Table rowKey="id" size="middle" loading={loading} columns={planColumns} dataSource={plans} pagination={false} />
                            </>
                        ),
                    },
                    { key: "community", label: "灵感社区", children: <Table rowKey="id" size="middle" loading={loading} columns={postColumns} dataSource={posts} pagination={false} /> },
                ]}
            />
            <Drawer title={editing === "new" ? "新增会员套餐" : "编辑会员套餐"} width={480} open={editing !== null} destroyOnHidden onClose={() => setEditing(null)} extra={<Button type="primary" loading={saving} onClick={() => void savePlan()}>保存</Button>}>
                <Form form={form} layout="vertical" requiredMark="optional">
                    <Form.Item name="name" label="套餐名称" rules={[{ required: true, max: 40 }]}><Input placeholder="例如：Pro 会员" /></Form.Item>
                    <Form.Item name="badge" label="角标" rules={[{ max: 12 }]}><Input placeholder="例如：推荐" /></Form.Item>
                    <Form.Item name="description" label="说明" rules={[{ max: 500 }]}><Input.TextArea rows={3} /></Form.Item>
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item name="durationDays" label="有效期（天）" rules={[{ required: true }, { type: "number", min: 1, max: 3660 }]}><InputNumber min={1} max={3660} precision={0} className="w-full" /></Form.Item>
                        <Form.Item name="activeTaskLimit" label="同时生成任务数" extra="0 表示沿用全站默认；只会提高不会降低。" rules={[{ required: true }, { type: "number", min: 0, max: 1000 }]}><InputNumber min={0} max={1000} precision={0} className="w-full" /></Form.Item>
                    </div>
                    <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}><InputNumber precision={0} className="w-full" /></Form.Item>
                    <Form.Item name="commercialLicense" label="含商用授权" valuePropName="checked"><Switch /></Form.Item>
                    <Form.Item name="enabled" label="上架" valuePropName="checked" extra="停用后已购买的会员权益也会停止生效。"><Switch /></Form.Item>
                </Form>
            </Drawer>
        </AdminPageFrame>
    );
}
