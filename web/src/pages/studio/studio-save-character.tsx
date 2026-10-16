import { useEffect, useState } from "react";
import { App, Input } from "antd";
import { useQueryClient } from "@tanstack/react-query";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import type { StudioWork } from "@/services/api/studio";
import { saveStudioCharacter } from "@/services/api/studio-agents";

/** 把一张生成的图片存成角色库里的新角色（这张图是主形象图）。 */
export function StudioSaveCharacterModal({ work, onClose }: { work: StudioWork | null; onClose: () => void }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!work) return;
        setName("");
        setDescription(work.prompt.slice(0, 1000));
    }, [work]);
    const resourceId = work ? resourceIdFromStorageKey(work.media[0]?.storageKey) : "";
    const save = async () => {
        if (!name.trim() || !resourceId || saving) return;
        setSaving(true);
        try {
            await saveStudioCharacter(undefined, { name: name.trim(), description: description.trim(), imageResourceIds: [resourceId] });
            await queryClient.invalidateQueries({ queryKey: ["studio", "characters"] });
            message.success("已存进角色库");
            onClose();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };
    return (
        <AppModal rootClassName="studio-modal" open={Boolean(work)} title="存为角色" okText={saving ? "保存中…" : "存进角色库"} cancelText="取消" okButtonProps={{ disabled: !name.trim() || !resourceId || saving }} onOk={() => void save()} onCancel={onClose}>
            <div className="studio-popup studio-feedback">
                <label className="studio-field"><span>角色名称</span><Input value={name} maxLength={40} autoFocus placeholder="例如：品牌代言人小雅" onChange={(event) => setName(event.target.value)} aria-label="角色名称" /></label>
                <label className="studio-field"><span>外形描述（AI 导演写分镜时会用到）</span><Input.TextArea value={description} maxLength={1000} autoSize={{ minRows: 3, maxRows: 6 }} onChange={(event) => setDescription(event.target.value)} aria-label="外形描述" /></label>
                <p className="studio-hint">这张图会作为角色的主形象图，之后可以在角色库里补充更多照片。</p>
            </div>
        </AppModal>
    );
}
