// 扫描 backend/ 的 Go 源码，收集可能返回给前端展示的中文文案，生成服务端文案键。
// 格式化占位符（%s、%d、%v、%w 等）统一转换为 {0}、{1}，前端按模式匹配翻译。
// 用法：bun scripts/i18n/extract-server.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const backendDir = join(webDir, "../backend");
const localeFile = join(webDir, "src/locales/en-server.json");
const reportDir = join(webDir, "../.local/i18n");
const HAN = /[㐀-鿿豈-﫿]/;
const MAX_LENGTH = 200;
const SKIP_DIRS = new Set(["testdata", "vendor"]);
// prompts 目录主要是给模型的长提示词，只收集其中的短标签（模板名、分类名）。
const PROMPT_DIR_MAX_LENGTH = 40;
const LOG_CALL = /(?:log|logger|slog|logging)\.(?:Print|Printf|Println|Debug|Info|Warn|Error|Fatal|Panic)[a-z]*\(\s*$|\.(?:Debug|Info|Warn|Warning)(?:f|w|Context)?\(\s*$/;

function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(full, files);
        } else if (name.endsWith(".go") && !name.endsWith("_test.go")) files.push(full);
    }
    return files;
}

function decodeInterpreted(body) {
    try {
        return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1").replace(/\\a|\\v/g, "")}"`);
    } catch {
        return null;
    }
}

function* goStrings(source) {
    let index = 0;
    const length = source.length;
    while (index < length) {
        const char = source[index];
        const next = source[index + 1];
        if (char === "/" && next === "/") {
            index = source.indexOf("\n", index);
            if (index < 0) return;
            continue;
        }
        if (char === "/" && next === "*") {
            index = source.indexOf("*/", index + 2);
            if (index < 0) return;
            index += 2;
            continue;
        }
        if (char === "'") {
            index += 1;
            while (index < length && source[index] !== "'") index += source[index] === "\\" ? 2 : 1;
            index += 1;
            continue;
        }
        if (char === "`") {
            const end = source.indexOf("`", index + 1);
            if (end < 0) return;
            yield { value: source.slice(index + 1, end), start: index };
            index = end + 1;
            continue;
        }
        if (char === '"') {
            let end = index + 1;
            while (end < length && source[end] !== '"' && source[end] !== "\n") end += source[end] === "\\" ? 2 : 1;
            const value = decodeInterpreted(source.slice(index + 1, end));
            if (value !== null) yield { value, start: index };
            index = end + 1;
            continue;
        }
        index += 1;
    }
}

const VERB = /%(?:\[\d+\])?[-+# 0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[vTtbcdoOqxXUeEfFgGsp w]/g;

function toKey(value) {
    if (!value.includes("%")) return value;
    let position = 0;
    return value.replace(/%%|%(?:\[\d+\])?[-+# 0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[vTtbcdoOqxXUeEfFgGspw]/g, (match) => (match === "%%" ? "%" : `{${position++}}`));
}

const collected = new Map();
for (const file of walk(backendDir)) {
    const source = readFileSync(file, "utf8");
    if (!HAN.test(source)) continue;
    for (const { value, start } of goStrings(source)) {
        if (!HAN.test(value) || value.length > MAX_LENGTH || value.includes("\n")) continue;
        if (/[\\/]prompts[\\/]/.test(file) && value.length > PROMPT_DIR_MAX_LENGTH) continue;
        if (/^\{\{[^}]+\}\}$/.test(value.trim())) continue;
        const lineStart = source.lastIndexOf("\n", start) + 1;
        if (LOG_CALL.test(source.slice(lineStart, start))) continue;
        const key = toKey(value).trim();
        if (!key || !HAN.test(key)) continue;
        if (!collected.has(key)) collected.set(key, relative(backendDir, file).replace(/\\/g, "/"));
    }
}

// 插件包 manifest 里展示给用户的字段（描述、标签、提示），由后端原样下发。
const pluginDir = join(webDir, "../plugin-packages");
const MANIFEST_FIELDS = new Set(["description", "message", "label", "name", "title", "placeholder"]);
function collectManifest(value, field, file) {
    if (Array.isArray(value)) return value.forEach((item) => collectManifest(item, field, file));
    if (value && typeof value === "object") return Object.entries(value).forEach(([key, item]) => collectManifest(item, key, file));
    if (typeof value !== "string" || !MANIFEST_FIELDS.has(field)) return;
    const key = value.trim();
    if (key && HAN.test(key) && key.length <= 400 && !collected.has(key)) collected.set(key, file);
}
if (existsSync(pluginDir)) {
    for (const name of readdirSync(pluginDir)) {
        const manifest = join(pluginDir, name, "manifest.json");
        if (existsSync(manifest)) collectManifest(JSON.parse(readFileSync(manifest, "utf8")), "", `plugin-packages/${name}/manifest.json`);
        if (name.endsWith(".yingce-plugin")) {
            const entries = unzipSync(readFileSync(join(pluginDir, name)), { filter: (file) => file.name === "manifest.json" });
            if (entries["manifest.json"]) collectManifest(JSON.parse(strFromU8(entries["manifest.json"])), "", `plugin-packages/${name}`);
        }
    }
}

// 内置技能包的名称与简介（SKILL.md frontmatter）。
const builtinDir = join(backendDir, "builtin");
if (existsSync(builtinDir)) {
    for (const name of readdirSync(builtinDir)) {
        const skillFile = join(builtinDir, name, "SKILL.md");
        if (!existsSync(skillFile)) continue;
        const frontmatter = readFileSync(skillFile, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
        for (const match of frontmatter.matchAll(/^(name|description):\s*(.+)$/gm)) {
            let value = match[2].trim();
            if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
            else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
            if (HAN.test(value) && !collected.has(value)) collected.set(value, `backend/builtin/${name}/SKILL.md`);
        }
    }
}

const existing = existsSync(localeFile) ? JSON.parse(readFileSync(localeFile, "utf8")) : {};
const missing = {};
for (const [key, file] of collected) if (!(key in existing)) missing[key] = file;
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "server-missing.json"), `${JSON.stringify(missing, null, 2)}\n`);
console.log(`server keys: ${collected.size}  translated: ${collected.size - Object.keys(missing).length}  missing: ${Object.keys(missing).length}`);
void VERB;
