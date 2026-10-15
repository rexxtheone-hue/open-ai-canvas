import type { CreationAttachment } from "@/pages/create/creation-assets";
import type { StudioKind, StudioMedia, StudioWork } from "@/services/api/studio";
import { resolveResourceUrl } from "@/services/api/resources";

/** 对话模式：Agent 先回复，再用 studio-actions 代码块给出生成计划。纯函数，便于测试。 */

export type StudioRunMode = "ask" | "auto";

export type StudioChatActionStatus = "proposed" | "submitted" | "skipped" | "failed";

export type StudioChatAction = {
    id: string;
    kind: StudioKind;
    prompt: string;
    ratio?: string;
    seconds?: number;
    count?: number;
    /** 引用的素材编号（对话素材清单里的 #n）。 */
    refs?: number[];
    status: StudioChatActionStatus;
    taskIds?: string[];
    error?: string;
    model?: string;
};

export type StudioChatAttachment = {
    id: string;
    kind: StudioKind;
    name: string;
    url: string;
    storageKey?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

export type StudioChatMessageLike = {
    role: "user" | "assistant";
    content: string;
    actions?: StudioChatAction[];
    attachments?: StudioChatAttachment[];
};

export type StudioChatAsset = {
    index: number;
    kind: StudioKind;
    label: string;
    /** 可作为参考素材发送；生成中或失败的结果为空。 */
    attachment?: CreationAttachment;
    taskId?: string;
    status: "ready" | "pending" | "failed";
};

export const STUDIO_CHAT_MAX_ACTIONS = 4;
export const STUDIO_CHAT_MAX_ATTACHMENTS = 6;
const HISTORY_LIMIT = 24;
const KIND_LABEL: Record<StudioKind, string> = { image: "图片", video: "视频", audio: "音频" };
const RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "3:2", "2:3", "21:9"]);
const BLOCK = /```studio-actions\s*([\s\S]*?)```/g;

export function studioKindLabel(kind: StudioKind) {
    return KIND_LABEL[kind];
}

function mediaKind(mimeType: string | undefined, fallback: StudioKind): StudioKind {
    if (mimeType?.startsWith("video/")) return "video";
    if (mimeType?.startsWith("audio/")) return "audio";
    if (mimeType?.startsWith("image/")) return "image";
    return fallback;
}

/** 对话附件转成生成用的参考素材。图片的 dataUrl 用可访问地址，后端按 storageKey 取原文件。 */
export function studioChatAttachmentToCreation(item: StudioChatAttachment): CreationAttachment {
    const url = item.storageKey ? resolveResourceUrl(item.storageKey, item.url) : item.url;
    const type = item.mimeType || (item.kind === "image" ? "image/png" : item.kind === "video" ? "video/mp4" : "audio/mpeg");
    const base = { id: item.id, name: item.name, type, url, storageKey: item.storageKey, previewUrl: url };
    if (item.kind === "image") return { ...base, dataUrl: url, width: item.width, height: item.height };
    if (item.kind === "video") return { ...base, width: item.width, height: item.height, durationMs: item.durationMs };
    return { ...base, durationMs: item.durationMs };
}

/** 上传或作品库素材存进消息：只保存可长期访问的 storageKey 和展示信息，不存 data URL。 */
export function studioChatAttachmentFromCreation(item: CreationAttachment): StudioChatAttachment | null {
    const kind = item.type.startsWith("video/") ? "video" : item.type.startsWith("audio/") ? "audio" : item.type.startsWith("image/") ? "image" : null;
    if (!kind || !("url" in item)) return null;
    const url = item.url || ("dataUrl" in item ? item.dataUrl : "") || "";
    if (!item.storageKey && (!url || url.startsWith("data:"))) return null;
    return {
        id: item.id,
        kind,
        name: item.name,
        url: url.startsWith("data:") ? "" : url,
        storageKey: item.storageKey,
        mimeType: item.type,
        width: "width" in item ? item.width : undefined,
        height: "height" in item ? item.height : undefined,
        durationMs: "durationMs" in item ? item.durationMs : undefined,
    };
}

export function studioChatAttachmentFromWork(work: StudioWork, media: StudioMedia, index = 0): StudioChatAttachment {
    return {
        id: `work:${work.id}:${index}`,
        kind: mediaKind(media.mimeType, media.kind),
        name: (work.prompt || "").slice(0, 24) || `${KIND_LABEL[work.kind]}作品`,
        url: media.url || "",
        storageKey: media.storageKey,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
    };
}

/**
 * 对话里所有可引用的素材，按出现顺序编号：用户附件、每个已提交生成任务的结果（每个任务一个产物）。
 * 编号只依赖消息内容，结果是否完成不影响编号，Agent 前后引用一致。
 */
export function studioChatAssets(messages: StudioChatMessageLike[], works: Map<string, StudioWork>): StudioChatAsset[] {
    const assets: StudioChatAsset[] = [];
    for (const message of messages) {
        if (message.role === "user") {
            for (const item of message.attachments || []) {
                assets.push({ index: assets.length + 1, kind: item.kind, label: `用户提供的${KIND_LABEL[item.kind]}「${item.name}」`, attachment: studioChatAttachmentToCreation(item), status: "ready" });
            }
            continue;
        }
        for (const action of message.actions || []) {
            for (const taskId of action.taskIds || []) {
                const work = works.get(taskId);
                const media = work?.media[0];
                const status = work?.status === "succeeded" && media ? "ready" : work?.status === "failed" || work?.status === "cancelled" ? "failed" : "pending";
                const prompt = Array.from(action.prompt).slice(0, 40).join("");
                assets.push({
                    index: assets.length + 1,
                    kind: action.kind,
                    label: `生成的${KIND_LABEL[action.kind]}（${prompt}）`,
                    attachment: status === "ready" && work && media ? studioChatAttachmentToCreation(studioChatAttachmentFromWork(work, media)) : undefined,
                    taskId,
                    status,
                });
            }
        }
    }
    return assets;
}

export function studioChatSystemPrompt(input: { kinds: StudioKind[]; assets: StudioChatAsset[]; brand?: string }) {
    const kinds = input.kinds.map((kind) => KIND_LABEL[kind]).join("、") || "暂无";
    const assetLines = input.assets.length
        ? input.assets.map((asset) => `#${asset.index} ${asset.label}${asset.status === "pending" ? "（生成中，暂不能引用）" : asset.status === "failed" ? "（生成失败，不能引用）" : ""}`).join("\n")
        : "（暂无）";
    return [
        "你是 AI Studio 的创作助手，帮用户做图片、视频和配音。用用户的语言简洁回复。",
        `当前可以生成：${kinds}。`,
        "当用户想要生成内容时，先用一两句话说明你的安排，然后在回复最后附上一个代码块，格式严格如下：",
        "```studio-actions",
        '[{"kind":"image","prompt":"详细的画面描述","ratio":"1:1","count":1,"refs":[1]}]',
        "```",
        "字段规则：",
        "- kind 只能是 image、video、audio，且必须是当前可以生成的类型。",
        "- prompt 写成可直接给生成模型的完整描述：主体、场景、构图、光线、风格、镜头运动（视频）。audio 的 prompt 是要原样朗读的文案。",
        "- ratio 可选 1:1、16:9、9:16、4:3、3:4；视频用 seconds 写秒数（通常 5 或 10）。",
        "- count 是同一需求要几个版本，1 到 4，默认 1。",
        "- refs 是要参考的素材编号（见下方素材清单），例如改图、图生视频、保持同一角色时使用；没有就省略。",
        `- 一次最多 ${STUDIO_CHAT_MAX_ACTIONS} 项。`,
        "需求不清楚时先提问，不要附代码块。只是聊天或回答问题时也不要附代码块。",
        "不要编造链接或声称已经生成完成；生成由系统执行，结果会显示在对话里。",
        input.brand ? `\n品牌要求（图片和视频都要符合）：\n${input.brand}` : "",
        `\n对话素材清单：\n${assetLines}`,
    ].filter(Boolean).join("\n");
}

/** 流式输出时隐藏还没写完的代码块。 */
export function studioChatVisibleText(text: string) {
    const start = text.indexOf("```studio-actions");
    return (start < 0 ? text : text.slice(0, start)).trimEnd();
}

function cleanNumber(value: unknown, min: number, max: number) {
    const number = typeof value === "string" ? Number(value) : value;
    if (typeof number !== "number" || !Number.isFinite(number)) return undefined;
    return Math.min(max, Math.max(min, Math.round(number)));
}

/** 解析 Agent 回复：正文去掉代码块；计划逐项校验，非法项丢弃，只认最后一个代码块。 */
export function parseStudioChatReply(text: string, options: { kinds: StudioKind[]; assetCount: number; newId?: () => string }) {
    const matches = [...text.matchAll(BLOCK)];
    const content = text.replace(BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!matches.length) return { content, actions: [] as StudioChatAction[] };
    let parsed: unknown;
    try {
        parsed = JSON.parse(matches[matches.length - 1][1].trim());
    } catch {
        return { content, actions: [] as StudioChatAction[], invalid: true };
    }
    const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { actions?: unknown }).actions) ? (parsed as { actions: unknown[] }).actions : [];
    const newId = options.newId || (() => crypto.randomUUID());
    const actions: StudioChatAction[] = [];
    for (const raw of list) {
        if (actions.length >= STUDIO_CHAT_MAX_ACTIONS) break;
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const kind = item.kind;
        if (kind !== "image" && kind !== "video" && kind !== "audio") continue;
        if (!options.kinds.includes(kind)) continue;
        const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
        if (!prompt || Array.from(prompt).length > 4000) continue;
        const action: StudioChatAction = { id: newId(), kind, prompt, status: "proposed" };
        if (typeof item.ratio === "string" && RATIOS.has(item.ratio.trim()) && kind !== "audio") action.ratio = item.ratio.trim();
        if (kind === "video") action.seconds = cleanNumber(item.seconds, 1, 60);
        if (kind === "image") action.count = cleanNumber(item.count, 1, 4) || 1;
        if (Array.isArray(item.refs)) {
            const refs = [...new Set(item.refs.map((ref) => cleanNumber(ref, 1, Number.MAX_SAFE_INTEGER)).filter((ref): ref is number => ref !== undefined && ref <= options.assetCount))];
            if (refs.length) action.refs = refs.slice(0, STUDIO_CHAT_MAX_ATTACHMENTS);
        }
        actions.push(action);
    }
    return { content, actions };
}

function actionSummary(action: StudioChatAction) {
    const state = action.status === "submitted" ? "已提交生成" : action.status === "skipped" ? "用户跳过" : action.status === "failed" ? `失败：${action.error || ""}` : "等待用户确认";
    return `[${KIND_LABEL[action.kind]}｜${state}] ${action.prompt}`;
}

/** 发给模型的历史：附件写成编号，计划写成一行摘要，只保留最近若干条。 */
export function studioChatHistory(messages: StudioChatMessageLike[]) {
    let counter = 0;
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const message of messages) {
        if (message.role === "user") {
            const refs = (message.attachments || []).map((item) => `#${++counter} ${KIND_LABEL[item.kind]}`);
            history.push({ role: "user", content: [message.content, refs.length ? `（附件：${refs.join("、")}）` : ""].filter(Boolean).join("\n") || "（发送了附件）" });
            continue;
        }
        const lines = (message.actions || []).map((action) => {
            counter += action.taskIds?.length || 0;
            return actionSummary(action);
        });
        history.push({ role: "assistant", content: [message.content, ...lines].filter(Boolean).join("\n") || "（无回复）" });
    }
    const recent = history.slice(-HISTORY_LIMIT);
    // 部分模型要求历史以用户消息开头。
    while (recent[0]?.role === "assistant") recent.shift();
    return recent;
}
