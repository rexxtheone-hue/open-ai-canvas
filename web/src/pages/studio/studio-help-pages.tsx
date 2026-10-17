import { useMemo, useState } from "react";
import { App, Input } from "antd";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ChevronDown, Copy, Search } from "./studio-icons";
import { useSearchParams } from "react-router";

import { getStudioSiteContent } from "@/services/api/studio-agents";
import { StudioShell } from "./studio-shell";

/** 帮助中心的常见问题。内容按本产品的真实规则写，改规则时同步更新。 */
export const STUDIO_FAQ: Array<{ id: string; title: string; items: Array<{ q: string; a: string }> }> = [
    {
        id: "start",
        title: "入门",
        items: [
            { q: "AI Studio 是什么？", a: "AI Studio 是一站式的 AI 创作工作台：用文字、图片、视频和声音生成新的图片、视频和配音，也可以用对话模式或导演模式一步步做出完整短片。" },
            { q: "能做什么？", a: "生成图片和视频、图生视频、首尾帧、编辑和延长视频、换背景、重新打光、对口型、配音、声音克隆、角色和世界等。所有工具都在左侧的「工具」里，按视频、图片、音频、角色、世界分类。" },
            { q: "对话模式、导演模式和工具有什么区别？", a: "工具适合单次生成：选好素材和参数直接出结果。对话模式像和助手聊天，它会帮你挑工具、写提示词。导演模式从一个想法开始，先写剧本、拆分镜，再逐个镜头生成，最后合成完整视频。" },
            { q: "为什么生成按钮是灰色的？", a: "按钮下方会写明原因：例如还没填提示词、缺少必需的素材、积分不足，或者后台还没有开启支持这个工具的模型。按提示补齐即可；如果提示没有可用的模型，请联系管理员。" },
            { q: "不知道怎么做某件事时去哪里？", a: "先看本页的常见问题；还解决不了，点右上角的问号选择「反馈」，写下遇到的情况，管理员会处理。" },
        ],
    },
    {
        id: "credits",
        title: "积分与会员",
        items: [
            { q: "积分怎么计算？", a: "每次生成按所选模型的价格扣积分，生成按钮上会显示这一次的积分数。视频通常按时长和分辨率计费，图片按张数计费，一次生成多个时每个单独计费。" },
            { q: "为什么同一个工具的价格会变？", a: "价格取决于你选的模型、时长、分辨率、数量和是否同步生成声音。换了其中任何一项，按钮上的积分都会重新计算。" },
            { q: "生成失败会扣积分吗？", a: "提交时积分会先冻结；任务失败会自动退还冻结的积分，在「积分记录」的「退款」里可以看到。" },
            { q: "怎么充值或兑换积分？", a: "点右上角的积分数字打开积分中心，可以充值或输入兑换码。会员方案在「升级」页面。" },
            { q: "在哪里看积分记录？", a: "点右上角头像选择「积分记录」，可以按全部、消耗、获得、退款查看每一笔积分的来去。" },
        ],
    },
    {
        id: "video",
        title: "视频生成",
        items: [
            { q: "支持哪些生成方式？", a: "文生视频、图生视频（首帧）、首尾帧、全能参考（图片、视频、音频任意组合），以及编辑、延长、换风格、运镜重拍等专项工具。具体能用哪些取决于所选模型。" },
            { q: "一次可以生成几个视频？", a: "生成视频最多一次 8 个，每个是独立任务、单独计费。" },
            { q: "参考素材有数量限制吗？", a: "有，上限由所选模型决定，面板里会写「当前模型最多几张图片、几段视频、几段音频」。超出上限的素材会标灰，生成时不会发送。" },
            { q: "生成要多久？", a: "视频一般需要几十秒到几分钟，取决于模型和时长。生成中的任务会出现在右侧作品库里，完成后自动刷新。" },
        ],
    },
    {
        id: "image",
        title: "图片生成",
        items: [
            { q: "比例和分辨率在哪里改？", a: "在面板底部的「输出」里。可选的比例和分辨率由模型决定。" },
            { q: "怎么让图片参考我上传的照片？", a: "在「添加参考」里上传图片或从作品、角色库选择。编辑图片、换背景、扩图等工具会按格子要求的素材使用。" },
        ],
    },
    {
        id: "character",
        title: "角色与一致性",
        items: [
            { q: "怎么让同一个角色出现在不同作品里？", a: "先在「角色库」建立角色（上传几张清晰的照片），之后在任何工具的「添加参考」里选「角色与世界」带入，生成时会把角色照片作为参考。" },
            { q: "声音也能复用吗？", a: "可以。在音频分类点「创建声音」录一段或上传一段 3–60 秒的人声，之后在声音库里点「使用」。复刻音色需要支持参考音频的配音模型。" },
        ],
    },
    {
        id: "privacy",
        title: "隐私、数据与版权",
        items: [
            { q: "别人能看到我的作品吗？", a: "不能。作品默认只有自己可见，只有你主动发布到灵感社区的作品才会公开。" },
            { q: "上传的素材存在哪里？", a: "上传的图片、视频和音频保存在你的账户下，只用于你自己的生成任务，在「添加参考」的「上传」里可以再次使用。" },
            { q: "生成内容可以商用吗？", a: "请以本站的服务条款为准，并确保你上传的素材拥有相应的使用权。" },
        ],
    },
];

function useSiteContent(enabled = true) {
    return useQuery({ queryKey: ["studio", "site-content"], queryFn: ({ signal }) => getStudioSiteContent(signal), enabled, staleTime: 60_000 });
}

/** /studio/help：常见问题（可搜索、按分类）和客服说明。 */
export function StudioHelpPage() {
    const { message } = App.useApp();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [openId, setOpenId] = useState("");
    const site = useSiteContent();
    const results = useMemo(() => {
        const text = query.trim().toLowerCase();
        return STUDIO_FAQ.filter((group) => category === "all" || group.id === category)
            .map((group) => ({ ...group, items: group.items.filter((item) => !text || `${item.q}${item.a}`.toLowerCase().includes(text)) }))
            .filter((group) => group.items.length);
    }, [category, query]);
    const copy = async (q: string, a: string) => {
        try {
            await navigator.clipboard.writeText(`${q}\n${a}`);
            message.success("已复制");
        } catch {
            message.error("复制失败");
        }
    };
    return (
        <StudioShell title="帮助中心">
            <div className="studio-doc">
                <h1>帮助中心</h1>
                <p className="studio-hint">这里整理了使用 AI Studio 时最常见的问题。可以搜索，也可以按分类浏览。</p>
                <Input allowClear size="large" prefix={<Search aria-hidden size={16} />} placeholder="搜索问题" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索问题" />
                <div className="studio-picker-sources studio-doc-tabs" role="tablist" aria-label="问题分类">
                    <button type="button" role="tab" aria-selected={category === "all"} onClick={() => setCategory("all")}>全部</button>
                    {STUDIO_FAQ.map((group) => <button key={group.id} type="button" role="tab" aria-selected={category === group.id} onClick={() => setCategory(group.id)}>{group.title}</button>)}
                </div>
                {results.length ? results.map((group) => (
                    <section key={group.id} className="studio-doc-section">
                        <h2>{group.title}</h2>
                        {group.items.map((item) => {
                            const id = `${group.id}:${item.q}`;
                            const expanded = openId === id || Boolean(query.trim());
                            return (
                                <div key={id} className="studio-faq" data-open={expanded}>
                                    <button type="button" className="studio-faq-q" aria-expanded={expanded} onClick={() => setOpenId(expanded && !query.trim() ? "" : id)}>
                                        <span>{item.q}</span><ChevronDown aria-hidden />
                                    </button>
                                    {expanded ? (
                                        <div className="studio-faq-a">
                                            <p>{item.a}</p>
                                            <button type="button" className="studio-icon-button is-ghost" aria-label="复制问题和答案" title="复制问题和答案" onClick={() => void copy(item.q, item.a)}><Copy aria-hidden /></button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </section>
                )) : <p className="studio-hint">没有找到相关问题，可以点右上角的问号提交反馈。</p>}
                <section id="support" className="studio-doc-section">
                    <h2>联系客服</h2>
                    {site.data?.support ? <div className="studio-doc-markdown"><ReactMarkdown>{site.data.support}</ReactMarkdown></div> : <p className="studio-hint">管理员还没有填写客服联系方式。遇到问题可以点右上角的问号提交反馈。</p>}
                </section>
            </div>
        </StudioShell>
    );
}

/** /studio/terms：服务条款和隐私政策，内容由管理员在后台填写。 */
export function StudioTermsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get("tab") === "privacy" ? "privacy" : "terms";
    const site = useSiteContent();
    const content = site.data?.[tab] || "";
    return (
        <StudioShell title="条款与政策">
            <div className="studio-doc">
                <div className="studio-picker-sources studio-doc-tabs" role="tablist" aria-label="条款类型">
                    <button type="button" role="tab" aria-selected={tab === "terms"} onClick={() => setSearchParams({})}>服务条款</button>
                    <button type="button" role="tab" aria-selected={tab === "privacy"} onClick={() => setSearchParams({ tab: "privacy" })}>隐私政策</button>
                </div>
                {site.isLoading ? <p className="studio-hint">正在加载…</p> : content ? <div className="studio-doc-markdown"><ReactMarkdown>{content}</ReactMarkdown></div> : <p className="studio-hint">管理员还没有填写{tab === "terms" ? "服务条款" : "隐私政策"}。</p>}
            </div>
        </StudioShell>
    );
}
