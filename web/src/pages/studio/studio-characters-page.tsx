import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Image as ImageIcon, Loader2, Pencil, Plus, Search, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { deleteStudioCharacter, saveStudioCharacter, type StudioCharacter } from "@/services/api/studio-agents";
import { uploadImage } from "@/services/image-storage";
import { STUDIO_ATTACH_KEY } from "./studio-agent";
import { useStudioCharacters } from "./studio-character-picker";
import { studioCharacterAttachments, studioCharacterCover, studioCharacterImageUrl } from "./studio-characters";
import { StudioShell } from "./studio-shell";

const MAX_IMAGES = 8;

type Draft = { id?: string; name: string; description: string; imageResourceIds: string[] };

const EMPTY_DRAFT: Draft = { name: "", description: "", imageResourceIds: [] };

/** AI Studio 的角色库：只属于 Studio，生成图片、视频和 AI 导演用同一张脸。 */
export default function StudioCharactersPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [params, setParams] = useSearchParams();
    const [keyword, setKeyword] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(0);
    const charactersQuery = useStudioCharacters();
    const characters = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        const list = charactersQuery.data || [];
        return query ? list.filter((item) => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)) : list;
    }, [charactersQuery.data, keyword]);

    useEffect(() => {
        if (params.get("create") !== "1") return;
        setDraft({ ...EMPTY_DRAFT });
        setParams({}, { replace: true });
    }, [params, setParams]);

    const sendToTool = (character: StudioCharacter, kind: "image" | "video") => {
        const attachments = studioCharacterAttachments(character);
        if (!attachments.length) {
            message.warning("这个角色还没有形象图，先编辑角色上传形象");
            return;
        }
        try {
            window.sessionStorage.setItem(STUDIO_ATTACH_KEY, JSON.stringify({ kind, attachments, prompt: `参考图中的角色「${character.name}」，` }));
        } catch {
            message.error("浏览器存储不可用，无法带入角色");
            return;
        }
        navigate(kind === "image" ? "/studio/create-image" : "/studio/create-video");
    };

    const upload = async (files: File[]) => {
        if (!draft) return;
        const room = MAX_IMAGES - draft.imageResourceIds.length;
        if (files.length > room) message.warning(`每个角色最多 ${MAX_IMAGES} 张形象图`);
        for (const file of files.slice(0, Math.max(0, room))) {
            setUploading((count) => count + 1);
            try {
                const uploaded = await uploadImage(file);
                const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                if (!resourceId) throw new Error("形象图没有保存到云端，请稍后重试");
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
            message.warning("请填写角色名称");
            return;
        }
        setSaving(true);
        try {
            await saveStudioCharacter(draft.id, { name: draft.name, description: draft.description, imageResourceIds: draft.imageResourceIds });
            await queryClient.invalidateQueries({ queryKey: ["studio", "characters"] });
            setDraft(null);
            message.success(draft.id ? "角色已保存" : "角色已创建");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const remove = (character: StudioCharacter) => {
        modal.confirm({
            title: `删除角色「${character.name}」？`,
            content: "已生成的作品不受影响。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await deleteStudioCharacter(character.id);
                await queryClient.invalidateQueries({ queryKey: ["studio", "characters"] });
            },
        });
    };

    return (
        <StudioShell title="角色">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>角色库</h2>
                        <p>建好角色后，生成图片、视频和 AI 导演都能保持同一张脸。</p>
                    </div>
                    <div className="studio-head-actions">
                        <label className="studio-search">
                            <Search aria-hidden />
                            <input value={keyword} placeholder="搜索角色" aria-label="搜索角色" onChange={(event) => setKeyword(event.target.value)} />
                        </label>
                        <button type="button" className="studio-upgrade-button" onClick={() => setDraft({ ...EMPTY_DRAFT })}><Plus aria-hidden />新建角色</button>
                    </div>
                </div>

                {charactersQuery.isError ? <div className="studio-empty"><strong>角色读取失败</strong><span>{charactersQuery.error instanceof Error ? charactersQuery.error.message : ""}</span></div> : null}
                {charactersQuery.isLoading ? <div className="studio-empty"><Loader2 className="studio-spin" aria-hidden /></div> : null}
                {!charactersQuery.isLoading && !charactersQuery.isError && !characters.length ? (
                    <div className="studio-empty"><UserRound aria-hidden /><strong>{keyword.trim() ? "没有找到相关角色" : "还没有角色"}</strong><span>{keyword.trim() ? "换个关键词试试。" : "点「新建角色」上传几张形象图即可。"}</span></div>
                ) : null}
                <div className="studio-character-grid">
                    {characters.map((character) => {
                        const cover = studioCharacterCover(character);
                        return (
                            <article key={character.id} className="studio-character-card">
                                <div className="studio-character-cover">{cover ? <img src={cover} alt={character.name} loading="lazy" /> : <UserRound aria-hidden />}</div>
                                <div className="studio-character-body">
                                    <strong>{character.name}</strong>
                                    <span className="studio-hint">{character.imageResourceIds.length ? `${character.imageResourceIds.length} 张形象图` : "缺少形象图"}{character.description ? ` · ${character.description}` : ""}</span>
                                    <div className="studio-character-actions">
                                        <button type="button" className="studio-mini-button" onClick={() => sendToTool(character, "image")}><ImageIcon aria-hidden />生成图片</button>
                                        <button type="button" className="studio-mini-button" onClick={() => sendToTool(character, "video")}><Clapperboard aria-hidden />生成视频</button>
                                        <button type="button" className="studio-mini-button" onClick={() => navigate(`/studio/director?character=${encodeURIComponent(character.id)}`)}><Sparkles aria-hidden />交给 AI 导演</button>
                                        <button type="button" className="studio-mini-button" aria-label={`编辑 ${character.name}`} onClick={() => setDraft({ id: character.id, name: character.name, description: character.description, imageResourceIds: character.imageResourceIds })}><Pencil aria-hidden /></button>
                                        <button type="button" className="studio-mini-button is-danger" aria-label={`删除 ${character.name}`} onClick={() => remove(character)}><Trash2 aria-hidden /></button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>
            <AppModal rootClassName="studio-modal" open={Boolean(draft)} title={draft?.id ? "编辑角色" : "新建角色"} okText={saving ? "保存中…" : "保存"} cancelText="取消" okButtonProps={{ disabled: saving || uploading > 0 }} onOk={() => void save()} onCancel={() => setDraft(null)}>
                {draft ? (
                    <div className="studio-popup studio-form-stack">
                        <label className="studio-field">
                            <span>角色名称 <b aria-hidden>*</b></span>
                            <input value={draft.name} maxLength={40} placeholder="例如：品牌代言人小雅" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                        </label>
                        <label className="studio-field">
                            <span>外形描述（AI 导演写分镜时会用到）</span>
                            <textarea value={draft.description} maxLength={1000} rows={3} placeholder="例如：25 岁女生，齐肩黑发，白色衬衫，笑容亲切" onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                        </label>
                        <div className="studio-field">
                            <span>形象图（第一张为主图，最多 {MAX_IMAGES} 张，建议正面清晰半身照）</span>
                            <div className="studio-character-images">
                                {draft.imageResourceIds.map((resourceId, index) => (
                                    <span key={resourceId} className="studio-chat-pending">
                                        <span className="studio-chat-thumb"><img src={studioCharacterImageUrl(resourceId)} alt={`形象图 ${index + 1}`} /></span>
                                        <button type="button" aria-label={`移除形象图 ${index + 1}`} onClick={() => setDraft({ ...draft, imageResourceIds: draft.imageResourceIds.filter((id) => id !== resourceId) })}><X aria-hidden /></button>
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
