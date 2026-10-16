import { useState } from "react";
import { App, Popover, Switch } from "antd";
import { Camera, ImageUp, Loader2, Maximize2, Trash2, WandSparkles } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import type { CreationAttachment } from "@/pages/create/creation-assets";
import type { StudioKind } from "@/services/api/studio";
import type { AiConfig } from "@/stores/use-config-store";
import { appendCameraMove, CAMERA_MOVES, enhanceStudioPrompt, promptFromImage, studioTextModel } from "./studio-prompt-tools";

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
    /** 「看图写提示词」用的图片（首帧或第一张参考图）；为空时按钮置灰。 */
    sourceImage?: CreationAttachment;
    /** 视频才显示运镜。 */
    cameraMoves?: boolean;
    autoPolish?: boolean;
    onAutoPolishChange?: (value: boolean) => void;
    onSubmitShortcut?: () => void;
};

/** 描述输入框：全屏编辑、运镜、看图写提示词、润色、清空和自动润色开关。 */
export function StudioPromptBox({ id, label, optional, value, placeholder, onChange, kind, config, maxChars, sourceImage, cameraMoves, autoPolish, onAutoPolishChange, onSubmitShortcut }: PromptBoxProps) {
    const { message } = App.useApp();
    const [expanded, setExpanded] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [busy, setBusy] = useState<"" | "enhance" | "describe">("");
    const chars = Array.from(value).length;
    const hasText = Boolean(studioTextModel(config));
    const hasVision = Boolean(studioTextModel(config, true));

    const run = async (task: "enhance" | "describe") => {
        if (busy) return;
        setBusy(task);
        try {
            const next = task === "enhance" ? await enhanceStudioPrompt(config, kind, value) : await promptFromImage(config, kind, sourceImage!, value);
            onChange(next);
            message.success(task === "enhance" ? "已润色提示词" : "已根据图片写好提示词");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "处理失败，请重试");
        } finally {
            setBusy("");
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
                {cameraMoves ? (
                    <Popover
                        open={cameraOpen}
                        onOpenChange={setCameraOpen}
                        trigger="click"
                        placement="topLeft"
                        arrow={false}
                        content={(
                            <div className="studio-popup studio-camera-moves">
                                <strong>运镜</strong>
                                <div>
                                    {CAMERA_MOVES.map((move) => (
                                        <button key={move.value} type="button" onClick={() => { onChange(appendCameraMove(value, move.prompt)); setCameraOpen(false); }}>{move.label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    >
                        <button type="button" className="studio-icon-button is-ghost" aria-label="添加运镜" title="添加运镜"><Camera aria-hidden /></button>
                    </Popover>
                ) : null}
                <button type="button" className="studio-icon-button is-ghost" aria-label="看图写提示词" title={!sourceImage ? "先添加一张图片" : !hasVision ? "后台还没有能看图的文本模型" : "看图写提示词"} disabled={!sourceImage || !hasVision || Boolean(busy)} onClick={() => void run("describe")}>
                    {busy === "describe" ? <Loader2 className="studio-spin" aria-hidden /> : <ImageUp aria-hidden />}
                </button>
                <button type="button" className="studio-icon-button is-ghost" aria-label="润色提示词" title={!hasText ? "后台还没有可用的文本模型" : "润色提示词"} disabled={!value.trim() || !hasText || Boolean(busy)} onClick={() => void run("enhance")}>
                    {busy === "enhance" ? <Loader2 className="studio-spin" aria-hidden /> : <WandSparkles aria-hidden />}
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
        </div>
    );
}
