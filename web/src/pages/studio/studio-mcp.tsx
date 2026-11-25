import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { App } from "antd";

import { useAppearanceStore } from "@/stores/use-appearance-store";
import { ArrowUpRight, Check, ChevronDown, Copy } from "./studio-icons";
import { StudioShell } from "./studio-shell";
import { STUDIO_MCP_APPS, StudioMcpMark, type StudioMcpAppId } from "./studio-mcp-apps";
import "./studio-mcp.css";

function CopyLine({ value, label }: { value: string; label?: string }) {
    const { message } = App.useApp();
    const [copied, setCopied] = useState(false);
    return (
        <div className="studio-mcp-copy">
            {label ? <span className="studio-mcp-copy-label">{label}</span> : null}
            <div className="studio-mcp-copy-row">
                <code>{value}</code>
                <button
                    type="button"
                    aria-label="复制"
                    onClick={() =>
                        void navigator.clipboard.writeText(value).then(() => {
                            setCopied(true);
                            message.success("已复制");
                            window.setTimeout(() => setCopied(false), 1500);
                        })
                    }
                >
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                </button>
            </div>
        </div>
    );
}

function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
    return (
        <li className="studio-mcp-step">
            <span className="studio-mcp-step-index">{index}</span>
            <div className="studio-mcp-step-body">
                <h3>{title}</h3>
                {children}
            </div>
        </li>
    );
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a className="studio-mcp-button" href={href} target="_blank" rel="noreferrer">
            {children}
            <ArrowUpRight aria-hidden />
        </a>
    );
}

const PROMPTS = [
    { title: "产品广告视频", text: "用 OmniMuse 为我的产品做一条 15 秒的竖屏广告视频。先问我要产品照片、卖点和目标客户，再给我看分镜，确认后才生成。" },
    { title: "电商主图", text: "用 OmniMuse 把这张产品照做成 4 张不同场景的电商主图，1:1，2K。先告诉我每张要花多少积分。" },
    { title: "批量广告变体", text: "用 OmniMuse 为同一个产品生成 3 个不同开头钩子的 5 秒短视频，9:16，720p，方便我做 A/B 测试。" },
];

const FAQ = [
    { q: "需要 API Key 吗？", a: "Claude、ChatGPT、Cursor 不需要：添加网址后点「连接」，用 OmniMuse 账号登录授权即可。只有不支持 OAuth 登录的工具，或服务器上的脚本，才需要在「API 与 MCP」设置里创建 API Key。" },
    { q: "怎么计费？", a: "和网页版完全一样，按模型和规格扣你账号里的积分。生成前 AI 助手可以先帮你估价；生成失败会自动退回积分。" },
    { q: "生成的作品在哪里？", a: "结果会直接显示在对话里，同时保存到你的 OmniMuse 作品库，可以回到网页继续编辑、下载或当参考素材。" },
    { q: "可以用参考图吗？", a: "可以。把图片的公开网址发给 AI 助手即可；命令行工具可以直接用本地文件，会自动上传。" },
    { q: "同时连接了多个工具怎么办？", a: "在提示词里提一句「用 OmniMuse」，AI 助手就知道该用哪个工具，结果更可控。" },
    { q: "怎么断开连接？", a: "在「账户与设置 → API 与 MCP」里可以看到所有已连接的应用，随时断开；也可以撤销不再使用的 API Key。" },
];

export default function StudioMcpPage() {
    const origin = window.location.origin;
    const mcpUrl = `${origin}/mcp`;
    const brand = useAppearanceStore((state) => state.appearance.brandName) || "OmniMuse";
    const { hash } = useLocation();
    const navigate = useNavigate();
    const current = (STUDIO_MCP_APPS.find((app) => `#${app.id}` === hash)?.id || "claude") as StudioMcpAppId;
    const [openFaq, setOpenFaq] = useState<number | null>(0);

    useEffect(() => {
        document.querySelector(".studio-mcp-guide")?.scrollIntoView({ block: "nearest" });
    }, [current]);

    const guides: Record<StudioMcpAppId, ReactNode> = {
        claude: (
            <ol className="studio-mcp-steps">
                <Step index={1} title={`添加 ${brand} 连接器`}>
                    <p>在 Claude 打开「设置 → 连接器」，点「添加自定义连接器」，名称填 {brand}，再粘贴下面的网址。</p>
                    <CopyLine value={mcpUrl} />
                    <ExternalButton href="https://claude.ai/settings/connectors">打开 Claude 连接器</ExternalButton>
                </Step>
                <Step index={2} title="登录并授权">
                    <p>点连接器旁边的「连接」，会打开 {brand} 的授权页，确认账号后点「授权连接」。</p>
                </Step>
                <Step index={3} title="开始创作">
                    <p>新开一个对话，直接说你要什么。试试：「用 {brand} 为我的产品做一条 15 秒的竖屏广告视频。」</p>
                </Step>
                <p className="studio-mcp-note">在用 Claude Code？在终端运行这一行，然后输入 /mcp 登录：</p>
                <CopyLine value={`claude mcp add --transport http omnimuse ${mcpUrl}`} />
            </ol>
        ),
        chatgpt: (
            <ol className="studio-mcp-steps">
                <Step index={1} title="打开开发者模式">
                    <p>在 ChatGPT 打开「设置 → 应用与连接器 → 高级设置」，打开「开发者模式」。需要 Plus、Pro、Business 或企业版账号。</p>
                    <ExternalButton href="https://chatgpt.com/#settings/Connectors">打开 ChatGPT 设置</ExternalButton>
                </Step>
                <Step index={2} title={`创建 ${brand} 连接器`}>
                    <p>回到「应用与连接器」，点「创建」。名称填 {brand}，MCP 服务器网址粘贴下面的地址，认证方式选 OAuth，然后按提示登录并授权。</p>
                    <CopyLine value={mcpUrl} />
                </Step>
                <Step index={3} title="在对话里使用">
                    <p>新对话里点输入框的「+」，在「更多」里选 {brand}，再描述你要的内容。试试：「用 {brand} 做 4 张电商主图。」</p>
                </Step>
            </ol>
        ),
        cursor: (
            <ol className="studio-mcp-steps">
                <Step index={1} title={`添加 ${brand} MCP 服务器`}>
                    <p>在 Cursor 打开「Settings → Tools & MCP」，点「New MCP Server」。如果打开的是 mcp.json，把下面这段加进去：</p>
                    <CopyLine value={JSON.stringify({ mcpServers: { omnimuse: { url: mcpUrl } } }, null, 0)} />
                </Step>
                <Step index={2} title="登录并授权">
                    <p>回到「Tools & MCP」，在 omnimuse 旁边点「Connect」，在打开的页面里授权。</p>
                </Step>
                <Step index={3} title="在 Agent 对话里使用">
                    <p>在 Cursor 的 Agent 对话里说：「用 {brand} 为这个落地页生成一张 16:9 的首图。」</p>
                </Step>
            </ol>
        ),
        other: (
            <ol className="studio-mcp-steps">
                <Step index={1} title="添加 MCP 服务器">
                    <p>在你的 AI 助手的「连接器」或「MCP」设置里，添加下面的网址（Streamable HTTP）。</p>
                    <CopyLine value={mcpUrl} />
                </Step>
                <Step index={2} title="登录授权，或使用 API Key">
                    <p>支持 OAuth 的工具会自动打开 {brand} 授权页。不支持的，在请求头加上 API Key：</p>
                    <CopyLine value="Authorization: Bearer <你的 API Key>" />
                    <Link className="studio-mcp-button" to="/studio/settings?section=developer">
                        创建 API Key
                    </Link>
                </Step>
                <Step index={3} title="开始创作">
                    <p>在提示词里提一句「用 {brand}」，AI 助手就会调用它出图出片。</p>
                </Step>
            </ol>
        ),
        cli: (
            <ol className="studio-mcp-steps">
                <Step index={1} title="安装命令行工具">
                    <p>在终端运行，适合 Claude Code、Codex 和批量自动化。</p>
                    <CopyLine label="macOS / Linux" value={`curl -fsSL ${origin}/install.sh | sh`} />
                    <CopyLine label="Windows PowerShell" value={`irm ${origin}/install.ps1 | iex`} />
                </Step>
                <Step index={2} title="登录">
                    <p>浏览器里确认即可。服务器或 CI 可以改用 API Key：omnimuse login --key &lt;key&gt;。</p>
                    <CopyLine value="omnimuse login" />
                </Step>
                <Step index={3} title="开始生成">
                    <p>先看可用模型和价格，再生成。加 --json 方便脚本和 AI 助手读取结果。</p>
                    <CopyLine value="omnimuse models video" />
                    <CopyLine value={'omnimuse video "一杯咖啡在晨光中冒着热气" -r 9:16 -d 5'} />
                    <CopyLine value={'omnimuse image "白色背景上的护肤品瓶子，柔和棚拍光" -r 1:1 -n 4'} />
                </Step>
            </ol>
        ),
    };

    return (
        <StudioShell title={`${brand} MCP 与 CLI`}>
            <div className="studio-mcp">
                <header className="studio-mcp-hero">
                    <h1>{brand} MCP 与 CLI</h1>
                    <p>在 Claude、ChatGPT、Cursor 等 AI 助手里直接出图出片，或者用命令行批量生成。价格和网页版一样，扣你的 {brand} 积分，作品自动存进作品库。</p>
                </header>

                <div className="studio-mcp-tabs" role="tablist" aria-label="选择应用">
                    {STUDIO_MCP_APPS.map((app) => (
                        <button key={app.id} type="button" role="tab" aria-selected={current === app.id} onClick={() => navigate({ hash: app.id }, { replace: true })}>
                            <StudioMcpMark id={app.id} size={22} />
                            {app.label}
                        </button>
                    ))}
                </div>

                <section className="studio-mcp-guide" aria-live="polite">
                    {guides[current]}
                </section>

                <section className="studio-mcp-section">
                    <h2>试试这些提示词</h2>
                    <div className="studio-mcp-prompts">
                        {PROMPTS.map((prompt) => (
                            <article key={prompt.title} className="studio-mcp-prompt">
                                <h3>{prompt.title}</h3>
                                <p>{prompt.text}</p>
                                <CopyLine value={prompt.text} />
                            </article>
                        ))}
                    </div>
                </section>

                <section className="studio-mcp-section">
                    <h2>AI 助手能做什么</h2>
                    <ul className="studio-mcp-features">
                        <li><b>生成图片和视频</b><span>文生图、图生视频、首尾帧、参考图/视频/音频，所有网页版上架的模型都能用。</span></li>
                        <li><b>先估价再生成</b><span>每次生成前可以先算积分，确认后再扣。</span></li>
                        <li><b>查进度和作品</b><span>查看生成进度、最近的作品，需要时取消。</span></li>
                        <li><b>查余额</b><span>随时问 AI 助手还剩多少积分。</span></li>
                    </ul>
                </section>

                <section className="studio-mcp-section">
                    <h2>常见问题</h2>
                    <div className="studio-mcp-faq">
                        {FAQ.map((item, index) => (
                            <div key={item.q} className="studio-mcp-faq-item" data-open={openFaq === index}>
                                <button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}>
                                    {item.q}
                                    <ChevronDown aria-hidden />
                                </button>
                                {openFaq === index ? <p>{item.a}</p> : null}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </StudioShell>
    );
}
