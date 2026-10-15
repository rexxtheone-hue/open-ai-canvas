import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getActiveUserScope } from "@/lib/user-scope";
import { listStudioBrandKits, type StudioBrandKit } from "@/services/api/studio";
import { useUserStore } from "@/stores/use-user-store";
import { studioBrandPrompt, type StudioBrandContext } from "./studio-generation";

export const STUDIO_BRAND_KITS_QUERY_KEY = ["studio", "brand-kits"] as const;

/** 品牌选择在所有工具间共用。未选择过时跟随默认套件，选了「不使用」记为空字符串。 */
const NO_BRAND = "";

function choiceKey() {
    return `studio.brand.${getActiveUserScope()}.v1`;
}

function readChoice(): string | undefined {
    try {
        const raw = window.localStorage.getItem(choiceKey());
        return raw === null ? undefined : raw;
    } catch {
        return undefined;
    }
}

export function useStudioBrandKits(enabled = true) {
    const user = useUserStore((state) => state.user);
    const query = useQuery({
        queryKey: [...STUDIO_BRAND_KITS_QUERY_KEY, user?.id || ""],
        queryFn: async () => (await listStudioBrandKits()).brandKits,
        enabled: enabled && Boolean(user),
        staleTime: 30_000,
    });
    const queryClient = useQueryClient();
    const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: STUDIO_BRAND_KITS_QUERY_KEY }), [queryClient]);
    return { kits: query.data || [], loading: query.isLoading, error: query.error, refresh };
}

export function studioBrandContext(kit: StudioBrandKit | undefined): StudioBrandContext | undefined {
    return kit ? { id: kit.id, name: kit.name, prompt: studioBrandPrompt(kit) } : undefined;
}

/** 当前选中的品牌：明确选择优先；已删除的套件视为未选择，回到默认套件。 */
export function resolveStudioBrandKit(kits: StudioBrandKit[], choice: string | undefined) {
    if (choice === NO_BRAND) return undefined;
    if (choice) {
        const chosen = kits.find((kit) => kit.id === choice);
        if (chosen) return chosen;
    }
    return kits.find((kit) => kit.isDefault);
}

export function useStudioBrandChoice(enabled: boolean) {
    const { kits, loading } = useStudioBrandKits(enabled);
    const [choice, setChoiceState] = useState<string | undefined>(() => readChoice());
    const kit = useMemo(() => (enabled ? resolveStudioBrandKit(kits, choice) : undefined), [choice, enabled, kits]);
    const setChoice = useCallback((value: string) => {
        setChoiceState(value);
        try {
            window.localStorage.setItem(choiceKey(), value);
        } catch {
            // 浏览器存储不可用时只在本页生效。
        }
    }, []);
    return { kits, loading, kit, context: useMemo(() => studioBrandContext(kit), [kit]), setChoice };
}
