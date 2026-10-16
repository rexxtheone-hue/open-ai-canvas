import { useState, type ReactNode } from "react";
import { AudioLines, Globe, LayoutGrid, Library, List, MessageSquareText, Mic, Pin, Plus, UserRound, Wand2, X } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";

import type { StudioWork } from "@/services/api/studio";
import { STUDIO_REUSE_KEY } from "./studio-agent";
import { StudioLibrary } from "./studio-library";
import { useAvailableStudioTools } from "./use-available-tools";
import { StudioShell, useStudioActiveTab } from "./studio-shell";
import { StudioToolThumb } from "./studio-tool-thumb";
import { STUDIO_TOOL_TABS, studioToolById, studioToolForKind, studioToolsInTab, studioToolTab, type StudioToolDefinition, type StudioToolTab } from "./studio-tools";
import { useStudioPins, useStudioToolCovers } from "./use-studio-tool-meta";
import { StudioCreateVoiceModal, StudioVoiceLibraryModal, STUDIO_VOICE_KEY, type StudioVoicePick } from "./studio-voices";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { StudioCreateCharacterModal, StudioCreateWorldModal, StudioWorldLibraryModal } from "./studio-worlds";

const VIEW_KEY = "studio.tools.view.v1";

/** 面板顶部的分类标签，工具列表页和工具面板共用。 */
export function StudioPanelTabs() {
    const active = useStudioActiveTab();
    return (
        <nav className="studio-panel-tabs" aria-label="工具分类">
            {STUDIO_TOOL_TABS.map((tab) => (
                <Link key={tab.id} to={tab.path} aria-current={active === tab.id ? "page" : undefined}>{tab.label}</Link>
            ))}
        </nav>
    );
}

/** 面板底部「对话 / 工具」切换。 */
export function StudioPanelFooter({ active = "tools" }: { active?: "chat" | "tools" }) {
    const tab = useStudioActiveTab();
    return (
        <div className="studio-panel-switch" role="group" aria-label="创作方式">
            <Link to="/studio/agents" aria-current={active === "chat" ? "page" : undefined}><MessageSquareText aria-hidden />对话</Link>
            <Link to={studioToolTab(tab)?.path || "/studio/video"} aria-current={active === "tools" ? "page" : undefined}><Wand2 aria-hidden />工具</Link>
        </div>
    );
}

function readView(): "list" | "grid" {
    try {
        return window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
    } catch {
        return "list";
    }
}

/** 工具清单：列表或网格，悬停显示固定按钮，已固定的常显。 */
export function StudioToolList({ title, tools, current, onPick }: { title: string; tools: StudioToolDefinition[]; current?: string; onPick?: () => void }) {
    const [view, setView] = useState<"list" | "grid">(readView);
    const { isPinned, toggle } = useStudioPins();
    const covers = useStudioToolCovers();
    const changeView = (next: "list" | "grid") => {
        setView(next);
        try {
            window.localStorage.setItem(VIEW_KEY, next);
        } catch {
            // 浏览器存储不可用时只在本页生效。
        }
    };
    return (
        <>
            <div className="studio-tools-head" data-view={view}>
                <strong>{title}</strong>
                <div className="studio-view-toggle" role="group" aria-label="显示方式">
                    <button type="button" aria-label="列表" aria-pressed={view === "list"} onClick={() => changeView("list")}><List aria-hidden /></button>
                    <button type="button" aria-label="网格" aria-pressed={view === "grid"} onClick={() => changeView("grid")}><LayoutGrid aria-hidden /></button>
                </div>
            </div>
            <ul className={`studio-tool-list is-${view}`}>
                {tools.map((tool) => {
                    const pinned = isPinned(tool.id);
                    return (
                        <li key={tool.id} className={`studio-tool-item${pinned ? " is-pinned" : ""}`} aria-current={current === tool.id ? "true" : undefined}>
                            <Link to={tool.path} className="studio-tool-link" onClick={onPick}>
                                <StudioToolThumb tool={tool} cover={covers[tool.id]} size={view === "grid" ? 120 : 64} className={view === "grid" ? "is-large" : ""} />
                                <span className="studio-tool-text">
                                    <b>{tool.label}{tool.badge ? <em className={`studio-tag is-${tool.badge.toLowerCase()}`}>{tool.badge}</em> : null}</b>
                                    {view === "list" ? <small>{tool.description}</small> : null}
                                </span>
                            </Link>
                            <button type="button" className="studio-pin-button" aria-pressed={pinned} aria-label={pinned ? `从侧栏取消固定 ${tool.label}` : `固定 ${tool.label} 到侧栏`} title={pinned ? "从侧栏取消固定" : "固定到侧栏"} onClick={() => toggle(tool.id)}>
                                <Pin aria-hidden />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

/** 工具页标题卡点「切换」后，在作品库上方弹出同分类的工具清单。 */
export function StudioToolSwitcher({ toolId, onClose }: { toolId: string; onClose: () => void }) {
    const available = useAvailableStudioTools();
    const tool = studioToolById(toolId);
    const tab = studioToolTab(tool?.tabs[0]);
    if (!tool || !tab) return null;
    return (
        <aside className="studio-switcher" aria-label="切换工具">
            <div className="studio-switcher-head">
                <tab.icon aria-hidden />
                <strong>{tab.label}</strong>
                <button type="button" className="studio-icon-button" aria-label="关闭" onClick={onClose}><X aria-hidden /></button>
            </div>
            <div className="studio-switcher-scroll">
                <StudioToolList title={tab.listTitle} tools={studioToolsInTab(available, tab.id)} current={tool.id} onPick={onClose} />
            </div>
        </aside>
    );
}

/** 左面板 + 右作品库的两栏工作区。 */
export function StudioWorkspace({ panel, footer = true, library }: { panel: ReactNode; footer?: boolean; library: ReactNode }) {
    return (
        <div className="studio-workspace">
            <section className="studio-left-panel">
                <StudioPanelTabs />
                <div className="studio-left-scroll">{panel}</div>
                {footer ? <StudioPanelFooter /> : null}
            </section>
            <div className="studio-right-panel">{library}</div>
        </div>
    );
}

function useReuseNavigation() {
    const navigate = useNavigate();
    return (work: StudioWork) => {
        const original = work.tool ? studioToolById(work.tool) : undefined;
        const tool = original && original.kind === work.kind ? original : studioToolForKind(work.kind);
        if (!tool) return;
        try {
            window.sessionStorage.setItem(STUDIO_REUSE_KEY, JSON.stringify(work));
        } catch {
            // 会话存储不可用时只打开工具页。
        }
        navigate(tool.path);
    };
}

/** /studio/video、/studio/image、/studio/audio、/studio/character：分类工具清单 + 作品库。 */
export function StudioToolsBrowser() {
    const { pathname } = useLocation();
    const tab = studioToolTab(pathname.split("/")[2]);
    const available = useAvailableStudioTools();
    const reuse = useReuseNavigation();
    const navigate = useNavigate();
    const config = useEffectiveConfig();
    const [voiceDialog, setVoiceDialog] = useState<"" | "create" | "library" | "world-create" | "world-library" | "character-create">("");
    const [worldPrompt, setWorldPrompt] = useState("");
    if (!tab) return <Navigate to="/studio/video" replace />;
    // 声音库里点「使用」：带着选择去配音页。
    const openVoice = (pick: StudioVoicePick) => {
        try {
            window.sessionStorage.setItem(STUDIO_VOICE_KEY, JSON.stringify(pick));
        } catch {
            // 会话存储不可用时只打开配音页。
        }
        navigate("/studio/create-audio");
    };
    const tools = studioToolsInTab(available, tab.id as StudioToolTab);
    return (
        <StudioShell title="创作" subtitle={tab.label}>
            <StudioWorkspace
                panel={
                    <>
                        {tab.id === "character" ? (
                            <div className="studio-entry-pair">
                                <button type="button" className="studio-entry-tile is-accent" onClick={() => setVoiceDialog("character-create")}><Plus aria-hidden /><span>创建角色</span></button>
                                <Link to="/studio/characters" className="studio-entry-tile"><UserRound aria-hidden /><span>角色库</span></Link>
                            </div>
                        ) : null}
                        {tab.id === "world" ? (
                            <div className="studio-entry-pair">
                                <button type="button" className="studio-entry-tile is-accent" onClick={() => { setWorldPrompt(""); setVoiceDialog("world-create"); }}><Globe aria-hidden /><span>创建世界</span></button>
                                <button type="button" className="studio-entry-tile" onClick={() => setVoiceDialog("world-library")}><Library aria-hidden /><span>世界库</span></button>
                            </div>
                        ) : null}
                        {tab.id === "audio" ? (
                            <div className="studio-entry-pair">
                                <button type="button" className="studio-entry-tile is-accent" onClick={() => setVoiceDialog("create")}><Mic aria-hidden /><span>创建声音</span></button>
                                <button type="button" className="studio-entry-tile" onClick={() => setVoiceDialog("library")}><AudioLines aria-hidden /><span>声音库</span></button>
                            </div>
                        ) : null}
                        {tools.length ? <StudioToolList title={tab.listTitle} tools={tools} /> : <p className="studio-hint">这个分类的工具还没有可用的模型，请联系管理员在后台开启。</p>}
                    </>
                }
                library={<StudioLibrary onReuseSettings={reuse} />}
            />
            {voiceDialog === "character-create" ? <StudioCreateCharacterModal open onClose={() => setVoiceDialog("")} /> : null}
            {voiceDialog === "world-create" ? <StudioCreateWorldModal open initialPrompt={worldPrompt} onClose={() => setVoiceDialog("")} /> : null}
            {voiceDialog === "world-library" ? <StudioWorldLibraryModal open onClose={() => setVoiceDialog("")} onCreate={(prompt) => { setWorldPrompt(prompt || ""); setVoiceDialog("world-create"); }} /> : null}
            {tab.id === "audio" ? (
                <>
                    <StudioCreateVoiceModal open={voiceDialog === "create"} onClose={() => setVoiceDialog("")} />
                    <StudioVoiceLibraryModal open={voiceDialog === "library"} config={config} onClose={() => setVoiceDialog("")} onPick={openVoice} />
                </>
            ) : null}
        </StudioShell>
    );
}
