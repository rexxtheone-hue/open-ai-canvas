import { useQuery } from "@tanstack/react-query";
import { Check, Coins, Images, Link2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getOAuthAuthorizeInfo, submitOAuthAuthorization, type OAuthAuthorizeRequest } from "@/services/api/developer";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useUserStore } from "@/stores/use-user-store";
import "./authorize.css";

/** MCP 客户端（Claude、ChatGPT 等）的 OAuth 授权页：用户确认后带着授权码跳回客户端。 */
export default function OAuthAuthorizePage() {
    const [params] = useSearchParams();
    const user = useUserStore((state) => state.user);
    const brandName = useAppearanceStore((state) => state.appearance.brandName) || "OmniMuse";
    const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
    const [submitError, setSubmitError] = useState("");
    const request: OAuthAuthorizeRequest = {
        clientId: params.get("client_id") || "",
        redirectUri: params.get("redirect_uri") || "",
        responseType: params.get("response_type") || "",
        codeChallenge: params.get("code_challenge") || "",
        codeChallengeMethod: params.get("code_challenge_method") || "",
        state: params.get("state") || "",
        resource: params.get("resource") || "",
    };
    const info = useQuery({
        queryKey: ["oauth-authorize", request.clientId, request.redirectUri],
        queryFn: () => getOAuthAuthorizeInfo(request.clientId, request.redirectUri),
        enabled: Boolean(request.clientId && request.redirectUri),
        retry: false,
    });

    useEffect(() => {
        document.title = `授权连接 · ${brandName}`;
    }, [brandName]);

    const submit = async (approve: boolean) => {
        setSubmitting(approve ? "approve" : "deny");
        setSubmitError("");
        try {
            window.location.assign(await submitOAuthAuthorization(request, approve));
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "授权失败，请重试");
            setSubmitting(null);
        }
    };

    const invalid = !request.clientId || !request.redirectUri || info.isError;
    return (
        <main className="oauth-page">
            <section className="oauth-card" aria-labelledby="oauth-title">
                <BrandLogo className="oauth-logo" theme="dark" fallback={<span className="oauth-logo" />} />
                {invalid ? (
                    <>
                        <ShieldAlert className="oauth-alert-icon" aria-hidden />
                        <h1 id="oauth-title">这个连接请求无效</h1>
                        <p className="oauth-muted">{info.error instanceof Error ? info.error.message : "缺少必要参数。"}请回到 Claude、ChatGPT 等应用重新点「连接」。</p>
                    </>
                ) : info.isLoading || !info.data ? (
                    <p className="oauth-muted">正在读取连接信息…</p>
                ) : (
                    <>
                        <h1 id="oauth-title">
                            <span>{info.data.clientName}</span> 想要连接你的 {brandName} 账号
                        </h1>
                        <p className="oauth-account">
                            当前账号：<strong>{user?.displayName || user?.username}</strong>
                            {user?.username ? <span>@{user.username}</span> : null}
                        </p>
                        <ul className="oauth-scopes">
                            <li>
                                <Coins aria-hidden />
                                <div>
                                    <strong>用你的积分生成图片和视频</strong>
                                    <span>每次生成都会显示价格，按网页版同样的价格扣积分，失败自动退回</span>
                                </div>
                            </li>
                            <li>
                                <Images aria-hidden />
                                <div>
                                    <strong>查看你的作品和生成进度</strong>
                                    <span>生成的作品同时保存在你的作品库里</span>
                                </div>
                            </li>
                            <li>
                                <Link2 aria-hidden />
                                <div>
                                    <strong>查看账号名称和积分余额</strong>
                                    <span>不能修改密码、充值或访问其他设置</span>
                                </div>
                            </li>
                        </ul>
                        <p className="oauth-muted">
                            授权后会回到 <strong>{info.data.redirectHost}</strong>。你可以随时在「设置 → API 与 MCP」里断开连接。
                        </p>
                        {submitError ? <p className="oauth-error">{submitError}</p> : null}
                        <div className="oauth-actions">
                            <button type="button" className="oauth-button" disabled={Boolean(submitting)} onClick={() => void submit(false)}>
                                {submitting === "deny" ? "正在取消…" : "取消"}
                            </button>
                            <button type="button" className="oauth-button is-primary" disabled={Boolean(submitting)} onClick={() => void submit(true)}>
                                <Check aria-hidden />
                                {submitting === "approve" ? "正在授权…" : "授权连接"}
                            </button>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}
