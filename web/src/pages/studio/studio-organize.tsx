import { useEffect, useState } from "react";
import { App, Input, Popover } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Folder, FolderInput, FolderMinus, FolderPlus, Pencil, Plus, Tag, Trash2 } from "./studio-icons";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { createStudioFolder, createStudioLabel, deleteStudioFolder, deleteStudioLabel, getStudioOrganize, labelStudioWorks, moveStudioWorks, renameStudioFolder, updateStudioLabel, type StudioFolder, type StudioLabel, type StudioLabelColor, type StudioWork } from "@/services/api/studio";

/** 标签色板，和后台允许的颜色一致。 */
export const STUDIO_LABEL_COLORS: Record<StudioLabelColor, string> = {
    gray: "#9aa0a6",
    red: "#ef5350",
    orange: "#ff9800",
    yellow: "#fdd835",
    green: "#66bb6a",
    blue: "#42a5f5",
    purple: "#ab47bc",
    pink: "#ec407a",
};

const ORGANIZE_KEY = ["studio", "organize"];

export function useStudioOrganize(enabled = true) {
    return useQuery({ queryKey: ORGANIZE_KEY, queryFn: ({ signal }) => getStudioOrganize(signal), enabled, staleTime: 30_000 });
}

function useOrganizeRefresh() {
    const queryClient = useQueryClient();
    return () => void queryClient.invalidateQueries({ queryKey: ORGANIZE_KEY });
}

type NameDialog = { mode: "folder" | "label"; id?: string; name: string; color: StudioLabelColor } | null;

/** 新建或重命名文件夹、标签的弹窗。onDone 返回新建的 ID。 */
function NameDialogModal({ dialog, onClose, onDone }: { dialog: NameDialog; onClose: () => void; onDone?: (id: string) => void }) {
    const { message } = App.useApp();
    const refresh = useOrganizeRefresh();
    const [name, setName] = useState("");
    const [color, setColor] = useState<StudioLabelColor>("gray");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!dialog) return;
        setName(dialog.name);
        setColor(dialog.color);
    }, [dialog]);
    const save = async () => {
        if (!dialog || !name.trim() || saving) return;
        setSaving(true);
        try {
            let id = dialog.id || "";
            if (dialog.mode === "folder") {
                if (dialog.id) await renameStudioFolder(dialog.id, name);
                else id = (await createStudioFolder(name)).id;
            } else if (dialog.id) await updateStudioLabel(dialog.id, { name, color });
            else id = (await createStudioLabel(name, color)).id;
            refresh();
            onDone?.(id);
            onClose();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };
    const title = dialog?.mode === "folder" ? (dialog.id ? "重命名文件夹" : "新建文件夹") : dialog?.id ? "编辑标签" : "新建标签";
    return (
        <AppModal rootClassName="studio-modal" open={Boolean(dialog)} title={title} okText={saving ? "保存中…" : "保存"} cancelText="取消" okButtonProps={{ disabled: !name.trim() || saving }} onOk={() => void save()} onCancel={onClose} destroyOnHidden>
            <div className="studio-popup studio-feedback">
                <Input autoFocus value={name} maxLength={dialog?.mode === "folder" ? 60 : 40} placeholder={dialog?.mode === "folder" ? "例如：产品图" : "例如：已发布"} onChange={(event) => setName(event.target.value)} onPressEnter={() => void save()} aria-label="名称" />
                {dialog?.mode === "label" ? (
                    <div className="studio-label-colors" role="radiogroup" aria-label="标签颜色">
                        {(Object.keys(STUDIO_LABEL_COLORS) as StudioLabelColor[]).map((value) => (
                            <button key={value} type="button" role="radio" aria-checked={color === value} aria-label={value} style={{ background: STUDIO_LABEL_COLORS[value] }} onClick={() => setColor(value)}>{color === value ? <Check aria-hidden /> : null}</button>
                        ))}
                    </div>
                ) : null}
            </div>
        </AppModal>
    );
}

function useConfirmDelete() {
    const { modal, message } = App.useApp();
    const refresh = useOrganizeRefresh();
    return (mode: "folder" | "label", item: { id: string; name: string }, onDeleted: () => void) => {
        modal.confirm({
            title: mode === "folder" ? `删除文件夹「${item.name}」？` : `删除标签「${item.name}」？`,
            content: mode === "folder" ? "里面的作品不会被删除，会回到「未归类」。" : "作品不会被删除，只是摘掉这个标签。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            rootClassName: "studio-modal",
            onOk: async () => {
                try {
                    if (mode === "folder") await deleteStudioFolder(item.id);
                    else await deleteStudioLabel(item.id);
                    refresh();
                    onDeleted();
                } catch (cause) {
                    message.error(cause instanceof Error ? cause.message : "删除失败");
                }
            },
        });
    };
}

/** 作品范围菜单里的文件夹列表：选中、重命名、删除、新建。 */
export function StudioFolderSection({ current, onSelect }: { current?: string; onSelect: (folder: string | undefined) => void }) {
    const organize = useStudioOrganize();
    const [dialog, setDialog] = useState<NameDialog>(null);
    const confirmDelete = useConfirmDelete();
    const folders = organize.data?.folders || [];
    return (
        <>
            <div className="studio-menu-title">文件夹</div>
            {folders.map((folder: StudioFolder) => (
                <div key={folder.id} className="studio-organize-row">
                    <button type="button" role="menuitemradio" aria-checked={current === folder.id} onClick={() => onSelect(folder.id)}>
                        <Folder aria-hidden /><span>{folder.name}</span><small>{folder.count}</small>{current === folder.id ? <Check className="studio-menu-check" aria-hidden /> : null}
                    </button>
                    <button type="button" className="studio-icon-button is-ghost is-tiny" aria-label={`重命名 ${folder.name}`} title="重命名" onClick={() => setDialog({ mode: "folder", id: folder.id, name: folder.name, color: "gray" })}><Pencil aria-hidden /></button>
                    <button type="button" className="studio-icon-button is-ghost is-tiny" aria-label={`删除 ${folder.name}`} title="删除" onClick={() => confirmDelete("folder", folder, () => current === folder.id && onSelect(undefined))}><Trash2 aria-hidden /></button>
                </div>
            ))}
            <button type="button" role="menuitem" onClick={() => setDialog({ mode: "folder", name: "", color: "gray" })}><FolderPlus aria-hidden />新建文件夹</button>
            <NameDialogModal dialog={dialog} onClose={() => setDialog(null)} onDone={(id) => !dialog?.id && onSelect(id)} />
        </>
    );
}

export function StudioLabelDot({ label }: { label: StudioLabel }) {
    return <span className="studio-label-dot" style={{ background: STUDIO_LABEL_COLORS[label.color] || STUDIO_LABEL_COLORS.gray }} aria-hidden />;
}

/** 工具栏的标签筛选：点标签只看带这个标签的作品，也可以管理标签。 */
export function StudioLabelFilter({ current, onSelect }: { current?: string; onSelect: (label: string | undefined) => void }) {
    const [open, setOpen] = useState(false);
    const organize = useStudioOrganize();
    const [dialog, setDialog] = useState<NameDialog>(null);
    const confirmDelete = useConfirmDelete();
    const labels = organize.data?.labels || [];
    const active = labels.find((label) => label.id === current);
    return (
        <>
            <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" arrow={false} content={(
                <div className="studio-menu" role="menu">
                    <div className="studio-menu-title">标签</div>
                    <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => { onSelect(undefined); setOpen(false); }}>全部标签{!current ? <Check className="studio-menu-check" aria-hidden /> : null}</button>
                    {labels.map((label) => (
                        <div key={label.id} className="studio-organize-row">
                            <button type="button" role="menuitemradio" aria-checked={current === label.id} onClick={() => { onSelect(label.id); setOpen(false); }}>
                                <StudioLabelDot label={label} /><span>{label.name}</span>{current === label.id ? <Check className="studio-menu-check" aria-hidden /> : null}
                            </button>
                            <button type="button" className="studio-icon-button is-ghost is-tiny" aria-label={`编辑 ${label.name}`} title="编辑" onClick={() => setDialog({ mode: "label", id: label.id, name: label.name, color: label.color })}><Pencil aria-hidden /></button>
                            <button type="button" className="studio-icon-button is-ghost is-tiny" aria-label={`删除 ${label.name}`} title="删除" onClick={() => confirmDelete("label", label, () => current === label.id && onSelect(undefined))}><Trash2 aria-hidden /></button>
                        </div>
                    ))}
                    <button type="button" role="menuitem" onClick={() => setDialog({ mode: "label", name: "", color: "blue" })}><Plus aria-hidden />新建标签</button>
                </div>
            )}>
                <button type="button" className={`studio-toolbar-icon${current ? " is-active" : ""}`} aria-label={active ? `标签：${active.name}` : "标签筛选"} title={active ? `标签：${active.name}` : "标签"}><Tag aria-hidden /></button>
            </Popover>
            <NameDialogModal dialog={dialog} onClose={() => setDialog(null)} />
        </>
    );
}

/** 选中作品后的「移到文件夹」。 */
export function StudioMoveToFolder({ works, onDone }: { works: StudioWork[]; onDone: () => void }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState<NameDialog>(null);
    const organize = useStudioOrganize();
    const refresh = useOrganizeRefresh();
    const move = async (folderId: string, name?: string) => {
        setOpen(false);
        try {
            const result = await moveStudioWorks(works.map((work) => work.id), folderId);
            refresh();
            message.success(folderId ? `已把 ${result.moved} 个作品移到「${name}」` : `已把 ${result.moved} 个作品移出文件夹`);
            onDone();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "移动失败");
        }
    };
    return (
        <>
            <Popover open={open} onOpenChange={setOpen} trigger="click" placement="top" arrow={false} content={(
                <div className="studio-menu" role="menu">
                    <div className="studio-menu-title">移到文件夹</div>
                    {(organize.data?.folders || []).map((folder) => <button key={folder.id} type="button" role="menuitem" onClick={() => void move(folder.id, folder.name)}><Folder aria-hidden />{folder.name}</button>)}
                    {works.some((work) => work.folderId) ? <button type="button" role="menuitem" onClick={() => void move("")}><FolderMinus aria-hidden />移出文件夹</button> : null}
                    <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog({ mode: "folder", name: "", color: "gray" }); }}><FolderPlus aria-hidden />新建文件夹并移入</button>
                </div>
            )}>
                <button type="button" className="studio-mini-button"><FolderInput aria-hidden />移到文件夹</button>
            </Popover>
            <NameDialogModal dialog={dialog} onClose={() => setDialog(null)} onDone={(id) => void moveStudioWorks(works.map((work) => work.id), id).then(() => { refresh(); onDone(); }).catch((cause) => message.error(cause instanceof Error ? cause.message : "移动失败"))} />
        </>
    );
}

/** 选中作品后的「标签」：全部已带的标签点一下摘掉，否则加上。 */
export function StudioLabelWorks({ works, onDone }: { works: StudioWork[]; onDone: () => void }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState<NameDialog>(null);
    const organize = useStudioOrganize();
    const toggle = async (label: StudioLabel) => {
        const add = !works.every((work) => work.labelIds?.includes(label.id));
        try {
            await labelStudioWorks(works.map((work) => work.id), label.id, add);
            message.success(add ? `已加上标签「${label.name}」` : `已摘掉标签「${label.name}」`);
            onDone();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "操作失败");
        }
    };
    return (
        <>
            <Popover open={open} onOpenChange={setOpen} trigger="click" placement="top" arrow={false} content={(
                <div className="studio-menu" role="menu">
                    <div className="studio-menu-title">标签</div>
                    {(organize.data?.labels || []).map((label) => {
                        const all = works.every((work) => work.labelIds?.includes(label.id));
                        return (
                            <button key={label.id} type="button" role="menuitemcheckbox" aria-checked={all} onClick={() => void toggle(label)}>
                                <StudioLabelDot label={label} />{label.name}{all ? <Check className="studio-menu-check" aria-hidden /> : null}
                            </button>
                        );
                    })}
                    <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog({ mode: "label", name: "", color: "blue" }); }}><Plus aria-hidden />新建标签</button>
                </div>
            )}>
                <button type="button" className="studio-mini-button"><Tag aria-hidden />标签</button>
            </Popover>
            <NameDialogModal dialog={dialog} onClose={() => setDialog(null)} onDone={(id) => void labelStudioWorks(works.map((work) => work.id), id, true).then(onDone).catch((cause) => message.error(cause instanceof Error ? cause.message : "操作失败"))} />
        </>
    );
}
