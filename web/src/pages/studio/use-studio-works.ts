import { useCallback, useEffect, useRef, useState } from "react";

import { deleteStudioWorks, listStudioWorks, setStudioWorkFavorite, type StudioKind, type StudioWork, type StudioWorkQuery } from "@/services/api/studio";
import { useUserStore } from "@/stores/use-user-store";
import { appendStudioPage, mergeStudioFirstPage, studioWorkIsActive } from "./studio-library-model";

/** 提交成功后广播，作品库立即刷新，不等下一次轮询。 */
export const STUDIO_WORKS_CHANGED_EVENT = "studio:works-changed";

export function notifyStudioWorksChanged() {
    window.dispatchEvent(new CustomEvent(STUDIO_WORKS_CHANGED_EVENT));
}

const POLL_INTERVAL_MS = 4000;
const PAGE_SIZE = 40;

/** folder 为文件夹 ID 或 unsorted；label 为标签 ID。 */
export type StudioWorksFilter = { kind: StudioKind | "all"; favorite: boolean; q: string; folder?: string; label?: string };

export function useStudioWorks(filter: StudioWorksFilter) {
    const userId = useUserStore((state) => state.user?.id || "");
    const [works, setWorks] = useState<StudioWork[]>([]);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const worksRef = useRef(works);
    worksRef.current = works;
    const query: StudioWorkQuery = { kind: filter.kind, favorite: filter.favorite, q: filter.q, folder: filter.folder, label: filter.label, pageSize: PAGE_SIZE };
    const queryKey = `${userId}|${filter.kind}|${filter.favorite}|${filter.q.trim()}|${filter.folder || ""}|${filter.label || ""}`;
    const queryRef = useRef(query);
    queryRef.current = query;
    const generationRef = useRef(0);

    const refreshFirstPage = useCallback(async (reset: boolean) => {
        if (!userId) return;
        const generation = reset ? ++generationRef.current : generationRef.current;
        if (reset) {
            setLoading(true);
            setError("");
        }
        try {
            const page = await listStudioWorks(queryRef.current);
            if (generation !== generationRef.current) return;
            setWorks((current) => (reset ? page.works : mergeStudioFirstPage(current, page)));
            if (reset) setNextCursor(page.nextCursor);
            setError("");
        } catch (cause) {
            if (generation !== generationRef.current) return;
            if (reset) setError(cause instanceof Error ? cause.message : "作品读取失败");
        } finally {
            if (reset && generation === generationRef.current) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        setWorks([]);
        setNextCursor(undefined);
        void refreshFirstPage(true);
    }, [queryKey, refreshFirstPage]);

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMore) return;
        const generation = generationRef.current;
        setLoadingMore(true);
        try {
            const page = await listStudioWorks({ ...queryRef.current, cursor: nextCursor });
            if (generation !== generationRef.current) return;
            setWorks((current) => appendStudioPage(current, page));
            setNextCursor(page.nextCursor);
        } catch (cause) {
            if (generation === generationRef.current) setError(cause instanceof Error ? cause.message : "作品读取失败");
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, nextCursor]);

    const hasActive = works.some((work) => studioWorkIsActive(work));
    // 作品结束（成功扣费或失败退款）后刷新积分余额，避免顶栏显示冻结前的旧数字。
    const activeIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const active = new Set(works.filter((work) => work.status === "queued" || work.status === "running").map((work) => work.id));
        const finished = [...activeIdsRef.current].some((id) => !active.has(id));
        activeIdsRef.current = active;
        if (finished) window.dispatchEvent(new CustomEvent("wallet:updated"));
    }, [works]);
    useEffect(() => {
        if (!hasActive) return;
        const timer = window.setInterval(() => void refreshFirstPage(false), POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [hasActive, refreshFirstPage]);

    useEffect(() => {
        const handle = () => void refreshFirstPage(false);
        window.addEventListener(STUDIO_WORKS_CHANGED_EVENT, handle);
        return () => window.removeEventListener(STUDIO_WORKS_CHANGED_EVENT, handle);
    }, [refreshFirstPage]);

    const toggleFavorite = useCallback(async (work: StudioWork) => {
        const favorite = !work.favorite;
        const apply = (value: boolean) => setWorks((current) => current.flatMap((item) => {
            if (item.id !== work.id) return [item];
            if (!value && queryRef.current.favorite) return [];
            return [{ ...item, favorite: value }];
        }));
        apply(favorite);
        try {
            await setStudioWorkFavorite(work.id, favorite);
        } catch (cause) {
            setWorks((current) => (current.some((item) => item.id === work.id) ? current.map((item) => (item.id === work.id ? { ...item, favorite: work.favorite } : item)) : mergeStudioFirstPage(current, { works: [work] })));
            throw cause;
        }
    }, []);

    const removeWorks = useCallback(async (ids: string[]) => {
        if (!ids.length) return 0;
        const result = await deleteStudioWorks(ids);
        const removed = new Set(ids);
        setWorks((current) => current.filter((work) => !removed.has(work.id)));
        return result.removed;
    }, []);

    return { works, loading, loadingMore, error, hasMore: Boolean(nextCursor), loadMore, refresh: () => refreshFirstPage(true), toggleFavorite, removeWorks };
}
