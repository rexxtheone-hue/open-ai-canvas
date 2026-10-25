import { useState } from "react";
import { App, Input, Popover } from "antd";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CircleHelp, FileText, Gift, Headset, MessageSquareWarning } from "./studio-icons";
import { Link, useLocation } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { announcementImageUrl, getAnnouncementFeed } from "@/services/api/announcements";
import { submitStudioFeedback, type StudioFeedbackCategory } from "@/services/api/studio-agents";
import { StudioSelect } from "./studio-select";

const FEEDBACK_CATEGORIES: Array<{ value: StudioFeedbackCategory; label: string }> = [
    { value: "bug", label: "问题或故障" },
    { value: "idea", label: "功能建议" },
    { value: "billing", label: "积分与付费" },
    { value: "other", label: "其他" },
];

/** 反馈弹窗：写下问题或建议，管理员在后台处理。 */
export function StudioFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const { pathname } = useLocation();
    const [category, setCategory] = useState<StudioFeedbackCategory>("bug");
    const [content, setContent] = useState("");
    const [contact, setContact] = useState("");
    const [sending, setSending] = useState(false);
    const send = async () => {
        if (!content.trim() || sending) return;
        setSending(true);
        try {
            await submitStudioFeedback({ category, content, contact, page: pathname });
            message.success("已收到反馈，谢谢！");
            setContent("");
            onClose();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "提交失败，请重试");
        } finally {
            setSending(false);
        }
    };
    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(520px, calc(100vw - 32px))" title="反馈" footer={null} onCancel={onClose}>
            <div className="studio-popup studio-feedback">
                <div className="studio-field"><span>类型</span><StudioSelect className="studio-select" placement="bottomLeft" value={category} onChange={(value) => setCategory(value as typeof category)} options={FEEDBACK_CATEGORIES} ariaLabel="反馈类型" /></div>
                <label className="studio-field"><span>内容</span><Input.TextArea value={content} maxLength={4000} showCount autoSize={{ minRows: 5, maxRows: 10 }} placeholder="遇到了什么情况？在哪个页面、做了什么操作？" onChange={(event) => setContent(event.target.value)} aria-label="反馈内容" /></label>
                <label className="studio-field"><span>联系方式（可选）</span><Input value={contact} maxLength={200} placeholder="邮箱或电话，方便我们回复你" onChange={(event) => setContact(event.target.value)} aria-label="联系方式" /></label>
                <div className="studio-voice-foot">
                    <span style={{ flex: 1 }} />
                    <button type="button" className="studio-mini-button" onClick={onClose}>取消</button>
                    <button type="button" className="studio-mini-button is-primary" disabled={!content.trim() || sending} onClick={() => void send()}>{sending ? "提交中…" : "提交"}</button>
                </div>
            </div>
        </AppModal>
    );
}

/** 顶部栏的帮助菜单：更新动态、帮助中心、反馈、联系客服、条款与政策。 */
export function StudioHelpMenu() {
    const [open, setOpen] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const close = () => setOpen(false);
    return (
        <>
            <Popover
                open={open}
                onOpenChange={setOpen}
                trigger="click"
                placement="bottomRight"
                arrow={false}
                content={(
                    <div className="studio-popup studio-menu" role="menu" aria-label="帮助">
                        <Link to="/studio/help" className="studio-menu-item" role="menuitem" onClick={close}><BookOpen aria-hidden />帮助中心</Link>
                        <button type="button" className="studio-menu-item" role="menuitem" onClick={() => { close(); setFeedbackOpen(true); }}><MessageSquareWarning aria-hidden />反馈</button>
                        <Link to="/studio/help#support" className="studio-menu-item" role="menuitem" onClick={close}><Headset aria-hidden />联系客服</Link>
                        <Link to="/studio/terms" className="studio-menu-item" role="menuitem" onClick={close}><FileText aria-hidden />条款与政策</Link>
                    </div>
                )}
            >
                <button type="button" className="studio-topbar-icon" aria-label="帮助" title="帮助"><CircleHelp aria-hidden /></button>
            </Popover>
            <StudioFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
        </>
    );
}

/** 顶部栏的活动中心：列出管理员发布的公告和活动。 */
export function StudioGiftCenter() {
    const [open, setOpen] = useState(false);
    const feed = useQuery({ queryKey: ["studio", "gift-center"], queryFn: getAnnouncementFeed, enabled: open, staleTime: 60_000 });
    const items = feed.data?.announcements || [];
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger="click"
            placement="bottomRight"
            arrow={false}
            content={(
                <div className="studio-popup studio-gift" aria-label="活动中心">
                    <strong>活动与公告</strong>
                    {feed.isLoading ? <p className="studio-hint">正在加载…</p> : items.length ? items.map((item) => {
                        const image = announcementImageUrl(item);
                        return (
                            <article key={item.id} className="studio-gift-item">
                                {image ? <img src={image} alt="" /> : null}
                                <div>
                                    <b>{item.pinned ? <em className="studio-tag is-hot">置顶</em> : null}{item.title}</b>
                                    <p>{item.content.slice(0, 160)}{item.content.length > 160 ? "…" : ""}</p>
                                    <small>{new Date(item.publishedAt || item.createdAt).toLocaleDateString("zh-CN")}</small>
                                </div>
                            </article>
                        );
                    }) : <p className="studio-hint">现在没有进行中的活动。</p>}
                </div>
            )}
        >
            <button type="button" className="studio-topbar-icon" aria-label="活动中心" title="活动中心">
                <Gift aria-hidden />
                {feed.data?.unreadCount ? <span className="studio-topbar-dot" aria-hidden /> : null}
            </button>
        </Popover>
    );
}
