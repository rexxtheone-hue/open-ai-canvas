import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession } from "@/services/user-data-sync";

/** 画布 Agent 需要真实画布：先建好并同步到云端，再带着需求打开 Agent 自动发送。 */
export async function startStudioAgentRun(prompt: string, title = "AI Studio 创作") {
    const text = prompt.trim();
    if (!text) throw new Error("请先写下你想做什么");
    const userId = useUserStore.getState().user?.id;
    if (!userId || !hasRemoteUserDataSyncSession()) throw new Error("登录或同步会话尚未就绪，请稍后重试");
    if (!useCanvasStore.getState().hydrated) throw new Error("画布资料还在加载，请稍后重试");
    const created = await createCanvasProjectWithRemoteSync(title);
    if (!created.id) throw new Error("画布创建失败，请重试");
    if (created.syncError) throw new Error("画布已缓存在本机，但云端尚未保存，请稍后重试");
    if (useUserStore.getState().user?.id !== userId) throw new Error("账号已切换，请重新发送");
    const params = new URLSearchParams({ agent: "1", agentPrompt: text });
    return `/canvas/${encodeURIComponent(created.id)}?${params.toString()}`;
}

export const STUDIO_REUSE_KEY = "studio.reuse.v1";
