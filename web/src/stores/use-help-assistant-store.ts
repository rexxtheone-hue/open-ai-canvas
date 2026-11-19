import { create } from "zustand";

import { askHelpAssistant, type HelpAssistantMessage } from "@/services/api/help-assistant";

const STORAGE_KEY = "studio:help-assistant";
const CONVERSATION_KEY = "studio:help-assistant-conversation";

function newConversationId() {
    try {
        const id = crypto.randomUUID();
        sessionStorage.setItem(CONVERSATION_KEY, id);
        return id;
    } catch {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
}

function loadConversationId() {
    try {
        return sessionStorage.getItem(CONVERSATION_KEY) || newConversationId();
    } catch {
        return newConversationId();
    }
}

function loadMessages(): HelpAssistantMessage[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as HelpAssistantMessage[]) : [];
        return Array.isArray(parsed) ? parsed.filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string") : [];
    } catch {
        return [];
    }
}

function saveMessages(messages: HelpAssistantMessage[]) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
        // 无痕模式下存不了，只影响刷新后恢复对话。
    }
}

type HelpAssistantStore = {
    open: boolean;
    conversationId: string;
    messages: HelpAssistantMessage[];
    pending: string;
    busy: boolean;
    error: string;
    setOpen: (open: boolean) => void;
    send: (question: string, page: string) => Promise<void>;
    reset: () => void;
};

let controller: AbortController | null = null;

/** 帮助助手的对话放在全局：点回答里的站内链接换页后，面板和进行中的回答都保留。 */
export const useHelpAssistantStore = create<HelpAssistantStore>((set, get) => ({
    open: false,
    conversationId: loadConversationId(),
    messages: loadMessages(),
    pending: "",
    busy: false,
    error: "",
    setOpen: (open) => set({ open }),
    send: async (text, page) => {
        const question = text.trim();
        if (!question || get().busy) return;
        const history: HelpAssistantMessage[] = [...get().messages, { role: "user", content: question }];
        saveMessages(history);
        set({ messages: history, error: "", pending: "", busy: true });
        const current = new AbortController();
        controller = current;
        try {
            const answer = await askHelpAssistant(history, page, get().conversationId, (pending) => set({ pending }), current.signal);
            if (controller !== current) return;
            const messages: HelpAssistantMessage[] = [...history, { role: "assistant", content: answer || "抱歉，我暂时答不上来，可以换个说法再问，或让我帮你转人工。" }];
            saveMessages(messages);
            set({ messages });
        } catch (cause) {
            if (controller !== current) return;
            set({ error: cause instanceof Error ? cause.message : "帮助助手暂时无法回答" });
        } finally {
            if (controller === current) {
                controller = null;
                set({ pending: "", busy: false });
            }
        }
    },
    reset: () => {
        controller?.abort();
        controller = null;
        saveMessages([]);
        set({ conversationId: newConversationId(), messages: [], pending: "", busy: false, error: "" });
    },
}));
