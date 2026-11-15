import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Input } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Select } from "@/components/ui/base/select";
import { listAgencyDiscounts, setAgencyDiscount, type AgencyDiscountItem } from "@/services/api/tenant-admin";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminTableEmpty } from "../components/admin-ui";
import { AdminCallout } from "../ui/controls";
import { AGENCY_DISCOUNT_OPTIONS, capabilityLabel } from "./agency-format";
import "./agencies.css";

const queryKey = ["admin", "agency-discounts"];

export default function AgencyDiscountsPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [keyword, setKeyword] = useState("");
    const [saving, setSaving] = useState("");
    const query = useQuery({ queryKey, queryFn: async ({ signal }) => (await listAgencyDiscounts(signal)).models || [] });
    const rows = useMemo(() => {
        const needle = keyword.trim().toLowerCase();
        const items = query.data || [];
        return needle ? items.filter((item) => [item.displayName, item.modelKey].some((value) => value?.toLowerCase().includes(needle))) : items;
    }, [keyword, query.data]);

    const change = async (item: AgencyDiscountItem, percent: number) => {
        setSaving(item.channelModelId);
        try {
            await setAgencyDiscount(item.channelModelId, percent);
            message.success(`${item.displayName || item.modelKey} 已改为 ${percent}% 折扣`);
            await queryClient.invalidateQueries({ queryKey });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving("");
        }
    };

    const columns: ColumnsType<AgencyDiscountItem> = [
        {
            title: "模型",
            width: 280,
            render: (_, item) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{item.displayName || item.modelKey}</div>
                    <div className="truncate font-mono text-xs text-foreground/50">{item.modelKey}</div>
                </div>
            ),
        },
        { title: "类型", width: 90, render: (_, item) => capabilityLabel(item.capability) },
        {
            title: "代理商折扣",
            width: 160,
            render: (_, item) => (
                <Select
                    aria-label={`${item.displayName || item.modelKey} 的代理商折扣`}
                    value={item.agencyDiscountPercent}
                    disabled={saving === item.channelModelId}
                    options={AGENCY_DISCOUNT_OPTIONS.map((value) => ({ value, label: `${value}%` }))}
                    onChange={(value) => void change(item, Number(value))}
                />
            ),
        },
        { title: "批发池扣减", width: 180, align: "right", render: (_, item) => `平台积分 × ${item.poolFactorPercent.toFixed(2)}%` },
    ];

    return (
        <AdminPageFrame
            title="代理商折扣"
            description="按模型设置代理商拿货折扣：折扣越高，代理商客户生成时批发池扣得越少"
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={query.isFetching} onClick={() => void query.refetch()}>
                    刷新
                </Button>
            }
        >
            <AdminCallout className="mb-4" tone="info" title="折扣怎么算">
                批发价 RM 0.773 / 100 积分已含 15% 折扣。选择更高的折扣时，池扣减 = 平台积分 × (100 − 折扣) ÷ 85，例如 25% 折扣扣 88.24%，40% 折扣扣 70.59%。只影响新提交的生成。
            </AdminCallout>
            {query.error ? <Alert type="error" showIcon title="读取失败" description={query.error instanceof Error ? query.error.message : String(query.error)} /> : null}
            <AdminDataTable<AgencyDiscountItem>
                toolbar={<Input allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} placeholder="搜索模型" aria-label="搜索模型" onChange={(event) => setKeyword(event.target.value)} />}
                empty={<AdminTableEmpty filtered={Boolean(keyword)} title={keyword ? "没有匹配的模型" : "还没有系统渠道模型"} />}
                table={{ rowKey: "channelModelId", dataSource: rows, columns, loading: query.isLoading, pagination: false, size: "small", scroll: { x: 710 } }}
            />
        </AdminPageFrame>
    );
}
