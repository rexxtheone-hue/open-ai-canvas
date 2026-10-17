import { useEffect, useRef, useState } from "react";
import { App, Input, Popover, Switch } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Camera, ImagePlus, ImageUp, Loader2, Maximize2, RefreshCw, ScanText, Trash2, WandSparkles } from "./studio-icons";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import type { CreationAttachment } from "@/pages/create/creation-assets";
import { listStudioWorks, type StudioKind } from "@/services/api/studio";
import type { AiConfig } from "@/stores/use-config-store";
import { studioMediaSrc } from "./studio-library";
import { enhanceStudioPrompt, promptFromImage, studioTextModel } from "./studio-prompt-tools";
import { studioAttachmentFromMedia, uploadStudioFile } from "./use-studio-tool";

type PromptBoxProps = {
    id: string;
    label: string;
    optional?: boolean;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    kind: StudioKind;
    config: AiConfig;
    maxChars?: number;
    /** 已添加的第一张参考图，图片转提示词时可以一键选用。 */
    sourceImage?: CreationAttachment;
    /** 视频才显示运镜；点开右侧的镜头运动面板。 */
    onOpenCamera?: () => void;
    autoPolish?: boolean;
    onAutoPolishChange?: (value: boolean) => void;
    onSubmitShortcut?: () => void;
};

/** 图片转提示词：左边上传或从作品选图，右边自动写出提示词，可修改后使用。 */
function ImageToPromptModal({ open, onClose, kind, config, sourceImage, onUse }: { open: boolean; onClose: () => void; kind: StudioKind; config: AiConfig; sourceImage?: CreationAttachment; onUse: (prompt: string) => void }) {
    const { message } = App.useApp();
    const [image, setImage] = useState<CreationAttachment | null>(null);
    const [result, setResult] = useState("");
    const [busy, setBusy] = useState<"" | "upload" | "describe">("");
    const [historyOpen, setHistoryOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const visionModel = studioTextModel(config, true);
    const history = useQuery({
        queryKey: ["studio", "prompt-image-history"],
        queryFn: async ({ signal }) => (await listStudioWorks({ kind: "image", pageSize: 40 }, signal)).works.filter((work) => work.status === "succeeded" && work.media[0]),
        enabled: open && historyOpen,
    });

    useEffect(() => {
        if (!open) return;
        setImage(null);
        setResult("");
    }, [open]);

    const describe = async (next: CreationAttachment) => {
        setImage(next);
        setResult("");
        if (!visionModel) return;
        setBusy("describe");
        try {
            setResult(await promptFromImage(config, kind, next, ""));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "识别失败，请重试");
        } finally {
            setBusy("");
        }
    };

    const upload = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            message.warning("请选择图片");
            return;
        }
        setBusy("upload");
        try {
            const attachment = await uploadStudioFile(file);
            setBusy("");
            await describe(attachment);
        } catch (cause) {
            setBusy("");
            message.error(cause instanceof Error ? cause.message : "上传失败");
        }
    };

    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(880px, calc(100vw - 32px))" title="图片转提示词" footer={null} onCancel={onClose} destroyOnHidden>
            <div className="studio-popup studio-i2p">
                <section className="studio-i2p-pane">
                    <strong>上传图片</strong>
                    <div
                        className={`studio-i2p-drop${image ? " has-image" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files?.[0]); }}
                    >
                        {image ? <img src={image.previewUrl} alt={image.name} /> : busy === "upload" ? <Loader2 className="studio-spin" aria-hidden /> : (
                            <>
                                <ImagePlus aria-hidden />
                                <b>上传或选择图片</b>
                                <small>点击或拖拽上传，也可以从作品里选</small>
                            </>
                        )}
                        <div className="studio-voice-sample-actions">
                            <button type="button" className="studio-mini-button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}><ImageUp aria-hidden />{image ? "换一张" : "上传图片"}</button>
                            <Popover open={historyOpen} onOpenChange={setHistoryOpen} trigger="click" arrow={false} content={(
                                <div className="studio-popup studio-world-history">
                                    <strong>从作品选择</strong>
                                    {history.isLoading ? <p className="studio-hint">正在加载…</p> : history.data?.length ? (
                                        <div className="studio-world-history-grid">
                                            {history.data.map((work) => (
                                                <button key={work.id} type="button" aria-label={work.prompt} onClick={() => { setHistoryOpen(false); void describe(studioAttachmentFromMedia(work, work.media[0])); }}>
                                                    <img src={studioMediaSrc(work.media[0])} alt="" loading="lazy" />
                                                </button>
                                            ))}
                                        </div>
                                    ) : <p className="studio-hint">还没有生成的图片。</p>}
                                </div>
                            )}>
                                <button type="button" className="studio-mini-button" disabled={Boolean(busy)}>从作品选择</button>
                            </Popover>
                            {sourceImage && !image ? <button type="button" className="studio-mini-button" disabled={Boolean(busy)} onClick={() => void describe(sourceImage)}>用已添加的参考图</button> : null}
                        </div>
                    </div>
                    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} />
                </section>
                <section className="studio-i2p-pane">
                    <strong>提示词</strong>
                    {!visionModel ? (
                        <div className="studio-i2p-empty"><ScanText aria-hidden /><span>后台还没有能看图的文本模型，暂时不能识别图片。</span></div>
                    ) : busy === "describe" ? (
                        <div className="studio-i2p-empty"><Loader2 className="studio-spin" aria-hidden /><span>正在看图写提示词…</span></div>
                    ) : result ? (
                        <Input.TextArea className="studio-i2p-result" value={result} onChange={(event) => setResult(event.target.value)} aria-label="生成的提示词" />
                    ) : (
                        <div className="studio-i2p-empty"><ScanText aria-hidden /><span>上传图片以生成提示词</span></div>
                    )}
                    <div className="studio-voice-foot">
                        {image && visionModel && !busy ? <button type="button" className="studio-mini-button" onClick={() => void describe(image)}><RefreshCw aria-hidden />重新生成</button> : null}
                        <span style={{ flex: 1 }} />
                        <button type="button" className="studio-mini-button is-primary" disabled={!result.trim() || Boolean(busy)} onClick={() => { onUse(result.trim()); onClose(); }}>使用提示词</button>
                    </div>
                </section>
            </div>
        </AppModal>
    );
}

/** 描述输入框：全屏编辑、运镜、图片转提示词、润色、清空和自动润色开关。 */
export function StudioPromptBox({ id, label, optional, value, placeholder, onChange, kind, config, maxChars, sourceImage, onOpenCamera, autoPolish, onAutoPolishChange, onSubmitShortcut }: PromptBoxProps) {
    const { message } = App.useApp();
    const [expanded, setExpanded] = useState(false);
    const [imageToPrompt, setImageToPrompt] = useState(false);
    const [enhancing, setEnhancing] = useState(false);
    const chars = Array.from(value).length;
    const hasText = Boolean(studioTextModel(config));

    const enhance = async () => {
        if (enhancing) return;
        setEnhancing(true);
        try {
            onChange(await enhanceStudioPrompt(config, kind, value));
            message.success("已润色提示词");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "处理失败，请重试");
        } finally {
            setEnhancing(false);
        }
    };

    const textarea = (big: boolean) => (
        <textarea
            id={big ? `${id}-full` : id}
            className={big ? "studio-prompt-full" : undefined}
            value={value}
            placeholder={placeholder}
            aria-label={label}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSubmitShortcut?.();
            }}
        />
    );

    return (
        <div className="studio-block studio-prompt">
            <div className="studio-block-title">
                <span>{label}{optional ? <em>可选</em> : null}</span>
                <button type="button" className="studio-icon-button is-ghost" aria-label="全屏编辑" title="全屏编辑" onClick={() => setExpanded(true)}><Maximize2 aria-hidden /></button>
            </div>
            {textarea(false)}
            <div className="studio-prompt-tools">
                {onOpenCamera ? <button type="button" className="studio-icon-button is-ghost is-accent" aria-label="镜头运动" title="镜头运动" onClick={onOpenCamera}><Camera aria-hidden /></button> : null}
                {kind !== "audio" ? <button type="button" className="studio-icon-button is-ghost" aria-label="图片转提示词" title="图片转提示词" onClick={() => setImageToPrompt(true)}><ScanText aria-hidden /></button> : null}
                <button type="button" className="studio-icon-button is-ghost" aria-label="润色提示词" title={!hasText ? "后台还没有可用的文本模型" : "润色提示词"} disabled={!value.trim() || !hasText || enhancing} onClick={() => void enhance()}>
                    {enhancing ? <Loader2 className="studio-spin" aria-hidden /> : <WandSparkles aria-hidden />}
                </button>
                <button type="button" className="studio-icon-button is-ghost" aria-label="清空" title="清空" disabled={!value} onClick={() => onChange("")}><Trash2 aria-hidden /></button>
                <span style={{ flex: 1 }} />
                {maxChars ? <span className={`studio-counter${chars > maxChars ? " is-over" : ""}`}>{chars.toLocaleString("zh-CN")} / {maxChars.toLocaleString("zh-CN")}</span> : null}
                {onAutoPolishChange ? (
                    <label className="studio-auto-polish" title={hasText ? "生成前自动润色提示词" : "后台还没有可用的文本模型"}>
                        <span>自动润色</span>
                        <Switch size="small" checked={Boolean(autoPolish) && hasText} disabled={!hasText} onChange={onAutoPolishChange} />
                    </label>
                ) : null}
            </div>
            <AppModal rootClassName="studio-modal" open={expanded} width="min(960px, calc(100vw - 32px))" title={label} footer={null} onCancel={() => setExpanded(false)}>
                <div className="studio-popup">{textarea(true)}</div>
            </AppModal>
            {kind !== "audio" ? <ImageToPromptModal open={imageToPrompt} onClose={() => setImageToPrompt(false)} kind={kind} config={config} sourceImage={sourceImage} onUse={onChange} /> : null}
        </div>
    );
}
