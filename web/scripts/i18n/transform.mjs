import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import i18nBabelPlugin, { HAN } from "./babel-plugin.mjs";

const overridesFile = join(dirname(fileURLToPath(import.meta.url)), "logic-overrides.json");
function loadOverrides() {
    try {
        return JSON.parse(readFileSync(overridesFile, "utf8")).files || {};
    } catch {
        return {};
    }
}

export function shouldTransform(id) {
    const file = id.split("?")[0].replace(/\\/g, "/");
    if (!/\/src\/.*\.(tsx?|jsx?|mjs)$/.test(file)) return false;
    if (file.includes("/node_modules/") || file.includes("/src/lib/i18n/") || file.includes("/src/locales/")) return false;
    if (/\.(test|spec)\.[tj]sx?$/.test(file) || file.endsWith(".d.ts")) return false;
    return true;
}

export function transformI18n(code, id, options = {}) {
    if (!HAN.test(code)) return null;
    const file = id.split("?")[0];
    const isTs = /\.tsx?$/.test(file);
    const isJsx = /\.(tsx|jsx)$/.test(file);
    const plugins = [];
    if (isTs) plugins.push(["typescript", { dts: false }]);
    if (isJsx) plugins.push("jsx");
    plugins.push("decorators-legacy", "importAttributes");
    const result = transformSync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceType: "module",
        sourceMaps: !options.collect,
        compact: false,
        parserOpts: { plugins },
        generatorOpts: { jsescOption: { minimal: true }, importAttributesKeyword: "with" },
        plugins: [[i18nBabelPlugin, { collect: options.collect, overrides: loadOverrides() }]],
    });
    if (options.collect || !result || !result.code.includes('"@/lib/i18n/runtime"')) return null;
    return { code: result.code, map: result.map };
}
