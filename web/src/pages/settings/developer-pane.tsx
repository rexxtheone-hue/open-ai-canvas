import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input } from "antd";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AppModal } from "@/components/ui/product/app-modal";
import { Callout } from "@/components/ui/product/callout";
import "./developer-pane.css";
import { createApiToken, listApiTokens, listOAuthConnections, revokeApiToken, revokeOAuthConnection, type CreatedApiToken } from "@/services/api/developer";

function formatTime(value?: string | null) {
    if (!value) return "从未使用";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function CommandBlock({ label, command }: { label: string; command: string }) {
    const { message } = App.useApp();
    return (
        <div className="developer-command">
            <span className="developer-command-label">{label}</span>
            <div className="developer-command-row">
                <code>{command}</code>
                <Button
                    size="small"
                    type="text"
                    icon={<Copy className="size-3.5" />}
                    aria-label={`复制${label}`}
                    onClick={() => void navigator.clipboard.writeText(command).then(() => message.success("已复制"))}
                />
            </div>
        </div>
    );
}

/** 用户自己的 API Key 和已授权的 MCP 应用（Claude、ChatGPT 等）。 */
export function DeveloperPane() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const origin = window.location.origin;
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [created, setCreated] = useState<CreatedApiToken | null>(null);

    const tokens = useQuery({ queryKey: ["api-tokens"], queryFn: listApiTokens });
    const connections = useQuery({ queryKey: ["oauth-connections"], queryFn: listOAuthConnections });

    const create = useMutation({
        mutationFn: () => createApiToken(name.trim() || "API Key"),
        onSuccess: (token) => {
            setCreating(false);
            setName("");
            setCreated(token);
            void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "创建失败"),
    });

    const confirmRevokeToken = (id: string, tokenName: string) =>
        modal.confirm({
            title: `撤销「${tokenName}」？`,
            content: "撤销后，使用这把 Key 的命令行工具和脚本会立即失效。",
            okText: "撤销",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await revokeApiToken(id);
                await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
                message.success("已撤销");
            },
        });

    const confirmDisconnect = (clientId: string, clientName: string) =>
        modal.confirm({
            title: `断开「${clientName}」？`,
            content: "断开后，这个应用需要重新授权才能使用你的账号。",
            okText: "断开",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await revokeOAuthConnection(clientId);
                await queryClient.invalidateQueries({ queryKey: ["oauth-connections"] });
                message.success("已断开");
            },
        });

    return (
        <>
            <div className="settings-pane-header">
                <div className="min-w-0">
                    <h2>API 与 MCP</h2>
                    <p>在 Claude、ChatGPT 里直接出图出片，或者用命令行工具批量生成。价格和网页版一样，扣你账号里的积分，失败自动退回。</p>
                </div>
            </div>

            <div className="settings-section developer-pane">
                <section className="developer-block">
                    <h3>在 Claude、ChatGPT 中使用（MCP）</h3>
                    <p>在应用的「连接器」设置里添加下面的网址，按提示登录并授权即可。</p>
                    <CommandBlock label="MCP 网址" command={`${origin}/mcp`} />
                    <CommandBlock label="Claude Code" command={`claude mcp add --transport http omnimuse ${origin}/mcp`} />
                </section>

                <section className="developer-block">
                    <h3>命令行工具（CLI）</h3>
                    <p>安装后运行 omnimuse login，浏览器里确认即可登录。服务器和自动化脚本可以改用 API Key。</p>
                    <CommandBlock label="macOS / Linux" command={`curl -fsSL ${origin}/install.sh | sh`} />
                    <CommandBlock label="Windows PowerShell" command={`irm ${origin}/install.ps1 | iex`} />
                    <CommandBlock label="生成示例" command={`omnimuse video "一杯咖啡在晨光中冒着热气" -r 9:16 -d 5`} />
                </section>

                <section className="developer-block">
                    <div className="developer-block-header">
                        <h3>API Key</h3>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
                            创建 API Key
                        </Button>
                    </div>
                    <p>
                        用于命令行工具（omnimuse login --key）和开放 API（{origin}/api/v1，请求头 Authorization: Bearer &lt;key&gt;）。请像密码一样保管。
                    </p>
                    {tokens.isError ? <Callout tone="error">{tokens.error instanceof Error ? tokens.error.message : "读取失败"}</Callout> : null}
                    {tokens.data?.length ? (
                        <ul className="developer-list">
                            {tokens.data.map((token) => (
                                <li key={token.id}>
                                    <KeyRound className="size-4 shrink-0 opacity-60" aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <strong>{token.name}</strong>
                                        <span>
                                            {token.prefix}… · 创建于 {formatTime(token.createdAt)} · 最近使用 {formatTime(token.lastUsedAt)}
                                        </span>
                                    </div>
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => confirmRevokeToken(token.id, token.name)}>
                                        撤销
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : tokens.isSuccess ? (
                        <p className="developer-empty">还没有 API Key。</p>
                    ) : null}
                </section>

                <section className="developer-block">
                    <h3>已连接的应用</h3>
                    {connections.data?.length ? (
                        <ul className="developer-list">
                            {connections.data.map((item) => (
                                <li key={item.clientId}>
                                    <div className="min-w-0 flex-1">
                                        <strong>{item.clientName}</strong>
                                        <span>
                                            授权于 {formatTime(item.createdAt)} · 最近使用 {formatTime(item.lastUsedAt)}
                                        </span>
                                    </div>
                                    <Button size="small" type="text" danger onClick={() => confirmDisconnect(item.clientId, item.clientName)}>
                                        断开
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : connections.isSuccess ? (
                        <p className="developer-empty">还没有应用连接到你的账号。</p>
                    ) : null}
                </section>
            </div>

            <AppModal
                open={creating}
                title="创建 API Key"
                onCancel={() => setCreating(false)}
                onOk={() => create.mutate()}
                okText="创建"
                cancelText="取消"
                confirmLoading={create.isPending}
            >
                <Input placeholder="名称，例如：投放脚本" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} onPressEnter={() => create.mutate()} />
            </AppModal>

            <AppModal open={Boolean(created)} title="API Key 已创建" onCancel={() => setCreated(null)} footer={<Button type="primary" onClick={() => setCreated(null)}>我已保存</Button>}>
                <p className="developer-created-hint">这把 Key 只显示这一次，关闭后无法再查看，请立即复制保存。</p>
                {created ? <CommandBlock label={created.name} command={created.token} /> : null}
            </AppModal>
        </>
    );
}
