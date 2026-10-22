import { type FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { App, Button, Checkbox, Divider, Input, Modal } from "antd";
import { ArrowLeft, ArrowRight, FileText, Gift, Info, LockKeyhole, Mail, TriangleAlert } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { getAuthSession, getAuthSettings, googleLoginURL, linuxDOLoginURL, register } from "@/services/api/auth";
import { GoogleIcon, LinuxDOIcon } from "./auth-scene";
import { safeNext } from "./login";
import { ApiError } from "@/services/api/request";
import { VerificationFields } from "@/components/auth/verification-fields";
import { emptyVerification, startVerification, verificationMethods, type VerificationMethod } from "@/services/api/verification";
import { currentLocale } from "@/lib/i18n/runtime";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import "./auth-forms.css";

type AuthSettings = Awaited<ReturnType<typeof getAuthSettings>>;

export default function RegisterPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = safeNext(params.get("next"));
    return <RegisterForm next={next} onSuccess={() => navigate(next, { replace: true })} onSwitch={() => navigate({ pathname: "/login", search: params.toString() ? `?${params}` : "" })} />;
}

/**
 * 标准注册流程：第三方一键注册优先；邮箱注册分两步——先填邮箱收验证码，再填验证码和密码。
 * 用户名由后端按邮箱生成，显示名称以后在个人资料里改。注册页与工作台里的注册弹窗共用。
 */
export function RegisterForm({ next, onSuccess, onSwitch }: { next: string; onSuccess: () => void; onSwitch: () => void }) {
    const { message } = App.useApp();
    const brandName = useAppearanceStore((state) => state.appearance.brandName) || "平台";
    const [settings, setSettings] = useState<AuthSettings | null>(null);
    const [settingsFailed, setSettingsFailed] = useState(false);
    const [settingsReloadKey, setSettingsReloadKey] = useState(0);
    const [step, setStep] = useState<"start" | "verify">("start");
    const [email, setEmail] = useState("");
    const [verification, setVerification] = useState({ ...emptyVerification });
    const [password, setPassword] = useState("");
    const [agreementAccepted, setAgreementAccepted] = useState(false);
    const [agreementNudge, setAgreementNudge] = useState(false);
    const [agreementOpen, setAgreementOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [resendIn, setResendIn] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [registerCountdown, setRegisterCountdown] = useState(0);
    const registering = useRef(false);

    // 协议标题与条款由后台「登录与注册」配置下发。标题未配置时才回退到当前品牌名，
    // 且只在确认拿到设置（settings 非空）后回退；接口失败时不猜标题，避免展示
    // 与后台真实配置不符的协议名。标题统一去掉书名号后由页面补《》。
    const agreementTitle = localizedAgreementTitle(((settings?.agreementTitle || "").trim() || `${brandName}服务协议`).replace(/^《|》$/g, ""));
    const agreementContent = (settings?.agreementContent || "").trim();
    const agreementParagraphs = agreementContent ? agreementContent.split(/\n\s*\n/) : [];

    useEffect(() => {
        let cancelled = false;
        setSettingsFailed(false);
        void getAuthSettings()
            .then((value) => {
                if (!cancelled) setSettings(value);
            })
            .catch((error) => {
                if (cancelled) return;
                // 必须留下失败态：协议标题只能来自后台配置，读不到时不能用品牌名顶替。
                setSettingsFailed(true);
                message.error(error instanceof Error ? error.message : "读取注册设置失败");
            });
        return () => {
            cancelled = true;
        };
    }, [message, settingsReloadKey]);

    useEffect(() => {
        if (registerCountdown <= 0 && resendIn <= 0) return;
        const timer = window.setInterval(() => {
            setRegisterCountdown((value) => Math.max(0, value - 1));
            setResendIn((value) => Math.max(0, value - 1));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [registerCountdown, resendIn]);

    const registrationClosed = settings?.registrationEnabled === false;
    const methods: VerificationMethod[] = settings ? verificationMethods(settings, "register") : [];
    const firstUser = Boolean(settings?.firstUser);
    const emailFlow = firstUser || methods.includes("email");
    // 只开了短信或「短信 + 邮箱」时沿用原来的验证码组件，一次填完。
    const otherMethod = !emailFlow ? methods[0] : undefined;
    const thirdParty = Boolean(settings?.googleEnabled || settings?.linuxdoEnabled);
    const formAvailable = Boolean(settings) && !registrationClosed && (emailFlow || Boolean(otherMethod));
    // 没有任何可用的注册方式时，不展示赠送积分和协议勾选，只留提示。
    const canSignUp = !registrationClosed && (formAvailable || thirdParty);
    const bonusCredits = Math.floor((settings?.signupBonusMicrocredits ?? 0) / 1_000_000);

    const requireAgreement = () => {
        if (agreementAccepted) return true;
        setAgreementNudge(true);
        message.warning(`请先同意${agreementTitle}`);
        return false;
    };

    const sendCode = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        if (!requireAgreement() || sending || resendIn > 0) return;
        const target = email.trim().toLowerCase();
        if (!target) return;
        setSending(true);
        try {
            const result = await startVerification({ purpose: "register", method: "email", email: target });
            setVerification({ ...emptyVerification, email: target, ticket: result.ticket });
            setResendIn(result.retryAfter || 60);
            setStep("verify");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "发送失败，请稍后重试");
        } finally {
            setSending(false);
        }
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (registering.current || registerCountdown > 0 || !requireAgreement()) return;
        registering.current = true;
        setSubmitting(true);
        try {
            if (firstUser) await register({ username: "", email: email.trim(), password, acceptedTerms: true });
            else {
                if (!verification.ticket) throw new Error("请先获取本次注册验证码");
                await register({ username: "", ...verification, password, acceptedTerms: true });
            }
            const { applyUserSession } = await import("@/lib/user-session");
            await applyUserSession(await getAuthSession());
            if (!firstUser) window.sessionStorage.setItem("yingce:model-setup-guide", "1");
            message.success(firstUser ? "管理员账号已创建" : "注册成功");
            onSuccess();
        } catch (error) {
            if (error instanceof ApiError && error.status === 429) setRegisterCountdown(Math.max(1, Math.ceil((error.retryAfterMs ?? 60000) / 1000)));
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            registering.current = false;
            setSubmitting(false);
        }
    };

    const passwordField = (
        <AuthField label="设置密码">
            <Input.Password size="large" prefix={<LockKeyhole className="auth-scene-icon size-4" />} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" autoComplete="new-password" minLength={8} required />
        </AuthField>
    );
    const submitButton = (
        <Button type="primary" htmlType="submit" size="large" block loading={submitting} disabled={registerCountdown > 0} icon={<ArrowRight className="size-4" />} iconPlacement="end">
            {registerCountdown > 0 ? `${registerCountdown} 秒后可重试` : "创建账号"}
        </Button>
    );

    return (
        <div className="space-y-4">
            {bonusCredits > 0 && canSignUp ? (
                <div className="auth-bonus flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium">
                    <Gift className="size-4 shrink-0" aria-hidden />
                    注册即送 {bonusCredits} 积分，免费开始创作
                </div>
            ) : null}
            {firstUser ? (
                <Notice icon={<Info className="size-3.5" />} tone="blue">
                    首个账号自动成为管理员，邮箱验证码暂不要求。
                </Notice>
            ) : null}
            {registrationClosed ? (
                <Notice icon={<TriangleAlert className="size-3.5" />} tone="amber">
                    当前暂未开放注册，请联系管理员创建账号。
                </Notice>
            ) : null}
            {settings && !registrationClosed && !formAvailable && !thirdParty ? (
                <Notice icon={<TriangleAlert className="size-3.5" />} tone="amber">
                    当前没有可用的注册方式，请联系管理员检查邮件与短信设置。
                </Notice>
            ) : null}
            {settingsFailed ? (
                <Notice icon={<TriangleAlert className="size-3.5" />} tone="amber">
                    <span>
                        读取注册设置失败，暂时无法确认服务协议名称与条款。
                        <button type="button" className="auth-scene-link ml-1 transition" onClick={() => setSettingsReloadKey((value) => value + 1)}>
                            重新读取
                        </button>
                    </span>
                </Notice>
            ) : null}

            {step === "start" && !registrationClosed ? (
                <>
                    {settings?.googleEnabled ? (
                        <Button size="large" block icon={<GoogleIcon />} onClick={() => requireAgreement() && window.location.assign(googleLoginURL(next, true))}>
                            使用 Google 继续
                        </Button>
                    ) : null}
                    {settings?.linuxdoEnabled ? (
                        <Button size="large" block icon={<LinuxDOIcon />} onClick={() => requireAgreement() && window.location.assign(linuxDOLoginURL(next, true))}>
                            使用 Linux.do 继续
                        </Button>
                    ) : null}
                    {thirdParty && formAvailable ? (
                        <Divider plain className="auth-scene-divider">
                            或使用邮箱注册
                        </Divider>
                    ) : null}
                    {formAvailable && firstUser ? (
                        <form onSubmit={submit} className="space-y-4">
                            <AuthField label="邮箱（可选）">
                                <Input size="large" type="email" prefix={<Mail className="auth-scene-icon size-4" />} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" />
                            </AuthField>
                            {passwordField}
                            {submitButton}
                        </form>
                    ) : formAvailable && emailFlow ? (
                        <form onSubmit={(event) => void sendCode(event)} className="space-y-4">
                            <AuthField label="邮箱">
                                <Input size="large" type="email" prefix={<Mail className="auth-scene-icon size-4" />} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" required />
                            </AuthField>
                            <Button type="primary" htmlType="submit" size="large" block loading={sending} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                                继续
                            </Button>
                        </form>
                    ) : formAvailable && otherMethod ? (
                        <form onSubmit={submit} className="space-y-4">
                            <VerificationFields key={otherMethod} purpose="register" method={otherMethod} value={verification} onChange={setVerification} disabled={submitting} />
                            {passwordField}
                            {submitButton}
                        </form>
                    ) : null}
                </>
            ) : null}

            {step === "verify" ? (
                <form onSubmit={submit} className="space-y-4">
                    <div className="auth-scene-muted flex flex-wrap items-center gap-x-2 text-sm leading-6">
                        <span>
                            验证码已发送至 <strong className="text-foreground">{verification.email}</strong>
                        </span>
                        <button
                            type="button"
                            className="auth-scene-link inline-flex items-center gap-1 text-xs font-medium"
                            onClick={() => {
                                setStep("start");
                                setVerification({ ...emptyVerification });
                            }}
                        >
                            <ArrowLeft className="size-3" />
                            修改邮箱
                        </button>
                    </div>
                    <AuthField label="邮件验证码">
                        <Input
                            size="large"
                            value={verification.emailCode}
                            onChange={(event) => setVerification({ ...verification, emailCode: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                            placeholder="6 位数字验证码"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            autoFocus
                            required
                            suffix={
                                <button type="button" className="auth-scene-link text-xs font-medium disabled:opacity-50" disabled={resendIn > 0 || sending} onClick={() => void sendCode()}>
                                    {resendIn > 0 ? `${resendIn} 秒后重发` : "重新发送"}
                                </button>
                            }
                        />
                    </AuthField>
                    {passwordField}
                    {submitButton}
                </form>
            ) : null}

            {settings && canSignUp ? (
                <div className="auth-agreement-row" data-accepted={agreementAccepted ? "true" : "false"} data-nudge={agreementNudge && !agreementAccepted ? "true" : undefined}>
                    <Checkbox
                        checked={agreementAccepted}
                        onChange={(event) => {
                            setAgreementAccepted(event.target.checked);
                            setAgreementNudge(false);
                        }}
                    >
                        <span className="auth-agreement-label">我已阅读并同意</span>
                    </Checkbox>
                    <button type="button" className="auth-agreement-link" onClick={() => setAgreementOpen(true)}>
                        {currentLocale === "en" ? agreementTitle : `《${agreementTitle}》`}
                    </button>
                    <span className="auth-agreement-label">并确认已年满 18 岁</span>
                </div>
            ) : null}

            <p className="auth-scene-muted m-0 flex justify-center gap-1.5 text-sm">
                <span>已有账号？</span>
                <button type="button" className="auth-scene-link font-medium" onClick={onSwitch}>
                    登录
                </button>
            </p>

            <Modal className="workspace-modal workspace-modal-compact auth-agreement-modal" title={agreementTitle} open={agreementOpen} onCancel={() => setAgreementOpen(false)} footer={null} destroyOnHidden>
                {agreementParagraphs.length === 0 ? (
                    <div className="auth-agreement-empty">
                        <FileText className="size-3.5 shrink-0" aria-hidden />
                        服务协议内容待补充，请联系管理员在后台「登录与注册」中完善。
                    </div>
                ) : (
                    <div className="auth-agreement-body">
                        {agreementParagraphs.map((paragraph, index) => {
                            // 后台用纯文本框维护条款，「一、二、三…」条目通常和正文写在同一个
                            // 段落里。把条目标题切出来单独成行并加重，长条款才有可扫描的层级。
                            const blocks = splitAgreementParagraph(paragraph);
                            return blocks.map((block, blockIndex) => (
                                <p key={`agreement-${index}-${blockIndex}`} data-role={block.heading ? "heading" : undefined}>
                                    {block.text}
                                </p>
                            ));
                        })}
                    </div>
                )}
                <p className="auth-agreement-meta">
                    <LockKeyhole className="size-3 shrink-0" aria-hidden />
                    继续注册即表示你已阅读并接受本协议全部条款。
                </p>
            </Modal>
        </div>
    );
}

/** 英文界面下，默认的「某某服务协议」显示为「某某 Terms of Service」；后台自定义的其他标题原样显示。 */
function localizedAgreementTitle(title: string) {
    if (currentLocale !== "en") return title;
    return title.replace(/\s*服务协议$/, " Terms of Service");
}

function AuthField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block space-y-2">
            <span className="auth-scene-label text-xs font-medium">{label}</span>
            {children}
        </label>
    );
}

function Notice({ icon, tone, children }: { icon: ReactNode; tone: "blue" | "amber"; children: ReactNode }) {
    return (
        <div data-tone={tone} className="auth-scene-notice flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5">
            <span className="mt-0.5 shrink-0">{icon}</span>
            {children}
        </div>
    );
}

// 中文条款里「一、」「二、」这类条目标题常与正文写在同一个段落内（只隔一个换行）。
// 这里按「条目标题 + 紧随其后的正文」拆成独立段落，让标题能单独成行并加重；
// 没有条目标题的普通段落原样返回，不改变后台已经整理好的排版。
const AGREEMENT_HEADING = /^\s*([一二三四五六七八九十百]+、[^\n]{0,40})\n+([\s\S]+)$/;

function splitAgreementParagraph(paragraph: string): { text: string; heading: boolean }[] {
    const match = paragraph.match(AGREEMENT_HEADING);
    if (!match) {
        const headingOnly = /^\s*[一二三四五六七八九十百]+、[^\n]{0,40}\s*$/.test(paragraph);
        return [{ text: paragraph.trim(), heading: headingOnly }];
    }
    return [
        { text: match[1].trim(), heading: true },
        { text: match[2].trim(), heading: false },
    ];
}
