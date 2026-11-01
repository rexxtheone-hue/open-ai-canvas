import { creationAttachmentKind, type CreationAttachment } from "@/pages/create/creation-assets";
import { currentLocale } from "@/lib/i18n/runtime";

/**
 * 提示词里的素材标记：@图片1、@视频1、@音频1（英文界面写作 @Image1 等）。
 * 编号按同类素材的添加顺序，和发给模型的参考素材顺序一致；发给模型前统一换成画布同款的中文标记。
 */
export type StudioMentionKind = "image" | "video" | "audio";

export type StudioMention = { token: string; kind: StudioMentionKind; index: number; attachment: CreationAttachment };

// 标记文字参与模型提示词，不能被界面翻译改写。
// i18n-ignore
const WORDS: Record<"zh" | "en", Record<StudioMentionKind, string>> = {
    zh: { image: "图片", video: "视频", audio: "音频" },
    en: { image: "Image", video: "Video", audio: "Audio" },
};
// i18n-ignore
const KIND_BY_WORD: Record<string, StudioMentionKind> = { 图片: "image", 视频: "video", 音频: "audio", image: "image", video: "video", audio: "audio" };
const TOKEN = /@(图片|视频|音频|Image|Video|Audio)(\d+)(?!\d)/gi;

export function studioMentionToken(kind: StudioMentionKind, index: number, locale: "zh" | "en" = currentLocale) {
    return `@${WORDS[locale][kind]}${index}`;
}

export function studioMentions(attachments: CreationAttachment[]): StudioMention[] {
    const counts: Record<StudioMentionKind, number> = { image: 0, video: 0, audio: 0 };
    return attachments.flatMap((attachment) => {
        const kind = creationAttachmentKind(attachment);
        if (kind === "file") return [];
        counts[kind] += 1;
        return [{ token: studioMentionToken(kind, counts[kind]), kind, index: counts[kind], attachment }];
    });
}

/** 把提示词切成普通文字和标记两类片段，用于在输入框里高亮标记。 */
export function splitStudioMentions(text: string): Array<{ text: string; mention: boolean }> {
    const parts: Array<{ text: string; mention: boolean }> = [];
    let cursor = 0;
    for (const match of text.matchAll(TOKEN)) {
        if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), mention: false });
        parts.push({ text: match[0], mention: true });
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), mention: false });
    return parts;
}

/** 发给模型的提示词：英文界面的 @Image1 等统一换成 @图片1。 */
export function studioModelPrompt(prompt: string) {
    return prompt.replace(TOKEN, (_, word: string, index: string) => `@${WORDS.zh[KIND_BY_WORD[word.toLowerCase()] || KIND_BY_WORD[word]]}${index}`);
}

function idsByKind(attachments: CreationAttachment[]) {
    const ids: Record<StudioMentionKind, string[]> = { image: [], video: [], audio: [] };
    for (const attachment of attachments) {
        const kind = creationAttachmentKind(attachment);
        if (kind !== "file") ids[kind].push(attachment.id);
    }
    return ids;
}

/**
 * 素材增删后同步提示词：删掉的素材，标记连同前面一个空格一起去掉；后面的同类标记往前补号；
 * 新加的素材把标记追加到末尾。用户自己手打、对不上素材的标记保持原样。
 */
export function syncStudioPromptMentions(prompt: string, previous: CreationAttachment[], next: CreationAttachment[], locale: "zh" | "en" = currentLocale) {
    const before = idsByKind(previous);
    const after = idsByKind(next);
    let text = prompt.replace(new RegExp(`( ?)${TOKEN.source}`, "gi"), (match, space: string, word: string, index: string) => {
        const kind = KIND_BY_WORD[word.toLowerCase()] || KIND_BY_WORD[word];
        const id = before[kind][Number(index) - 1];
        if (!id) return match;
        const position = after[kind].indexOf(id);
        return position < 0 ? "" : `${space}@${word}${position + 1}`;
    });
    const added = (["image", "video", "audio"] as const).flatMap((kind) => after[kind].map((id, position) => ({ kind, id, position })).filter((item) => !before[item.kind].includes(item.id)));
    for (const item of added) {
        const token = studioMentionToken(item.kind, item.position + 1, locale);
        if (text.includes(token)) continue;
        text = text && !/\s$/.test(text) ? `${text} ${token}` : `${text}${token}`;
    }
    return text;
}
