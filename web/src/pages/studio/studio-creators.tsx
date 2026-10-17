import { useCallback, useEffect, useRef, useState } from "react";
import { App, Select, Spin } from "antd";
import { Link } from "react-router";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { followStudioProfile, listStudioCreators, type StudioCreatorCard, type StudioCreatorQuery } from "@/services/api/studio";
import { Heart, MapPin, Search, UserCheck, UserPlus, Users } from "./studio-icons";
import { StudioCreatorAvatar, studioProfilePath } from "./studio-post-feed";
import { SPECIALTY_PRESETS } from "./studio-profile";
import { StudioShell } from "./studio-shell";

type Sort = NonNullable<StudioCreatorQuery["sort"]>;

const SORTS: Array<{ value: Sort; label: string }> = [
    { value: "popular", label: "最受欢迎" },
    { value: "followers", label: "粉丝最多" },
    { value: "works", label: "作品最多" },
    { value: "latest", label: "最近发布" },
];

function CreatorPreview({ creator }: { creator: StudioCreatorCard }) {
    const slots = [0, 1, 2];
    return (
        <div className="studio-creator-previews">
            {slots.map((index) => {
                const media = creator.previews[index];
                if (!media) return <span key={index} className="studio-creator-preview is-empty" />;
                if (media.kind === "video") return <video key={index} className="studio-creator-preview" src={media.url} muted playsInline preload="metadata" />;
                if (media.kind === "audio")
                    return (
                        <span key={index} className="studio-creator-preview is-audio">
                            ♪
                        </span>
                    );
                return <img key={index} className="studio-creator-preview" src={media.url} alt="" loading="lazy" />;
            })}
        </div>
    );
}

/** 创作者列表：按擅长领域、所在地、关键词找人，以后商家也在这里挑创作者。 */
export default function StudioCreatorsPage() {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [locationText, setLocationText] = useState("");
    const q = useDebouncedValue(keyword.trim(), 300);
    const location = useDebouncedValue(locationText.trim(), 300);
    const [specialty, setSpecialty] = useState("");
    const [sort, setSort] = useState<Sort>("popular");
    const [creators, setCreators] = useState<StudioCreatorCard[]>([]);
    const [nextOffset, setNextOffset] = useState<number | undefined>();
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [following, setFollowing] = useState("");
    const requestRef = useRef(0);

    const load = useCallback(
        async (offset = 0) => {
            const request = ++requestRef.current;
            if (offset) setLoadingMore(true);
            else setLoading(true);
            setError("");
            try {
                const page = await listStudioCreators({ q, specialty, location, sort, offset });
                if (request !== requestRef.current) return;
                setCreators((current) => (offset ? [...current, ...page.creators.filter((item) => !current.some((existing) => existing.handle === item.handle))] : page.creators));
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
        [location, q, sort, specialty],
    );

    useEffect(() => {
        void load(0);
    }, [load]);

    const toggleFollow = async (creator: StudioCreatorCard) => {
        setFollowing(creator.handle);
        try {
            const profile = await followStudioProfile(creator.handle, !creator.following);
            setCreators((current) => current.map((item) => (item.handle === creator.handle ? { ...item, following: profile.following, stats: { ...item.stats, followers: profile.stats.followers } } : item)));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "操作失败");
        } finally {
            setFollowing("");
        }
    };

    const filtered = Boolean(q || specialty || location);

    return (
        <StudioShell title="创作者">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>创作者</h2>
                        <p>按擅长领域和所在地找到合适的创作者，看作品、关注他们。</p>
                    </div>
                    <label className="studio-search">
                        <Search aria-hidden />
                        <input value={keyword} placeholder="搜索名字、主页地址或简介" aria-label="搜索创作者" onChange={(event) => setKeyword(event.target.value)} />
                    </label>
                </div>
                <div className="studio-community-toolbar">
                    <div className="studio-filter studio-creator-specialties" role="group" aria-label="擅长领域">
                        <button type="button" aria-pressed={!specialty} onClick={() => setSpecialty("")}>
                            全部
                        </button>
                        {SPECIALTY_PRESETS.map((item) => (
                            <button key={item} type="button" aria-pressed={specialty === item} onClick={() => setSpecialty(specialty === item ? "" : item)}>
                                {item}
                            </button>
                        ))}
                    </div>
                    <div className="studio-creator-controls">
                        <label className="studio-search is-compact">
                            <MapPin aria-hidden />
                            <input value={locationText} placeholder="所在地" aria-label="按所在地筛选" onChange={(event) => setLocationText(event.target.value)} />
                        </label>
                        <Select value={sort} onChange={setSort} options={SORTS} aria-label="排序" classNames={{ popup: { root: "studio-popup" } }} popupMatchSelectWidth={false} />
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
                ) : !creators.length ? (
                    <div className="studio-empty">
                        <Users aria-hidden />
                        <strong>{filtered ? "没有找到符合条件的创作者" : "还没有创作者"}</strong>
                        <span>{filtered ? "换个领域或所在地试试。" : "发布作品到灵感社区后，创作者就会出现在这里。"}</span>
                    </div>
                ) : (
                    <>
                        <div className="studio-creator-grid">
                            {creators.map((creator) => (
                                <article key={creator.handle} className="studio-creator-card">
                                    <Link to={studioProfilePath(creator.handle)} className="studio-creator-link" aria-label={`查看 ${creator.name} 的主页`}>
                                        <CreatorPreview creator={creator} />
                                        <div className="studio-creator-who">
                                            <StudioCreatorAvatar name={creator.name} url={creator.avatarUrl} size={44} />
                                            <div>
                                                <strong>{creator.name}</strong>
                                                <span>@{creator.handle}</span>
                                            </div>
                                        </div>
                                        {creator.bio ? <p className="studio-creator-bio">{creator.bio}</p> : null}
                                        {creator.specialties.length ? (
                                            <div className="studio-profile-tags">
                                                {creator.specialties.slice(0, 4).map((item) => (
                                                    <span key={item}>{item}</span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </Link>
                                    <div className="studio-creator-foot">
                                        <span className="studio-creator-stats">
                                            {creator.location ? (
                                                <span>
                                                    <MapPin aria-hidden />
                                                    {creator.location}
                                                </span>
                                            ) : null}
                                            <span>{creator.stats.works} 个作品</span>
                                            <span>
                                                <Heart aria-hidden />
                                                {creator.stats.likes}
                                            </span>
                                            <span>{creator.stats.followers} 粉丝</span>
                                        </span>
                                        {creator.mine ? null : (
                                            <button type="button" className={`studio-mini-button${creator.following ? "" : " is-primary"}`} disabled={following === creator.handle} onClick={() => void toggleFollow(creator)}>
                                                {creator.following ? <UserCheck aria-hidden /> : <UserPlus aria-hidden />}
                                                {creator.following ? "已关注" : "加关注"}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                        {nextOffset !== undefined ? (
                            <div className="studio-load-more">
                                <button type="button" className="studio-mini-button" disabled={loadingMore} onClick={() => void load(nextOffset)}>
                                    {loadingMore ? "加载中…" : "加载更多"}
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </StudioShell>
    );
}
