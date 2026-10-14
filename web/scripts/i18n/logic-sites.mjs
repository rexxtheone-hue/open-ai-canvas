// 列出中文字面量参与逻辑判断的位置（比较、switch、文本匹配、对象键），供人工确认数据来源。
// 用法：bun scripts/i18n/logic-sites.mjs > report.txt
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, traverse } from "@babel/core";
import { HAN, isLogicSite } from "./babel-plugin.mjs";
import { shouldTransform } from "./transform.mjs";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEXT_METHODS = new Set(["includes", "startsWith", "endsWith", "indexOf", "lastIndexOf", "split", "replace", "replaceAll", "match", "search", "test", "some", "every", "find", "findIndex", "has", "get"]);

function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, files);
        else if (shouldTransform(full)) files.push(full);
    }
    return files;
}

function category(path) {
    const { node, parent, parentPath } = path;
    if (parent.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(parent.operator)) return "compare";
    if (parent.type === "SwitchCase" && parent.test === node) return "switch";
    if ((parent.type === "CallExpression" || parent.type === "OptionalCallExpression") && parent.arguments.includes(node)) {
        const callee = parent.callee;
        const name = callee.property?.name;
        if (name && TEXT_METHODS.has(name)) return `match:${name}`;
    }
    if (parent.type === "ArrayExpression") {
        const holder = parentPath.parent;
        if ((holder?.type === "MemberExpression" || holder?.type === "OptionalMemberExpression") && holder.object === parent && TEXT_METHODS.has(holder.property?.name)) return `array:${holder.property.name}`;
    }
    if (parent.type === "ObjectProperty" && parent.key === node) return "object-key";
    if ((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && parent.property === node) return "member";
    return null;
}

for (const file of walk(join(webDir, "src"))) {
    const code = readFileSync(file, "utf8");
    if (!HAN.test(code)) continue;
    const lines = code.split("\n");
    const plugins = [["typescript", {}], "decorators-legacy"];
    if (file.endsWith("x")) plugins.push("jsx");
    const ast = parseSync(code, { filename: file, babelrc: false, configFile: false, sourceType: "module", parserOpts: { plugins } });
    const visit = (path) => {
        const value = path.node.type === "StringLiteral" ? path.node.value : path.node.quasis.map((quasi) => quasi.value.cooked).join("{}");
        if (!HAN.test(value)) return;
        if (path.findParent((candidate) => candidate.isTSType())) return;
        if (!isLogicSite(path)) return;
        const kind = category(path) || "set";
        const line = path.node.loc.start.line;
        console.log(`${relative(webDir, file).replace(/\\/g, "/")}:${line}\t${kind}\t${lines[line - 1].trim().slice(0, 220)}`);
    };
    traverse(ast, { StringLiteral: visit, TemplateLiteral: visit });
}
