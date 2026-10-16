import { useEffect, useMemo, useRef, useState } from "react";
import { App, Input, Select, Switch } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AudioLines, Check, Mic, Pause, Pencil, Play, Plus, Search, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { audioVoiceOptionsForConfig, isDoubaoAudioConfig } from "@/lib/audio-generation";
import type { CreationAttachment } from "@/pages/create/creation-assets";
import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { listStudioWorks } from "@/services/api/studio";
import { createStudioVoice, deleteStudioVoice, listStudioVoices, markStudioVoiceUsed, renameStudioVoice, type StudioVoice, type StudioVoiceSource } from "@/services/api/studio-agents";
import { modelDisplayName, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { StudioRecorder } from "./studio-recorder";
import { uploadStudioFile } from "./use-studio-tool";

/** 从声音库跳到配音页时带上的选择。 */
export const STUDIO_VOICE_KEY = "studio.voice.pick.v1";

export type StudioVoicePick = { kind: "system"; model: string; voice: string; label: string } | { kind: "mine"; model: string; voice: StudioVoice };

const SAMPLE_MIN_SECONDS = 3;
const SAMPLE_MAX_SECONDS = 60;
const SAMPLE_ACCEPT = ".mp3,.wav,.m4a,.flac,.aac,.webm,audio/*";

/** 我的声音转成配音的参考音频（复刻音色）。 */
export function studioVoiceAttachment(voice: StudioVoice): CreationAttachment {
    const storageKey = `resource:${voice.resourceId}`;
    const url = resolveResourceUrl(storageKey, "");
    return { id: `voice:${voice.id}`, name: voice.name, type: voice.mimeType || "audio/mpeg", url, storageKey, durationMs: voice.durationMs, previewUrl: url };
}

/** 能用参考音频复刻音色的配音模型（目前是豆包流式语音）。 */
export function studioCloneVoiceModel(config: AiConfig) {
    return selectableModelsByCapability(config, "audio").find((model) => isDoubaoAudioConfig({ ...config, model, audioModel: model })) || "";
}

type SystemVoice = { key: string; model: string; modelLabel: string; value: string; label: string; language: string; scene: string; gender: "female" | "male" | "" };

/** 系统音色：每种配音接口取第一个可用模型，列出它的音色。 */
export function studioSystemVoices(config: AiConfig): SystemVoice[] {
    const seenFamily = new Set<string>();
    const voices: SystemVoice[] = [];
    for (const model of selectableModelsByCapability(config, "audio")) {
        const modelConfig = { ...config, model, audioModel: model };
        const family = isDoubaoAudioConfig(modelConfig) ? "doubao" : "openai";
        if (seenFamily.has(family)) continue;
        seenFamily.add(family);
        for (const option of audioVoiceOptionsForConfig(modelConfig) as Array<{ value: string; label: string; language?: string; scene?: string }>) {
            const gender = /_female_|female/i.test(option.value) ? "female" : /_male_/i.test(option.value) ? "male" : "";
            voices.push({ key: `${model}|${option.value}`, model, modelLabel: modelDisplayName(config, model), value: option.value, label: option.label, language: option.language || "", scene: option.scene || "", gender });
        }
    }
    return voices;
}

function formatDuration(ms?: number) {
    if (!ms) return "";
    const seconds = Math.round(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function defaultRecordingName() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `录音 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 读取音频时长（秒），读不到时返回 0。 */
function audioSeconds(file: File) {
    return new Promise<number>((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        const done = (value: number) => {
            URL.revokeObjectURL(url);
            resolve(Number.isFinite(value) ? value : 0);
        };
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
            // webm 录音的时长要跳到末尾才能读出来。
            if (audio.duration === Infinity) {
                audio.currentTime = 1e7;
                audio.ontimeupdate = () => done(audio.duration);
            } else done(audio.duration);
        };
        audio.onerror = () => done(0);
        audio.src = url;
    });
}

function useVoicesChanged() {
    const queryClient = useQueryClient();
    return () => void queryClient.invalidateQueries({ queryKey: ["studio", "voices"] });
}

export function useStudioVoices(enabled = true) {
    return useQuery({ queryKey: ["studio", "voices"], queryFn: async ({ signal }) => (await listStudioVoices(signal)).items, enabled });
}

/** 一行里的试听按钮：同一时间只播放一个。 */
function PlayButton({ src, playing, onToggle }: { src: string; playing: boolean; onToggle: () => void }) {
    return (
        <button type="button" className="studio-voice-play" aria-label={playing ? "暂停" : "试听"} disabled={!src} onClick={onToggle}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
    );
}

type CreateProps = { open: boolean; onClose: () => void; onCreated?: (voice: StudioVoice) => void };

/** 创建声音：录音或上传一段人声建立「我的声音」，或用文字描述设计声音。 */
export function StudioCreateVoiceModal({ open, onClose, onCreated }: CreateProps) {
    const { message } = App.useApp();
    const refresh = useVoicesChanged();
    const [step, setStep] = useState<"choose" | "clone" | "design">("choose");
    const [name, setName] = useState(defaultRecordingName);
    const [sample, setSample] = useState<{ file: File; source: StudioVoiceSource; seconds: number } | null>(null);
    const [sampleUrl, setSampleUrl] = useState("");
    const [recording, setRecording] = useState(false);
    const [saving, setSaving] = useState(false);
    const [description, setDescription] = useState("");
    const [previews, setPreviews] = useState(1);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setStep("choose");
        setName(defaultRecordingName());
        setSample(null);
        setDescription("");
        setPreviews(1);
    }, [open]);

    useEffect(() => {
        if (!sample) {
            setSampleUrl("");
            return;
        }
        const url = URL.createObjectURL(sample.file);
        setSampleUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [sample]);

    const takeSample = async (file: File, source: StudioVoiceSource) => {
        if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|flac|aac|webm)$/i.test(file.name)) {
            message.warning("请选择音频文件");
            return;
        }
        const seconds = await audioSeconds(file);
        setSample({ file, source, seconds });
        if (source === "upload" && name.startsWith("录音 ")) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 120));
    };

    const sampleError = !sample ? "先录一段或上传一段声音" : sample.seconds && sample.seconds < SAMPLE_MIN_SECONDS ? `样本太短，至少 ${SAMPLE_MIN_SECONDS} 秒` : sample.seconds > SAMPLE_MAX_SECONDS ? `样本太长，最多 ${SAMPLE_MAX_SECONDS} 秒` : !name.trim() ? "请填写声音名称" : "";

    const save = async () => {
        if (!sample || sampleError || saving) return;
        setSaving(true);
        try {
            const attachment = await uploadStudioFile(sample.file);
            const resourceId = resourceIdFromStorageKey(attachment.storageKey);
            if (!resourceId) throw new Error("样本上传后没有拿到资源编号");
            const voice = await createStudioVoice({ name: name.trim(), source: sample.source, resourceId });
            refresh();
            message.success("已加入我的声音");
            onCreated?.(voice);
            onClose();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败，请重试");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(560px, calc(100vw - 32px))" title={null} footer={null} onCancel={onClose}>
            <div className="studio-popup studio-voice-create">
                {step === "choose" ? (
                    <>
                        <h3>创建声音</h3>
                        <p className="studio-hint">建立可以反复使用的声音，用在角色和项目里。</p>
                        <button type="button" className="studio-voice-choice" onClick={() => setStep("clone")}>
                            <Mic aria-hidden />
                            <span><b>克隆你的声音</b><small>用一段录音或音频文件复刻声音</small></span>
                        </button>
                        <button type="button" className="studio-voice-choice" onClick={() => setStep("design")}>
                            <Wand2 aria-hidden />
                            <span><b>设计声音</b><small>用一段文字描述生成声音</small></span>
                        </button>
                    </>
                ) : step === "clone" ? (
                    <>
                        <h3><button type="button" className="studio-icon-button is-ghost" aria-label="返回" onClick={() => setStep("choose")}><ArrowLeft aria-hidden /></button>录制或上传声音</h3>
                        <label className="studio-field">
                            <span>名称</span>
                            <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-label="声音名称" />
                        </label>
                        <div className="studio-voice-sample">
                            {sample ? (
                                <>
                                    <audio src={sampleUrl} controls />
                                    <small>{sample.source === "record" ? "录音" : sample.file.name}{sample.seconds ? ` · ${Math.round(sample.seconds)} 秒` : ""}</small>
                                </>
                            ) : <p className="studio-hint">朗读一段 {SAMPLE_MIN_SECONDS}–{SAMPLE_MAX_SECONDS} 秒的话，环境安静、只有一个人说话，效果最好。</p>}
                            <div className="studio-voice-sample-actions">
                                <button type="button" className="studio-mini-button" onClick={() => setRecording(true)}><Mic aria-hidden />{sample?.source === "record" ? "重新录音" : "开始录音"}</button>
                                <button type="button" className="studio-mini-button" onClick={() => fileRef.current?.click()}><Upload aria-hidden />上传音频</button>
                            </div>
                            <small className="studio-slot-constraint">支持 MP3、WAV、M4A、FLAC、AAC、WEBM，{SAMPLE_MIN_SECONDS}–{SAMPLE_MAX_SECONDS} 秒</small>
                        </div>
                        <p className="studio-hint">配音时选择这个声音，会用支持参考音频的模型复刻它的音色。</p>
                        <div className="studio-voice-foot">
                            <span className="studio-hint is-warn">{sample ? sampleError : ""}</span>
                            <button type="button" className="studio-mini-button" onClick={() => setStep("choose")}>返回</button>
                            <button type="button" className="studio-mini-button is-primary" disabled={Boolean(sampleError) || saving} onClick={() => void save()}>{saving ? "保存中…" : "克隆声音"}</button>
                        </div>
                        <input ref={fileRef} type="file" hidden accept={SAMPLE_ACCEPT} onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void takeSample(file, "upload");
                        }} />
                        <StudioRecorder open={recording} kind="audio" maxSeconds={SAMPLE_MAX_SECONDS} onClose={() => setRecording(false)} onDone={(file) => void takeSample(file, "record")} />
                    </>
                ) : (
                    <>
                        <h3><button type="button" className="studio-icon-button is-ghost" aria-label="返回" onClick={() => setStep("choose")}><ArrowLeft aria-hidden /></button>设计声音</h3>
                        <Input.TextArea value={description} maxLength={500} showCount autoSize={{ minRows: 4, maxRows: 8 }} placeholder="例如：英国老绅士，声音沉稳、清晰、让人放松。" onChange={(event) => setDescription(event.target.value)} aria-label="声音描述" />
                        <div className="studio-voice-foot">
                            <div className="studio-stepper is-small" role="group" aria-label="试听数量">
                                <button type="button" aria-label="减少数量" disabled={previews <= 1} onClick={() => setPreviews((value) => Math.max(1, value - 1))}>−</button>
                                <span>{previews} / 4</span>
                                <button type="button" aria-label="增加数量" disabled={previews >= 4} onClick={() => setPreviews((value) => Math.min(4, value + 1))}>+</button>
                            </div>
                            <span style={{ flex: 1 }} />
                            <button type="button" className="studio-mini-button is-primary" disabled title="后台还没有支持「声音设计」的模型"><Sparkles aria-hidden />生成试听</button>
                        </div>
                        <p className="studio-block-reason">后台还没有支持「声音设计」的模型，请管理员在模型能力里开启。现在可以先用「克隆你的声音」。</p>
                    </>
                )}
            </div>
        </AppModal>
    );
}

type LibraryProps = { open: boolean; onClose: () => void; config: AiConfig; onPick: (pick: StudioVoicePick) => void };

/** 声音库：我的声音（录音、上传）和系统音色，可以试听、改名、删除、使用。 */
export function StudioVoiceLibraryModal({ open, onClose, config, onPick }: LibraryProps) {
    const { message, modal } = App.useApp();
    const refresh = useVoicesChanged();
    const [tab, setTab] = useState<"mine" | "system">("mine");
    const [source, setSource] = useState<"all" | "design" | StudioVoiceSource>("all");
    const [usedOnly, setUsedOnly] = useState(false);
    const [query, setQuery] = useState("");
    const [language, setLanguage] = useState("");
    const [gender, setGender] = useState("");
    const [scene, setScene] = useState("");
    const [playing, setPlaying] = useState("");
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const voicesQuery = useStudioVoices(open);
    const usedQuery = useQuery({
        queryKey: ["studio", "voices-used"],
        queryFn: async ({ signal }) => (await listStudioWorks({ kind: "audio", pageSize: 100 }, signal)).works.map((work) => String(work.settings?.audioVoice || "")).filter(Boolean),
        enabled: open && usedOnly && tab === "system",
    });
    const systemVoices = useMemo(() => studioSystemVoices(config), [config]);
    const cloneModel = studioCloneVoiceModel(config);

    useEffect(() => () => audioRef.current?.pause(), []);
    useEffect(() => {
        if (!open) {
            audioRef.current?.pause();
            setPlaying("");
        }
    }, [open]);

    const toggle = (id: string, src: string) => {
        if (playing === id) {
            audioRef.current?.pause();
            setPlaying("");
            return;
        }
        audioRef.current?.pause();
        const audio = new Audio(src);
        audio.onended = () => setPlaying("");
        audioRef.current = audio;
        void audio.play().then(() => setPlaying(id)).catch(() => message.error("无法播放这段声音"));
    };

    const mine = (voicesQuery.data || []).filter((voice) => (source === "all" || voice.source === source) && (!usedOnly || voice.lastUsedAt) && (!query.trim() || voice.name.toLowerCase().includes(query.trim().toLowerCase())));
    const used = new Set(usedQuery.data || []);
    const system = systemVoices.filter((voice) => (!language || voice.language.includes(language)) && (!gender || voice.gender === gender) && (!scene || voice.scene === scene) && (!usedOnly || used.has(voice.value)) && (!query.trim() || `${voice.label} ${voice.value}`.toLowerCase().includes(query.trim().toLowerCase())));
    const languages = [...new Set(systemVoices.flatMap((voice) => voice.language.split("、")).filter(Boolean))];
    const scenes = [...new Set(systemVoices.map((voice) => voice.scene).filter(Boolean))];

    const pickMine = (voice: StudioVoice) => {
        if (!cloneModel) {
            message.warning("后台还没有支持参考音频的配音模型，暂时不能用这个声音配音");
            return;
        }
        void markStudioVoiceUsed(voice.id).then(refresh).catch(() => undefined);
        onPick({ kind: "mine", model: cloneModel, voice });
        onClose();
    };

    const remove = (voice: StudioVoice) => {
        modal.confirm({
            title: `删除「${voice.name}」？`,
            content: "删除后不能恢复，已经生成的配音不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            rootClassName: "studio-modal",
            onOk: async () => {
                await deleteStudioVoice(voice.id);
                refresh();
            },
        });
    };

    const saveRename = async () => {
        if (!renaming) return;
        try {
            await renameStudioVoice(renaming.id, renaming.name);
            refresh();
            setRenaming(null);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "改名失败");
        }
    };

    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(860px, calc(100vw - 32px))" title="声音库" footer={null} onCancel={onClose}>
            <div className="studio-popup studio-voice-library">
                <div className="studio-voice-toolbar">
                    <div className="studio-picker-kinds" role="tablist" aria-label="声音来源">
                        <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}><AudioLines aria-hidden /><span>我的声音</span></button>
                        <button type="button" role="tab" aria-selected={tab === "system"} onClick={() => setTab("system")}><Sparkles aria-hidden /><span>系统音色</span></button>
                    </div>
                    <label className="studio-switch-row is-inline"><span>只看用过的</span><Switch size="small" checked={usedOnly} onChange={setUsedOnly} /></label>
                </div>
                <div className="studio-voice-filters">
                    <Input allowClear prefix={<Search aria-hidden size={14} />} placeholder="搜索" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索声音" />
                    {tab === "mine" ? (
                        <div className="studio-picker-sources" role="tablist" aria-label="声音类型">
                            {([["all", "全部"], ["design", "设计"], ["upload", "上传"], ["record", "录音"]] as const).map(([value, label]) => (
                                <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)}>{label}</button>
                            ))}
                        </div>
                    ) : (
                        <>
                            <Select value={language} onChange={setLanguage} aria-label="语言" options={[{ value: "", label: "全部语言" }, ...languages.map((item) => ({ value: item, label: item }))]} popupMatchSelectWidth={false} />
                            <Select value={gender} onChange={setGender} aria-label="性别" options={[{ value: "", label: "全部性别" }, { value: "female", label: "女声" }, { value: "male", label: "男声" }]} />
                            <Select value={scene} onChange={setScene} aria-label="场景" options={[{ value: "", label: "全部场景" }, ...scenes.map((item) => ({ value: item, label: item }))]} popupMatchSelectWidth={false} />
                        </>
                    )}
                </div>
                <div className="studio-voice-list">
                    {tab === "mine" ? (
                        voicesQuery.isLoading ? <p className="studio-hint">正在加载…</p> : mine.length ? mine.map((voice) => {
                            const src = resolveResourceUrl(`resource:${voice.resourceId}`, "");
                            return (
                                <div key={voice.id} className="studio-voice-row">
                                    <PlayButton src={src} playing={playing === voice.id} onToggle={() => toggle(voice.id, src)} />
                                    <span className="studio-voice-name">
                                        {renaming?.id === voice.id ? (
                                            <Input size="small" autoFocus maxLength={120} value={renaming.name} onChange={(event) => setRenaming({ id: voice.id, name: event.target.value })} onPressEnter={() => void saveRename()} onBlur={() => void saveRename()} aria-label="新名称" />
                                        ) : <b>{voice.name}</b>}
                                        <small>{voice.source === "record" ? "录音" : "上传"}{voice.durationMs ? ` · ${formatDuration(voice.durationMs)}` : ""}</small>
                                    </span>
                                    <button type="button" className="studio-icon-button is-ghost" aria-label={`改名 ${voice.name}`} title="改名" onClick={() => setRenaming({ id: voice.id, name: voice.name })}><Pencil aria-hidden /></button>
                                    <button type="button" className="studio-icon-button is-ghost" aria-label={`删除 ${voice.name}`} title="删除" onClick={() => remove(voice)}><Trash2 aria-hidden /></button>
                                    <button type="button" className="studio-mini-button is-primary" onClick={() => pickMine(voice)}><Check aria-hidden />使用</button>
                                </div>
                            );
                        }) : (
                            <div className="studio-voice-empty">
                                <p>{source === "design" ? "用文字设计的声音会出现在这里。" : usedOnly ? "还没有用过的声音。" : "这里还什么都没有。"}</p>
                                <button type="button" className="studio-mini-button is-primary" onClick={() => setCreateOpen(true)}><Plus aria-hidden />去创建</button>
                            </div>
                        )
                    ) : system.length ? system.map((voice) => (
                        <div key={voice.key} className="studio-voice-row">
                            <span className="studio-voice-avatar" data-gender={voice.gender}>{voice.label.slice(0, 1)}</span>
                            <span className="studio-voice-name">
                                <b>{voice.label}</b>
                                <small>{[voice.language, voice.gender === "female" ? "女声" : voice.gender === "male" ? "男声" : "", voice.scene, voice.modelLabel].filter(Boolean).join(" · ")}</small>
                            </span>
                            <button type="button" className="studio-mini-button is-primary" onClick={() => { onPick({ kind: "system", model: voice.model, voice: voice.value, label: voice.label }); onClose(); }}><Check aria-hidden />使用</button>
                        </div>
                    )) : <div className="studio-voice-empty"><p>{systemVoices.length ? "没有符合条件的音色。" : "后台还没有可用的配音模型。"}</p></div>}
                </div>
            </div>
            <StudioCreateVoiceModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => setTab("mine")} />
        </AppModal>
    );
}
