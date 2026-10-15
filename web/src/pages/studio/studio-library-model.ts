import type { StudioWork, StudioWorkPage } from "@/services/api/studio";

/** 结果转存可能比任务完成晚几秒到几分钟；这段时间内仍需要继续刷新。 */
const MATERIALIZING_WINDOW_MS = 10 * 60 * 1000;

export function studioWorkIsActive(work: StudioWork, now = Date.now()) {
    if (work.status === "queued" || work.status === "running") return true;
    if (work.status !== "succeeded" || work.media.length > 0) return false;
    const finished = Date.parse(work.completedAt || work.updatedAt || work.createdAt);
    return Number.isFinite(finished) && now - finished < MATERIALIZING_WINDOW_MS;
}

function newerFirst(left: StudioWork, right: StudioWork) {
    return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

/**
 * 刷新第一页后合并到已加载列表：第一页覆盖它覆盖的时间范围（含删除和新作品），
 * 比第一页更早、已经翻页加载的作品保留不动。
 */
export function mergeStudioFirstPage(existing: StudioWork[], page: StudioWorkPage): StudioWork[] {
    const fresh = page.works;
    if (!page.nextCursor || !fresh.length) return [...fresh].sort(newerFirst);
    const oldest = fresh[fresh.length - 1];
    const freshIds = new Set(fresh.map((work) => work.id));
    const older = existing.filter((work) => !freshIds.has(work.id) && newerFirst(oldest, work) < 0);
    return [...fresh, ...older].sort(newerFirst);
}

/** 追加下一页时去重，避免轮询刷新和翻页同时进行时出现重复卡片。 */
export function appendStudioPage(existing: StudioWork[], page: StudioWorkPage): StudioWork[] {
    const seen = new Set(existing.map((work) => work.id));
    return [...existing, ...page.works.filter((work) => !seen.has(work.id))];
}

/** L5：Shift 多选时选中上次点击与本次点击之间的全部作品。 */
export function studioSelectionRange(works: StudioWork[], anchorId: string | null, targetId: string, current: ReadonlySet<string>) {
    const next = new Set(current);
    const targetIndex = works.findIndex((work) => work.id === targetId);
    const anchorIndex = anchorId ? works.findIndex((work) => work.id === anchorId) : -1;
    if (targetIndex < 0) return next;
    if (anchorIndex < 0) {
        next.add(targetId);
        return next;
    }
    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    for (let index = start; index <= end; index += 1) next.add(works[index].id);
    return next;
}

export function studioWorkTitle(work: StudioWork) {
    const prompt = work.prompt.trim();
    return prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt || "未命名作品";
}

export function studioWorkFileName(work: StudioWork, index: number) {
    const media = work.media[index];
    const extension = media?.kind === "video" ? "mp4" : media?.kind === "audio" ? (media.mimeType?.includes("wav") ? "wav" : "mp3") : media?.mimeType?.includes("jpeg") ? "jpg" : media?.mimeType?.includes("webp") ? "webp" : "png";
    const stem = work.prompt.trim().slice(0, 24).replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "studio";
    return `${stem}-${work.id.slice(0, 6)}${work.media.length > 1 ? `-${index + 1}` : ""}.${extension}`;
}
