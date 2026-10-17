import { useCallback, useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import { Search, Sparkles } from "./studio-icons";
import { useSearchParams } from "react-router";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listStudioCommunity, type StudioCommunityQuery, type StudioKind, type StudioPost } from "@/services/api/studio";
import { STUDIO_POST_KIND_LABELS, StudioPostFeed } from "./studio-post-feed";
import { StudioShell } from "./studio-shell";

type Tab = "featured" | "latest" | "popular" | "following" | "templates" | "mine";

const TABS: Array<{ id: Tab; label: string }> = [
    { id: "featured", label: "精选" },
    { id: "latest", label: "最新" },
    { id: "popular", label: "最热" },
    { id: "following", label: "关注" },
    { id: "templates", label: "模板" },
    { id: "mine", label: "我的发布" },
];

function tabQuery(tab: Tab): StudioCommunityQuery {
    if (tab === "templates") return { templates: true, sort: "popular" };
    if (tab === "mine") return { mine: true, sort: "latest" };
    if (tab === "following") return { following: true, sort: "latest" };
    return { sort: tab };
}

function emptyText(tab: Tab, q: string): [string, string] {
    if (tab === "mine") return ["还没有发布作品", "在作品库里点「发布到社区」就能分享。"];
    if (tab === "following") return ["还没有关注的创作者", "在作品上点作者名字进入主页，点「关注」后他们的新作品会出现在这里。"];
    return [q ? "没有找到相关作品" : "这里还是空的", "换个分类看看，或者先发布一个作品。"];
}

/** 灵感社区：看别人发布的作品，一键做同款。 */
export default function StudioInspirePage() {
    // 分类跟着网址走：侧栏「模板」「灵感社区」切换时页面同步，刷新后也保持。
    const [searchParams, setSearchParams] = useSearchParams();
    const tab: Tab = TABS.some((item) => item.id === searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "featured";
    const setTab = (next: Tab) => setSearchParams(next === "featured" ? {} : { tab: next }, { replace: true });
    const [kind, setKind] = useState<StudioKind | "all">("all");
    const [keyword, setKeyword] = useState("");
    const q = useDebouncedValue(keyword.trim(), 300);
    const [posts, setPosts] = useState<StudioPost[]>([]);
    const [nextOffset, setNextOffset] = useState<number | undefined>();
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const requestRef = useRef(0);

    const load = useCallback(
        async (offset = 0) => {
            const request = ++requestRef.current;
            if (offset) setLoadingMore(true);
            else setLoading(true);
            setError("");
            try {
                const page = await listStudioCommunity({ ...tabQuery(tab), kind, q, offset, pageSize: 24 });
                if (request !== requestRef.current) return;
                setPosts((current) => (offset ? [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))] : page.posts));
                setNextOffset(page.nextOffset);
            } catch (cause) {
                if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "读取失败");
            } finally {
                if (request === requestRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [kind, q, tab],
    );

    useEffect(() => {
        void load(0);
    }, [load]);

    const [emptyTitle, emptyHint] = emptyText(tab, q);

    return (
        <StudioShell title="灵感">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>灵感社区</h2>
                        <p>看看大家做了什么，喜欢的一键做同款。</p>
                    </div>
                    <label className="studio-search">
                        <Search aria-hidden />
                        <input value={keyword} placeholder="搜索标题或提示词" aria-label="搜索灵感" onChange={(event) => setKeyword(event.target.value)} />
                    </label>
                </div>
                <div className="studio-community-toolbar">
                    <div className="studio-filter" role="group" aria-label="灵感分类">
                        {TABS.map((item) => (
                            <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="studio-filter" role="group" aria-label="作品类型">
                        {(["all", "image", "video", "audio"] as const).map((value) => (
                            <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                                {value === "all" ? "全部" : STUDIO_POST_KIND_LABELS[value]}
                            </button>
                        ))}
                    </div>
                </div>
                {loading ? (
                    <div className="studio-empty">
                        <Spin />
                    </div>
                ) : error ? (
                    <div className="studio-empty" role="alert">
                        <strong>读取失败</strong>
                        <span>{error}</span>
                        <button type="button" className="studio-mini-button" onClick={() => void load(0)}>
                            重试
                        </button>
                    </div>
                ) : !posts.length ? (
                    <div className="studio-empty">
                        <Sparkles aria-hidden />
                        <strong>{emptyTitle}</strong>
                        <span>{emptyHint}</span>
                    </div>
                ) : (
                    <StudioPostFeed posts={posts} setPosts={setPosts} nextOffset={nextOffset} loadingMore={loadingMore} onLoadMore={(offset) => void load(offset)} />
                )}
            </div>
        </StudioShell>
    );
}
