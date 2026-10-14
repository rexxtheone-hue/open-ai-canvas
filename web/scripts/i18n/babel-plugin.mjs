// 构建期把源码里的中文文案替换为 __t/__tf/__tjsx 调用；源码本身保持中文不变。
export const HAN = /[㐀-鿿豈-﫿]/;
export const RUNTIME_MODULE = "@/lib/i18n/runtime";

const SKIP_JSX_ATTRS = new Set(["className", "class", "key", "id", "name", "type", "htmlFor", "to", "href", "src", "role", "style", "rel", "target", "lang", "accept", "pattern", "autoComplete", "form", "method", "action", "mode", "ref", "as", "variant", "size", "color"]);
const DATA_KEYS = new Set(["key", "id", "code", "format", "lang", "locale", "pattern", "regex", "slug", "path", "url", "href", "src", "icon", "className", "fontFamily", "font"]);
const MATCH_METHODS = new Set(["getItem", "setItem", "removeItem", "querySelector", "querySelectorAll", "getAttribute", "setAttribute", "getElementById", "getPropertyValue", "setProperty"]);
const COMPARE_OPS = new Set(["in", "instanceof"]);
const IGNORED_CALLEES = new Set(["require", "RegExp", "Symbol", "for", "addEventListener", "removeEventListener", "dispatchEvent", "CustomEvent", "Event"]);
const IGNORE_MARK = "i18n-ignore";
const LOCALE_LITERAL = /^zh(?:-CN|-Hans(?:-CN)?)?$/;
const LOCALE_CALLEES = new Set(["toLocaleString", "toLocaleDateString", "toLocaleTimeString", "DateTimeFormat", "NumberFormat", "RelativeTimeFormat", "PluralRules", "ListFormat", "DisplayNames"]);

function calleeName(t, callee) {
    if (t.isIdentifier(callee)) return callee.name;
    if ((t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && !callee.computed && t.isIdentifier(callee.property)) return callee.property.name;
    return null;
}

function isConsoleCall(t, callee) {
    return (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && t.isIdentifier(callee.object, { name: "console" });
}

function propertyKeyName(t, node) {
    if (!node) return null;
    if (t.isIdentifier(node)) return node.name;
    if (t.isStringLiteral(node)) return node.value;
    return null;
}

function hasIgnoreComment(path) {
    let current = path;
    for (let depth = 0; current && depth < 10; depth += 1) {
        const comments = [...(current.node.leadingComments || []), ...(current.node.trailingComments || [])];
        if (comments.some((comment) => comment.value.includes(IGNORE_MARK))) return true;
        if (current.isStatement() || current.isProgram()) break;
        current = current.parentPath;
    }
    return false;
}

function isExcludedLiteral(t, path) {
    const { node, parent, parentPath } = path;
    if (node._i18n) return true;
    if (path.findParent((candidate) => candidate.isTSType() || candidate.isTSEnumMember() || candidate.isTSModuleDeclaration() || candidate.isTSImportEqualsDeclaration())) return true;
    if (t.isImportDeclaration(parent) || t.isExportNamedDeclaration(parent) || t.isExportAllDeclaration(parent) || parent.type === "ImportExpression") return true;
    if ((t.isObjectMethod(parent) || t.isClassProperty(parent) || t.isClassMethod(parent) || parent.type === "ClassPrivateProperty") && parent.key === node) return true;
    if (t.isObjectProperty(parent) && parent.key === node && parentPath.parentPath?.isObjectPattern()) return true;
    if (t.isBinaryExpression(parent) && COMPARE_OPS.has(parent.operator)) return true;
    if (t.isTaggedTemplateExpression(parent)) return true;
    if (t.isObjectProperty(parent) && parent.value === node && DATA_KEYS.has(propertyKeyName(t, parent.key))) return true;
    if (t.isAssignmentExpression(parent) && parent.right === node && t.isMemberExpression(parent.left) && !parent.left.computed && DATA_KEYS.has(propertyKeyName(t, parent.left.property))) return true;
    if (t.isJSXAttribute(parent)) {
        const name = t.isJSXIdentifier(parent.name) ? parent.name.name : `${parent.name.namespace.name}:${parent.name.name.name}`;
        if (SKIP_JSX_ATTRS.has(name) || name.startsWith("data-")) return true;
    }
    if ((t.isCallExpression(parent) || t.isOptionalCallExpression(parent) || t.isNewExpression(parent)) && parent.arguments.includes(node)) {
        const callee = parent.callee;
        if (t.isImport(callee) || isConsoleCall(t, callee)) return true;
        const name = calleeName(t, callee);
        if (name && IGNORED_CALLEES.has(name)) return true;
        if (name && MATCH_METHODS.has(name) && parent.arguments[0] === node) return true;
    }
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && /(STORAGE_KEY|EVENT_NAME|_EVENT$)/i.test(parent.id.name)) return true;
    if (hasIgnoreComment(path)) return true;
    return false;
}

const LOGIC_TEXT_METHODS = new Set(["includes", "startsWith", "endsWith", "indexOf", "lastIndexOf", "split", "replace", "replaceAll", "match", "search", "test", "some", "every", "find", "findIndex", "has", "get"]);

/** 字面量是否处在逻辑判断位置（比较、switch、文本匹配、数组匹配）。 */
export function isLogicSite(path) {
    const { node, parent, parentPath } = path;
    if (parent.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(parent.operator)) return true;
    if (parent.type === "SwitchCase" && parent.test === node) return true;
    if ((parent.type === "CallExpression" || parent.type === "OptionalCallExpression") && parent.arguments.includes(node) && LOGIC_TEXT_METHODS.has(parent.callee.property?.name)) return true;
    if (parent.type === "ArrayExpression") {
        const holder = parentPath.parent;
        if ((holder?.type === "MemberExpression" || holder?.type === "OptionalMemberExpression") && holder.object === parent && LOGIC_TEXT_METHODS.has(holder.property?.name)) return true;
        if (holder?.type === "NewExpression" && (holder.callee?.name === "Set" || holder.callee?.name === "Map")) return true;
    }
    return false;
}

function cleanJsxText(value) {
    const lines = value.split(/\r\n|\n|\r/);
    let lastNonEmpty = 0;
    for (let index = 0; index < lines.length; index += 1) if (/[^ \t]/.test(lines[index])) lastNonEmpty = index;
    let result = "";
    for (let index = 0; index < lines.length; index += 1) {
        const isFirst = index === 0;
        const isLast = index === lines.length - 1;
        let trimmed = lines[index].replace(/\t/g, " ");
        if (!isFirst) trimmed = trimmed.replace(/^[ ]+/, "");
        if (!isLast) trimmed = trimmed.replace(/[ ]+$/, "");
        if (trimmed) {
            if (index !== lastNonEmpty) trimmed += " ";
            result += trimmed;
        }
    }
    return result;
}

function staticString(t, node) {
    if (t.isStringLiteral(node)) return node.value;
    if (t.isTemplateLiteral(node) && node.expressions.length === 0) return node.quasis[0].value.cooked ?? null;
    return null;
}

export function templateKey(quasis) {
    let key = "";
    quasis.forEach((quasi, index) => {
        key += quasi.value.cooked ?? quasi.value.raw;
        if (index < quasis.length - 1) key += `{${index}}`;
    });
    return key;
}

/** options.collect 为 Map<key, Set<file>> 时只收集不改写。 */
export default function i18nBabelPlugin({ types: t }, options = {}) {
    const collect = options.collect || null;
    const record = (key, state) => {
        if (!collect) return;
        const normalized = key.trim();
        if (!normalized || !HAN.test(normalized)) return;
        if (!collect.has(normalized)) collect.set(normalized, new Set());
        collect.get(normalized).add(state.filename || "");
    };
    const mark = (node) => {
        node._i18n = true;
        return node;
    };
    const call = (state, name, args) => {
        state.i18nUsed.add(name);
        return mark(t.callExpression(t.identifier(name), args));
    };
    const literal = (value) => mark(t.stringLiteral(value));
    // overrides: { "src/x.ts": { raw: [...], server: [...] } }，只作用于逻辑判断位置。
    const overrides = options.overrides || {};
    const logicOverride = (path, value, state) => {
        const file = (state.filename || "").replace(/\\/g, "/");
        const entry = Object.entries(overrides).find(([suffix]) => file.endsWith(`/${suffix}`))?.[1];
        if (!entry || !isLogicSite(path)) return null;
        if (entry.raw?.includes(value)) return "raw";
        if (entry.server?.includes(value)) return "server";
        return null;
    };

    function processJsxChildren(path, state) {
        const children = path.node.children;
        if (!children.some((child) => t.isJSXText(child) && HAN.test(child.value))) return;
        const output = [];
        let run = [];
        const flush = () => {
            if (!run.length) return;
            const hasHan = run.some((child) => t.isJSXText(child) && HAN.test(child.value));
            if (!hasHan) {
                output.push(...run);
                run = [];
                return;
            }
            let key = "";
            const args = [];
            for (const child of run) {
                if (t.isJSXText(child)) {
                    key += cleanJsxText(child.value);
                    continue;
                }
                const text = staticString(t, child.expression);
                if (text !== null && !text.includes("{")) {
                    key += text;
                    continue;
                }
                key += `{${args.length}}`;
                args.push(child.expression);
            }
            record(key, state);
            if (collect || !key.trim()) {
                output.push(...run);
            } else {
                const expression = args.length ? call(state, "__tjsx", [literal(key), t.arrayExpression(args)]) : call(state, "__t", [literal(key)]);
                output.push(t.jsxExpressionContainer(expression));
            }
            run = [];
        };
        for (const child of children) {
            const isRunnable = t.isJSXText(child) || (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression) && !t.isJSXElement(child.expression) && !t.isJSXFragment(child.expression));
            if (isRunnable) run.push(child);
            else {
                flush();
                output.push(child);
            }
        }
        flush();
        if (!collect) path.node.children = output;
    }

    return {
        name: "yingce-i18n",
        pre() {
            this.i18nUsed = new Set();
        },
        visitor: {
            Program: {
                exit(path, state) {
                    if (collect || !state.i18nUsed.size) return;
                    const specifiers = [...state.i18nUsed].sort().map((name) => t.importSpecifier(t.identifier(name), t.identifier(name)));
                    path.unshiftContainer("body", t.importDeclaration(specifiers, t.stringLiteral(RUNTIME_MODULE)));
                },
            },
            JSXElement(path, state) {
                if (!hasIgnoreComment(path)) processJsxChildren(path, state);
            },
            JSXFragment(path, state) {
                processJsxChildren(path, state);
            },
            StringLiteral(path, state) {
                const { node } = path;
                if (!collect && !node._i18n && LOCALE_LITERAL.test(node.value) && (t.isCallExpression(path.parent) || t.isNewExpression(path.parent) || t.isOptionalCallExpression(path.parent)) && path.parent.arguments[0] === node && LOCALE_CALLEES.has(calleeName(t, path.parent.callee))) {
                    path.replaceWith(call(state, "__locale", [literal(node.value)]));
                    path.skip();
                    return;
                }
                if (node._i18n || !HAN.test(node.value) || isExcludedLiteral(t, path)) return;
                const override = logicOverride(path, node.value, state);
                if (override === "raw") return;
                if (override === "server") {
                    if (collect) return;
                    path.replaceWith(call(state, "__ts", [literal(node.value)]));
                    path.skip();
                    return;
                }
                record(node.value, state);
                if (collect) return;
                const replacement = call(state, "__t", [literal(node.value)]);
                if (t.isJSXAttribute(path.parent)) path.replaceWith(t.jsxExpressionContainer(replacement));
                else if (t.isObjectProperty(path.parent) && path.parent.key === node) {
                    path.parent.computed = true;
                    path.parent.shorthand = false;
                    path.replaceWith(replacement);
                } else path.replaceWith(replacement);
                path.skip();
            },
            TemplateLiteral(path, state) {
                const { node } = path;
                if (node._i18n || !node.quasis.some((quasi) => HAN.test(quasi.value.cooked ?? quasi.value.raw)) || isExcludedLiteral(t, path)) return;
                const key = templateKey(node.quasis);
                record(key, state);
                if (collect) return;
                if (!node.expressions.length) {
                    path.replaceWith(call(state, "__t", [literal(key)]));
                    path.skip();
                    return;
                }
                path.replaceWith(call(state, "__tf", [literal(key), t.arrayExpression(node.expressions)]));
            },
        },
    };
}
