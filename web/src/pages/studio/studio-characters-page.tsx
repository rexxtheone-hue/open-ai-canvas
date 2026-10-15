import { useState } from "react";
import { App } from "antd";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Image as ImageIcon, Plus, Search, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { createCharacter, listCharacters, type ProjectCharacterDetail } from "@/services/api/projects";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { uploadImage } from "@/services/image-storage";
import { STUDIO_ATTACH_KEY } from "./studio-agent";
import { StudioShell } from "./studio-shell";
import { studioCharacterAttachment, studioCharacterCover } from "./studio-characters";

const PAGE_SIZE = 24;

/** 角色库与画布共用同一份数据：在这里建的角色，画布和 AI 导演都能用。 */
export default function StudioCharactersPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const query = useDebouncedValue(keyword.trim(), 250);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    const charactersQuery = useQuery({
        queryKey: ["characters", "studio", query, page],
        queryFn: () => listCharacters({ page, pageSize: PAGE_SIZE, query: query || undefined }),
        placeholderData: keepPreviousData,
    });
    const characters = charactersQuery.data?.characters || [];
    const total = charactersQuery.data?.total || 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const sendToTool = (detail: ProjectCharacterDetail, kind: "image" | "video") => {
        const attachment = studioCharacterAttachment(detail);
        if (!attachment) {
            message.warning("这个角色还没有形象图，先在画布里补上形象");
            return;
        }
        try {
            window.sessionStorage.setItem(STUDIO_ATTACH_KEY, JSON.stringify({ kind, attachments: [attachment], prompt: `参考图中的角色「${detail.asset.title}」，` }));
        } catch {
            message.error("浏览器存储不可用，无法带入角色");
            return;
        }
        navigate(kind === "image" ? "/studio/create-image" : "/studio/create-video");
    };

    const create = async () => {
        const title = name.trim();
        if (!title) {
            message.warning("请填写角色名称");
            return;
        }
        setSaving(true);
        try {
            let imageResourceId: string | undefined;
            if (file) {
                const uploaded = await uploadImage(file);
                imageResourceId = resourceIdFromStorageKey(uploaded.storageKey) || undefined;
                if (!imageResourceId) throw new Error("形象图没有保存到云端，请稍后重试");
            }
            await createCharacter({ name: title, imageResourceId });
            await queryClient.invalidateQueries({ queryKey: ["characters"] });
            setName("");
            setFile(null);
            setCreating(false);
            setPage(1);
            message.success("角色已创建");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "角色创建失败");
        } finally {
            setSaving(false);
        }
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
                            <input value={keyword} placeholder="搜索角色" aria-label="搜索角色" onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
                        </label>
                        <button type="button" className="studio-upgrade-button" onClick={() => setCreating((value) => !value)}><Plus aria-hidden />新建角色</button>
                    </div>
                </div>

                {creating ? (
                    <div className="studio-block studio-inline-form">
                        <label className="studio-field">
                            <span>角色名称 <b aria-hidden>*</b></span>
                            <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="例如：品牌代言人小雅" />
                        </label>
                        <label className="studio-field">
                            <span>形象图（建议正面清晰半身照）</span>
                            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                        </label>
                        <div className="studio-form-actions">
                            <button type="button" className="studio-mini-button" onClick={() => setCreating(false)}>取消</button>
                            <button type="button" className="studio-generate-button is-compact" disabled={saving} onClick={() => void create()}>{saving ? "创建中…" : "创建"}</button>
                        </div>
                    </div>
                ) : null}

                {charactersQuery.isError ? <div className="studio-empty"><strong>角色读取失败</strong><span>{charactersQuery.error instanceof Error ? charactersQuery.error.message : ""}</span></div> : null}
                {!charactersQuery.isLoading && !charactersQuery.isError && !characters.length ? (
                    <div className="studio-empty"><UserRound aria-hidden /><strong>{query ? "没有找到相关角色" : "还没有角色"}</strong><span>{query ? "换个关键词试试。" : "点「新建角色」上传一张形象图即可。"}</span></div>
                ) : null}
                <div className="studio-character-grid">
                    {characters.map((detail) => {
                        const cover = studioCharacterCover(detail);
                        return (
                            <article key={detail.asset.id} className="studio-character-card">
                                <div className="studio-character-cover">{cover ? <img src={cover} alt={detail.asset.title} loading="lazy" /> : <UserRound aria-hidden />}</div>
                                <div className="studio-character-body">
                                    <strong>{detail.asset.title}</strong>
                                    <span className="studio-hint">{detail.character.visualStatus === "ready" ? "形象完整" : detail.character.visualStatus === "partial" ? "形象部分完成" : "缺少形象"} · {detail.character.voiceStatus === "ready" ? "已绑定声音" : "未绑定声音"}</span>
                                    <div className="studio-character-actions">
                                        <button type="button" className="studio-mini-button" onClick={() => sendToTool(detail, "image")}><ImageIcon aria-hidden />生成图片</button>
                                        <button type="button" className="studio-mini-button" onClick={() => sendToTool(detail, "video")}><Clapperboard aria-hidden />生成视频</button>
                                        <button type="button" className="studio-mini-button" onClick={() => navigate(`/studio/director?character=${encodeURIComponent(detail.asset.id)}`)}><Sparkles aria-hidden />交给 AI 导演</button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
                {pageCount > 1 ? (
                    <div className="studio-pager">
                        <button type="button" className="studio-mini-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
                        <span>{page} / {pageCount}</span>
                        <button type="button" className="studio-mini-button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一页</button>
                    </div>
                ) : null}
            </div>
        </StudioShell>
    );
}
