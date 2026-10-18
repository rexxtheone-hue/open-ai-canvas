import { App, Button, Input, InputNumber, Modal, Table, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Select } from "@/pages/admin/ui/controls";
import { listAdminPartnerApplications, partnerKindLabels, partnerStatusLabels, reviewPartnerApplication, type AdminPartnerApplication, type PartnerApplicationStatus, type PartnerKind } from "@/services/api/partner";
import { isStaffRole, useUserStore } from "@/stores/use-user-store";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge } from "../components/admin-ui";

type ReviewAction = "approve" | "reject" | "revoke";

const statusTone: Record<PartnerApplicationStatus, "warning" | "success" | "neutral" | "error"> = { pending: "warning", approved: "success", rejected: "error", revoked: "neutral" };
const actionLabels: Record<ReviewAction, string> = { approve: "通过", reject: "驳回", revoke: "撤销认证" };
const doneMessages: Record<ReviewAction, string> = { approve: "已通过申请", reject: "已驳回申请", revoke: "已撤销认证" };

/** 认证审核：认证创作者、商家、推广者的申请统一在这里处理。 */
export default function PartnersPage() {
    const { message } = App.useApp();
    const role = useUserStore((state) => state.user?.role);
    const readOnly = isStaffRole(role) && role !== "operator";
    const [kind, setKind] = useState<PartnerKind | "">("");
    const [status, setStatus] = useState<PartnerApplicationStatus | "">("pending");
    const [items, setItems] = useState<AdminPartnerApplication[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [review, setReview] = useState<{ item: AdminPartnerApplication; action: ReviewAction } | null>(null);
    const [note, setNote] = useState("");
    const [rate, setRate] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listAdminPartnerApplications({ kind: kind || undefined, status: status || undefined });
            setItems(result.items);
            setTotal(result.total);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "读取申请失败");
        } finally {
            setLoading(false);
        }
    }, [kind, status, message]);

    useEffect(() => {
        void load();
    }, [load]);

    const openReview = (item: AdminPartnerApplication, action: ReviewAction) => {
        setReview({ item, action });
        setNote("");
        setRate(null);
    };

    const submitReview = async () => {
        if (!review) return;
        setSaving(true);
        try {
            await reviewPartnerApplication(review.item.id, { action: review.action, note: note.trim(), rateBp: rate ? Math.round(rate * 100) : 0 });
            message.success(doneMessages[review.action]);
            setReview(null);
            await load();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "操作失败");
        } finally {
            setSaving(false);
        }
    };

    const columns: ColumnsType<AdminPartnerApplication> = [
        {
            title: "申请人",
            width: 180,
            render: (_, item) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{item.displayName || item.username}</div>
                    <div className="truncate text-xs opacity-70">@{item.username}</div>
                </div>
            ),
        },
        { title: "类型", dataIndex: "kind", width: 110, render: (value: PartnerKind) => partnerKindLabels[value] },
        {
            title: "申请说明",
            render: (_, item) => (
                <div className="min-w-0 whitespace-pre-wrap break-words text-sm">
                    {item.message}
                    {item.contact ? <div className="mt-1 text-xs opacity-70">联系方式：{item.contact}</div> : null}
                    {item.reviewNote ? <div className="mt-1 text-xs opacity-70">审核备注：{item.reviewNote}</div> : null}
                </div>
            ),
        },
        { title: "状态", dataIndex: "status", width: 100, render: (value: PartnerApplicationStatus) => <AdminStatusBadge label={partnerStatusLabels[value]} tone={statusTone[value]} /> },
        { title: "更新时间", dataIndex: "updatedAt", width: 150, render: (value: string) => new Date(value).toLocaleString() },
        {
            title: "操作",
            width: 170,
            render: (_, item) =>
                readOnly ? null : (
                    <div className="flex flex-wrap gap-2">
                        {item.status !== "approved" ? (
                            <Button size="small" type="primary" onClick={() => openReview(item, "approve")}>
                                通过
                            </Button>
                        ) : null}
                        {item.status === "pending" ? (
                            <Button size="small" onClick={() => openReview(item, "reject")}>
                                驳回
                            </Button>
                        ) : null}
                        {item.status === "approved" ? (
                            <Button size="small" danger onClick={() => openReview(item, "revoke")}>
                                撤销认证
                            </Button>
                        ) : null}
                    </div>
                ),
        },
    ];

    return (
        <AdminPageFrame
            title="认证审核"
            description="审核认证创作者、商家与推广者申请；通过后立即生效"
            actions={
                <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()} loading={loading}>
                    刷新
                </Button>
            }
            scroll
        >
            <div className="admin-settings-stack">
                <div className="flex flex-wrap items-center gap-3">
                    <Tabs
                        activeKey={kind || "all"}
                        onChange={(key) => setKind(key === "all" ? "" : (key as PartnerKind))}
                        items={[{ key: "all", label: "全部" }, ...(Object.keys(partnerKindLabels) as PartnerKind[]).map((key) => ({ key, label: partnerKindLabels[key] }))]}
                    />
                    <Select
                        aria-label="筛选状态"
                        className="w-32"
                        value={status || "all"}
                        onChange={(value: string) => setStatus(value === "all" ? "" : (value as PartnerApplicationStatus))}
                        options={[{ value: "all", label: "全部状态" }, ...(Object.keys(partnerStatusLabels) as PartnerApplicationStatus[]).map((value) => ({ value, label: partnerStatusLabels[value] }))]}
                    />
                    <span className="text-sm opacity-70">共 {total} 份</span>
                </div>
                <Table rowKey="id" size="middle" loading={loading} columns={columns} dataSource={items} pagination={false} scroll={{ x: 900 }} />
            </div>
            <Modal
                open={Boolean(review)}
                title={review ? `${actionLabels[review.action]} · ${partnerKindLabels[review.item.kind]}` : ""}
                okText={review ? actionLabels[review.action] : "确定"}
                okButtonProps={{ danger: review?.action !== "approve", loading: saving }}
                onOk={() => void submitReview()}
                onCancel={() => setReview(null)}
                destroyOnHidden
            >
                {review?.action === "approve" && review.item.kind === "affiliate" ? (
                    <label className="mb-3 block text-sm">
                        <span className="mb-1 block">佣金比例（留空用系统默认）</span>
                        <InputNumber className="w-full" min={0} max={90} precision={2} addonAfter="%" value={rate} onChange={setRate} />
                    </label>
                ) : null}
                <label className="block text-sm">
                    <span className="mb-1 block">{review?.action === "approve" ? "备注（可选，申请人可见）" : "原因（申请人可见）"}</span>
                    <Input.TextArea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
            </Modal>
        </AdminPageFrame>
    );
}
