import { useState } from "react";
import { App, Button } from "antd";
import { useQueryClient } from "@tanstack/react-query";

import { StudioToolThumb } from "@/pages/studio/studio-tool-thumb";
import { STUDIO_QUICK_STARTS } from "@/pages/studio/studio-quickstarts";
import { STUDIO_TOOLS } from "@/pages/studio/studio-tools";
import { CAMERA_MOVES, cameraMoveCoverId } from "@/pages/studio/studio-prompt-tools";
import { Camera } from "@/pages/studio/studio-icons";
import { useStudioToolCovers } from "@/pages/studio/use-studio-tool-meta";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { setAdminStudioToolCover } from "@/services/api/studio";
import { uploadImage } from "@/services/image-storage";

/** 工具封面：在工具列表、网格和侧栏固定区显示，建议 1:1。快速开始封面：首页和 AI 导演的行业海报卡片，建议 4:3 竖构图偏上。 */
export function StudioToolCoversPanel() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const covers = useStudioToolCovers();
    const [busy, setBusy] = useState("");

    const save = async (toolId: string, file: File | undefined | null) => {
        setBusy(toolId);
        try {
            let resourceId = "";
            if (file) {
                if (!file.type.startsWith("image/")) throw new Error("封面需要是图片");
                resourceId = resourceIdFromStorageKey((await uploadImage(file)).storageKey);
                if (!resourceId) throw new Error("封面没有保存到云端，请稍后重试");
            }
            await setAdminStudioToolCover(toolId, resourceId);
            await queryClient.invalidateQueries({ queryKey: ["studio", "tool-covers"] });
            message.success(file ? "封面已更新" : "已恢复默认封面");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setBusy("");
        }
    };

    const entries = [
        ...STUDIO_QUICK_STARTS.map((item) => ({ id: item.coverId, label: `快速开始 · ${item.label}`, tool: { ...STUDIO_TOOLS[0], id: item.coverId, label: item.label, icon: item.icon, gradient: item.gradient } })),
        ...STUDIO_TOOLS.map((tool) => ({ id: tool.id, label: tool.label, tool })),
        ...CAMERA_MOVES.map((move) => ({ id: cameraMoveCoverId(move.value), label: `运镜 · ${move.label}`, tool: { ...STUDIO_TOOLS[0], id: cameraMoveCoverId(move.value), label: move.label, icon: Camera, gradient: ["#1f2937", "#4b5563"] as [string, string] } })),
    ];
    return (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {entries.map(({ id, label, tool }) => (
                <div key={id} className="flex items-center gap-3 rounded-xl border border-foreground/10 p-3">
                    <StudioToolThumb tool={tool} cover={covers[tool.id]} size={64} />
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{label}</div>
                        <div className="mt-2 flex gap-2">
                            <label className="cursor-pointer">
                                <span className="inline-flex h-7 items-center rounded-lg bg-foreground/10 px-3 text-xs">{busy === tool.id ? "上传中…" : "上传封面"}</span>
                                <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={(event) => { void save(tool.id, event.target.files?.[0]); event.target.value = ""; }} />
                            </label>
                            {covers[tool.id] ? <Button size="small" disabled={Boolean(busy)} onClick={() => void save(tool.id, null)}>恢复默认</Button> : null}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
