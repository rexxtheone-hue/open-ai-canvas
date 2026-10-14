// 扫描 web/src 收集需要翻译的中文文案，并报告 en.json 缺失的条目。
// 用法：bun scripts/i18n/extract.mjs [--check] [--prune]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldTransform, transformI18n } from "./transform.mjs";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = join(webDir, "src");
const localeFile = join(webDir, "src/locales/en.json");
const reportDir = join(webDir, "../.local/i18n");
const args = new Set(process.argv.slice(2));

function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, files);
        else if (shouldTransform(full)) files.push(full);
    }
    return files;
}

const collect = new Map();
const failures = [];
for (const file of walk(srcDir)) {
    const code = readFileSync(file, "utf8");
    try {
        transformI18n(code, file, { collect });
        transformI18n(code, file);
    } catch (error) {
        failures.push(`${relative(webDir, file)}: ${error.message.split("\n")[0]}`);
    }
}

const existing = existsSync(localeFile) ? JSON.parse(readFileSync(localeFile, "utf8")) : {};
const missing = {};
for (const [key, files] of collect) {
    if (!(key in existing)) missing[key] = [...files].map((file) => relative(webDir, file).replace(/\\/g, "/"))[0];
}
const unused = Object.keys(existing).filter((key) => !collect.has(key));

if (args.has("--prune") && unused.length) {
    for (const key of unused) delete existing[key];
    const sorted = Object.fromEntries(Object.entries(existing).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
    writeFileSync(localeFile, `${JSON.stringify(sorted, null, 2)}\n`);
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "web-missing.json"), `${JSON.stringify(missing, null, 2)}\n`);

console.log(`keys: ${collect.size}  translated: ${collect.size - Object.keys(missing).length}  missing: ${Object.keys(missing).length}  unused: ${unused.length}`);
if (failures.length) {
    console.log(`transform failures (${failures.length}):`);
    for (const failure of failures) console.log(`  ${failure}`);
}
if (args.has("--check") && (Object.keys(missing).length || failures.length)) process.exit(1);
