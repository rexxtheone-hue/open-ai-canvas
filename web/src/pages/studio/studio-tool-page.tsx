import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Popover, Switch } from "antd";
import { ArrowLeftRight, AudioLines, ChevronRight, Crop, Film, ImagePlus, ListVideo, Loader2, Mic, Music, SlidersHorizontal, Sparkles, Video, X } from "./studio-icons";
import { useSearchParams } from "react-router";

import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { VideoSettingsPanel } from "@/components/video-settings-panel";
import { CreditSymbol } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { videoModeMaterialRole, videoModeUsesMaterial } from "@/lib/video-modes";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import { resolveResourceUrl } from "@/services/api/resources";
import type { StudioKind } from "@/services/api/studio";
import { StudioLibrary } from "./studio-library";
import { StudioAssetPicker, type StudioPickerKind } from "./studio-asset-picker";
import { StudioOptionField } from "./studio-option-field";
import { StudioPromptBox } from "./studio-prompt-box";
import { StudioCameraPanel } from "./studio-camera-panel";
import { appendCameraMove, enhanceStudioPrompt, planStudioShots, studioTextModel } from "./studio-prompt-tools";
import { StudioRecorder } from "./studio-recorder";
import { StudioVoiceLibraryModal, studioVoiceAttachment, STUDIO_VOICE_KEY, type StudioVoicePick } from "./studio-voices";
import { describeStudioRegions, StudioRegionMarker, type StudioRegion } from "./studio-region-marker";
import { StudioShell } from "./studio-shell";
import { studioToolById, STUDIO_TOOLS } from "./studio-tools";
import { studioAttachmentFromMedia, uploadStudioFile, useStudioTool } from "./use-studio-tool";
import { StudioPanelFooter, StudioPanelTabs, StudioToolSwitcher } from "./studio-workspace";
import { StudioToolThumb } from "./studio-tool-thumb";
import { StudioModelCard, StudioModelPanel } from "./studio-model-panel";
import { studioImageDefaultRatio, studioImageRatioSupported, studioModelSupportsSpecialty } from "./studio-generation";
import { useStudioToolCovers } from "./use-studio-tool-meta";
import { buildSpecialtyState, defaultSpecialtyOptions, orderedSlotAttachments, ratioOfChoice, restoreSpecialtyOptions, slotAccepts, slotItems, studioSpecialtySpec, type StudioSlot, type StudioSlotValues } from "./studio-specialty";
import { STUDIO_ATTACH_KEY, STUDIO_REUSE_KEY } from "./studio-agent";
import type { StudioWork } from "@/services/api/studio";

function promptMaxChars(config: Parameters<typeof modelCapabilityConfigFor>[0], kind: StudioKind, model: string) {
    if (!model || kind === "audio") return kind === "audio" ? 10000 : 0;
    const profile = modelCapabilityConfigFor(config, model);
    return (kind === "image" ? profile.image?.references.promptMaxChars : profile.video?.references.promptMaxChars) || 0;
}

/** 配音的示例文案，点一下填进输入框。 */
const VOICE_OVER_SAMPLES = [
    { label: "播客开场", text: "欢迎收听本期节目，我是你的主持人。今天我们聊一个每个人都关心的话题：怎样在忙碌的生活里，找回属于自己的节奏。" },
    { label: "产品讲解", text: "这款保温杯采用双层真空设计，热饮保温十二小时，冷饮保冷二十四小时。一键开盖，单手就能操作，通勤、运动都方便。" },
    { label: "广告预告", text: "今年夏天，最受期待的新品终于来了。更轻、更快、更懂你。七月一日，全网首发，敬请期待。" },
    { label: "品牌故事", text: "十年前，我们在一间小小的工作室里，做出了第一件作品。那时我们只有一个信念：把每一个细节做到最好。" },
];

/** 品牌素材或风格参考图，作为图片参考加入。 */
function settingsSummary(kind: StudioKind, state: ReturnType<typeof useStudioTool>["state"]) {
    if (kind === "image") return [state.image.ratio, state.image.imageResolution !== "auto" ? state.image.imageResolution : "", state.image.quality !== "auto" ? state.image.quality : ""].filter(Boolean).join(" | ") || "默认";
    if (kind === "video") return `${state.video.ratio} | ${state.video.videoQuality.replace(/p$/i, "")}p | ${state.video.seconds}s`;
    return state.audio.voice || "默认音色";
}

function slotPickerKinds(slot: StudioSlot): StudioPickerKind[] {
    if (slot.accept === "audio") return ["audio"];
    if (slot.accept === "video") return ["video"];
    if (slot.accept === "image") return ["image", "character"];
    if (slot.accept === "audio_or_video") return ["audio", "video"];
    return ["image", "video", "character"];
}

function AttachmentPreview({ attachment }: { attachment: CreationAttachment }) {
    const attachmentKind = creationAttachmentKind(attachment);
    if (attachmentKind === "image") return <img src={attachment.previewUrl} alt={attachment.name} />;
    if (attachmentKind === "video") return <video src={attachment.previewUrl} muted playsInline preload="metadata" />;
    return <div className="studio-ref-audio"><Music aria-hidden /><span>{attachment.name}</span></div>;
}

type PickerState = { kinds: StudioPickerKind[]; initialKind: StudioPickerKind; max: number; slot?: StudioSlot; firstFrame?: boolean; title?: string };

export default function StudioToolPage({ toolId }: { toolId: string }) {
    const tool = studioToolById(toolId) || STUDIO_TOOLS[0];
    const kind = tool.kind;
    const { message } = App.useApp();
    // Studio 固定深色界面，设置面板也用深色主题。
    const theme = canvasThemes.dark;
    const specialtySpec = studioSpecialtySpec(tool.id);
    const [slotValues, setSlotValues] = useState<StudioSlotValues>({});
    const [specialtyText, setSpecialtyText] = useState("");
    const [specialtyOptions, setSpecialtyOptions] = useState<Record<string, string>>(() => (specialtySpec ? defaultSpecialtyOptions(specialtySpec) : {}));
    const [slotUploading, setSlotUploading] = useState("");
    const [regions, setRegions] = useState<StudioRegion[]>([]);
    const [regionOpen, setRegionOpen] = useState(false);
    const [recorderSlot, setRecorderSlot] = useState<StudioSlot | null>(null);
    const [shotPlan, setShotPlan] = useState("");
    const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);
    const [planning, setPlanning] = useState(false);
    const specialtyContext = useMemo(() => ({ plan: shotPlan, regions: regions.length ? describeStudioRegions(regions) : "" }), [regions, shotPlan]);
    const specialty = useMemo(() => (specialtySpec ? buildSpecialtyState(specialtySpec, slotValues, specialtyText, specialtyOptions, specialtyContext) : undefined), [slotValues, specialtyContext, specialtyOptions, specialtySpec, specialtyText]);
    const studio = useStudioTool(kind, tool.id, { specialty });
    const { state, config, resolvedModel, generationConfig, limits, overflowIds, maxCount, credits, creditsEnabled, blockReason, submitting, uploading } = studio;
    const [outputOpen, setOutputOpen] = useState(false);
    const autoPolishKey = `studio.auto-polish.${tool.id}.v1`;
    const [autoPolish, setAutoPolishState] = useState(() => {
        try {
            return window.localStorage.getItem(autoPolishKey) === "1";
        } catch {
            return false;
        }
    });
    const setAutoPolish = (value: boolean) => {
        setAutoPolishState(value);
        try {
            window.localStorage.setItem(autoPolishKey, value ? "1" : "0");
        } catch {
            // 浏览器存储不可用时只在本页生效。
        }
    };
    const [picker, setPicker] = useState<PickerState | null>(null);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [modelPanelOpen, setModelPanelOpen] = useState(false);
    const covers = useStudioToolCovers();
    const [searchParams, setSearchParams] = useSearchParams();
    const { update, applyWorkSettings, addAttachments } = studio;
    const [cameraOpen, setCameraOpen] = useState(false);
    const openPicker = (next: PickerState) => {
        setPicker(next);
        setSwitcherOpen(false);
        setModelPanelOpen(false);
        setCameraOpen(false);
    };

    // 专项工具的素材按槽位顺序提交（第一张图是主体）。
    useEffect(() => {
        if (specialtySpec) update({ attachments: orderedSlotAttachments(specialtySpec, slotValues) });
    }, [slotValues, specialtySpec, update]);

    // 框选区域属于当前素材，换素材后清空。
    const regionSource = specialtySpec?.region ? slotItems(slotValues, specialtySpec.region.slot)[0] : undefined;
    useEffect(() => setRegions([]), [regionSource?.id]);

    // 图生视频、文生视频入口：模型就绪后选好对应模式，之后用户仍可切换。
    const presetAppliedRef = useRef(false);
    const { setVideoMode, updateImage } = studio;
    useEffect(() => {
        if (!tool.presetMode || presetAppliedRef.current || !resolvedModel) return;
        presetAppliedRef.current = true;
        setVideoMode(tool.presetMode);
    }, [resolvedModel, setVideoMode, tool.presetMode]);

    const videoModeNow = state.video.mode;
    const imageCountNow = state.attachments.filter((attachment) => creationAttachmentKind(attachment) === "image").length;
    useEffect(() => {
        if (kind !== "video" || specialtySpec || tool.presetMode || !videoModeNow) return;
        if (videoModeNow !== "image_to_video" || imageCountNow === 0) setVideoMode(undefined);
    }, [imageCountNow, kind, setVideoMode, specialtySpec, tool.presetMode, videoModeNow]);

    // 固定或选定的输出比例（全景 2:1、扩图画幅）：模型支持时自动选上；不支持就回到模型默认并提示换模型，避免提交后才被拒绝。
    const optionRatio = specialtySpec?.ratioOption ? ratioOfChoice(specialtyOptions[specialtySpec.ratioOption]) : "";
    const fixedRatio = specialtySpec?.outputRatio || (optionRatio && optionRatio !== "original" ? optionRatio : "");
    const fixedRatioSupported = Boolean(fixedRatio && resolvedModel && studioImageRatioSupported(config, resolvedModel, fixedRatio));
    const ratioAppliedRef = useRef("");
    useEffect(() => {
        const key = `${resolvedModel}|${fixedRatio}`;
        if (!fixedRatio || !resolvedModel || ratioAppliedRef.current === key) return;
        ratioAppliedRef.current = key;
        if (fixedRatioSupported) updateImage({ ratio: fixedRatio });
        else if (state.image.ratio === fixedRatio) updateImage({ ratio: studioImageDefaultRatio(config, resolvedModel) });
    }, [config, fixedRatio, fixedRatioSupported, resolvedModel, state.image.ratio, updateImage]);
    const ratioMismatch = Boolean(fixedRatio && resolvedModel && !fixedRatioSupported);

    /** 放进槽位：多素材槽位追加（去重、不超过上限），单素材槽位替换。 */
    const fillSlot = useCallback((slot: StudioSlot, incoming: CreationAttachment[]) => {
        const accepted = incoming.filter((attachment) => slotAccepts(slot, attachment));
        if (accepted.length < incoming.length) {
            const label = slot.accept === "audio" ? "音频" : slot.accept === "video" ? "视频" : slot.accept === "image" ? "图片" : slot.accept === "audio_or_video" ? "音频或视频" : "图片或视频";
            message.warning(`${slot.label}需要${label}`);
        }
        if (!accepted.length) return false;
        const max = slot.max || 1;
        let dropped = 0;
        setSlotValues((current) => {
            if (max <= 1) return { ...current, [slot.key]: accepted[0] };
            const existing = slotItems(current, slot.key);
            const merged = [...existing, ...accepted.filter((item) => !existing.some((entry) => entry.id === item.id))];
            dropped = Math.max(0, merged.length - max);
            return { ...current, [slot.key]: merged.slice(0, max) };
        });
        if (dropped) message.warning(`${slot.label}最多 ${max} 个`);
        return true;
    }, [message]);
    const removeFromSlot = (slot: StudioSlot, id: string) => setSlotValues((current) => {
        const rest = slotItems(current, slot.key).filter((item) => item.id !== id);
        return { ...current, [slot.key]: (slot.max || 1) > 1 ? rest : undefined };
    });
    const uploadToSlot = async (slot: StudioSlot, files: File[]) => {
        if (!files.length) return;
        setSlotUploading(slot.key);
        const done: CreationAttachment[] = [];
        try {
            for (const file of files.slice(0, slot.max || 1)) {
                try {
                    done.push(await uploadStudioFile(file));
                } catch (cause) {
                    message.error(`${file.name} 上传失败：${cause instanceof Error ? cause.message : "未知错误"}`);
                }
            }
            if (done.length) fillSlot(slot, done);
        } finally {
            setSlotUploading("");
        }
    };
    /** 作品库「作为参考」：放进第一个类型匹配且还有空位的槽位，没有空位时替换第一个匹配的单素材槽位。 */
    const attachToSlot = useCallback((attachment: CreationAttachment) => {
        if (!specialtySpec) return false;
        const matching = specialtySpec.slots.filter((slot) => slotAccepts(slot, attachment));
        const target = matching.find((slot) => slotItems(slotValues, slot.key).length < (slot.max || 1)) || matching.find((slot) => (slot.max || 1) <= 1);
        if (!target) {
            message.warning(matching.length ? "对应的素材格已经放满" : "这个工具用不到这种素材");
            return false;
        }
        return fillSlot(target, [attachment]);
    }, [fillSlot, message, slotValues, specialtySpec]);

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
            const payload = JSON.parse(raw) as { kind?: StudioKind; attachments?: CreationAttachment[]; prompt?: string; slot?: string };
            if (payload.kind !== kind) return;
            window.sessionStorage.removeItem(STUDIO_ATTACH_KEY);
            if (payload.prompt) update({ prompt: payload.prompt });
            if (specialtySpec) {
                // 指定了格子（例如世界库「用作场景」）就直接放进那一格。
                const slot = payload.slot ? specialtySpec.slots.find((item) => item.key === payload.slot) : undefined;
                if (slot && payload.attachments?.length) fillSlot(slot, payload.attachments);
                else payload.attachments?.forEach((attachment) => attachToSlot(attachment));
                return;
            }
            const reason = payload.attachments?.length ? addAttachments(payload.attachments) : undefined;
            if (reason) message.warning(reason);
        } catch {
            // 会话存储不可用时忽略带入。
        }
    }, [addAttachments, attachToSlot, fillSlot, kind, message, resolvedModel, specialtySpec, update]);
    /** 声音库的选择：系统音色直接选上；我的声音作为参考音频复刻音色。 */
    const { updateAudio } = studio;
    const applyVoicePick = useCallback((pick: StudioVoicePick) => {
        update({ model: pick.model });
        if (pick.kind === "system") {
            updateAudio({ voice: pick.voice });
            message.success(`已选择音色：${pick.label}`);
            return;
        }
        updateAudio({ voice: "" });
        const reason = addAttachments([studioVoiceAttachment(pick.voice)]);
        if (reason) message.warning(reason);
        else message.success(`已使用「${pick.voice.name}」的声音`);
    }, [addAttachments, message, update, updateAudio]);
    useEffect(() => {
        if (kind !== "audio" || specialtySpec || !resolvedModel) return;
        try {
            const raw = window.sessionStorage.getItem(STUDIO_VOICE_KEY);
            if (!raw) return;
            window.sessionStorage.removeItem(STUDIO_VOICE_KEY);
            applyVoicePick(JSON.parse(raw) as StudioVoicePick);
        } catch {
            // 会话存储不可用时忽略。
        }
    }, [applyVoicePick, kind, resolvedModel, specialtySpec]);
    // 声音克隆用样本复刻音色，不再指定系统音色。
    useEffect(() => {
        if (tool.id === "voice-clone" && state.audio.voice) updateAudio({ voice: "" });
    }, [state.audio.voice, tool.id, updateAudio]);

    const maxChars = specialtySpec?.prompt.maxChars || promptMaxChars(config, kind, resolvedModel);
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
    const isFrameTool = !specialtySpec && tool.presetMode === "image_to_video";
    const isTextOnly = !specialtySpec && tool.presetMode === "text_to_video";
    const variantCount = specialty?.variants?.length || 0;
    const showCount = !variantCount && (kind === "image" || (kind === "video" && (!specialtySpec || Boolean(specialtySpec.count))));

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const { failures, reason } = await studio.uploadFiles(Array.from(files));
        if (failures.length) message.error(failures.join("；"));
        if (reason) message.warning(reason);
    };

    const handleGenerate = async () => {
        let polished: string | undefined;
        // 自动润色：生成前先把描述扩写一遍，写回输入框后用新描述提交；润色失败就用原描述继续。
        if (autoPolish && !specialtySpec && kind !== "audio" && state.prompt.trim() && studioTextModel(config)) {
            try {
                polished = await enhanceStudioPrompt(config, kind, state.prompt);
                studio.update({ prompt: polished });
            } catch (cause) {
                message.warning(`自动润色没成功，用原描述生成：${cause instanceof Error ? cause.message : ""}`);
            }
        }
        const result = await studio.submit(polished);
        if (result.created) {
            message.success(result.failed ? `已提交 ${result.created} 个，${result.failed} 个提交失败：${result.error}` : `已提交 ${result.created} 个生成任务`);
        } else if (result.error) {
            message.error(result.error);
        }
    };

    const previewShotPlan = async () => {
        if (!specialtySpec?.shotPlan || planning) return;
        setPlanning(true);
        try {
            const detail = specialtySpec.options?.find((option) => option.key === "detail");
            const shots = Number(detail?.choices.find((choice) => choice.value === specialtyOptions.detail)?.prompt || 5);
            setShotPlan(await planStudioShots(config, specialtyText, shots, state.video.seconds));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "生成分镜失败");
        } finally {
            setPlanning(false);
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
    const frameImages = attachmentCards.filter((card) => card.attachmentKind === "image");

    const referenceTile = (referenceKind: "image" | "video" | "audio") => {
        const label = referenceKind === "image" ? "添加图片或角色参考" : referenceKind === "video" ? "添加视频参考" : "添加音频参考";
        const kinds = [...(limits.maxImages > 0 ? (["character"] as StudioPickerKind[]) : []), ...referenceKinds];
        const max = Math.max(1, totalReferenceLimit - state.attachments.length);
        const tile = (
            <button
                key={referenceKind}
                type="button"
                className="studio-ref-slot"
                aria-disabled={uploading}
                title={label}
                aria-label={label}
                onClick={kind === "video" && referenceKind === "image" ? undefined : () => openPicker({ kinds, initialKind: referenceKind, max })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    void handleFiles(event.dataTransfer.files);
                }}
            >
                {referenceKind === "image" ? <ImagePlus aria-hidden /> : referenceKind === "video" ? <Film aria-hidden /> : <AudioLines aria-hidden />}
            </button>
        );
        // 视频的图片参考：OpenArt 式二选一——当作参考，或设为首帧。
        if (kind !== "video" || referenceKind !== "image") return tile;
        return (
            <Popover
                key={referenceKind}
                trigger="click"
                placement="bottomLeft"
                arrow={false}
                content={(
                    <div className="studio-popup studio-option-list">
                        <button type="button" className="studio-option-item is-rich" onClick={() => openPicker({ kinds, initialKind: "image", max })}>
                            <span><b>添加图片或角色参考</b><small>用参考引导视频内容</small></span>
                        </button>
                        <button type="button" className="studio-option-item is-rich" onClick={() => openPicker({ kinds: ["image", "character"], initialKind: "image", max: 1, firstFrame: true, title: "设为首帧" })}>
                            <span><b>设为首帧</b><small>用这张图作为视频的第一帧</small></span>
                        </button>
                    </div>
                )}
            >
                {tile}
            </Popover>
        );
    };

    return (
        <StudioShell title="创作" subtitle={tool.label}>
            <div className="studio-workspace">
                <section className="studio-left-panel" aria-label={`${tool.label}参数`}>
                    <StudioPanelTabs />
                    <div className="studio-left-scroll studio-panel-scroll">
                        <button type="button" className="studio-tool-hero" aria-label={`切换工具（当前：${tool.label}）`} aria-expanded={switcherOpen} onClick={() => { setSwitcherOpen((value) => !value); setModelPanelOpen(false); }}>
                            <StudioToolThumb tool={tool} cover={covers[tool.id]} size={48} />
                            <span className="studio-tool-hero-text"><strong>{tool.label}</strong><small>{tool.description}</small></span>
                            <ChevronRight aria-hidden />
                        </button>
                        <StudioModelCard config={config} model={resolvedModel || state.model} open={modelPanelOpen} onToggle={() => { setModelPanelOpen((value) => !value); setSwitcherOpen(false); }} />

                        {specialtySpec?.slots.length ? (
                            <div className="studio-block">
                                <div className="studio-slot-grid">
                                    {specialtySpec.slots.map((slot) => {
                                        const items = slotItems(slotValues, slot.key);
                                        const max = slot.max || 1;
                                        const busy = slotUploading === slot.key;
                                        const isRegionSlot = specialtySpec.region?.slot === slot.key;
                                        return (
                                            <div key={slot.key} className={`studio-slot${max > 1 ? " is-multi" : ""}`}>
                                                <span className="studio-slot-label">
                                                    {slot.label}{slot.required ? <b aria-hidden>*</b> : <em>可选</em>}
                                                    {max > 1 ? <em className="studio-slot-count">{items.length}/{max}</em> : null}
                                                </span>
                                                <div className={max > 1 ? "studio-slot-items" : undefined}>
                                                    {items.map((item) => (
                                                        <div key={item.id} className="studio-ref-slot is-filled" title={item.name}>
                                                            <AttachmentPreview attachment={item} />
                                                            <button type="button" className="studio-ref-remove" aria-label={`移除 ${slot.label}`} onClick={() => removeFromSlot(slot, item.id)}><X aria-hidden /></button>
                                                        </div>
                                                    ))}
                                                    {items.length < max ? (
                                                        <button
                                                            type="button"
                                                            className="studio-ref-slot"
                                                            aria-disabled={busy}
                                                            aria-label={`添加${slot.label}`}
                                                            onClick={() => openPicker({ kinds: slotPickerKinds(slot), initialKind: slotPickerKinds(slot)[0], max: max - items.length, slot })}
                                                            onDragOver={(event) => event.preventDefault()}
                                                            onDrop={(event) => {
                                                                event.preventDefault();
                                                                void uploadToSlot(slot, Array.from(event.dataTransfer.files || []));
                                                            }}
                                                        >
                                                            {busy ? <Loader2 className="studio-spin" aria-hidden /> : slot.accept === "audio" || slot.accept === "audio_or_video" ? <AudioLines aria-hidden /> : slot.accept === "video" ? <Film aria-hidden /> : <ImagePlus aria-hidden />}
                                                            {max <= 1 || !items.length ? <small>{busy ? "正在上传…" : slot.hint}</small> : null}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {slot.constraint ? <small className="studio-slot-constraint">{slot.constraint}</small> : null}
                                                {slot.record || (isRegionSlot && items.length) ? (
                                                    <div className="studio-slot-actions">
                                                        {slot.record ? (
                                                            <button type="button" className="studio-mini-button" onClick={() => setRecorderSlot(slot)}>
                                                                {slot.record === "video" ? <Video aria-hidden /> : <Mic aria-hidden />}{slot.record === "video" ? "录制视频" : "录制音频"}
                                                            </button>
                                                        ) : null}
                                                        {isRegionSlot && items.length ? (
                                                            <button type="button" className="studio-mini-button" onClick={() => setRegionOpen(true)}>
                                                                <Crop aria-hidden />{specialtySpec.region!.label}{regions.length ? ` · ${regions.length}` : ""}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="studio-hint">点格子从作品、上传或角色库选择，也可以把文件拖进格子。</p>
                            </div>
                        ) : isFrameTool && limits.maxImages > 0 ? (
                            <div className="studio-block">
                                <div className="studio-block-title">首尾帧</div>
                                <div className="studio-frame-pair">
                                    {[0, 1].map((index) => {
                                        const card = frameImages[index];
                                        const label = index === 0 ? "首帧" : "尾帧";
                                        return (
                                            <div key={index} className="studio-slot">
                                                <span className="studio-slot-label">{label}{index === 0 ? <b aria-hidden>*</b> : <em>可选</em>}</span>
                                                {card ? (
                                                    <div className="studio-ref-slot is-filled" title={card.attachment.name}>
                                                        <AttachmentPreview attachment={card.attachment} />
                                                        <button
                                                            type="button"
                                                            className="studio-ref-remove"
                                                            aria-label={`移除${label}`}
                                                            onClick={() => {
                                                                studio.removeAttachment(card.attachment.id);
                                                                if (frameImages.length === 2) setVideoMode("image_to_video");
                                                            }}
                                                        ><X aria-hidden /></button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="studio-ref-slot"
                                                        disabled={index === 1 && (!frameImages.length || limits.maxImages < 2)}
                                                        title={index === 1 && limits.maxImages < 2 ? "当前模型不支持尾帧" : undefined}
                                                        aria-label={`添加${label}`}
                                                        onClick={() => openPicker({ kinds: ["image", "character"], initialKind: "image", max: 1, title: `添加${label}` })}
                                                    >
                                                        <ImagePlus aria-hidden />
                                                        <small>{index === 0 ? "添加首帧" : "添加尾帧"}</small>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <button type="button" className="studio-icon-button studio-frame-swap" aria-label="交换首尾帧" title="交换首尾帧" disabled={frameImages.length < 2} onClick={studio.swapFirstImages}><ArrowLeftRight aria-hidden /></button>
                                </div>
                            </div>
                        ) : !isTextOnly && totalReferenceLimit > 0 ? (
                            <div className="studio-block">
                                <div className="studio-block-title">添加参考 <em>可选</em></div>
                                <div className="studio-ref-grid">
                                    {attachmentCards.map(({ attachment, isUsed, role }) => (
                                        <div key={attachment.id} className={`studio-ref-slot is-filled${isUsed ? "" : " is-unused"}`} title={isUsed ? attachment.name : "当前模型或模式不使用这个素材，生成时不会发送"}>
                                            <AttachmentPreview attachment={attachment} />
                                            {role ? <span className="studio-ref-role">{role}</span> : null}
                                            <button type="button" className="studio-ref-remove" aria-label={`移除 ${attachment.name}`} onClick={() => studio.removeAttachment(attachment.id)}><X aria-hidden /></button>
                                        </div>
                                    ))}
                                    {referenceKinds.map((referenceKind) => referenceTile(referenceKind))}
                                </div>
                                <p className="studio-hint">
                                    {uploading ? "正在上传…" : `当前模型最多：${[limits.maxImages ? `${limits.maxImages} 张图片` : "", limits.maxVideos ? `${limits.maxVideos} 段视频` : "", limits.maxAudios ? `${limits.maxAudios} 段音频` : ""].filter(Boolean).join("、")}`}
                                </p>
                                {overflowIds.size ? <p className="studio-hint is-warn">有 {overflowIds.size} 个素材超出当前模型上限，生成时不会发送。</p> : null}
                                {kind === "video" && state.video.mode === "image_to_video" && attachmentCounts.imageCount > 0 ? (
                                    <p className="studio-hint">当前：第一张图作为首帧。<button type="button" className="studio-block-link" onClick={() => setVideoMode(undefined)}>改为参考图</button></p>
                                ) : null}
                            </div>
                        ) : null}

                        <StudioPromptBox
                            id={`studio-prompt-${tool.id}`}
                            label={specialtySpec ? specialtySpec.prompt.label : kind === "audio" ? "配音文案" : kind === "video" ? "描述你的视频" : "描述你的图片"}
                            optional={Boolean(specialtySpec && !specialtySpec.prompt.required)}
                            value={specialtySpec ? specialtyText : state.prompt}
                            placeholder={specialtySpec ? specialtySpec.prompt.placeholder : kind === "audio" ? "输入要朗读的文案" : kind === "video" ? "描述画面、动作、镜头和声音。可以写清楚怎么使用参考素材。" : "描述你想要的画面，例如：清晨阳光下，桌上的一杯咖啡，暖色调。"}
                            onChange={(value) => (specialtySpec ? setSpecialtyText(value) : studio.update({ prompt: value }))}
                            kind={kind}
                            config={config}
                            maxChars={maxChars || undefined}
                            sourceImage={state.attachments.find((attachment) => creationAttachmentKind(attachment) === "image")}
                            onOpenCamera={kind === "video" && (!specialtySpec || Boolean(specialtySpec.shotPlan)) ? () => { setCameraOpen(true); setPicker(null); setSwitcherOpen(false); setModelPanelOpen(false); } : undefined}
                            autoPolish={autoPolish}
                            onAutoPolishChange={!specialtySpec && kind !== "audio" ? setAutoPolish : undefined}
                            onSubmitShortcut={() => {
                                if (!blockReason && !submitting) void handleGenerate();
                            }}
                        />

                        {specialtySpec?.promptChips?.length || (!specialtySpec && kind === "audio") ? (
                            <div className="studio-chip-list is-compact" role="group" aria-label="快捷标签">
                                {(specialtySpec?.promptChips || VOICE_OVER_SAMPLES.map((sample) => ({ label: sample.label, text: sample.text, mode: "replace" as const }))).map((chip) => (
                                    <button
                                        key={chip.label}
                                        type="button"
                                        onClick={() => {
                                            const current = specialtySpec ? specialtyText : state.prompt;
                                            const next = chip.mode === "replace" ? chip.text : current.includes(chip.text) ? current : [current.trim(), chip.text].filter(Boolean).join(current.trim() ? "，" : "");
                                            if (specialtySpec) setSpecialtyText(next);
                                            else studio.update({ prompt: next });
                                        }}
                                    >{chip.label}</button>
                                ))}
                            </div>
                        ) : null}

                        {specialtySpec?.shotPlan ? (
                            <div className="studio-block">
                                <div className="studio-block-title">
                                    <span>分镜 <em>可选，可直接修改</em></span>
                                    {shotPlan ? <button type="button" className="studio-block-link" onClick={() => setShotPlan("")}>清除</button> : null}
                                </div>
                                {shotPlan ? (
                                    <textarea className="studio-shot-plan" value={shotPlan} aria-label="分镜" onChange={(event) => setShotPlan(event.target.value)} />
                                ) : <p className="studio-hint">点下方「预览分镜」先看拆分好的镜头，满意后再生成视频；不预览也可以直接生成。</p>}
                            </div>
                        ) : null}

                        {specialtySpec?.options?.map((option) => (
                            <StudioOptionField key={option.key} option={option} value={specialtyOptions[option.key] ?? ""} onChange={(value) => setSpecialtyOptions((current) => ({ ...current, [option.key]: value }))} />
                        ))}

                        {kind === "audio" ? (
                            specialtySpec ? null : (
                                <div className="studio-block">
                                    <div className="studio-block-title">声音<button type="button" className="studio-block-link" onClick={() => setVoiceLibraryOpen(true)}>声音库</button></div>
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
                            )
                        ) : (
                            <>
                                <div className="studio-output-row">
                                {kind === "video" && (!specialtySpec || specialtySpec.shotPlan) && videoProfile?.generateAudio.supported ? (
                                    <label className="studio-row-button studio-audio-card" htmlFor={`studio-audio-${tool.id}`}>
                                        <AudioLines aria-hidden />
                                        <span><small>音频</small><b>{state.video.generateAudio ? "开" : "关"}</b></span>
                                        <Switch id={`studio-audio-${tool.id}`} checked={state.video.generateAudio} onChange={(checked) => studio.updateVideo({ generateAudio: checked })} />
                                    </label>
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
                                                hideGenerateAudio={Boolean(videoProfile?.generateAudio.supported) && (!specialtySpec || Boolean(specialtySpec.shotPlan))}
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
                                </div>
                            </>
                        )}
                    </div>
                    <div className="studio-panel-footer">
                        {ratioMismatch ? <p className="studio-hint is-warn">当前模型不支持 {fixedRatio} 画幅，会用模型默认比例生成，建议换一个支持 {fixedRatio} 的模型。</p> : null}
                        {variantCount ? <p className="studio-hint">将分别生成 {variantCount} 个结果，每个单独计费。</p> : null}
                        <div className="studio-generate-row">
                            {showCount ? (
                                <div className="studio-stepper" role="group" aria-label="生成数量">
                                    <button type="button" aria-label="减少数量" disabled={state.count <= 1} onClick={() => studio.update({ count: Math.max(1, state.count - 1) })}>−</button>
                                    <span>{Math.min(state.count, maxCount)} / {maxCount}</span>
                                    <button type="button" aria-label="增加数量" disabled={state.count >= maxCount} onClick={() => studio.update({ count: Math.min(maxCount, state.count + 1) })}>+</button>
                                </div>
                            ) : null}
                            {specialtySpec?.shotPlan ? (
                                <button type="button" className="studio-generate-button is-secondary" disabled={planning || !specialtyText.trim() || !studioTextModel(config)} title={!studioTextModel(config) ? "后台还没有可用的文本模型" : undefined} onClick={() => void previewShotPlan()}>
                                    {planning ? <Loader2 className="studio-spin" aria-hidden /> : <ListVideo aria-hidden />}
                                    {planning ? "生成中…" : "预览分镜"}
                                </button>
                            ) : null}
                            <button type="button" className="studio-generate-button" disabled={Boolean(blockReason) || submitting || uploading || Boolean(slotUploading)} onClick={() => void handleGenerate()}>
                                <Sparkles aria-hidden />
                                {submitting ? "提交中…" : specialtySpec?.shotPlan ? "生成视频" : "生成"}
                                {creditsEnabled && credits !== null ? <span className="studio-cost"><CreditSymbol />{credits.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</span> : null}
                            </button>
                        </div>
                        <p className="studio-block-reason" role="status">
                            {blockReason ? (
                                blockReason.startsWith("积分不足") ? <>{blockReason}，<button type="button" onClick={() => openWorkspaceWallet()}>去充值</button></> : blockReason
                            ) : studio.creditsEstimated ? "价格为预估值，以实际结算为准" : ""}
                        </p>
                    </div>
                    <StudioPanelFooter />
                </section>
                <div className="studio-right-panel">
                {switcherOpen ? <StudioToolSwitcher toolId={tool.id} onClose={() => setSwitcherOpen(false)} /> : null}
                <StudioCameraPanel
                    open={cameraOpen}
                    prompt={specialtySpec ? specialtyText : state.prompt}
                    onClose={() => setCameraOpen(false)}
                    onPick={(move) => {
                        if (specialtySpec) setSpecialtyText((current) => appendCameraMove(current, move.prompt));
                        else update({ prompt: appendCameraMove(state.prompt, move.prompt) });
                        message.success(`已加入运镜：${move.label}`);
                    }}
                />
                <StudioAssetPicker
                    open={Boolean(picker)}
                    kinds={picker?.kinds || ["image"]}
                    initialKind={picker?.initialKind}
                    max={picker?.max || 1}
                    title={picker?.title || (picker?.slot ? `选择${picker.slot.label}` : "添加参考")}
                    onClose={() => setPicker(null)}
                    onPick={(items) => {
                        if (picker?.slot) {
                            fillSlot(picker.slot, items);
                            return;
                        }
                        const reason = studio.addAttachments(items);
                        if (reason) message.warning(reason);
                        if (reason || !items[0]) return;
                        if (picker?.firstFrame) {
                            studio.moveAttachmentFirst(items[0].id);
                            setVideoMode("image_to_video");
                        } else if (isFrameTool && frameImages.length === 1) {
                            setVideoMode("first_last_frame");
                        }
                    }}
                />
                {modelPanelOpen ? (
                    <StudioModelPanel
                        config={config}
                        kind={kind}
                        value={state.model}
                        requirements={studio.requirements}
                        filter={(model) => studioModelSupportsSpecialty(config, model, specialty)}
                        onChange={(model) => studio.update({ model })}
                        onClose={() => setModelPanelOpen(false)}
                    />
                ) : null}
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
            </div>
            {recorderSlot ? (
                <StudioRecorder
                    open
                    kind={recorderSlot.record || "audio"}
                    maxSeconds={recorderSlot.record === "video" ? 30 : 90}
                    onClose={() => setRecorderSlot(null)}
                    onDone={(file) => void uploadToSlot(recorderSlot, [file])}
                />
            ) : null}
            {kind === "audio" && !specialtySpec ? (
                <StudioVoiceLibraryModal open={voiceLibraryOpen} config={config} onClose={() => setVoiceLibraryOpen(false)} onPick={applyVoicePick} />
            ) : null}
            {specialtySpec?.region && regionSource ? (
                <StudioRegionMarker
                    open={regionOpen}
                    title={specialtySpec.region.label}
                    hint={specialtySpec.region.hint}
                    src={regionSource.previewUrl || regionSource.url || ""}
                    mediaKind={creationAttachmentKind(regionSource) === "video" ? "video" : "image"}
                    value={regions}
                    onChange={setRegions}
                    onClose={() => setRegionOpen(false)}
                />
            ) : null}
        </StudioShell>
    );
}
