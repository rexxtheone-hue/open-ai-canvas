import { useEffect, useState } from "react";
import { App, Button, Input, Segmented, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getStudioSiteContent, listAdminStudioFeedback, saveAdminStudioSiteContent, setAdminStudioFeedbackStatus, type StudioFeedback, type StudioSiteContentKey } from "@/services/api/studio-agents";

const CATEGORY_LABELS: Record<StudioFeedback["category"], string> = { bug: "问题或故障", idea: "功能建议", billing: "积分与付费", other: "其他" };

/** 用户在 Studio 帮助菜单里提交的反馈。 */
export function StudioFeedbackPanel() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<"open" | "done" | "all">("open");
    const query = useQuery({ queryKey: ["admin", "studio-feedback", status], queryFn: async ({ signal }) => (await listAdminStudioFeedback(status === "all" ? undefined : status, signal)).items });
    const toggle = async (item: StudioFeedback) => {
        try {
            await setAdminStudioFeedbackStatus(item.id, item.status === "open" ? "done" : "open");
            await queryClient.invalidateQueries({ queryKey: ["admin", "studio-feedback"] });
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "更新失败");
        }
    };
    const columns: ColumnsType<StudioFeedback> = [
        { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => new Date(value).toLocaleString("zh-CN") },
        { title: "用户", dataIndex: "username", width: 120 },
        { title: "类型", dataIndex: "category", width: 110, render: (value: StudioFeedback["category"]) => <Tag>{CATEGORY_LABELS[value] || value}</Tag> },
        { title: "内容", dataIndex: "content", render: (value: string, item) => <div style={{ whiteSpace: "pre-wrap" }}>{value}{item.page ? <div style={{ opacity: 0.55, fontSize: 12 }}>页面：{item.page}</div> : null}</div> },
        { title: "联系方式", dataIndex: "contact", width: 180 },
        { title: "状态", key: "status", width: 120, render: (_, item) => <Button size="small" onClick={() => void toggle(item)}>{item.status === "open" ? "标记已处理" : "重新打开"}</Button> },
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Segmented value={status} onChange={(value) => setStatus(value as typeof status)} options={[{ value: "open", label: "待处理" }, { value: "done", label: "已处理" }, { value: "all", label: "全部" }]} />
            <Table rowKey="id" size="middle" loading={query.isLoading} columns={columns} dataSource={query.data || []} pagination={{ pageSize: 20 }} />
        </div>
    );
}

const CONTENT_FIELDS: Array<{ key: StudioSiteContentKey; label: string; hint: string }> = [
    { key: "support", label: "联系客服", hint: "显示在帮助中心底部，例如客服邮箱、微信、工作时间。支持 Markdown。" },
    { key: "terms", label: "服务条款", hint: "显示在「条款与政策」的服务条款页。支持 Markdown。" },
    { key: "privacy", label: "隐私政策", hint: "显示在「条款与政策」的隐私政策页。支持 Markdown。" },
];

/** 帮助中心的客服说明、服务条款和隐私政策。 */
export function StudioSiteContentPanel() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: ["studio", "site-content"], queryFn: ({ signal }) => getStudioSiteContent(signal) });
    const [drafts, setDrafts] = useState<Record<StudioSiteContentKey, string>>({ support: "", terms: "", privacy: "" });
    const [saving, setSaving] = useState("");
    useEffect(() => {
        if (query.data) setDrafts(query.data);
    }, [query.data]);
    const save = async (key: StudioSiteContentKey) => {
        setSaving(key);
        try {
            await saveAdminStudioSiteContent(key, drafts[key]);
            await queryClient.invalidateQueries({ queryKey: ["studio", "site-content"] });
            message.success("已保存");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving("");
        }
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {CONTENT_FIELDS.map((field) => (
                <section key={field.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <strong>{field.label}</strong>
                    <span style={{ opacity: 0.6, fontSize: 12 }}>{field.hint}</span>
                    <Input.TextArea value={drafts[field.key]} autoSize={{ minRows: 4, maxRows: 18 }} maxLength={60000} onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))} aria-label={field.label} />
                    <div><Button type="primary" loading={saving === field.key} disabled={query.isLoading || drafts[field.key] === (query.data?.[field.key] ?? "")} onClick={() => void save(field.key)}>保存{field.label}</Button></div>
                </section>
            ))}
        </div>
    );
}
