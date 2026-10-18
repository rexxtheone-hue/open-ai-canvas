import { App, Button, Input, Switch } from "antd";
import { Copy, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { getAdminGoogleSetting, updateAdminGoogleSetting, type GoogleSetting } from "@/services/api/auth";
import { AdminStatusBadge, SettingsSectionCard } from "./admin-ui";

function GoogleMark() {
    return (
        <svg aria-hidden viewBox="0 0 48 48" className="size-4">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
    );
}

/** Google 登录：填写 Google Cloud 的 OAuth 客户端，回调地址需登记到 Google 控制台。 */
export function GoogleLoginSettingsCard() {
    const { message } = App.useApp();
    const suggestedRedirect = `${window.location.origin}/api/auth/google/callback`;
    const [saved, setSaved] = useState<GoogleSetting | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [redirectUrl, setRedirectUrl] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getAdminGoogleSetting()
            .then(({ setting }) => {
                setSaved(setting);
                setEnabled(setting.enabled);
                setClientId(setting.clientId);
                setRedirectUrl(setting.redirectUrl || suggestedRedirect);
            })
            .catch((cause: unknown) => message.error(cause instanceof Error ? cause.message : "读取 Google 登录配置失败"));
    }, [message, suggestedRedirect]);

    const save = async () => {
        setSaving(true);
        try {
            const { setting } = await updateAdminGoogleSetting({ enabled, clientId: clientId.trim(), clientSecret: clientSecret.trim() || undefined, redirectUrl: redirectUrl.trim() });
            setSaved(setting);
            setClientSecret("");
            message.success(setting.enabled ? "Google 登录已启用" : "Google 登录配置已保存");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const copyRedirect = async () => {
        try {
            await navigator.clipboard.writeText(redirectUrl);
            message.success("已复制回调地址");
        } catch {
            message.error("复制失败，请手动选择复制");
        }
    };

    return (
        <SettingsSectionCard
            icon={<GoogleMark />}
            title="Google 登录"
            description="海外用户最常用的登录方式。首次登录是否能创建账号仍受上方注册开关控制。"
            status={<AdminStatusBadge label={saved?.enabled ? "已启用" : "未启用"} tone={saved?.enabled ? "success" : "neutral"} />}
        >
            <div className="admin-settings-stack">
                <label className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">在登录与注册页显示「使用 Google 继续」</span>
                    <Switch checked={enabled} onChange={setEnabled} disabled={saving} aria-label="启用 Google 登录" />
                </label>
                <label className="admin-currency-field">
                    <span>Client ID</span>
                    <Input value={clientId} placeholder="xxxxxxxx.apps.googleusercontent.com" onChange={(event) => setClientId(event.target.value)} disabled={saving} />
                </label>
                <label className="admin-currency-field">
                    <span>Client Secret</span>
                    <Input.Password value={clientSecret} placeholder={saved?.hasClientSecret ? "已保存，留空则不修改" : "GOCSPX-…"} onChange={(event) => setClientSecret(event.target.value)} disabled={saving} autoComplete="new-password" />
                </label>
                <label className="admin-currency-field">
                    <span>回调地址（复制到 Google 控制台的「已获授权的重定向 URI」）</span>
                    <Input
                        value={redirectUrl}
                        onChange={(event) => setRedirectUrl(event.target.value)}
                        disabled={saving}
                        addonAfter={
                            <button type="button" className="inline-flex items-center gap-1" onClick={() => void copyRedirect()}>
                                <Copy className="size-3.5" aria-hidden />
                                复制
                            </button>
                        }
                    />
                </label>
                <div>
                    <Button type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void save()}>
                        保存
                    </Button>
                </div>
            </div>
        </SettingsSectionCard>
    );
}
