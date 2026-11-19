import { useEffect, useState } from "react";
import { App, Button, Input, Segmented, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import "./studio-help-admin.css";

import { getStudioSiteContent, listAdminStudioAssistantLogs, listAdminStudioFeedback, saveAdminStudioSiteContent, setAdminStudioFeedbackStatus, type StudioAssistantLog, type StudioFeedback, type StudioSiteContentKey } from "@/services/api/studio-agents";

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

const ASSISTANT_TOOL_LABELS: Record<string, string> = { get_model_prices: "查价格", get_my_account: "查积分与任务", create_ticket: "转人工" };

/** AI 助手的问答记录：用户问了什么、怎么答的、有没有失败或转人工。 */
export function StudioAssistantLogsPanel() {
    const [kind, setKind] = useState<"all" | "failed" | "ticket">("all");
    const [days, setDays] = useState(30);
    const [keyword, setKeyword] = useState("");
    const [conversationId, setConversationId] = useState("");
    const [page, setPage] = useState(1);
    const pageSize = 20;
    const query = useQuery({
        queryKey: ["admin", "studio-assistant-logs", kind, days, keyword, conversationId, page],
        queryFn: ({ signal }) => listAdminStudioAssistantLogs({ kind, days, q: keyword || undefined, conversationId: conversationId || undefined, page, pageSize }, signal),
    });
    const stats = query.data?.stats;
    const columns: ColumnsType<StudioAssistantLog> = [
        { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false }) },
        { title: "用户", dataIndex: "username", width: 120 },
        {
            title: "提问",
            dataIndex: "question",
            render: (value: string, item) => (
                <div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{value}</div>
                    <div style={{ opacity: 0.55, fontSize: 12 }}>{item.page || "-"}{item.locale ? ` · ${item.locale}` : ""}</div>
                </div>
            ),
        },
        {
            title: "结果",
            key: "result",
            width: 200,
            render: (_, item) => (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {item.error ? <Tag color="red">失败</Tag> : <Tag color="green">已回答</Tag>}
                    {item.ticket ? <Tag color="orange">转人工</Tag> : null}
                    {item.tools.split(",").filter((name) => name && name !== "create_ticket").map((name) => <Tag key={name}>{ASSISTANT_TOOL_LABELS[name] || name}</Tag>)}
                </div>
            ),
        },
        { title: "耗时", dataIndex: "durationMs", width: 80, render: (value: number) => `${(value / 1000).toFixed(1)}s` },
        {
            title: "",
            key: "conversation",
            width: 100,
            render: (_, item) => (item.conversationId && !conversationId ? <Button size="small" onClick={() => { setConversationId(item.conversationId); setPage(1); }}>整段对话</Button> : null),
        },
    ];
    const statItems = [
        { label: "提问数", value: stats?.questions ?? 0 },
        { label: "提问人数", value: stats?.users ?? 0 },
        { label: "失败", value: stats?.failed ?? 0 },
        { label: "转人工", value: stats?.tickets ?? 0 },
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                {statItems.map((item) => (
                    <div key={item.label} style={{ padding: "12px 16px", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 8 }}>
                        <div style={{ opacity: 0.6, fontSize: 12 }}>{item.label}（近 {days} 天）</div>
                        <div style={{ fontSize: 22, fontWeight: 600 }}>{item.value.toLocaleString()}</div>
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <Segmented value={kind} onChange={(value) => { setKind(value as typeof kind); setPage(1); }} options={[{ value: "all", label: "全部" }, { value: "failed", label: "失败" }, { value: "ticket", label: "转人工" }]} />
                <Select value={days} style={{ width: 120 }} onChange={(value) => { setDays(value); setPage(1); }} options={[{ value: 1, label: "近 1 天" }, { value: 7, label: "近 7 天" }, { value: 30, label: "近 30 天" }, { value: 90, label: "近 90 天" }]} aria-label="时间范围" />
                <Input.Search allowClear placeholder="搜索提问、回答或用户名" style={{ width: 280 }} onSearch={(value) => { setKeyword(value.trim()); setPage(1); }} aria-label="搜索" />
                {conversationId ? <Button onClick={() => { setConversationId(""); setPage(1); }}>返回全部记录</Button> : null}
            </div>
            <Table
                rowKey="id"
                size="middle"
                loading={query.isLoading}
                columns={columns}
                dataSource={query.data?.items || []}
                expandable={{
                    expandedRowRender: (item) => (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {item.error ? <div style={{ color: "#ff4d4f" }}>错误：{item.error}</div> : null}
                            <div className="assistant-log-answer">{item.answer ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown> : "（没有回答）"}</div>
                        </div>
                    ),
                }}
                pagination={{ current: page, pageSize, total: query.data?.total || 0, showSizeChanger: false, onChange: setPage }}
            />
        </div>
    );
}
