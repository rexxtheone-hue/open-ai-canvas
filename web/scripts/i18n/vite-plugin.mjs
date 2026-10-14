import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldTransform, transformI18n } from "./transform.mjs";

const DEV_DICTIONARY_PATH = "/__i18n/en.js";

function readJson(file) {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

function dictionaryScript(localeDir) {
    const dict = readJson(join(localeDir, "en.json"));
    const server = readJson(join(localeDir, "en-server.json"));
    const content = readJson(join(localeDir, "en-content.json"));
    return `window.__YINGCE_I18N__=${JSON.stringify({ dict, server, content })};\n`;
}

// 在任何模块执行前确定语言；英文时同步加载词典，保证模块顶层常量也能翻译。
function bootScript(dictionaryUrl) {
    return [
        "(function(){",
        "var k='yingce:locale',l;try{l=localStorage.getItem(k)}catch(e){}",
        "if(l!=='en'&&l!=='zh'){var n=(navigator.languages&&navigator.languages[0])||navigator.language||'zh';l=/^zh/i.test(n)?'zh':'en'}",
        "window.__YINGCE_LOCALE__=l;document.documentElement.lang=l==='en'?'en':'zh-CN';",
        `if(l==='en'){document.title='Loading';document.write('<script src="${dictionaryUrl}"><\\/script>')}`,
        "})();",
    ].join("");
}

export function yingceI18n({ localeDir }) {
    let base = "/";
    let command = "serve";
    let builtFileName = null;
    return {
        name: "yingce-i18n",
        enforce: "pre",
        configResolved(config) {
            base = config.base || "/";
            command = config.command;
        },
        buildStart() {
            if (command !== "build") return;
            const source = dictionaryScript(localeDir);
            const hash = createHash("sha256").update(source).digest("hex").slice(0, 10);
            builtFileName = `assets/i18n-en.${hash}.js`;
            this.emitFile({ type: "asset", fileName: builtFileName, source });
        },
        configureServer(server) {
            server.watcher.add([join(localeDir, "en.json"), join(localeDir, "en-server.json"), join(localeDir, "en-content.json")]);
            server.middlewares.use(DEV_DICTIONARY_PATH, (_request, response) => {
                response.setHeader("Content-Type", "application/javascript; charset=utf-8");
                response.setHeader("Cache-Control", "no-store");
                response.end(dictionaryScript(localeDir));
            });
        },
        transformIndexHtml() {
            const url = command === "build" && builtFileName ? `${base}${builtFileName}` : DEV_DICTIONARY_PATH;
            return [{ tag: "script", children: bootScript(url), injectTo: "head-prepend" }];
        },
        transform(code, id) {
            if (!shouldTransform(id)) return null;
            return transformI18n(code, id);
        },
    };
}
