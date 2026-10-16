import { useEffect, useState } from "react";
import { App } from "antd";
import { ImagePlus, Plus, Star, Trash2, X } from "lucide-react";

import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { createStudioBrandKit, deleteStudioBrandKit, updateStudioBrandKit, type StudioBrandKit, type StudioBrandKitInput } from "@/services/api/studio";
import { uploadImage } from "@/services/image-storage";
import { StudioShell } from "./studio-shell";
import { studioBrandPrompt } from "./studio-generation";
import { useStudioBrandKits } from "./use-studio-brand";

const EMPTY_FORM: StudioBrandKitInput = { name: "", intro: "", audience: "", tone: "", slogan: "", colors: [], logoResourceId: "", avoid: "", typography: "", assetResourceIds: [], styleResourceIds: [], isDefault: false };
const MAX_BRAND_IMAGES = 8;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function formFromKit(kit: StudioBrandKit): StudioBrandKitInput {
    return { name: kit.name, intro: kit.intro, audience: kit.audience, tone: kit.tone, slogan: kit.slogan, colors: kit.colors, logoResourceId: kit.logoResourceId || "", avoid: kit.avoid, typography: kit.typography || "", assetResourceIds: kit.assetResourceIds || [], styleResourceIds: kit.styleResourceIds || [], isDefault: kit.isDefault };
}

function logoSrc(resourceId?: string) {
    return resourceId ? resolveResourceUrl(`resource:${resourceId}`, "") : "";
}

/** 品牌套件：一处填写，图片和视频工具、AI 导演都能直接套用。 */
export default function StudioBrandPage() {
    const { message, modal } = App.useApp();
    const { kits, loading, refresh } = useStudioBrandKits();
    const [selectedId, setSelectedId] = useState<string>("");
    const [form, setForm] = useState<StudioBrandKitInput>(EMPTY_FORM);
    const [colorDraft, setColorDraft] = useState("#D9A441");
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const selected = kits.find((kit) => kit.id === selectedId);

    // 首次加载后默认打开第一个套件；没有套件时停在新建表单。
    useEffect(() => {
        if (loading || selectedId === "new") return;
        if (selectedId && selected) return;
        if (kits[0]) {
            setSelectedId(kits[0].id);
            setForm(formFromKit(kits[0]));
        } else {
            setSelectedId("new");
            setForm(EMPTY_FORM);
        }
    }, [kits, loading, selected, selectedId]);

    const pick = (kit: StudioBrandKit) => {
        setSelectedId(kit.id);
        setForm(formFromKit(kit));
    };
    const startNew = () => {
        setSelectedId("new");
        setForm(EMPTY_FORM);
    };
    const set = <K extends keyof StudioBrandKitInput>(key: K, value: StudioBrandKitInput[K]) => setForm((current) => ({ ...current, [key]: value }));

    const addColor = () => {
        const color = colorDraft.trim().toUpperCase();
        if (!COLOR_PATTERN.test(color)) {
            message.warning("品牌色需要是 #RRGGBB 格式");
            return;
        }
        if (form.colors.includes(color)) return;
        if (form.colors.length >= 6) {
            message.warning("品牌色最多 6 个");
            return;
        }
        set("colors", [...form.colors, color]);
    };

    const uploadLogo = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            message.error("Logo 需要是图片");
            return;
        }
        setUploading(true);
        try {
            const uploaded = await uploadImage(file);
            const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
            if (!resourceId) throw new Error("Logo 没有保存到云端，请稍后重试");
            set("logoResourceId", resourceId);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "Logo 上传失败");
        } finally {
            setUploading(false);
        }
    };

    const [uploadingField, setUploadingField] = useState("");
    /** 品牌素材、风格参考：多张图片，最多 8 张。 */
    const uploadImages = async (field: "assetResourceIds" | "styleResourceIds", files: File[]) => {
        const room = MAX_BRAND_IMAGES - form[field].length;
        if (files.length > room) message.warning(`最多 ${MAX_BRAND_IMAGES} 张`);
        setUploadingField(field);
        try {
            const added: string[] = [];
            for (const file of files.slice(0, Math.max(0, room))) {
                if (!file.type.startsWith("image/")) continue;
                const uploaded = await uploadImage(file);
                const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                if (resourceId) added.push(resourceId);
            }
            setForm((current) => ({ ...current, [field]: [...current[field], ...added].slice(0, MAX_BRAND_IMAGES) }));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "上传失败");
        } finally {
            setUploadingField("");
        }
    };
    const imageField = (field: "assetResourceIds" | "styleResourceIds", label: string, hint: string) => (
        <div className="studio-field is-wide">
            <span>{label} <em>{hint}</em></span>
            <div className="studio-character-images">
                {form[field].map((resourceId, index) => (
                    <span key={resourceId} className="studio-chat-pending">
                        <span className="studio-chat-thumb"><img src={logoSrc(resourceId)} alt={`${label} ${index + 1}`} /></span>
                        <button type="button" aria-label={`移除${label} ${index + 1}`} onClick={() => setForm((current) => ({ ...current, [field]: current[field].filter((id) => id !== resourceId) }))}><X aria-hidden /></button>
                    </span>
                ))}
                {form[field].length < MAX_BRAND_IMAGES ? (
                    <label className="studio-chat-thumb studio-upload-tile" aria-disabled={Boolean(uploadingField)} title={`上传${label}`}>
                        {uploadingField === field ? "…" : <Plus aria-hidden />}
                        <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploadingField)} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; void uploadImages(field, files); }} />
                    </label>
                ) : null}
            </div>
        </div>
    );

    const save = async () => {
        if (!form.name.trim()) {
            message.warning("请填写品牌名称");
            return;
        }
        setSaving(true);
        try {
            const saved = selected ? await updateStudioBrandKit(selected.id, form) : await createStudioBrandKit(form);
            await refresh();
            setSelectedId(saved.id);
            setForm(formFromKit(saved));
            message.success("品牌套件已保存");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败，请重试");
        } finally {
            setSaving(false);
        }
    };

    const remove = () => {
        if (!selected) return;
        modal.confirm({
            title: `删除「${selected.name}」？`,
            content: "已生成的作品不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await deleteStudioBrandKit(selected.id);
                    setSelectedId("");
                    await refresh();
                    message.success("已删除");
                } catch (cause) {
                    message.error(cause instanceof Error ? cause.message : "删除失败，请重试");
                }
            },
        });
    };

    const preview = form.name.trim() ? studioBrandPrompt({ id: "", ...form }) : "";

    return (
        <StudioShell title="品牌套件">
            <div className="studio-split">
                <aside className="studio-panel studio-list-panel" aria-label="品牌套件列表">
                    <div className="studio-list-head">
                        <strong>品牌套件</strong>
                        <button type="button" className="studio-mini-button" onClick={startNew} disabled={kits.length >= 20}><Plus aria-hidden />新建</button>
                    </div>
                    <div className="studio-list-scroll">
                        {loading ? <p className="studio-hint">正在读取…</p> : null}
                        {kits.map((kit) => (
                            <button key={kit.id} type="button" className="studio-list-item" aria-current={kit.id === selectedId ? "true" : undefined} onClick={() => pick(kit)}>
                                <span className="studio-brand-logo">{kit.logoResourceId ? <img src={logoSrc(kit.logoResourceId)} alt="" /> : kit.name.slice(0, 1)}</span>
                                <span className="studio-list-text">
                                    <b>{kit.name}{kit.isDefault ? <em>默认</em> : null}</b>
                                    <span className="studio-swatches">{kit.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
                                </span>
                            </button>
                        ))}
                        {!loading && !kits.length ? <p className="studio-hint">还没有品牌套件。填好右边的表单保存即可。</p> : null}
                    </div>
                </aside>
                <section className="studio-panel studio-form-panel" aria-label="编辑品牌套件">
                    <div className="studio-panel-scroll">
                        <div className="studio-form-grid">
                            <label className="studio-field">
                                <span>品牌名称 <b aria-hidden>*</b></span>
                                <input value={form.name} maxLength={40} onChange={(event) => set("name", event.target.value)} placeholder="例如：暖杯 WarmCup" />
                            </label>
                            <label className="studio-field">
                                <span>品牌口号</span>
                                <input value={form.slogan} maxLength={60} onChange={(event) => set("slogan", event.target.value)} placeholder="例如：一杯温暖，随身带走" />
                            </label>
                            <label className="studio-field is-wide">
                                <span>品牌介绍</span>
                                <textarea value={form.intro} maxLength={600} rows={3} onChange={(event) => set("intro", event.target.value)} placeholder="做什么产品、核心卖点、和别人有什么不同" />
                            </label>
                            <label className="studio-field">
                                <span>目标人群</span>
                                <input value={form.audience} maxLength={120} onChange={(event) => set("audience", event.target.value)} placeholder="例如：25-35 岁上班族" />
                            </label>
                            <label className="studio-field">
                                <span>品牌调性</span>
                                <input value={form.tone} maxLength={120} onChange={(event) => set("tone", event.target.value)} placeholder="例如：温暖、简约、高级" />
                            </label>
                            <div className="studio-field is-wide">
                                <span>品牌色（最多 6 个）</span>
                                <div className="studio-color-row">
                                    {form.colors.map((color) => (
                                        <span key={color} className="studio-color-chip">
                                            <i style={{ background: color }} />{color}
                                            <button type="button" aria-label={`移除 ${color}`} onClick={() => set("colors", form.colors.filter((item) => item !== color))}><X aria-hidden /></button>
                                        </span>
                                    ))}
                                    {form.colors.length < 6 ? (
                                        <span className="studio-color-add">
                                            <input type="color" aria-label="选择颜色" value={COLOR_PATTERN.test(colorDraft) ? colorDraft : "#D9A441"} onChange={(event) => setColorDraft(event.target.value.toUpperCase())} />
                                            <input aria-label="颜色值" value={colorDraft} maxLength={7} onChange={(event) => setColorDraft(event.target.value)} />
                                            <button type="button" className="studio-mini-button" onClick={addColor}><Plus aria-hidden />添加</button>
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="studio-field">
                                <span>Logo</span>
                                <div className="studio-logo-row">
                                    <span className="studio-brand-logo is-large">{form.logoResourceId ? <img src={logoSrc(form.logoResourceId)} alt="品牌 Logo" /> : <ImagePlus aria-hidden />}</span>
                                    <label className="studio-mini-button" aria-disabled={uploading}>
                                        {uploading ? "正在上传…" : form.logoResourceId ? "更换" : "上传"}
                                        <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.target.value = ""; }} />
                                    </label>
                                    {form.logoResourceId ? <button type="button" className="studio-mini-button" onClick={() => set("logoResourceId", "")}>移除</button> : null}
                                </div>
                            </div>
                            <label className="studio-field">
                                <span>字体规范</span>
                                <input value={form.typography} maxLength={120} onChange={(event) => set("typography", event.target.value)} placeholder="例如：标题思源黑体 Bold，正文思源宋体" />
                            </label>
                            {imageField("assetResourceIds", "品牌素材", "产品、包装、吉祥物等，生成时可一键加入参考")}
                            {imageField("styleResourceIds", "风格参考", "想要的画面风格，生成时可一键加入参考")}
                            <label className="studio-field">
                                <span>避免内容</span>
                                <input value={form.avoid} maxLength={200} onChange={(event) => set("avoid", event.target.value)} placeholder="例如：竞品 Logo、夸大功效" />
                            </label>
                            <label className="studio-switch-row is-wide">
                                <span><Star aria-hidden /> 设为默认品牌（新打开的工具自动套用）</span>
                                <input type="checkbox" checked={form.isDefault} onChange={(event) => set("isDefault", event.target.checked)} />
                            </label>
                        </div>
                        {preview ? (
                            <div className="studio-block">
                                <div className="studio-block-title">生成时追加的内容 <em>预览</em></div>
                                <pre className="studio-preview-text">{preview}</pre>
                            </div>
                        ) : null}
                    </div>
                    <div className="studio-panel-footer studio-form-actions">
                        {selected ? <button type="button" className="studio-mini-button is-danger" onClick={remove}><Trash2 aria-hidden />删除</button> : null}
                        <span style={{ flex: 1 }} />
                        <button type="button" className="studio-generate-button is-compact" disabled={saving || uploading} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</button>
                    </div>
                </section>
            </div>
        </StudioShell>
    );
}
