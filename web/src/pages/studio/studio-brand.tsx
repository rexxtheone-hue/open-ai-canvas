import { useEffect, useState } from "react";
import { App, Input, Popover, Switch } from "antd";
import { BookOpen, Image as Gallery, Info, Palette, Plus, ScanFace as Smileys, Sparkles as MagicStar, Trash2, Type as Text, X } from "./studio-icons";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { createStudioBrandKit, deleteStudioBrandKit, updateStudioBrandKit, type StudioBrandKit, type StudioBrandKitInput } from "@/services/api/studio";
import { uploadImage } from "@/services/image-storage";
import { StudioShell } from "./studio-shell";
import { studioBrandPrompt } from "./studio-generation";
import { useStudioBrandKits } from "./use-studio-brand";

const EMPTY_FORM: StudioBrandKitInput = { name: "", intro: "", audience: "", tone: "", slogan: "", colors: [], logoResourceId: "", avoid: "", typography: "", assetResourceIds: [], styleResourceIds: [], isDefault: false };
const MAX_BRAND_IMAGES = 8;
const MAX_BRAND_KITS = 20;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Section = "logo" | "palette" | "typography" | "assets" | "styles" | "rules";

function formFromKit(kit: StudioBrandKit): StudioBrandKitInput {
    return { name: kit.name, intro: kit.intro, audience: kit.audience, tone: kit.tone, slogan: kit.slogan, colors: kit.colors, logoResourceId: kit.logoResourceId || "", avoid: kit.avoid, typography: kit.typography || "", assetResourceIds: kit.assetResourceIds || [], styleResourceIds: kit.styleResourceIds || [], isDefault: kit.isDefault };
}

function imageSrc(resourceId?: string) {
    return resourceId ? resolveResourceUrl(`resource:${resourceId}`, "") : "";
}

/** 新套件默认叫「品牌套件 N」，N 取当前没被占用的最小编号。 */
function nextKitName(kits: StudioBrandKit[]) {
    let index = 1;
    while (kits.some((kit) => kit.name === `品牌套件 ${index}`)) index += 1;
    return `品牌套件 ${index}`;
}

const SECTIONS: Array<{ id: Section; title: string; empty: string; icon: typeof Plus }> = [
    { id: "logo", title: "Logo", empty: "添加 logo", icon: Smileys },
    { id: "palette", title: "调色板", empty: "添加调色板", icon: Palette },
    { id: "typography", title: "排版", empty: "添加排版", icon: Text },
    { id: "assets", title: "品牌素材", empty: "添加品牌素材", icon: Gallery },
    { id: "styles", title: "风格参考", empty: "添加风格参考", icon: MagicStar },
    { id: "rules", title: "品牌规范", empty: "添加品牌规范", icon: BookOpen },
];

/** 品牌套件：左边是套件列表，右边六张卡片（Logo、调色板、排版、品牌素材、风格参考、品牌规范），点开编辑后保存。 */
export default function StudioBrandPage() {
    const { message, modal } = App.useApp();
    const { kits, loading, refresh } = useStudioBrandKits();
    const [selectedId, setSelectedId] = useState<string>("");
    const [form, setForm] = useState<StudioBrandKitInput>(EMPTY_FORM);
    const [section, setSection] = useState<Section | null>(null);
    const [colorDraft, setColorDraft] = useState("#D9A441");
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [uploadingField, setUploadingField] = useState("");
    const selected = kits.find((kit) => kit.id === selectedId);

    // 首次加载后默认打开第一个套件。
    useEffect(() => {
        if (loading) return;
        if (selectedId && selected) return;
        if (kits[0]) {
            setSelectedId(kits[0].id);
            setForm(formFromKit(kits[0]));
        } else {
            setSelectedId("");
            setForm(EMPTY_FORM);
        }
    }, [kits, loading, selected, selectedId]);

    const pick = (kit: StudioBrandKit) => {
        setSelectedId(kit.id);
        setForm(formFromKit(kit));
    };
    const set = <K extends keyof StudioBrandKitInput>(key: K, value: StudioBrandKitInput[K]) => setForm((current) => ({ ...current, [key]: value }));

    /** 「新增」直接建一个空套件，和 OpenArt 一样随后逐项补充。 */
    const createKit = async () => {
        if (creating || kits.length >= MAX_BRAND_KITS) return;
        setCreating(true);
        try {
            const saved = await createStudioBrandKit({ ...EMPTY_FORM, name: nextKitName(kits), isDefault: !kits.length });
            await refresh();
            setSelectedId(saved.id);
            setForm(formFromKit(saved));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "新建失败，请重试");
        } finally {
            setCreating(false);
        }
    };

    const save = async (next: StudioBrandKitInput = form) => {
        if (!selected) return false;
        if (!next.name.trim()) {
            message.warning("请填写品牌名称");
            return false;
        }
        setSaving(true);
        try {
            const saved = await updateStudioBrandKit(selected.id, next);
            await refresh();
            setForm(formFromKit(saved));
            message.success("已保存");
            return true;
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败，请重试");
            return false;
        } finally {
            setSaving(false);
        }
    };

    const closeSection = (discard: boolean) => {
        if (discard && selected) setForm(formFromKit(selected));
        setSection(null);
    };

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

    const uploadTo = async (field: "logoResourceId" | "assetResourceIds" | "styleResourceIds", files: File[]) => {
        const images = files.filter((file) => file.type.startsWith("image/"));
        if (!images.length) {
            message.warning("请选择图片");
            return;
        }
        setUploadingField(field);
        try {
            if (field === "logoResourceId") {
                const uploaded = await uploadImage(images[0]);
                const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                if (!resourceId) throw new Error("Logo 没有保存到云端，请稍后重试");
                set("logoResourceId", resourceId);
                return;
            }
            const room = MAX_BRAND_IMAGES - form[field].length;
            if (images.length > room) message.warning(`最多 ${MAX_BRAND_IMAGES} 张`);
            const added: string[] = [];
            for (const file of images.slice(0, Math.max(0, room))) {
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

    const remove = () => {
        if (!selected) return;
        modal.confirm({
            title: `删除「${selected.name}」？`,
            content: "已生成的作品不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            rootClassName: "studio-modal",
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

    const filled: Record<Section, boolean> = {
        logo: Boolean(form.logoResourceId),
        palette: form.colors.length > 0,
        typography: Boolean(form.typography.trim()),
        assets: form.assetResourceIds.length > 0,
        styles: form.styleResourceIds.length > 0,
        rules: Boolean(form.intro.trim() || form.audience.trim() || form.tone.trim() || form.slogan.trim() || form.avoid.trim()),
    };
    const anyFilled = Object.values(filled).some(Boolean);

    const cardBody = (id: Section) => {
        if (id === "logo") return <img className="studio-brand-card-logo" src={imageSrc(form.logoResourceId)} alt="Logo" />;
        if (id === "palette") return <span className="studio-brand-card-swatches">{form.colors.map((color) => <i key={color} style={{ background: color }} title={color} />)}</span>;
        if (id === "typography") return <span className="studio-brand-card-text is-type">{form.typography}</span>;
        if (id === "assets" || id === "styles") {
            const ids = id === "assets" ? form.assetResourceIds : form.styleResourceIds;
            return <span className="studio-brand-card-thumbs">{ids.slice(0, 4).map((resourceId) => <img key={resourceId} src={imageSrc(resourceId)} alt="" />)}{ids.length > 4 ? <em>+{ids.length - 4}</em> : null}</span>;
        }
        return <span className="studio-brand-card-text">{[form.tone, form.audience, form.slogan, form.intro].filter((item) => item.trim()).join(" · ")}</span>;
    };

    const imageEditor = (field: "assetResourceIds" | "styleResourceIds", hint: string) => (
        <>
            <p className="studio-hint">{hint}</p>
            <div className="studio-brand-images">
                {form[field].map((resourceId, index) => (
                    <span key={resourceId} className="studio-ref-slot is-filled">
                        <img src={imageSrc(resourceId)} alt={`图片 ${index + 1}`} />
                        <button type="button" className="studio-ref-remove" aria-label={`移除图片 ${index + 1}`} onClick={() => setForm((current) => ({ ...current, [field]: current[field].filter((id) => id !== resourceId) }))}><X aria-hidden /></button>
                    </span>
                ))}
                {form[field].length < MAX_BRAND_IMAGES ? (
                    <label className="studio-ref-slot" aria-disabled={Boolean(uploadingField)} title="上传图片">
                        {uploadingField === field ? "…" : <Plus aria-hidden />}
                        <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploadingField)} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; void uploadTo(field, files); }} />
                    </label>
                ) : null}
            </div>
            <small className="studio-slot-constraint">最多 {MAX_BRAND_IMAGES} 张，JPEG / PNG / WEBP。生成时在参考区的品牌格子里可以一键加入。</small>
        </>
    );

    const sectionEditor = () => {
        switch (section) {
            case "logo":
                return (
                    <div className="studio-brand-logo-edit">
                        <span className="studio-brand-logo is-large">{form.logoResourceId ? <img src={imageSrc(form.logoResourceId)} alt="品牌 Logo" /> : <Smileys aria-hidden />}</span>
                        <div className="studio-voice-sample-actions">
                            <label className="studio-mini-button" aria-disabled={Boolean(uploadingField)}>
                                {uploadingField ? "正在上传…" : form.logoResourceId ? "更换" : "上传 Logo"}
                                <input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploadingField)} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; void uploadTo("logoResourceId", files); }} />
                            </label>
                            {form.logoResourceId ? <button type="button" className="studio-mini-button" onClick={() => set("logoResourceId", "")}>移除</button> : null}
                        </div>
                        <small className="studio-slot-constraint">建议透明背景的 PNG。生成时可以在参考区的品牌格子里加入 Logo。</small>
                    </div>
                );
            case "palette":
                return (
                    <>
                        <p className="studio-hint">品牌色会写进提示词，让画面配色保持一致，最多 6 个。</p>
                        <div className="studio-color-row">
                            {form.colors.map((color) => (
                                <span key={color} className="studio-color-chip">
                                    <i style={{ background: color }} />{color}
                                    <button type="button" aria-label={`移除 ${color}`} onClick={() => set("colors", form.colors.filter((item) => item !== color))}><X aria-hidden /></button>
                                </span>
                            ))}
                        </div>
                        {form.colors.length < 6 ? (
                            <span className="studio-color-add">
                                <input type="color" aria-label="选择颜色" value={COLOR_PATTERN.test(colorDraft) ? colorDraft : "#D9A441"} onChange={(event) => setColorDraft(event.target.value.toUpperCase())} />
                                <input aria-label="颜色值" value={colorDraft} maxLength={7} onChange={(event) => setColorDraft(event.target.value)} />
                                <button type="button" className="studio-mini-button" onClick={addColor}><Plus aria-hidden />添加</button>
                            </span>
                        ) : null}
                    </>
                );
            case "typography":
                return (
                    <label className="studio-field">
                        <span>字体规范</span>
                        <Input value={form.typography} maxLength={120} showCount onChange={(event) => set("typography", event.target.value)} placeholder="例如：标题思源黑体 Bold，正文思源宋体" aria-label="字体规范" />
                        <small className="studio-slot-constraint">画面里需要出现文字时，会按这里的字体风格来写。</small>
                    </label>
                );
            case "assets":
                return imageEditor("assetResourceIds", "产品、包装、吉祥物等品牌素材。");
            case "styles":
                return imageEditor("styleResourceIds", "想要的画面风格参考图。");
            case "rules":
                return (
                    <div className="studio-feedback">
                        <label className="studio-field"><span>品牌介绍</span><Input.TextArea value={form.intro} maxLength={600} autoSize={{ minRows: 3, maxRows: 6 }} onChange={(event) => set("intro", event.target.value)} placeholder="做什么产品、核心卖点、和别人有什么不同" aria-label="品牌介绍" /></label>
                        <label className="studio-field"><span>目标人群</span><Input value={form.audience} maxLength={120} onChange={(event) => set("audience", event.target.value)} placeholder="例如：25-35 岁上班族" aria-label="目标人群" /></label>
                        <label className="studio-field"><span>品牌调性</span><Input value={form.tone} maxLength={120} onChange={(event) => set("tone", event.target.value)} placeholder="例如：温暖、简约、高级" aria-label="品牌调性" /></label>
                        <label className="studio-field"><span>品牌口号</span><Input value={form.slogan} maxLength={60} onChange={(event) => set("slogan", event.target.value)} placeholder="例如：一杯温暖，随身带走" aria-label="品牌口号" /></label>
                        <label className="studio-field"><span>避免内容</span><Input value={form.avoid} maxLength={200} onChange={(event) => set("avoid", event.target.value)} placeholder="例如：竞品 Logo、夸大功效" aria-label="避免内容" /></label>
                    </div>
                );
            default:
                return null;
        }
    };

    const preview = selected && form.name.trim() ? studioBrandPrompt({ id: "", ...form }) : "";
    const currentSection = SECTIONS.find((item) => item.id === section);

    return (
        <StudioShell title="品牌套件">
            <div className="studio-brand-page">
                <aside className="studio-brand-list" aria-label="品牌套件列表">
                    <div className="studio-brand-list-head">
                        <strong>品牌套件</strong>
                        <Popover arrow={false} trigger={["hover", "click"]} content={<div className="studio-popup studio-option-info">品牌套件保存 Logo、配色、字体、品牌素材、风格参考和品牌规范。生成图片和视频时选上品牌，这些内容会自动用在提示词和参考图里，让每次创作风格一致。</div>}>
                            <button type="button" className="studio-icon-button is-ghost" aria-label="关于品牌套件"><Info aria-hidden /></button>
                        </Popover>
                    </div>
                    <button type="button" className="studio-brand-new" disabled={creating || kits.length >= MAX_BRAND_KITS} onClick={() => void createKit()}>
                        <Plus aria-hidden />{creating ? "新建中…" : "新增"}
                    </button>
                    {loading ? <p className="studio-hint">正在读取…</p> : null}
                    {kits.map((kit) => (
                        <button key={kit.id} type="button" className="studio-brand-item" aria-current={kit.id === selectedId ? "true" : undefined} onClick={() => pick(kit)}>
                            <span className="studio-brand-logo">{kit.logoResourceId ? <img src={imageSrc(kit.logoResourceId)} alt="" /> : <Palette aria-hidden />}</span>
                            <span className="studio-brand-item-text"><b>{kit.name}</b>{kit.isDefault ? <em>默认</em> : null}</span>
                        </button>
                    ))}
                </aside>
                <section className="studio-brand-main" aria-label="品牌套件内容">
                    {selected ? (
                        <>
                            <div className="studio-brand-toolbar">
                                <Input className="studio-brand-name" value={form.name} maxLength={40} onChange={(event) => set("name", event.target.value)} onBlur={() => { if (form.name.trim() && form.name !== selected.name) void save(); }} onPressEnter={(event) => event.currentTarget.blur()} aria-label="品牌名称" />
                                <label className="studio-switch-row is-inline"><span>默认品牌</span><Switch size="small" checked={form.isDefault} onChange={(checked) => void save({ ...form, isDefault: checked })} /></label>
                                <button type="button" className="studio-mini-button is-danger" onClick={remove}><Trash2 aria-hidden />删除</button>
                            </div>
                            <h1 className="studio-brand-title">{anyFilled ? form.name : "创建你的品牌套件"}</h1>
                            {!anyFilled ? (
                                <div className="studio-brand-banner">
                                    <div><b>让你的品牌在每一次创作中鲜活起来</b><p>添加标志、配色、品牌规范等，打造一致的风格。</p></div>
                                    <span className="studio-brand-banner-art" aria-hidden><i>Aa</i></span>
                                </div>
                            ) : null}
                            <div className="studio-brand-cards">
                                {SECTIONS.map((item) => (
                                    <button key={item.id} type="button" className={`studio-brand-card${filled[item.id] ? " is-filled" : ""}`} onClick={() => setSection(item.id)}>
                                        {filled[item.id] ? (
                                            <>
                                                <span className="studio-brand-card-head">{item.title}<em>编辑</em></span>
                                                {cardBody(item.id)}
                                            </>
                                        ) : (
                                            <>
                                                <span className="studio-brand-card-icon"><item.icon aria-hidden /><Plus className="studio-brand-card-plus" aria-hidden /></span>
                                                <b>{item.empty}</b>
                                            </>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {preview ? (
                                <details className="studio-brand-preview">
                                    <summary>生成时追加到提示词的内容</summary>
                                    <pre className="studio-preview-text">{preview}</pre>
                                </details>
                            ) : null}
                        </>
                    ) : (
                        <div className="studio-voice-empty">
                            <h1 className="studio-brand-title">创建你的品牌套件</h1>
                            <p>添加标志、配色、品牌规范等，打造一致的风格。</p>
                            <button type="button" className="studio-mini-button is-primary" disabled={creating || loading} onClick={() => void createKit()}><Plus aria-hidden />新增品牌套件</button>
                        </div>
                    )}
                </section>
            </div>
            <AppModal
                rootClassName="studio-modal"
                open={Boolean(section)}
                width="min(560px, calc(100vw - 32px))"
                title={currentSection?.title}
                okText={saving ? "保存中…" : "保存"}
                cancelText="取消"
                okButtonProps={{ disabled: saving || Boolean(uploadingField) }}
                onOk={() => void save().then((ok) => ok && closeSection(false))}
                onCancel={() => closeSection(true)}
            >
                <div className="studio-popup studio-brand-editor">{sectionEditor()}</div>
            </AppModal>
        </StudioShell>
    );
}
