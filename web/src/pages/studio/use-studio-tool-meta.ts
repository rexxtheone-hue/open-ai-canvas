import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getActiveUserScope } from "@/lib/user-scope";
import { listStudioToolCovers } from "@/services/api/studio";

const PINS_EVENT = "studio:pins-changed";

function pinsKey() {
    return `studio.pins.${getActiveUserScope()}.v1`;
}

export function readStudioPins(): string[] {
    try {
        const raw = window.localStorage.getItem(pinsKey());
        const value = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } catch {
        return [];
    }
}

/** 固定到侧边栏的工具，同一浏览器内所有页面同步。 */
export function useStudioPins() {
    const [pins, setPins] = useState<string[]>(() => readStudioPins());
    useEffect(() => {
        const sync = () => setPins(readStudioPins());
        window.addEventListener(PINS_EVENT, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(PINS_EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);
    const toggle = useCallback((id: string) => {
        const current = readStudioPins();
        const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        try {
            window.localStorage.setItem(pinsKey(), JSON.stringify(next));
        } catch {
            // 浏览器存储不可用时只在本页生效。
        }
        setPins(next);
        window.dispatchEvent(new Event(PINS_EVENT));
    }, []);
    return { pins, toggle, isPinned: (id: string) => pins.includes(id) };
}

/** 管理员上传的工具封面，没有封面的工具用渐变图标。 */
export function useStudioToolCovers() {
    // 封面是公开内容，访客浏览 Studio 时同样读取。
    const query = useQuery({
        queryKey: ["studio", "tool-covers"],
        queryFn: async () => (await listStudioToolCovers()).covers,
        staleTime: 10 * 60_000,
    });
    return query.data || {};
}
