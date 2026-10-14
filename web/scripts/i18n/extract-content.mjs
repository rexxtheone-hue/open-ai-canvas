// 收集 public/inspirations 静态内容库中展示用的文案（标题、简介、标签、分类名），不含提示词正文。
// 用法：bun scripts/i18n/extract-content.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contentDir = join(webDir, "public/inspirations");
const localeFile = join(webDir, "src/locales/en-content.json");
const reportDir = join(webDir, "../.local/i18n");
const HAN = /[㐀-鿿豈-﫿]/;
export const CONTENT_TEXT_FIELDS = new Set(["title", "description", "label", "name"]);
export const CONTENT_LIST_FIELDS = new Set(["tags", "categories"]);

const collected = new Map();
function add(value, file) {
    const key = typeof value === "string" ? value.trim() : "";
    if (key && HAN.test(key) && !collected.has(key)) collected.set(key, file);
}
function walk(value, field, file) {
    if (Array.isArray(value)) {
        for (const item of value) {
            if (typeof item === "string" && CONTENT_LIST_FIELDS.has(field)) add(item, file);
            else walk(item, field, file);
        }
        return;
    }
    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            if (field === "categories" && typeof item === "string") add(item, file);
            else walk(item, key, file);
        }
        return;
    }
    if (CONTENT_TEXT_FIELDS.has(field)) add(value, file);
}

for (const name of readdirSync(contentDir)) {
    if (name.endsWith(".json")) walk(JSON.parse(readFileSync(join(contentDir, name), "utf8")), "", `public/inspirations/${name}`);
}
const existing = existsSync(localeFile) ? JSON.parse(readFileSync(localeFile, "utf8")) : {};
const missing = {};
for (const [key, file] of collected) if (!(key in existing)) missing[key] = file;
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "content-missing.json"), `${JSON.stringify(missing, null, 2)}\n`);
console.log(`content keys: ${collected.size}  translated: ${collected.size - Object.keys(missing).length}  missing: ${Object.keys(missing).length}`);
