import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Clapperboard, Image as ImageIcon, Loader2, Mountain, Palette, Pencil, Plus, Search, Sparkles, Trash2, UserRound, X } from "./studio-icons";
import { useNavigate, useSearchParams } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { deleteStudioCharacter, saveStudioCharacter, type StudioAssetKind, type StudioCharacter } from "@/services/api/studio-agents";
import { uploadImage } from "@/services/image-storage";
import { STUDIO_ATTACH_KEY } from "./studio-agent";
import { useStudioAssets } from "./studio-character-picker";
import { studioCharacterAttachments, studioCharacterCover, studioCharacterImageUrl } from "./studio-characters";
import { StudioShell } from "./studio-shell";

const MAX_IMAGES = 8;

type Draft = { id?: string; kind: StudioAssetKind; name: string; description: string; imageResourceIds: string[] };

type Tab = "all" | StudioAssetKind;

/** 每种资产的说明：标题、新建按钮、提示和带进工具时的提示词开头。 */
const KIND_META: Record<StudioAssetKind, { label: string; create: string; hint: string; namePlaceholder: string; descLabel: string; descPlaceholder: string; prompt: (name: string) => string; icon: typeof UserRound }> = {
    character: { label: "角色", create: "新建角色", hint: "上传几张形象图，之后生成都是同一张脸", namePlaceholder: "例如：品牌代言人小雅", descLabel: "外形描述（AI 导演写分镜时会用到）", descPlaceholder: "例如：25 岁女生，齐肩黑发，白色衬衫，笑容亲切", prompt: (name) => `参考图中的角色「${name}」，`, icon: UserRound },
    object: { label: "物体", create: "新建物体", hint: "商品或道具，上传几张不同角度的照片", namePlaceholder: "例如：保温杯", descLabel: "物体描述", descPlaceholder: "例如：哑光黑色保温杯，金色杯盖", prompt: (name) => `参考图中的物体「${name}」，外观保持一致，`, icon: Box },
    background: { label: "背景", create: "新建背景", hint: "常用的场景或背景图", namePlaceholder: "例如：品牌门店", descLabel: "背景描述", descPlaceholder: "例如：明亮的白色门店，木质展台", prompt: (name) => `以参考图「${name}」作为背景场景，`, icon: Mountain },
    style: { label: "风格", create: "新建风格", hint: "想反复使用的画风参考图", namePlaceholder: "例如：复古胶片", descLabel: "风格描述", descPlaceholder: "例如：暖色胶片颗粒，柔和高光", prompt: (name) => `画面风格参考图「${name}」，`, icon: Palette },
};

const KINDS: StudioAssetKind[] = ["character", "object", "background", "style"];

function assetKind(item: StudioCharacter): StudioAssetKind {
    return item.kind || "character";
}

/** AI Studio 的角色库：角色、物体、背景、风格，只属于 Studio。 */
export default function StudioCharactersPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [params, setParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(() => (["character", "object", "background", "style"].includes(params.get("tab") || "") ? (params.get("tab") as Tab) : "all"));
    const [keyword, setKeyword] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(0);
    const assetsQuery = useStudioAssets();
    const assets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        const list = assetsQuery.data || [];
        return query ? list.filter((item) => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)) : list;
    }, [assetsQuery.data, keyword]);

    useEffect(() => {
        if (params.get("create") !== "1") return;
        setDraft({ kind: "character", name: "", description: "", imageResourceIds: [] });
        setParams({}, { replace: true });
    }, [params, setParams]);

    const newDraft = (kind: StudioAssetKind) => setDraft({ kind, name: "", description: "", imageResourceIds: [] });

    const sendToTool = (item: StudioCharacter, kind: "image" | "video") => {
        const attachments = studioCharacterAttachments(item);
        if (!attachments.length) {
            message.warning("还没有图片，先编辑并上传图片");
            return;
        }
        try {
            window.sessionStorage.setItem(STUDIO_ATTACH_KEY, JSON.stringify({ kind, attachments, prompt: KIND_META[assetKind(item)].prompt(item.name) }));
        } catch {
            message.error("浏览器存储不可用，无法带入");
            return;
        }
        navigate(kind === "image" ? "/studio/create-image" : "/studio/create-video");
    };

    const upload = async (files: File[]) => {
        if (!draft) return;
        const room = MAX_IMAGES - draft.imageResourceIds.length;
        if (files.length > room) message.warning(`最多 ${MAX_IMAGES} 张图片`);
        for (const file of files.slice(0, Math.max(0, room))) {
            setUploading((count) => count + 1);
            try {
                const uploaded = await uploadImage(file);
                const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                if (!resourceId) throw new Error("图片没有保存到云端，请稍后重试");
                setDraft((current) => (current ? { ...current, imageResourceIds: [...current.imageResourceIds, resourceId].slice(0, MAX_IMAGES) } : current));
            } catch (cause) {
                message.error(`${file.name}：${cause instanceof Error ? cause.message : "上传失败"}`);
            } finally {
                setUploading((count) => Math.max(0, count - 1));
            }
        }
    };

    const save = async () => {
        if (!draft) return;
        if (!draft.name.trim()) {
            message.warning("请填写名称");
            return;
        }
        setSaving(true);
        try {
            await saveStudioCharacter(draft.id, { name: draft.name, kind: draft.kind, description: draft.description, imageResourceIds: draft.imageResourceIds });
            await queryClient.invalidateQueries({ queryKey: ["studio", "characters"] });
            setDraft(null);
            message.success(draft.id ? "已保存" : `已新建${KIND_META[draft.kind].label}`);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const remove = (item: StudioCharacter) => {
        modal.confirm({
            title: `删除${KIND_META[assetKind(item)].label}「${item.name}」？`,
            content: "已生成的作品不受影响。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await deleteStudioCharacter(item.id);
                await queryClient.invalidateQueries({ queryKey: ["studio", "characters"] });
            },
        });
    };

    const changeTab = (next: Tab) => {
        setTab(next);
        setParams(next === "all" ? {} : { tab: next }, { replace: true });
    };

    const renderCards = (kind: StudioAssetKind, limit?: number) => {
        const meta = KIND_META[kind];
        const list = assets.filter((item) => assetKind(item) === kind);
        const shown = limit ? list.slice(0, limit) : list;
        return (
            <div className="studio-character-grid">
                {!keyword.trim() ? (
                    <button type="button" className="studio-create-tile is-portrait" onClick={() => newDraft(kind)}>
                        <Plus aria-hidden />
                        <strong>{meta.create}</strong>
                        <span>{meta.hint}</span>
                    </button>
                ) : null}
                {shown.map((item) => {
                    const cover = studioCharacterCover(item);
                    const Icon = meta.icon;
                    return (
                        <article key={item.id} className="studio-character-card">
                            <div className="studio-character-cover">
                                {cover ? <img src={cover} alt={item.name} loading="lazy" /> : <Icon aria-hidden />}
                                <div className="studio-character-caption">
                                    <strong>{item.name}</strong>
                                    <span>{item.imageResourceIds.length ? `${item.imageResourceIds.length} 张图片` : "缺少图片"}</span>
                                </div>
                                <div className="studio-character-tools">
                                    <button type="button" className="studio-icon-button" title="编辑" aria-label={`编辑 ${item.name}`} onClick={() => setDraft({ id: item.id, kind, name: item.name, description: item.description, imageResourceIds: item.imageResourceIds })}><Pencil aria-hidden /></button>
                                    <button type="button" className="studio-icon-button is-danger" title="删除" aria-label={`删除 ${item.name}`} onClick={() => remove(item)}><Trash2 aria-hidden /></button>
                                </div>
                            </div>
                            <div className="studio-character-actions">
                                <button type="button" title="生成图片" aria-label={`用 ${item.name} 生成图片`} onClick={() => sendToTool(item, "image")}><ImageIcon aria-hidden />图片</button>
                                <button type="button" title="生成视频" aria-label={`用 ${item.name} 生成视频`} onClick={() => sendToTool(item, "video")}><Clapperboard aria-hidden />视频</button>
                                {kind === "character" ? <button type="button" title="交给 AI 导演" aria-label={`把 ${item.name} 交给 AI 导演`} onClick={() => navigate(`/studio/director?character=${encodeURIComponent(item.id)}`)}><Sparkles aria-hidden />导演</button> : null}
                            </div>
                        </article>
                    );
                })}
            </div>
        );
    };

    const draftMeta = draft ? KIND_META[draft.kind] : KIND_META.character;

    return (
        <StudioShell title="角色库">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>角色库</h2>
                        <p>把角色、物体、背景和风格存起来，之后生成图片和视频都能保持一致。</p>
                    </div>
                    <div className="studio-head-actions">
                        <label className="studio-search">
                            <Search aria-hidden />
                            <input value={keyword} placeholder="搜索" aria-label="搜索角色与素材" onChange={(event) => setKeyword(event.target.value)} />
                        </label>
                    </div>
                </div>
                <div className="studio-picker-sources studio-doc-tabs" role="tablist" aria-label="资产类型">
                    <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => changeTab("all")}>全部</button>
                    <button type="button" role="tab" aria-selected={tab === "character"} onClick={() => changeTab("character")}>角色</button>
                    <button type="button" role="tab" aria-selected={tab === "object"} onClick={() => changeTab("object")}>物体</button>
                    <button type="button" role="tab" aria-selected={tab === "background"} onClick={() => changeTab("background")}>背景</button>
                    <button type="button" role="tab" aria-selected={tab === "style"} onClick={() => changeTab("style")}>风格</button>
                </div>

                {assetsQuery.isError ? <div className="studio-empty"><strong>读取失败</strong><span>{assetsQuery.error instanceof Error ? assetsQuery.error.message : ""}</span></div> : null}
                {assetsQuery.isLoading ? <div className="studio-empty"><Loader2 className="studio-spin" aria-hidden /></div> : null}

                {tab === "all" ? (
                    <>
                        {KINDS.map((kind) => (
                            <section key={kind} className="studio-asset-section">
                                <div className="studio-asset-section-head">
                                    <strong>{KIND_META[kind].label}</strong>
                                    <button type="button" className="studio-block-link" onClick={() => changeTab(kind)}>查看全部</button>
                                </div>
                                {renderCards(kind, 7)}
                            </section>
                        ))}
                    </>
                ) : (
                    <>
                        {keyword.trim() && !assets.some((item) => assetKind(item) === tab) ? <div className="studio-empty"><strong>没有找到相关内容</strong><span>换个关键词试试。</span></div> : null}
                        {renderCards(tab)}
                    </>
                )}
            </div>
            <AppModal rootClassName="studio-modal" open={Boolean(draft)} title={draft?.id ? `编辑${draftMeta.label}` : draftMeta.create} okText={saving ? "保存中…" : "保存"} cancelText="取消" okButtonProps={{ disabled: saving || uploading > 0 }} onOk={() => void save()} onCancel={() => setDraft(null)}>
                {draft ? (
                    <div className="studio-popup studio-form-stack">
                        <label className="studio-field">
                            <span>名称 <b aria-hidden>*</b></span>
                            <input value={draft.name} maxLength={40} placeholder={draftMeta.namePlaceholder} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                        </label>
                        <label className="studio-field">
                            <span>{draftMeta.descLabel}</span>
                            <textarea value={draft.description} maxLength={1000} rows={3} placeholder={draftMeta.descPlaceholder} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                        </label>
                        <div className="studio-field">
                            <span>图片（第一张为主图，最多 {MAX_IMAGES} 张）</span>
                            <div className="studio-character-images">
                                {draft.imageResourceIds.map((resourceId, index) => (
                                    <span key={resourceId} className="studio-chat-pending">
                                        <span className="studio-chat-thumb"><img src={studioCharacterImageUrl(resourceId)} alt={`图片 ${index + 1}`} /></span>
                                        <button type="button" aria-label={`移除图片 ${index + 1}`} onClick={() => setDraft({ ...draft, imageResourceIds: draft.imageResourceIds.filter((id) => id !== resourceId) })}><X aria-hidden /></button>
                                    </span>
                                ))}
                                {uploading ? <span className="studio-chat-thumb"><Loader2 className="studio-spin" aria-label="上传中" /></span> : null}
                                {draft.imageResourceIds.length < MAX_IMAGES ? (
                                    <label className="studio-chat-thumb studio-upload-tile">
                                        <Plus aria-hidden />
                                        <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                                            const files = [...(event.target.files || [])];
                                            event.target.value = "";
                                            void upload(files);
                                        }} />
                                    </label>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </AppModal>
        </StudioShell>
    );
}
