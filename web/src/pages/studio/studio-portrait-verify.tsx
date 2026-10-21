import { QRCode } from "antd";
import { useEffect, useRef, useState } from "react";

import { AppModal } from "@/components/ui/product/app-modal";
import { checkStudioPortrait, createStudioPortrait, listStudioPortraits, type StudioPortrait } from "@/services/api/portraits";
import { Check, Loader2 } from "./studio-icons";

/** 上游因参考图含真人而拒绝时的固定提示（后端 provider_errors.go 归类出的文案或原始错误码）。 */
export function isRealPersonError(message?: string) {
    const text = (message || "").toLowerCase();
    return text.includes("疑似包含真人形象") || text.includes("privacyinformation") || text.includes("sensitivecontentdetected");
}

/** 就地完成一次人脸认证：沿用未完成的认证，没有就新建一个「本人」。认证通过后回调，由调用方重新生成。 */
export function StudioPortraitVerifyModal({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified: () => void }) {
    const [portrait, setPortrait] = useState<StudioPortrait | null>(null);
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const doneRef = useRef(false);

    useEffect(() => {
        if (!open) return;
        doneRef.current = false;
        setError("");
        setPortrait(null);
        let cancelled = false;
        void (async () => {
            try {
                const list = await listStudioPortraits();
                if (!list.available) throw new Error("平台还没有开通真人认证，请联系客服");
                const pending = list.portraits.find((item) => item.status === "pending" && item.h5Link);
                const next = pending || (await createStudioPortrait("本人"));
                if (!cancelled) setPortrait(next);
            } catch (cause) {
                if (!cancelled) setError(cause instanceof Error ? cause.message : "无法开始认证");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const check = async () => {
        if (!portrait || doneRef.current) return;
        setChecking(true);
        try {
            const next = await checkStudioPortrait(portrait.id);
            if (next.status === "verified" && !doneRef.current) {
                doneRef.current = true;
                onVerified();
            }
        } catch {
            // 认证未完成时继续等待。
        } finally {
            setChecking(false);
        }
    };

    useEffect(() => {
        if (!open || !portrait) return;
        const timer = window.setInterval(() => void check(), 4000);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, portrait?.id]);

    return (
        <AppModal open={open} onCancel={onClose} footer={null} rootClassName="studio-modal" title="需要一次人脸认证" destroyOnHidden>
            <div className="studio-portrait-verify">
                {error ? (
                    <p className="studio-error">{error}</p>
                ) : portrait ? (
                    <>
                        <QRCode value={portrait.h5Link} type="canvas" size={180} bordered={false} color="#111111" bgColor="#ffffff" errorLevel="M" />
                        <div>
                            <p>参考图里有真人，Seedance 要求出镜的人先完成一次人脸认证。请这位真人用手机扫码，按提示完成，大约 1 分钟。</p>
                            <p className="studio-hint">只需要认证一次。之后的参考图会自动处理，完成后这里会自动重新生成。</p>
                            <p className="studio-hint">
                                也可以把链接发到手机：
                                <a href={portrait.h5Link} target="_blank" rel="noopener noreferrer">
                                    认证链接
                                </a>
                            </p>
                            <button type="button" className="studio-mini-button" disabled={checking} onClick={() => void check()}>
                                {checking ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                                我已完成认证
                            </button>
                        </div>
                    </>
                ) : (
                    <p className="studio-hint">正在准备认证…</p>
                )}
            </div>
        </AppModal>
    );
}
