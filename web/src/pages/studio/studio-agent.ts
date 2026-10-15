import { projectCharacterToInsertPayload } from "@/components/canvas/canvas-project-asset-modal";
import { createCharacterCardNode } from "@/lib/canvas/canvas-character-node";
import type { ProjectCharacterDetail } from "@/services/api/projects";
import { addSkill, listAddedSkills, listSkillPresets } from "@/services/api/skills";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession } from "@/services/user-data-sync";
import type { CanvasNodeData } from "@/types/canvas";
import { compileDirectorPrompt, directorBriefError, directorGenre, directorProjectTitle, type DirectorBrief } from "./studio-director";

/** 交给画布 Agent 的开场消息。放在会话存储里按画布 ID 取用，避免长指令塞进地址栏。 */
export type StudioAgentHandoff = { text: string; displayText?: string; maxCredits?: number };

export const STUDIO_AGENT_HANDOFF_PREFIX = "studio.agent.handoff.";

export function readStudioAgentHandoff(canvasId: string): StudioAgentHandoff | null {
    try {
        const key = `${STUDIO_AGENT_HANDOFF_PREFIX}${canvasId}`;
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return null;
        window.sessionStorage.removeItem(key);
        const value = JSON.parse(raw) as StudioAgentHandoff;
        return typeof value.text === "string" && value.text.trim() ? value : null;
    } catch {
        return null;
    }
}

async function createAgentCanvas(title: string, nodes: CanvasNodeData[] = []) {
    const userId = useUserStore.getState().user?.id;
    if (!userId || !hasRemoteUserDataSyncSession()) throw new Error("登录或同步会话尚未就绪，请稍后重试");
    if (!useCanvasStore.getState().hydrated) throw new Error("画布资料还在加载，请稍后重试");
    const created = await createCanvasProjectWithRemoteSync(title, undefined, nodes.length ? { nodes, connections: [] } : undefined);
    if (!created.id) throw new Error("画布创建失败，请重试");
    if (created.syncError) throw new Error("画布已缓存在本机，但云端尚未保存，请稍后重试");
    if (useUserStore.getState().user?.id !== userId) throw new Error("账号已切换，请重新发送");
    return created.id;
}

/** 画布 Agent 需要真实画布：先建好并同步到云端，再带着需求打开 Agent 自动发送。 */
export async function startStudioAgentRun(prompt: string, title = "AI Studio 创作") {
    const text = prompt.trim();
    if (!text) throw new Error("请先写下你想做什么");
    const id = await createAgentCanvas(title);
    const params = new URLSearchParams({ agent: "1", agentPrompt: text });
    return `/canvas/${encodeURIComponent(id)}?${params.toString()}`;
}

/** 装好场景预设里的技能，返回已确认安装的技能 ID。装不上的技能跳过，不阻断开工。 */
async function ensurePresetSkills(presetId: string) {
    if (!presetId) return [];
    const { presets } = await listSkillPresets();
    const preset = presets.find((item) => item.presetId === presetId);
    if (!preset) return [];
    const installed = new Set((await listAddedSkills()).skills.filter((skill) => skill.isAdded).map((skill) => skill.skillId));
    for (const id of preset.skillIds) {
        if (installed.has(id)) continue;
        try {
            await addSkill(id);
        } catch {
            // 单个技能安装失败时继续，Agent 仍可用其余技能工作。
        }
    }
    const confirmed = new Set((await listAddedSkills()).skills.filter((skill) => skill.isAdded).map((skill) => skill.skillId));
    return preset.skillIds.filter((id) => confirmed.has(id));
}

export type StudioDirectorContext = {
    brand?: { name: string; prompt: string };
    characters?: ProjectCharacterDetail[];
};

/** AI 导演开工：预置角色卡、挂上行业技能、写入开场指令，返回画布地址。 */
export async function startStudioDirectorRun(brief: DirectorBrief, context: StudioDirectorContext = {}) {
    const error = directorBriefError(brief);
    if (error) throw new Error(error);
    const characters = context.characters || [];
    const nodes = characters.map((detail, index) => createCharacterCardNode(
        projectCharacterToInsertPayload({ ...detail.asset, character: detail.character }) as Parameters<typeof createCharacterCardNode>[0],
        { x: 360 + index * 300, y: 260 },
    ));
    const skillIds = await ensurePresetSkills(directorGenre(brief.genre).presetId).catch(() => []);
    const { text, displayText } = compileDirectorPrompt(brief, { brand: context.brand, characters: characters.map((detail) => ({ name: detail.asset.title })), skillIds });
    const id = await createAgentCanvas(directorProjectTitle(brief), nodes);
    try {
        window.sessionStorage.setItem(`${STUDIO_AGENT_HANDOFF_PREFIX}${id}`, JSON.stringify({ text, displayText, maxCredits: brief.budgetCredits } satisfies StudioAgentHandoff));
    } catch {
        throw new Error("浏览器存储不可用，无法把需求交给 AI 导演");
    }
    return `/canvas/${encodeURIComponent(id)}?agent=1&agentHandoff=1`;
}

export const STUDIO_REUSE_KEY = "studio.reuse.v1";

/** 其他页面（角色库、品牌套件）把素材带进工具页：{ kind, attachments }，工具页读取后立即删除。 */
export const STUDIO_ATTACH_KEY = "studio.attach.v1";
