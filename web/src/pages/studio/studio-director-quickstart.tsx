import { useMemo, useState } from "react";
import { App } from "antd";
import { Link } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Loader2, Music, Plus, Sparkles, X } from "./studio-icons";
import { StudioCharacterGrid, useStudioCharacters } from "./studio-character-picker";
import { DIRECTOR_DURATIONS, DIRECTOR_RATIOS, type DirectorBrief, type DirectorMusic, type DirectorReference, type DirectorRunMode } from "./studio-director";
import { quickStartError, quickStartTitle, type QuickStartField, type QuickStartValues, type StudioQuickStart } from "./studio-quickstarts";
import { uploadStudioFile } from "./use-studio-tool";

export type QuickStartSubmit = { title: string; brief: DirectorBrief; kickoff: string; music?: DirectorMusic };

type Props = {
    config: StudioQuickStart | null;
    runMode: DirectorRunMode;
    starting: boolean;
    /** 角色库「交给 AI 导演」带进来的角色。 */
    initialCharacterIds?: string[];
    brandKitId?: string;
    onClose: () => void;
    onSubmit: (value: QuickStartSubmit) => void;
};

function errorText(cause: unknown, fallback: string) {
    return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** 快速开始表单：按类型显示不同的问题，提交时写成交给导演的第一条消息。 */
export function StudioQuickStartModal({ config, ...rest }: Props) {
    if (!config) return null;
    return <QuickStartForm key={config.genre} config={config} {...rest} />;
}

function QuickStartForm({ config, runMode, starting, initialCharacterIds = [], brandKitId, onClose, onSubmit }: Props & { config: StudioQuickStart }) {
    const { message } = App.useApp();
    const charactersQuery = useStudioCharacters();
    const library = useMemo(() => charactersQuery.data || [], [charactersQuery.data]);
    const [text, setText] = useState<Record<string, string>>({});
    const [refs, setRefs] = useState<Record<string, DirectorReference[]>>({});
    const [castIds, setCastIds] = useState<Record<string, string[]>>(() => {
        const field = config.fields.find((item) => item.kind === "characters");
        return field && initialCharacterIds.length ? { [field.key]: initialCharacterIds.slice(0, field.kind === "characters" ? field.max : 1) } : {};
    });
    const [described, setDescribed] = useState<Record<string, string>>({});
    const [uploading, setUploading] = useState("");
    const [ratio, setRatio] = useState(config.ratio);
    const [duration, setDuration] = useState(config.durationSeconds);

    const values: QuickStartValues = useMemo(() => ({
        text,
        refs,
        cast: Object.fromEntries(config.fields.filter((field) => field.kind === "characters").map((field) => [field.key, {
            names: library.filter((item) => (castIds[field.key] || []).includes(item.id)).map((item) => item.name),
            described: described[field.key] || "",
        }])),
        durationSeconds: duration,
        ratio,
    }), [castIds, config.fields, described, duration, library, ratio, refs, text]);
    const error = quickStartError(config, values);

    const upload = async (field: Extract<QuickStartField, { kind: "images" | "song" }>, files: File[]) => {
        const max = field.kind === "song" ? 1 : field.max;
        const existing = field.kind === "song" ? [] : refs[field.key] || [];
        const room = max - existing.length;
        if (room <= 0) {
            message.warning(`最多 ${max} ${field.kind === "song" ? "首" : "张"}`);
            return;
        }
        if (files.length > room) message.warning(`最多 ${max} 张，只添加前 ${room} 张`);
        setUploading(field.key);
        try {
            const added: DirectorReference[] = [];
            for (const file of files.slice(0, room)) {
                const item = await uploadStudioFile(file);
                if (!("url" in item) || !item.url) throw new Error(`${file.name} 上传失败`);
                const kind = field.kind === "song" ? "audio" : "image";
                if (!item.type.startsWith(kind === "audio" ? "audio/" : "image/")) throw new Error(`${file.name} 不是${kind === "audio" ? "音频" : "图片"}`);
                added.push({
                    label: "",
                    kind,
                    name: file.name,
                    type: item.type,
                    url: item.url,
                    ...(item.storageKey ? { storageKey: item.storageKey } : {}),
                    ...("width" in item && item.width ? { width: item.width } : {}),
                    ...("height" in item && item.height ? { height: item.height } : {}),
                    ...("durationMs" in item && item.durationMs ? { durationMs: item.durationMs } : {}),
                });
            }
            setRefs((current) => {
                const list = [...(field.kind === "song" ? [] : current[field.key] || []), ...added];
                return { ...current, [field.key]: list.map((item, index) => ({ ...item, label: field.kind === "song" ? "歌曲" : field.max === 1 ? field.refLabel : `${field.refLabel}${index + 1}` })) };
            });
        } catch (cause) {
            message.error(errorText(cause, "上传失败"));
        } finally {
            setUploading("");
        }
    };

    const removeRef = (field: Extract<QuickStartField, { kind: "images" | "song" }>, index: number) => setRefs((current) => {
        const list = (current[field.key] || []).filter((_, at) => at !== index);
        return { ...current, [field.key]: list.map((item, at) => ({ ...item, label: field.kind === "song" ? "歌曲" : field.max === 1 ? field.refLabel : `${field.refLabel}${at + 1}` })) };
    });

    const submit = () => {
        if (error) {
            message.warning(error);
            return;
        }
        const references = Object.values(refs).flat();
        const song = references.find((item) => item.kind === "audio");
        const style = config.styleKey ? (text[config.styleKey] || "").trim() : "";
        const brief: DirectorBrief = {
            genre: config.genre,
            subject: quickStartTitle(config, values),
            points: "",
            durationSeconds: duration,
            ratio,
            style,
            voiceover: config.voiceover !== false,
            subtitles: config.subtitles !== false,
            music: true,
            characterIds: [...new Set(Object.values(castIds).flat())],
            ...(brandKitId ? { brandKitId } : {}),
            references,
        };
        onSubmit({
            title: quickStartTitle(config, values),
            brief,
            kickoff: config.buildPrompt(values),
            ...(song?.storageKey?.startsWith("resource:") ? { music: { storageKey: song.storageKey, durationMs: song.durationMs, name: song.name } } : {}),
        });
    };

    const fieldNode = (field: QuickStartField) => {
        if (field.kind === "text" || field.kind === "textarea") {
            const current = text[field.key] || "";
            return (
                <label key={field.key} className="studio-field">
                    <span>{field.label}{field.optional ? <small> 可选</small> : <b aria-hidden> *</b>}{field.kind === "textarea" ? <small className="studio-qs-count">{Array.from(current).length}/{field.maxLength}</small> : null}</span>
                    {field.kind === "textarea"
                        ? <textarea value={current} rows={field.maxLength > 500 ? 5 : 3} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => setText((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                        : <input value={current} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => setText((prev) => ({ ...prev, [field.key]: event.target.value }))} />}
                </label>
            );
        }
        if (field.kind === "chips") {
            const current = text[field.key] || "";
            const preset = field.options.includes(current);
            return (
                <div key={field.key} className="studio-field">
                    <span>{field.label}{field.optional ? <small> 可选</small> : null}</span>
                    <div className="studio-chip-list" role="group" aria-label={field.label}>
                        {field.options.map((option) => <button key={option} type="button" aria-pressed={current === option} onClick={() => setText((prev) => ({ ...prev, [field.key]: current === option ? "" : option }))}>{option}</button>)}
                    </div>
                    {field.custom ? <input value={preset ? "" : current} maxLength={60} placeholder="或者自己写" onChange={(event) => setText((prev) => ({ ...prev, [field.key]: event.target.value }))} /> : null}
                </div>
            );
        }
        if (field.kind === "images" || field.kind === "song") {
            const list = refs[field.key] || [];
            const max = field.kind === "song" ? 1 : field.max;
            const busy = uploading === field.key;
            return (
                <div key={field.key} className="studio-field">
                    <span>
                        {field.label}
                        {field.kind === "images" ? <small> ({list.length}/{field.max})</small> : null}
                        {field.optional ? <small> 可选</small> : field.kind === "images" && field.min ? <small> 至少 {field.min} 张</small> : <b aria-hidden> *</b>}
                    </span>
                    <div className="studio-qs-uploads">
                        {list.map((item, index) => (
                            <figure key={`${item.url}-${index}`} className={item.kind === "audio" ? "is-audio" : undefined}>
                                {item.kind === "audio" ? <><Music aria-hidden /><figcaption>{item.name}</figcaption></> : <><img src={item.url} alt={item.label} loading="lazy" /><figcaption>{item.label}</figcaption></>}
                                <button type="button" aria-label={`移除 ${item.label}`} onClick={() => removeRef(field, index)}><X aria-hidden /></button>
                            </figure>
                        ))}
                        {list.length < max ? (
                            <label className="studio-qs-add" aria-busy={busy}>
                                {busy ? <Loader2 className="studio-spin" aria-hidden /> : <Plus aria-hidden />}
                                <span>{busy ? "上传中…" : field.kind === "song" ? "上传歌曲（mp3 / wav / m4a）" : field.hint}</span>
                                <input
                                    type="file"
                                    hidden
                                    multiple={field.kind === "images" && field.max > 1}
                                    accept={field.kind === "song" ? "audio/*" : "image/*"}
                                    disabled={busy}
                                    onChange={(event) => {
                                        const files = [...(event.target.files || [])];
                                        event.target.value = "";
                                        if (files.length) void upload(field, files);
                                    }}
                                />
                            </label>
                        ) : null}
                    </div>
                </div>
            );
        }
        const selected = castIds[field.key] || [];
        return (
            <div key={field.key} className="studio-field">
                <span>{field.label}{field.max > 1 ? <small>（最多 {field.max} 个）</small> : null}{field.optional ? <small> 可选</small> : <b aria-hidden> *</b>}<Link to="/studio/characters" className="studio-block-link">角色库</Link></span>
                {library.length ? (
                    <StudioCharacterGrid characters={library} selected={selected} onToggle={(character) => {
                        const picked = selected.includes(character.id);
                        if (!picked && selected.length >= field.max) {
                            message.warning(`最多选 ${field.max} 个`);
                            return;
                        }
                        setCastIds((prev) => ({ ...prev, [field.key]: picked ? selected.filter((id) => id !== character.id) : [...selected, character.id] }));
                    }} />
                ) : null}
                <textarea value={described[field.key] || ""} rows={2} maxLength={500} placeholder={library.length ? "或者描述人物：年龄、长相、穿着、性格" : "描述人物：年龄、长相、穿着、性格"} onChange={(event) => setDescribed((prev) => ({ ...prev, [field.key]: event.target.value }))} />
            </div>
        );
    };

    return (
        <AppModal
            rootClassName="studio-modal"
            open
            width={640}
            title={config.headline}
            okText={starting ? "正在创建…" : config.cta}
            cancelText="取消"
            okButtonProps={{ disabled: starting || Boolean(uploading) || Boolean(error), icon: <Sparkles aria-hidden /> }}
            onOk={submit}
            onCancel={onClose}
        >
            <div className="studio-popup studio-form-stack">
                <p className="studio-hint">{config.subtitle}</p>
                {config.fields.map(fieldNode)}
                <div className="studio-field">
                    <span>成片时长</span>
                    <div className="studio-filter" role="group" aria-label="成片时长">
                        {DIRECTOR_DURATIONS.map((seconds) => <button key={seconds} type="button" aria-pressed={duration === seconds} onClick={() => setDuration(seconds)}>{seconds} 秒</button>)}
                    </div>
                </div>
                <div className="studio-field">
                    <span>画面比例</span>
                    <div className="studio-filter" role="group" aria-label="画面比例">
                        {DIRECTOR_RATIOS.map((item) => <button key={item} type="button" aria-pressed={ratio === item} onClick={() => setRatio(item)}>{item}</button>)}
                    </div>
                </div>
                {error && (Object.values(text).some((item) => item.trim()) || Object.keys(refs).length) ? <p className="studio-hint">{error}</p> : null}
                <p className="studio-hint">{runMode === "auto" ? "直接做：导演写好剧本和分镜后自动生成成片。" : "引导我：导演先写剧本给你确认，每一步生成前都会先问你。"}</p>
            </div>
        </AppModal>
    );
}
