import { apiBaseURL } from "./request";
import { createTaskTextStreamParser, consumeTaskTextStream, type TaskTextStreamEvent } from "./task-text-stream";
import { currentLocale, translateServerText } from "@/lib/i18n/runtime";

export type HelpAssistantMessage = { role: "user" | "assistant"; content: string };

/** 向帮助助手提问：边生成边回调 onText（累计全文），结束返回最终答案。 */
export async function askHelpAssistant(messages: HelpAssistantMessage[], page: string, onText: (text: string) => void, signal?: AbortSignal) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    const response = await fetch(`${base}/studio/help-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        credentials: "include",
        body: JSON.stringify({ messages, page, locale: currentLocale }),
        signal,
    });
    if (!response.ok) {
        let message = `请求失败（HTTP ${response.status}）`;
        try {
            const payload = (await response.json()) as { msg?: unknown };
            if (typeof payload.msg === "string" && payload.msg.trim()) message = translateServerText(payload.msg);
        } catch {
            // 网关错误页不是 JSON，只显示状态码。
        }
        throw new Error(message);
    }
    if (!response.body) throw new Error("帮助助手暂时不可用");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createTaskTextStreamParser();
    let text = "";
    let final = "";
    let failure = "";
    const onEvent = (event: TaskTextStreamEvent) => {
        const data = (event.data && typeof event.data === "object" ? event.data : {}) as { content?: unknown; message?: unknown };
        if (event.event === "delta" && typeof data.content === "string") {
            text += data.content;
            onText(text);
        } else if (event.event === "done" && typeof data.content === "string") {
            final = data.content;
        } else if (event.event === "error") {
            failure = typeof data.message === "string" ? data.message : "帮助助手暂时无法回答";
        }
    };
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        consumeTaskTextStream(parser, decoder.decode(value, { stream: true }), onEvent);
    }
    consumeTaskTextStream(parser, decoder.decode(), onEvent, true);
    if (failure) throw new Error(translateServerText(failure));
    return final || text;
}
