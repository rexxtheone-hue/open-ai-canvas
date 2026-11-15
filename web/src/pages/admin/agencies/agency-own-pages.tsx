// 代理商管理员在自己网址后台看到的页面：积分池、我的网址、管理员。

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button } from "antd";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useUserStore } from "@/stores/use-user-store";
import { createOwnStaff, getOwnMonthlyUsage, getOwnPool, listOwnDomains, listOwnLedger, listOwnLots, listOwnStaff, setOwnStaffStatus } from "@/services/api/tenant-admin";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminCallout } from "../ui/controls";
import { AddAdminModal, AdminsTable, CnameInstruction, DebtsTable, DomainsTable, LedgerTable, LotsTable, MonthlyMinimumCard, PoolStats, SettlementsTable } from "./agency-components";
import "./agencies.css";

function ErrorAlert({ error, title }: { error: unknown; title: string }) {
    if (!error) return null;
    return <Alert type="error" showIcon title={title} description={error instanceof Error ? error.message : String(error)} />;
}

export function AgencyPoolPage() {
    const queryClient = useQueryClient();
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerSize, setLedgerSize] = useState(20);
    const pool = useQuery({ queryKey: ["agency", "pool"], queryFn: ({ signal }) => getOwnPool(signal) });
    const lots = useQuery({ queryKey: ["agency", "lots"], queryFn: async ({ signal }) => (await listOwnLots(signal)).lots });
    const ledger = useQuery({ queryKey: ["agency", "ledger", ledgerPage, ledgerSize], queryFn: ({ signal }) => listOwnLedger(ledgerPage, ledgerSize, signal) });
    const usage = useQuery({ queryKey: ["agency", "monthly-usage"], queryFn: ({ signal }) => getOwnMonthlyUsage(signal) });
    const lowBalance = pool.data && pool.data.latestTopupMicrocredits > 0 && pool.data.availableMicrocredits < pool.data.latestTopupMicrocredits / 5;

    return (
        <AdminPageFrame
            title="积分池"
            description="批发积分余额、充值批次与每月最低消费；充值请转账后联系平台入账"
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={pool.isFetching} onClick={() => void queryClient.invalidateQueries({ queryKey: ["agency"] })}>
                    刷新
                </Button>
            }
            scroll
        >
            <div className="admin-agency-stack">
                <ErrorAlert error={pool.error} title="积分池读取失败" />
                {pool.data ? (
                    <>
                        {pool.data.availableMicrocredits <= 0 ? (
                            <AdminCallout tone="error" title="批发池已用完">
                                你的客户现在无法生成，会看到「服务暂时不可用」。请尽快转账充值。
                            </AdminCallout>
                        ) : lowBalance ? (
                            <AdminCallout tone="warning" title="批发池余额不足最近一次充值的 20%">
                                建议尽快充值，避免客户生成中断。
                            </AdminCallout>
                        ) : null}
                        <PoolStats summary={pool.data} />
                        <MonthlyMinimumCard month={pool.data.currentMonth} />
                        {pool.data.debts.length > 0 ? (
                            <>
                                <h3 className="admin-agency-section-title">未结欠款</h3>
                                <DebtsTable debts={pool.data.debts} />
                            </>
                        ) : null}
                    </>
                ) : null}
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
                <h3 className="admin-agency-section-title">月度结算</h3>
                <SettlementsTable items={usage.data?.settlements || []} loading={usage.isLoading} />
            </div>
        </AdminPageFrame>
    );
}

export function AgencyDomainsPage() {
    const query = useQuery({ queryKey: ["agency", "domains"], queryFn: async ({ signal }) => (await listOwnDomains(signal)).domains });
    const domains = query.data || [];
    return (
        <AdminPageFrame
            title="我的网址"
            description="客户访问的网址与证书状态；新增或更换网址请联系平台"
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={query.isFetching} onClick={() => void query.refetch()}>
                    刷新
                </Button>
            }
            scroll
        >
            <div className="admin-agency-stack">
                <ErrorAlert error={query.error} title="网址读取失败" />
                <CnameInstruction domains={domains} />
                <DomainsTable domains={domains} loading={query.isLoading} />
            </div>
        </AdminPageFrame>
    );
}

export function AgencyStaffPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const currentUserId = useUserStore((state) => state.user?.id);
    const [open, setOpen] = useState(false);
    const query = useQuery({ queryKey: ["agency", "staff"], queryFn: async ({ signal }) => (await listOwnStaff(signal)).users });
    const reload = () => void queryClient.invalidateQueries({ queryKey: ["agency", "staff"] });
    return (
        <AdminPageFrame
            title="管理员"
            description="可以进入本网址后台的同事；管理员能管理客户、价格与网站设置"
            actions={
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
                    添加管理员
                </Button>
            }
        >
            <ErrorAlert error={query.error} title="管理员读取失败" />
            <AdminsTable
                users={query.data || []}
                loading={query.isLoading}
                currentUserId={currentUserId}
                onToggle={async (user, next) => {
                    try {
                        await setOwnStaffStatus(user.id, next);
                        message.success(next === "active" ? "已恢复" : "已停用");
                        reload();
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "操作失败");
                    }
                }}
            />
            <AddAdminModal
                open={open}
                onClose={() => setOpen(false)}
                onSubmit={async (values) => {
                    const result = await createOwnStaff(values);
                    reload();
                    return result;
                }}
            />
        </AdminPageFrame>
    );
}
