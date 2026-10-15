import { useEffect, useState } from "react";
import { App, Switch } from "antd";

import { AppModal } from "@/components/ui/product/app-modal";
import { publishStudioWork, type StudioWork } from "@/services/api/studio";
import { studioWorkTitle } from "./studio-library-model";

/** 发布到灵感社区：标题必填；可以选择是否让别人「做同款」（关闭时别人看不到提示词和参数）。 */
export function StudioPublishModal({ work, onClose }: { work: StudioWork | null; onClose: () => void }) {
    const { message } = App.useApp();
    const [title, setTitle] = useState("");
    const [allowRemix, setAllowRemix] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!work) return;
        setTitle(studioWorkTitle(work).replace(/…$/, "").slice(0, 60));
        setAllowRemix(true);
    }, [work]);

    const submit = async () => {
        if (!work || saving) return;
        if (!title.trim()) {
            message.warning("请填写标题");
            return;
        }
        setSaving(true);
        try {
            await publishStudioWork(work.id, { title: title.trim(), allowRemix });
            message.success("已发布到灵感社区");
            onClose();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "发布失败，请重试");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppModal open={Boolean(work)} title="发布到灵感社区" okText="发布" cancelText="取消" confirmLoading={saving} onOk={() => void submit()} onCancel={onClose} destroyOnHidden>
            <div className="studio-publish-form">
                <label className="studio-field">
                    <span>标题 <b aria-hidden>*</b></span>
                    <input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="给作品起个名字" />
                </label>
                <label className="studio-switch-row" htmlFor="studio-publish-remix">
                    <span>允许别人做同款（公开提示词和参数）</span>
                    <Switch id="studio-publish-remix" checked={allowRemix} onChange={setAllowRemix} />
                </label>
                <p className="studio-hint">发布后所有用户都能看到这个作品。随时可以在灵感社区「我的发布」里撤回。</p>
            </div>
        </AppModal>
    );
}
