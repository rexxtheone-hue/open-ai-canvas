import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, QRCode } from "antd";
import { useEffect, useRef, useState } from "react";

import { resourceIdFromStorageKey } from "@/services/api/resources";
import { addStudioPortraitPhoto, checkStudioPortrait, createStudioPortrait, deleteStudioPortrait, deleteStudioPortraitPhoto, listStudioPortraits, type StudioPortrait } from "@/services/api/portraits";
import { useUserStore } from "@/stores/use-user-store";
import { Check, ImagePlus, Loader2, ScanFace, Trash2 } from "./studio-icons";
import { StudioShell } from "./studio-shell";
import { uploadStudioFile } from "./use-studio-tool";

const QUERY_KEY = ["studio", "portraits"];

/** 真人认证：Seedance 只接受通过活体认证的真人人像，认证后上传的照片会在生成时自动以可信素材提交。 */
export default function StudioPortraitsPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const user = useUserStore((state) => state.user);
    const query = useQuery({
        queryKey: [...QUERY_KEY, user?.id || ""],
        queryFn: listStudioPortraits,
        enabled: Boolean(user),
        refetchInterval: (state) => (state.state.data?.portraits.some((portrait) => portrait.photos?.some((photo) => photo.status === "processing")) ? 5000 : false),
    });
    const [name, setName] = useState("");
    const create = useMutation({
        mutationFn: () => createStudioPortrait(name.trim()),
        onSuccess: async () => {
            setName("");
            await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        },
        onError: (cause) => message.error(cause instanceof Error ? cause.message : "创建失败"),
    });
    const portraits = query.data?.portraits || [];

    return (
        <StudioShell title="真人认证">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>真人认证</h2>
                        <p>Seedance 不接受未认证的真人照片。出镜的人用手机完成一次人脸认证后，上传他的照片，之后在 Seedance 里用这些照片当参考图会自动通过。</p>
                    </div>
                </div>
                {query.isLoading ? <p className="studio-hint">正在读取…</p> : null}
                {query.data && !query.data.available ? (
                    <div className="studio-empty">
                        <strong>平台还没有开通真人认证</strong>
                        <span>需要管理员先添加支持真人认证的 Seedance 渠道。</span>
                    </div>
                ) : null}
                {query.data?.available ? (
                    <form
                        className="studio-block studio-portrait-create"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (name.trim()) create.mutate();
                        }}
                    >
                        <label className="studio-field">
                            <span>新建认证：这位真人怎么称呼？</span>
                            <input value={name} maxLength={30} placeholder="例如：本人、模特 Amy" onChange={(event) => setName(event.target.value)} />
                        </label>
                        <button type="submit" className="studio-generate-button" disabled={!name.trim() || create.isPending}>
                            <ScanFace aria-hidden />
                            {create.isPending ? "正在创建…" : "开始认证"}
                        </button>
                    </form>
                ) : null}
                <div className="studio-portrait-list">
                    {portraits.map((portrait) => (
                        <PortraitCard key={portrait.id} portrait={portrait} />
                    ))}
                </div>
            </div>
        </StudioShell>
    );
}

function PortraitCard({ portrait }: { portrait: StudioPortrait }) {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(0);
    const check = useMutation({ mutationFn: () => checkStudioPortrait(portrait.id), onSuccess: (next) => (next.status === "verified" ? refresh() : undefined) });

    // 待认证时每 4 秒检查一次，手机端完成后电脑这边自动跳到已认证。
    useEffect(() => {
        if (portrait.status !== "pending") return;
        const timer = window.setInterval(() => check.mutate(), 4000);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [portrait.id, portrait.status]);

    const upload = async (files: FileList | null) => {
        const list = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!list.length) return;
        setUploading(list.length);
        try {
            for (const file of list) {
                const attachment = await uploadStudioFile(file);
                const resourceId = resourceIdFromStorageKey(attachment.storageKey);
                if (!resourceId) throw new Error(`${file.name} 上传失败`);
                await addStudioPortraitPhoto(portrait.id, resourceId);
                setUploading((count) => count - 1);
            }
            message.success("照片已提交审核，通过后即可在 Seedance 中使用");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "上传失败");
        } finally {
            setUploading(0);
            if (fileRef.current) fileRef.current.value = "";
            await refresh();
        }
    };

    const remove = () =>
        modal.confirm({
            title: `删除「${portrait.name}」的认证？`,
            content: "认证和已上传的照片都会删除，之后需要重新认证。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await deleteStudioPortrait(portrait.id);
                await refresh();
            },
        });

    const verified = portrait.status === "verified";
    return (
        <section className="studio-block studio-portrait-card">
            <header className="studio-portrait-head">
                <div>
                    <strong>{portrait.name}</strong>
                    <span className={`studio-verified-badge${verified ? "" : " is-muted"}`}>{verified ? "已认证" : "等待认证"}</span>
                </div>
                <button type="button" className="studio-mini-button" onClick={remove} aria-label="删除认证">
                    <Trash2 aria-hidden />
                </button>
            </header>
            {!verified ? (
                <div className="studio-portrait-verify">
                    <QRCode value={portrait.h5Link} type="canvas" size={180} bordered={false} color="#111111" bgColor="#ffffff" errorLevel="M" />
                    <div>
                        <p>请「{portrait.name}」本人用手机扫码，按提示完成人脸认证。完成后这里会自动更新。</p>
                        <p className="studio-hint">
                            也可以把链接发给对方在手机打开：
                            <a href={portrait.h5Link} target="_blank" rel="noopener noreferrer">
                                认证链接
                            </a>
                        </p>
                        <button type="button" className="studio-mini-button" disabled={check.isPending} onClick={() => check.mutate()}>
                            {check.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                            我已完成认证
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="studio-portrait-photos">
                        {(portrait.photos || []).map((photo) => (
                            <figure key={photo.id} className={`studio-portrait-photo is-${photo.status}`}>
                                {photo.url ? <img src={photo.url} alt="" loading="lazy" /> : null}
                                <figcaption>{photo.status === "active" ? "可用" : photo.status === "processing" ? "审核中" : photo.error || "未通过"}</figcaption>
                                <button
                                    type="button"
                                    aria-label="删除照片"
                                    onClick={async () => {
                                        await deleteStudioPortraitPhoto(photo.id);
                                        await refresh();
                                    }}
                                >
                                    <Trash2 aria-hidden />
                                </button>
                            </figure>
                        ))}
                        <button type="button" className="studio-portrait-add" disabled={uploading > 0} onClick={() => fileRef.current?.click()}>
                            {uploading > 0 ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                            <span>{uploading > 0 ? `上传中（剩 ${uploading} 张）` : "添加照片"}</span>
                        </button>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => void upload(event.target.files)} />
                    <p className="studio-hint">照片会同时出现在工具「添加参考 → 上传」里。在 Seedance 中选这些照片当参考图，系统会自动换成认证素材提交。</p>
                </>
            )}
        </section>
    );
}

/** 手机端认证完成后的跳转页（无需登录）。 */
export function PortraitVerifiedPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black p-6 text-center text-white">
            <Check aria-hidden className="size-10 text-[#d65cff]" />
            <h1 className="text-xl font-semibold">认证已提交</h1>
            <p className="max-w-sm text-sm opacity-70">请回到电脑上的「真人认证」页面，结果会自动更新。</p>
        </main>
    );
}
