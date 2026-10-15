import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Popover, Switch } from "antd";
import { AudioLines, ChevronLeft, ChevronRight, Film, ImagePlus, Music, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { VideoSettingsPanel } from "@/components/video-settings-panel";
import { CreditSymbol } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { VIDEO_MODES, videoModeMaterialRole, videoModeUnavailableReason, videoModeUsesMaterial } from "@/lib/video-modes";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import { resolveResourceUrl } from "@/services/api/resources";
import type { StudioKind } from "@/services/api/studio";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { StudioLibrary } from "./studio-library";
import { StudioShell } from "./studio-shell";
import { studioToolById, STUDIO_TOOLS } from "./studio-tools";
import { studioAttachmentFromMedia, uploadStudioFile, useStudioTool } from "./use-studio-tool";
import { buildSpecialtyState, defaultSpecialtyOptions, orderedSlotAttachments, restoreSpecialtyOptions, slotAcceptAttribute, slotAccepts, studioSpecialtySpec, type StudioSlot, type StudioSlotValues } from "./studio-specialty";
import { STUDIO_ATTACH_KEY, STUDIO_REUSE_KEY } from "./studio-agent";
import type { StudioBrandKit, StudioWork } from "@/services/api/studio";

const KIND_TABS: Array<{ kind: StudioKind; label: string; path: string }> = [
    { kind: "video", label: "视频", path: "/studio/create-video" },
    { kind: "image", label: "图片", path: "/studio/create-image" },
    { kind: "audio", label: "音频", path: "/studio/create-audio" },
];

function promptMaxChars(config: Parameters<typeof modelCapabilityConfigFor>[0], kind: StudioKind, model: string) {
    if (!model || kind === "audio") return kind === "audio" ? 10000 : 0;
    const profile = modelCapabilityConfigFor(config, model);
    return (kind === "image" ? profile.image?.references.promptMaxChars : profile.video?.references.promptMaxChars) || 0;
}

/** 品牌 Logo 作为一张图片参考，和上传的图片走同一套上限检查。 */
export function studioBrandLogoAttachment(kit: StudioBrandKit): CreationAttachment | undefined {
    if (!kit.logoResourceId) return undefined;
    const storageKey = `resource:${kit.logoResourceId}`;
    const url = resolveResourceUrl(storageKey, kit.logoUrl || "");
    return { id: `brand-logo:${kit.id}:${kit.logoResourceId}`, name: `${kit.name} Logo`, type: "image/png", dataUrl: url, url, storageKey, previewUrl: url };
}

function settingsSummary(kind: StudioKind, state: ReturnType<typeof useStudioTool>["state"]) {
    if (kind === "image") return [state.image.ratio, state.image.imageResolution !== "auto" ? state.image.imageResolution : "", state.image.quality !== "auto" ? state.image.quality : ""].filter(Boolean).join(" | ") || "默认";
    if (kind === "video") return `${state.video.ratio} | ${state.video.videoQuality.replace(/p$/i, "")}p | ${state.video.seconds}s`;
    return state.audio.voice || "默认音色";
}

export default function StudioToolPage({ toolId }: { toolId: string }) {
    const tool = studioToolById(toolId) || STUDIO_TOOLS[0];
    const kind = tool.kind;
    const { message } = App.useApp();
    const theme = canvasThemes[useActiveTheme()] ?? canvasThemes.dark;
    const specialtySpec = studioSpecialtySpec(tool.id);
    const [slotValues, setSlotValues] = useState<StudioSlotValues>({});
    const [specialtyText, setSpecialtyText] = useState("");
    const [specialtyOptions, setSpecialtyOptions] = useState<Record<string, string>>(() => (specialtySpec ? defaultSpecialtyOptions(specialtySpec) : {}));
    const [slotUploading, setSlotUploading] = useState("");
    const specialty = useMemo(() => (specialtySpec ? buildSpecialtyState(specialtySpec, slotValues, specialtyText, specialtyOptions) : undefined), [slotValues, specialtyOptions, specialtySpec, specialtyText]);
    const studio = useStudioTool(kind, tool.id, { specialty, brand: !specialtySpec });
    const { state, config, resolvedModel, generationConfig, limits, overflowIds, maxCount, credits, creditsEnabled, blockReason, submitting, uploading } = studio;
    const [outputOpen, setOutputOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const { update, applyWorkSettings, addAttachments } = studio;

    // 专项工具的素材按槽位顺序提交（第一张图是主体）。
    useEffect(() => {
        if (specialtySpec) update({ attachments: orderedSlotAttachments(specialtySpec, slotValues) });
    }, [slotValues, specialtySpec, update]);

    const fillSlot = (slot: StudioSlot, attachment: CreationAttachment) => {
        if (!slotAccepts(slot, attachment)) {
            message.warning(`${slot.label}需要${slot.accept === "audio" ? "音频" : slot.accept === "video" ? "视频" : slot.accept === "image" ? "图片" : "图片或视频"}`);
            return false;
        }
        setSlotValues((current) => ({ ...current, [slot.key]: attachment }));
        return true;
    };
    const uploadToSlot = async (slot: StudioSlot, file: File | undefined) => {
        if (!file) return;
        setSlotUploading(slot.key);
        try {
            fillSlot(slot, await uploadStudioFile(file));
        } catch (cause) {
            message.error(`${file.name} 上传失败：${cause instanceof Error ? cause.message : "未知错误"}`);
        } finally {
            setSlotUploading("");
        }
    };
    /** 作品库「作为参考」：放进第一个类型匹配的空槽位，没有空位时替换第一个匹配的槽位。 */
    const attachToSlot = useCallback((attachment: CreationAttachment) => {
        if (!specialtySpec) return false;
        const matching = specialtySpec.slots.filter((slot) => slotAccepts(slot, attachment));
        const target = matching.find((slot) => !slotValues[slot.key]) || matching[0];
        if (!target) {
            message.warning("这个工具用不到这种素材");
            return false;
        }
        setSlotValues((current) => ({ ...current, [target.key]: attachment }));
        return true;
    }, [message, slotValues, specialtySpec]);

    // 首页「可用模型」带着 ?model= 进入时选中该模型；素材页「再生成」通过会话存储带入作品设置。
    useEffect(() => {
        const model = searchParams.get("model");
        if (model) {
            update({ model });
            const next = new URLSearchParams(searchParams);
            next.delete("model");
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams, update]);
    useEffect(() => {
        try {
            const raw = window.sessionStorage.getItem(STUDIO_REUSE_KEY);
            if (!raw) return;
            window.sessionStorage.removeItem(STUDIO_REUSE_KEY);
            const work = JSON.parse(raw) as StudioWork;
            if (work.kind !== kind) return;
            applyWorkSettings(work);
            if (specialtySpec) {
                setSpecialtyText(typeof work.settings?.userPrompt === "string" ? work.settings.userPrompt : "");
                setSpecialtyOptions(restoreSpecialtyOptions(specialtySpec, work.settings?.specialtyOptions));
            }
        } catch {
            // 会话存储不可用时忽略带入。
        }
    }, [applyWorkSettings, kind, specialtySpec]);
    // 模型能力加载后再带入素材，才能按当前模型上限检查。
    useEffect(() => {
        if (!resolvedModel) return;
        try {
            const raw = window.sessionStorage.getItem(STUDIO_ATTACH_KEY);
            if (!raw) return;
            const payload = JSON.parse(raw) as { kind?: StudioKind; attachments?: CreationAttachment[]; prompt?: string };
            if (payload.kind !== kind) return;
            window.sessionStorage.removeItem(STUDIO_ATTACH_KEY);
            if (payload.prompt) update({ prompt: payload.prompt });
            if (specialtySpec) {
                payload.attachments?.forEach((attachment) => attachToSlot(attachment));
                return;
            }
            const reason = payload.attachments?.length ? addAttachments(payload.attachments) : undefined;
            if (reason) message.warning(reason);
        } catch {
            // 会话存储不可用时忽略带入。
        }
    }, [addAttachments, attachToSlot, kind, message, resolvedModel, specialtySpec, update]);
    const maxChars = promptMaxChars(config, kind, resolvedModel);
    const promptChars = Array.from(state.prompt).length;
    const videoProfile = kind === "video" && resolvedModel ? modelCapabilityConfigFor(config, resolvedModel).video : undefined;
    const attachmentCounts = { imageCount: 0, videoCount: 0, audioCount: 0 };
    for (const attachment of state.attachments) {
        const attachmentKind = creationAttachmentKind(attachment);
        if (attachmentKind === "image") attachmentCounts.imageCount += 1;
        else if (attachmentKind === "video") attachmentCounts.videoCount += 1;
        else if (attachmentKind === "audio") attachmentCounts.audioCount += 1;
    }
    const referenceKinds = (["image", "video", "audio"] as const).filter((item) => (item === "image" ? limits.maxImages : item === "video" ? limits.maxVideos : limits.maxAudios) > 0);
    const totalReferenceLimit = limits.maxImages + limits.maxVideos + limits.maxAudios;

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const { failures, reason } = await studio.uploadFiles(Array.from(files));
        if (failures.length) message.error(failures.join("；"));
        if (reason) message.warning(reason);
    };

    const handleGenerate = async () => {
        const result = await studio.submit();
        if (result.created) {
            message.success(result.failed ? `已提交 ${result.created} 个，${result.failed} 个提交失败：${result.error}` : `已提交 ${result.created} 个生成任务`);
        } else if (result.error) {
            message.error(result.error);
        }
    };

    const used = (attachment: CreationAttachment, kindIndex: number) => {
        if (overflowIds.has(attachment.id)) return false;
        const attachmentKind = creationAttachmentKind(attachment);
        if (kind !== "video" || attachmentKind === "file") return true;
        return videoModeUsesMaterial(state.video.mode, attachmentKind, kindIndex);
    };

    const seenByKind = { image: 0, video: 0, audio: 0, file: 0 };
    const attachmentCards = state.attachments.map((attachment) => {
        const attachmentKind = creationAttachmentKind(attachment);
        const index = seenByKind[attachmentKind]++;
        const isUsed = used(attachment, index);
        const role = kind === "video" && attachmentKind !== "file" ? videoModeMaterialRole(state.video.mode, attachmentKind, index) : undefined;
        return { attachment, attachmentKind, isUsed, role };
    });

    return (
        <StudioShell title={tool.label}>
            <div className="studio-tool">
                <section className="studio-panel" aria-label={`${tool.label}参数`}>
                    <div className="studio-panel-scroll">
                        {specialtySpec ? (
                            <Link to="/studio/tools" className="studio-back-link"><ChevronLeft aria-hidden />全部工具</Link>
                        ) : (
                            <nav className="studio-kind-tabs" aria-label="生成类型">
                                {KIND_TABS.map((tab) => (
                                    <Link key={tab.kind} to={tab.path} aria-current={tab.kind === kind ? "page" : undefined}>{tab.label}</Link>
                                ))}
                            </nav>
                        )}
                        <div className="studio-tool-header">
                            <tool.icon aria-hidden />
                            <div><strong>{tool.label}</strong><span>{tool.description}</span></div>
                        </div>
                        <div className="studio-block">
                            <div className="studio-block-title">模型</div>
                            <ModelPicker
                                config={config}
                                value={state.model}
                                onChange={(model) => studio.update({ model })}
                                capability={kind}
                                requirements={studio.requirements}
                                fullWidth
                                variant="creation"
                                placeholder="选择模型"
                            />
                        </div>

                        {specialtySpec ? (
                            <div className="studio-block">
                                <div className="studio-block-title">素材</div>
                                <div className="studio-slot-grid">
                                    {specialtySpec.slots.map((slot) => {
                                        const value = slotValues[slot.key];
                                        const valueKind = value ? creationAttachmentKind(value) : undefined;
                                        const busy = slotUploading === slot.key;
                                        return (
                                            <div key={slot.key} className="studio-slot">
                                                <span className="studio-slot-label">{slot.label}{slot.required ? <b aria-hidden>*</b> : <em>可选</em>}</span>
                                                {value ? (
                                                    <div className="studio-ref-slot is-filled" title={value.name}>
                                                        {valueKind === "image" ? <img src={value.previewUrl} alt={value.name} /> : valueKind === "video" ? <video src={value.previewUrl} muted playsInline preload="metadata" /> : <div className="studio-ref-audio"><Music aria-hidden /><span>{value.name}</span></div>}
                                                        <button type="button" className="studio-ref-remove" aria-label={`移除 ${slot.label}`} onClick={() => setSlotValues((current) => ({ ...current, [slot.key]: undefined }))}><X aria-hidden /></button>
                                                    </div>
                                                ) : (
                                                    <label className="studio-ref-slot" aria-disabled={busy}>
                                                        {slot.accept === "audio" ? <AudioLines aria-hidden /> : slot.accept === "video" ? <Film aria-hidden /> : <ImagePlus aria-hidden />}
                                                        <small>{busy ? "正在上传…" : slot.hint}</small>
                                                        <input
                                                            id={`studio-slot-${tool.id}-${slot.key}`}
                                                            type="file"
                                                            className="sr-only"
                                                            disabled={busy}
                                                            aria-label={`上传${slot.label}`}
                                                            accept={slotAcceptAttribute(slot)}
                                                            onChange={(event) => {
                                                                void uploadToSlot(slot, event.target.files?.[0]);
                                                                event.target.value = "";
                                                            }}
                                                        />
                                                    </label>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="studio-hint">也可以在右边作品库点「作为参考」直接放进来。</p>
                            </div>
                        ) : totalReferenceLimit > 0 ? (
                            <div className="studio-block">
                                <div className="studio-block-title">参考素材 <em>可选</em></div>
                                <div className="studio-ref-grid">
                                    {attachmentCards.map(({ attachment, attachmentKind, isUsed, role }) => (
                                        <div key={attachment.id} className={`studio-ref-slot is-filled${isUsed ? "" : " is-unused"}`} title={isUsed ? attachment.name : "当前模型或模式不使用这个素材，生成时不会发送"}>
                                            {attachmentKind === "image" ? <img src={attachment.previewUrl} alt={attachment.name} /> : attachmentKind === "video" ? <video src={attachment.previewUrl} muted playsInline preload="metadata" /> : <div className="studio-ref-audio"><Music aria-hidden /><span>{attachment.name}</span></div>}
                                            {role ? <span className="studio-ref-role">{role}</span> : null}
                                            <button type="button" className="studio-ref-remove" aria-label={`移除 ${attachment.name}`} onClick={() => studio.removeAttachment(attachment.id)}><X aria-hidden /></button>
                                        </div>
                                    ))}
                                    {referenceKinds.map((referenceKind) => (
                                        <label key={referenceKind} className="studio-ref-slot" aria-disabled={uploading} title={referenceKind === "image" ? "添加图片参考" : referenceKind === "video" ? "添加视频参考" : "添加音频参考"}>
                                            {referenceKind === "image" ? <ImagePlus aria-hidden /> : referenceKind === "video" ? <Film aria-hidden /> : <AudioLines aria-hidden />}
                                            <input
                                                id={`studio-upload-${tool.id}-${referenceKind}`}
                                                type="file"
                                                className="sr-only"
                                                multiple
                                                disabled={uploading}
                                                aria-label={referenceKind === "image" ? "添加图片参考" : referenceKind === "video" ? "添加视频参考" : "添加音频参考"}
                                                accept={referenceKind === "image" ? "image/png,image/jpeg,image/webp" : referenceKind === "video" ? "video/mp4,video/quicktime,video/webm" : "audio/mpeg,audio/wav,audio/x-wav,audio/mp4"}
                                                onChange={(event) => {
                                                    void handleFiles(event.target.files);
                                                    event.target.value = "";
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <p className="studio-hint">
                                    {uploading ? "正在上传…" : `当前模型最多：${[limits.maxImages ? `${limits.maxImages} 张图片` : "", limits.maxVideos ? `${limits.maxVideos} 段视频` : "", limits.maxAudios ? `${limits.maxAudios} 段音频` : ""].filter(Boolean).join("、")}`}
                                </p>
                                {overflowIds.size ? <p className="studio-hint is-warn">有 {overflowIds.size} 个素材超出当前模型上限，生成时不会发送。</p> : null}
                            </div>
                        ) : null}

                        {specialtySpec?.options?.map((option) => (
                            <div key={option.key} className="studio-block">
                                <div className="studio-block-title">{option.label}</div>
                                <div className="studio-chip-list" role="group" aria-label={option.label}>
                                    {option.choices.map((choice) => (
                                        <button key={choice.value} type="button" aria-pressed={specialtyOptions[option.key] === choice.value} onClick={() => setSpecialtyOptions((current) => ({ ...current, [option.key]: choice.value }))}>{choice.label}</button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {kind === "video" && !specialtySpec ? (
                            <div className="studio-block">
                                <div className="studio-block-title">生成模式 <em>{state.video.mode ? "手动选择" : "按素材自动判断"}</em></div>
                                <div className="studio-mode-list" role="group" aria-label="视频生成模式">
                                    {VIDEO_MODES.map((mode) => {
                                        const reason = videoModeUnavailableReason(videoProfile, mode.value, attachmentCounts);
                                        const selected = state.video.mode === mode.value || (!state.video.mode && studio.effectiveVideoMode === mode.value);
                                        return (
                                            <button key={mode.value} type="button" aria-pressed={selected} disabled={Boolean(reason) && state.video.mode !== mode.value} title={reason || mode.description} onClick={() => studio.setVideoMode(state.video.mode === mode.value ? undefined : mode.value)}>
                                                {mode.label}
                                                <small>{reason || mode.description}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                                {state.video.mode ? <button type="button" className="studio-mini-button" onClick={() => studio.setVideoMode(undefined)}>改回自动判断</button> : null}
                            </div>
                        ) : null}

                        <div className="studio-block studio-prompt">
                            <div className="studio-block-title">{specialtySpec ? specialtySpec.prompt.label : kind === "audio" ? "配音文案" : kind === "video" ? "描述你的视频" : "描述你的图片"}{specialtySpec && !specialtySpec.prompt.required ? <em>可选</em> : null}</div>
                            <textarea
                                id={`studio-prompt-${tool.id}`}
                                value={specialtySpec ? specialtyText : state.prompt}
                                placeholder={specialtySpec ? specialtySpec.prompt.placeholder : kind === "audio" ? "输入要朗读的文案" : kind === "video" ? "描述画面、动作、镜头和声音。可以写清楚怎么使用参考素材。" : "描述你想要的画面，例如：清晨阳光下，桌上的一杯咖啡，暖色调。"}
                                aria-label={specialtySpec ? specialtySpec.prompt.label : kind === "audio" ? "配音文案" : "提示词"}
                                onChange={(event) => (specialtySpec ? setSpecialtyText(event.target.value) : studio.update({ prompt: event.target.value }))}
                                onKeyDown={(event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !blockReason && !submitting) void handleGenerate();
                                }}
                            />
                            <div className="studio-prompt-tools">
                                <button type="button" className="studio-mini-button" disabled={specialtySpec ? !specialtyText : !state.prompt} onClick={() => (specialtySpec ? setSpecialtyText("") : studio.update({ prompt: "" }))}><Trash2 aria-hidden />清空</button>
                                {maxChars ? <span className={`studio-counter${promptChars > maxChars ? " is-over" : ""}`}>{promptChars.toLocaleString("zh-CN")} / {maxChars.toLocaleString("zh-CN")}</span> : null}
                            </div>
                        </div>

                        {kind !== "audio" && !specialtySpec ? (
                            <div className="studio-block">
                                <div className="studio-block-title">品牌 <em>可选</em><Link to="/studio/brand" className="studio-block-link">管理</Link></div>
                                <select
                                    className="studio-select"
                                    aria-label="品牌套件"
                                    value={studio.brandKit?.id || ""}
                                    onChange={(event) => studio.setBrandChoice(event.target.value)}
                                >
                                    <option value="">不使用品牌</option>
                                    {studio.brandKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.isDefault ? "（默认）" : ""}</option>)}
                                </select>
                                {studio.brandKit ? (
                                    <>
                                        <p className="studio-hint">品牌介绍、调性、品牌色等会追加在提示词后发送。</p>
                                        {studio.brandKit.logoResourceId && limits.maxImages > 0 ? (
                                            <button
                                                type="button"
                                                className="studio-mini-button"
                                                onClick={() => {
                                                    const logo = studioBrandLogoAttachment(studio.brandKit!);
                                                    const reason = logo ? studio.addAttachments([logo]) : undefined;
                                                    if (reason) message.warning(reason);
                                                    else message.success("已加入参考素材");
                                                }}
                                            >
                                                <ImagePlus aria-hidden />加入 Logo 参考
                                            </button>
                                        ) : null}
                                    </>
                                ) : !studio.brandKits.length ? <p className="studio-hint">还没有品牌套件，<Link to="/studio/brand">去创建</Link>。</p> : null}
                            </div>
                        ) : null}

                        {kind === "audio" ? (
                            <div className="studio-block">
                                <div className="studio-block-title">声音</div>
                                <AudioSettingsPanel
                                    config={generationConfig}
                                    theme={theme}
                                    showTitle={false}
                                    className="space-y-4"
                                    onConfigChange={(key, value) => {
                                        if (key === "audioVoice") studio.updateAudio({ voice: value });
                                        else if (key === "audioFormat") studio.updateAudio({ format: value });
                                        else if (key === "audioSpeed") studio.updateAudio({ speed: value });
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                {kind === "video" && !specialtySpec && videoProfile?.generateAudio.supported ? (
                                    <div className="studio-block">
                                        <label className="studio-switch-row" htmlFor={`studio-audio-${tool.id}`}>
                                            <span>同步生成声音</span>
                                            <Switch id={`studio-audio-${tool.id}`} checked={state.video.generateAudio} onChange={(checked) => studio.updateVideo({ generateAudio: checked })} />
                                        </label>
                                    </div>
                                ) : null}
                                <Popover
                                    open={outputOpen}
                                    onOpenChange={setOutputOpen}
                                    trigger="click"
                                    placement="right"
                                    arrow={false}
                                    content={
                                        kind === "image" ? (
                                            <ImageSettingsPanel
                                                config={generationConfig}
                                                theme={theme}
                                                showCount={false}
                                                showTransparent={false}
                                                onConfigChange={(key, value) => {
                                                    if (key === "size") studio.updateImage({ ratio: value });
                                                    else if (key === "quality") studio.updateImage({ quality: value });
                                                    else if (key === "imageResolution") studio.updateImage({ imageResolution: value });
                                                    else if (key === "imageParameters") studio.updateImage({ imageParameters: value });
                                                }}
                                            />
                                        ) : (
                                            <VideoSettingsPanel
                                                config={generationConfig}
                                                theme={theme}
                                                onConfigChange={(key, value) => {
                                                    if (key === "size") studio.updateVideo({ ratio: value });
                                                    else if (key === "vquality") studio.updateVideo({ videoQuality: value.replace(/p$/i, "") });
                                                    else if (key === "videoSeconds") studio.updateVideo({ seconds: value });
                                                    else if (key === "videoGenerateAudio") studio.updateVideo({ generateAudio: value === "true" });
                                                }}
                                            />
                                        )
                                    }
                                >
                                    <button type="button" className="studio-row-button" aria-label="输出设置">
                                        <SlidersHorizontal aria-hidden />
                                        <span><small>输出</small><b>{settingsSummary(kind, state)}</b></span>
                                        <ChevronRight aria-hidden />
                                    </button>
                                </Popover>
                            </>
                        )}
                    </div>
                    <div className="studio-panel-footer">
                        <div className="studio-generate-row">
                            {kind === "image" ? (
                                <div className="studio-stepper" role="group" aria-label="生成数量">
                                    <button type="button" aria-label="减少数量" disabled={state.count <= 1} onClick={() => studio.update({ count: Math.max(1, state.count - 1) })}>−</button>
                                    <span>{Math.min(state.count, maxCount)} / {maxCount}</span>
                                    <button type="button" aria-label="增加数量" disabled={state.count >= maxCount} onClick={() => studio.update({ count: Math.min(maxCount, state.count + 1) })}>+</button>
                                </div>
                            ) : null}
                            <button type="button" className="studio-generate-button" disabled={Boolean(blockReason) || submitting || uploading || Boolean(slotUploading)} onClick={() => void handleGenerate()}>
                                <Sparkles aria-hidden />
                                {submitting ? "提交中…" : "生成"}
                                {creditsEnabled && credits !== null ? <span className="studio-cost"><CreditSymbol />{credits.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</span> : null}
                            </button>
                        </div>
                        <p className="studio-block-reason" role="status">
                            {blockReason ? (
                                blockReason.startsWith("积分不足") ? <>{blockReason}，<button type="button" onClick={() => openWorkspaceWallet()}>去充值</button></> : blockReason
                            ) : studio.creditsEstimated ? "价格为预估值，以实际结算为准" : ""}
                        </p>
                    </div>
                </section>
                <StudioLibrary
                    kind={kind}
                    onUseAsReference={specialtySpec ? (work, media) => {
                        if (attachToSlot(studioAttachmentFromMedia(work, media))) message.success("已加入参考素材");
                    } : totalReferenceLimit > 0 ? (work, media) => {
                        const reason = studio.addAttachments([studioAttachmentFromMedia(work, media)]);
                        if (reason) message.warning(reason);
                        else message.success("已加入参考素材");
                    } : undefined}
                    onReuseSettings={(work) => {
                        studio.applyWorkSettings(work);
                        if (specialtySpec) {
                            setSpecialtyText(typeof work.settings?.userPrompt === "string" ? work.settings.userPrompt : "");
                            setSpecialtyOptions(restoreSpecialtyOptions(specialtySpec, work.settings?.specialtyOptions));
                        }
                        message.success("已填入这个作品的提示词和设置");
                    }}
                />
            </div>
        </StudioShell>
    );
}
