import { createElement, Fragment, type ReactNode } from "react";

export type Locale = "zh" | "en";

type I18nPayload = { dict?: Record<string, string>; server?: Record<string, string>; content?: Record<string, string> };

declare global {
    interface Window {
        __YINGCE_LOCALE__?: Locale;
        __YINGCE_I18N__?: I18nPayload;
    }
}

export const LOCALE_STORAGE_KEY = "yingce:locale";
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
const PLACEHOLDER = /\{(\d+)\}/g;

function detectLocale(): Locale {
    if (typeof window === "undefined") return "zh";
    if (window.__YINGCE_LOCALE__ === "en" || window.__YINGCE_LOCALE__ === "zh") return window.__YINGCE_LOCALE__;
    try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored === "en" || stored === "zh") return stored;
    } catch {
        // storage unavailable
    }
    return "zh";
}

const payload: I18nPayload = (typeof window !== "undefined" && window.__YINGCE_I18N__) || {};
export const currentLocale: Locale = detectLocale() === "en" && payload.dict ? "en" : "zh";
const dict: Record<string, string> = payload.dict ?? {};
const server: Record<string, string> = payload.server ?? {};
const content: Record<string, string> = payload.content ?? {};

export function setLocale(locale: Locale) {
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // storage unavailable
    }
    window.location.reload();
}

function lookupIn(table: Record<string, string>, source: string): string | undefined {
    const direct = table[source];
    if (direct !== undefined) return direct;
    const trimmed = source.trim();
    if (trimmed === source || !trimmed) return undefined;
    const hit = table[trimmed];
    if (hit === undefined) return undefined;
    const lead = source.slice(0, source.indexOf(trimmed));
    return lead + hit + source.slice(lead.length + trimmed.length);
}

function lookup(source: string): string {
    if (currentLocale === "zh" || !source) return source;
    return lookupIn(dict, source) ?? source;
}

function fill(template: string, args: string[]): string {
    return template.replace(PLACEHOLDER, (match, index: string) => (Number(index) < args.length ? args[Number(index)] : match));
}

export function __locale(original: string): string {
    return currentLocale === "en" ? "en-US" : original;
}

/** 仅当文本与内置文案完全一致时翻译（用于后端回传的默认文案）。 */
export function translateKnownText(text: string): string {
    return lookup(text);
}

export function __t(source: string): string {
    return lookup(source);
}

export function __tf(key: string, args: unknown[]): string {
    return fill(lookup(key), args.map((arg) => String(arg)));
}

function isTextLike(value: unknown) {
    return value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint";
}

export function __tjsx(key: string, args: ReactNode[]): ReactNode {
    const template = lookup(key);
    if (args.every(isTextLike)) {
        return fill(template, args.map((arg) => (arg === null || arg === undefined || typeof arg === "boolean" ? "" : String(arg))));
    }
    const parts: ReactNode[] = [];
    let cursor = 0;
    for (const match of template.matchAll(PLACEHOLDER)) {
        const index = Number(match[1]);
        if (match.index > cursor) parts.push(template.slice(cursor, match.index));
        parts.push(index < args.length ? args[index] : match[0]);
        cursor = match.index + match[0].length;
    }
    if (cursor < template.length) parts.push(template.slice(cursor));
    return createElement(Fragment, null, ...parts);
}

type ServerPattern = { regex: RegExp; output: string };
let serverPatterns: ServerPattern[] | null = null;

function escapeRegex(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileServerPatterns(): ServerPattern[] {
    const patterns: Array<ServerPattern & { weight: number }> = [];
    for (const [source, output] of Object.entries(server)) {
        if (!source.includes("{0}")) continue;
        const pieces = source.split(/\{\d+\}/);
        const order = Array.from(source.matchAll(PLACEHOLDER), (match) => Number(match[1]));
        const body = pieces.map(escapeRegex).join("([\\s\\S]+?)");
        let remapped = output;
        order.forEach((placeholder, position) => {
            remapped = remapped.split(`{${placeholder}}`).join(`\u0000${position}\u0000`);
        });
        remapped = remapped.replace(/\u0000(\d+)\u0000/g, "{$1}");
        patterns.push({ regex: new RegExp(`^${body}$`), output: remapped, weight: pieces.join("").length });
    }
    return patterns.sort((left, right) => right.weight - left.weight);
}

function translateServerSegment(text: string, depth: number): string {
    const exact = lookupIn(server, text) ?? lookupIn(dict, text);
    if (exact !== undefined) return exact;
    serverPatterns ??= compileServerPatterns();
    for (const pattern of serverPatterns) {
        const match = pattern.regex.exec(text);
        if (!match) continue;
        const args = match.slice(1).map((arg) => (depth < 2 && HAN.test(arg) ? translateServerSegment(arg, depth + 1) : arg));
        return fill(pattern.output, args);
    }
    return text;
}

/** 翻译后端返回的展示文案（错误、进度等）；中文模式原样返回。 */
export function translateServerText(text: string): string {
    if (currentLocale === "zh" || typeof text !== "string" || !HAN.test(text)) return text;
    const whole = translateServerSegment(text, 0);
    if (whole !== text) return whole;
    const separator = /(\s*[:：]\s*|；|;\s*)/;
    if (!separator.test(text)) return text;
    return text
        .split(separator)
        .map((segment) => (HAN.test(segment) ? translateServerSegment(segment, 1) : segment))
        .join("");
}

const SERVER_TEXT_FIELDS = new Set(["msg", "message", "error", "errorMessage", "error_message", "reason", "failReason", "failureReason", "statusText", "progressText", "progressMessage", "detail", "stage"]);

// 展示类字段只做整句精确匹配，避免把用户自己写的名称、描述按模式改写。
const SERVER_TEXT_SUFFIX = /(Reason|Message|Error|Hint|Note)$/;
const SERVER_LABEL_FIELDS = new Set(["label", "name", "title", "description", "skillName", "tagline", "category", "endpoint", "displayName", "placeholder", "tooltip", "hint", "summary", "categoryLabel", "tagLabel", "groupLabel", "sourceLabel"]);

function translateExactServerText(text: string): string {
    if (!HAN.test(text)) return text;
    return lookupIn(dict, text) ?? lookupIn(server, text) ?? text;
}

/** 递归翻译响应体里的提示类字段；展示类字段只翻译与内置文案完全一致的内容。 */
export function translateServerPayload<T>(value: T, depth = 0): T {
    if (currentLocale === "zh" || depth > 10 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) translateServerPayload(value[index], depth + 1);
        return value;
    }
    const record = value as Record<string, unknown>;
    for (const [key, field] of Object.entries(record)) {
        if (typeof field === "string") {
            if (SERVER_TEXT_FIELDS.has(key) || SERVER_TEXT_SUFFIX.test(key)) record[key] = translateServerText(field);
            else if (SERVER_LABEL_FIELDS.has(key)) record[key] = translateExactServerText(field);
        } else if (field && typeof field === "object") {
            translateServerPayload(field, depth + 1);
        }
    }
    return value;
}

const CONTENT_TEXT_FIELDS = new Set(["title", "description", "label", "name"]);
const CONTENT_LIST_FIELDS = new Set(["tags", "categories"]);

function translateContentText(text: string): string {
    if (!HAN.test(text)) return text;
    return lookupIn(content, text) ?? lookupIn(dict, text) ?? text;
}

/** 翻译静态内容库（灵感库）的展示字段：标题、简介、标签、分类名；提示词正文保持原样。 */
export function translateContentPayload<T>(value: T, field = "", depth = 0): T {
    if (currentLocale === "zh" || depth > 8 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            const item = value[index];
            if (typeof item === "string") {
                if (CONTENT_LIST_FIELDS.has(field)) value[index] = translateContentText(item);
            } else translateContentPayload(item, field, depth + 1);
        }
        return value;
    }
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
        if (typeof item === "string") {
            if (CONTENT_TEXT_FIELDS.has(key) || field === "categories") record[key] = translateContentText(item);
        } else if (item && typeof item === "object") {
            translateContentPayload(item, key, depth + 1);
        }
    }
    return value;
}

export const __ts = translateServerText;
