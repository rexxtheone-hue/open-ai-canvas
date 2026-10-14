// 把翻译产出（JSON 片段）合并进 src/locales/en.json 与 en-server.json。
// 用法：bun scripts/i18n/merge.mjs <web|server|content> <file.json> [...more]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [target, ...files] = process.argv.slice(2);
if (!["web", "server", "content"].includes(target) || !files.length) {
    console.error("usage: bun scripts/i18n/merge.mjs <web|server> <file.json> [...]");
    process.exit(1);
}
const localeFile = join(webDir, "src/locales", { web: "en.json", server: "en-server.json", content: "en-content.json" }[target]);
const current = existsSync(localeFile) ? JSON.parse(readFileSync(localeFile, "utf8")) : {};
let added = 0;
for (const file of files) {
    const entries = JSON.parse(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== "string" || !value.trim()) continue;
        if (current[key] !== value) added += 1;
        current[key] = value;
    }
}
const sorted = Object.fromEntries(Object.entries(current).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
writeFileSync(localeFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${target}: merged ${added} entries, total ${Object.keys(sorted).length}`);
