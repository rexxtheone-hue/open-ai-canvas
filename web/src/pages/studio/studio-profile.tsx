import { useCallback, useEffect, useRef, useState } from "react";
import { App, Input, QRCode, Select, Spin } from "antd";
import { requireUser } from "@/stores/use-auth-gate-store";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { followStudioProfile, getMyStudioProfile, getStudioProfile, listStudioProfilePosts, updateStudioProfile, type StudioPost, type StudioProfile, type StudioProfileInput, type StudioProfileLinkKey } from "@/services/api/studio";
import { uploadImage } from "@/services/image-storage";
import { useUserStore } from "@/stores/use-user-store";
import { CalendarDays, Camera, Check, Copy, Download, Heart, Link as LinkIcon, MapPin, Pencil, Share2, Sparkles, UserCheck, UserPlus, Wand2 } from "./studio-icons";
import { StudioCreatorAvatar, StudioPostFeed, studioProfilePath } from "./studio-post-feed";
import { StudioShell } from "./studio-shell";
import "./studio.css";

const LINK_FIELDS: Array<{ key: StudioProfileLinkKey; label: string; placeholder: string }> = [
    { key: "website", label: "网站", placeholder: "https://example.com" },
    { key: "instagram", label: "Instagram", placeholder: "instagram.com/你的账号" },
    { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@你的账号" },
    { key: "facebook", label: "Facebook", placeholder: "facebook.com/你的主页" },
    { key: "youtube", label: "YouTube", placeholder: "youtube.com/@你的频道" },
    { key: "xiaohongshu", label: "小红书", placeholder: "xiaohongshu.com/user/profile/…" },
    { key: "douyin", label: "抖音", placeholder: "douyin.com/user/…" },
];

export const SPECIALTY_PRESETS = ["广告视频", "产品图", "电商主图", "人像写真", "品牌设计", "短视频", "动画", "音乐 MV", "配音", "角色设计", "海报", "社媒内容"];

type ProfileTab = "works" | "liked";

function shareUrl(handle: string) {
    return `${window.location.origin}/u/${encodeURIComponent(handle)}`;
}

function profileInput(profile: StudioProfile): StudioProfileInput {
    return {
        handle: profile.handle,
        name: profile.name,
        bio: profile.bio,
        location: profile.location,
        specialties: profile.specialties,
        links: { ...profile.links },
        avatarResourceId: profile.avatarResourceId || "",
        coverResourceId: profile.coverResourceId || "",
    };
}

/** 编辑主页：头像、封面、名称、主页地址、简介、所在地、擅长领域、外部链接。 */
function StudioProfileEditor({ profile, open, onClose, onSaved }: { profile: StudioProfile; open: boolean; onClose: () => void; onSaved: (profile: StudioProfile) => void }) {
    const { message } = App.useApp();
    const [form, setForm] = useState<StudioProfileInput>(() => profileInput(profile));
    const [avatarPreview, setAvatarPreview] = useState(profile.avatarUrl || "");
    const [coverPreview, setCoverPreview] = useState(profile.coverUrl || "");
    const [uploading, setUploading] = useState<"" | "avatar" | "cover">("");
    const [saving, setSaving] = useState(false);

    const upload = async (field: "avatar" | "cover", file?: File) => {
        if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
            message.error("只支持 JPEG / PNG / WEBP 图片");
            return;
        }
        setUploading(field);
        try {
            const uploaded = await uploadImage(file);
            const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
            if (!resourceId) throw new Error("上传失败，请重试");
            const preview = URL.createObjectURL(file);
            if (field === "avatar") {
                setForm((current) => ({ ...current, avatarResourceId: resourceId }));
                setAvatarPreview(preview);
            } else {
                setForm((current) => ({ ...current, coverResourceId: resourceId }));
                setCoverPreview(preview);
            }
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "上传失败");
        } finally {
            setUploading("");
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const saved = await updateStudioProfile(form);
            message.success("主页已更新");
            onSaved(saved);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const handleChanged = form.handle.trim().toLowerCase() !== profile.handle;

    return (
        <AppModal rootClassName="studio-modal" open={open} title="编辑主页" okText="保存" cancelText="取消" confirmLoading={saving} okButtonProps={{ disabled: Boolean(uploading) }} onOk={() => void save()} onCancel={onClose} width={620} destroyOnHidden>
            <div className="studio-profile-editor">
                <div className="studio-profile-editor-cover" style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined}>
                    <label className="studio-mini-button">
                        <Camera aria-hidden />
                        {uploading === "cover" ? "上传中…" : coverPreview ? "更换封面" : "上传封面"}
                        <input
                            type="file"
                            hidden
                            accept="image/png,image/jpeg,image/webp"
                            disabled={Boolean(uploading)}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                void upload("cover", file);
                            }}
                        />
                    </label>
                    {coverPreview ? (
                        <button
                            type="button"
                            className="studio-mini-button"
                            onClick={() => {
                                setForm((current) => ({ ...current, coverResourceId: "" }));
                                setCoverPreview("");
                            }}
                        >
                            移除
                        </button>
                    ) : null}
                </div>
                <div className="studio-profile-editor-avatar">
                    <StudioCreatorAvatar name={form.name || profile.handle} url={avatarPreview} size={72} />
                    <label className="studio-mini-button">
                        <Camera aria-hidden />
                        {uploading === "avatar" ? "上传中…" : "更换头像"}
                        <input
                            type="file"
                            hidden
                            accept="image/png,image/jpeg,image/webp"
                            disabled={Boolean(uploading)}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                void upload("avatar", file);
                            }}
                        />
                    </label>
                    {avatarPreview ? (
                        <button
                            type="button"
                            className="studio-mini-button"
                            onClick={() => {
                                setForm((current) => ({ ...current, avatarResourceId: "" }));
                                setAvatarPreview("");
                            }}
                        >
                            移除
                        </button>
                    ) : null}
                </div>
                <label className="studio-field">
                    <span>名称</span>
                    <Input value={form.name} maxLength={40} placeholder="在主页和作品上显示的名字" onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="studio-field">
                    <span>主页地址</span>
                    <Input value={form.handle} maxLength={24} prefix={<span className="studio-input-prefix">{`${window.location.host}/u/`}</span>} onChange={(event) => setForm({ ...form, handle: event.target.value.toLowerCase() })} />
                    <small className="studio-hint">{handleChanged ? "修改后，之前分享出去的主页链接会失效。" : "3–24 个字符：小写字母、数字、下划线和点。"}</small>
                </label>
                <label className="studio-field">
                    <span>简介</span>
                    <Input.TextArea value={form.bio} maxLength={300} showCount autoSize={{ minRows: 3, maxRows: 6 }} placeholder="介绍一下你自己、你擅长做什么、服务过哪些客户" onChange={(event) => setForm({ ...form, bio: event.target.value })} />
                </label>
                <label className="studio-field">
                    <span>所在地</span>
                    <Input value={form.location} maxLength={60} placeholder="例如：马六甲，马来西亚" onChange={(event) => setForm({ ...form, location: event.target.value })} />
                </label>
                <label className="studio-field">
                    <span>擅长领域</span>
                    <Select
                        mode="tags"
                        classNames={{ popup: { root: "studio-popup" } }}
                        value={form.specialties}
                        maxCount={8}
                        placeholder="选择或输入，最多 8 个"
                        options={SPECIALTY_PRESETS.map((value) => ({ value, label: value }))}
                        onChange={(values: string[]) => setForm({ ...form, specialties: values.map((value) => value.trim()).filter(Boolean) })}
                    />
                </label>
                <div className="studio-field">
                    <span>链接</span>
                    <div className="studio-profile-editor-links">
                        {LINK_FIELDS.map((field) => (
                            <Input
                                key={field.key}
                                prefix={<span className="studio-input-prefix">{field.label}</span>}
                                value={form.links[field.key] || ""}
                                placeholder={field.placeholder}
                                onChange={(event) => setForm({ ...form, links: { ...form.links, [field.key]: event.target.value } })}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </AppModal>
    );
}

/** 分享主页：二维码（可下载，线下活动打印或现场扫码）+ 复制链接。 */
function StudioShareProfileModal({ profile, open, onClose }: { profile: StudioProfile; open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const qrRef = useRef<HTMLDivElement>(null);
    const link = shareUrl(profile.handle);

    const copy = () => {
        void navigator.clipboard?.writeText(link).then(
            () => message.success("主页链接已复制"),
            () => message.error("复制失败，请手动复制链接"),
        );
    };

    const download = () => {
        const canvas = qrRef.current?.querySelector("canvas");
        if (!canvas) return;
        const anchor = document.createElement("a");
        anchor.href = canvas.toDataURL("image/png");
        anchor.download = `${profile.handle}-qrcode.png`;
        anchor.click();
    };

    return (
        <AppModal rootClassName="studio-modal" open={open} title="分享主页" footer={null} width={420} onCancel={onClose} destroyOnHidden>
            <div className="studio-share-profile">
                <div className="studio-share-card">
                    <div className="studio-share-qr" ref={qrRef}>
                        <QRCode value={link} type="canvas" size={220} bordered={false} color="#111111" bgColor="#ffffff" errorLevel="M" />
                    </div>
                    <div className="studio-share-who">
                        <StudioCreatorAvatar name={profile.name} url={profile.avatarUrl} size={32} />
                        <div>
                            <strong>{profile.name}</strong>
                            <span>@{profile.handle}</span>
                        </div>
                    </div>
                </div>
                <p className="studio-hint">扫码打开主页，不用登录也能看作品。线下活动可以下载二维码打印出来。</p>
                <div className="studio-share-link">
                    <Input value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <button type="button" className="studio-mini-button" onClick={copy}>
                        <Copy aria-hidden />
                        复制链接
                    </button>
                </div>
                <button type="button" className="studio-generate-button" onClick={download}>
                    <Download aria-hidden />
                    下载二维码
                </button>
            </div>
        </AppModal>
    );
}

/** 创作者主页的内容部分：站内（StudioShell 里）和公开页共用。 */
function StudioProfileContent({ handle, guest }: { handle: string; guest: boolean }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const [profile, setProfile] = useState<StudioProfile | null>(null);
    const [profileError, setProfileError] = useState("");
    const [tab, setTab] = useState<ProfileTab>("works");
    const [posts, setPosts] = useState<StudioPost[]>([]);
    const [nextOffset, setNextOffset] = useState<number | undefined>();
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [editing, setEditing] = useState(false);
    const [following, setFollowing] = useState(false);
    const [sharing, setSharing] = useState(false);
    const requestRef = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        setProfile(null);
        setProfileError("");
        getStudioProfile(handle, controller.signal)
            .then(setProfile)
            .catch((cause) => {
                if (!controller.signal.aborted) setProfileError(cause instanceof Error ? cause.message : "主页不存在");
            });
        return () => controller.abort();
    }, [handle]);

    const loadPosts = useCallback(
        async (offset = 0) => {
            const request = ++requestRef.current;
            if (offset) setLoadingMore(true);
            else setLoadingPosts(true);
            try {
                const page = await listStudioProfilePosts(handle, tab, offset);
                if (request !== requestRef.current) return;
                setPosts((current) => (offset ? [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))] : page.posts));
                setNextOffset(page.nextOffset);
            } catch (cause) {
                if (request === requestRef.current) message.error(cause instanceof Error ? cause.message : "读取失败");
            } finally {
                if (request === requestRef.current) {
                    setLoadingPosts(false);
                    setLoadingMore(false);
                }
            }
        },
        [handle, message, tab],
    );

    useEffect(() => {
        void loadPosts(0);
    }, [loadPosts]);

    const toggleFollow = async () => {
        if (!profile) return;
        if (guest && !requireUser()) return;
        setFollowing(true);
        try {
            setProfile(await followStudioProfile(profile.handle, !profile.following));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "操作失败");
        } finally {
            setFollowing(false);
        }
    };

    if (profileError) {
        return (
            <div className="studio-empty" role="alert">
                <strong>找不到这个主页</strong>
                <span>{profileError}</span>
                <Link className="studio-mini-button" to={guest ? "/" : "/studio/inspire"}>
                    去看看灵感社区
                </Link>
            </div>
        );
    }
    if (!profile)
        return (
            <div className="studio-empty">
                <Spin />
            </div>
        );

    const links = LINK_FIELDS.filter((field) => profile.links[field.key]);

    return (
        <div className="studio-profile">
            <div className="studio-profile-cover" style={profile.coverUrl ? { backgroundImage: `url(${profile.coverUrl})` } : undefined} />
            <div className="studio-profile-head">
                <div className="studio-profile-avatar">
                    <StudioCreatorAvatar name={profile.name} url={profile.avatarUrl} size={112} />
                </div>
                <div className="studio-profile-actions">
                    {profile.mine ? (
                        <button type="button" className="studio-mini-button" onClick={() => setEditing(true)}>
                            <Pencil aria-hidden />
                            编辑主页
                        </button>
                    ) : (
                        <button type="button" className={`studio-generate-button is-compact${profile.following ? " is-muted" : ""}`} disabled={following} onClick={() => void toggleFollow()}>
                            {profile.following ? (
                                <>
                                    <UserCheck aria-hidden />
                                    已关注
                                </>
                            ) : (
                                <>
                                    <UserPlus aria-hidden />
                                    加关注
                                </>
                            )}
                        </button>
                    )}
                    <button type="button" className="studio-mini-button" onClick={() => setSharing(true)}>
                        <Share2 aria-hidden />
                        分享主页
                    </button>
                </div>
            </div>
            <div className="studio-profile-info">
                <h1>
                    {profile.name}{" "}
                    {profile.creatorVerified ? (
                        <span className="studio-verified-badge" title="平台审核通过的认证创作者">
                            <UserCheck aria-hidden />
                            认证创作者
                        </span>
                    ) : null}{" "}
                    {profile.merchantVerified ? <span className="studio-verified-badge">商家</span> : null}
                </h1>
                <p className="studio-profile-handle">@{profile.handle}</p>
                {profile.bio ? <p className="studio-profile-bio">{profile.bio}</p> : profile.mine ? <p className="studio-hint">还没有简介。点「编辑主页」介绍一下你自己，商家更容易找到你。</p> : null}
                <div className="studio-profile-facts">
                    {profile.location ? (
                        <span>
                            <MapPin aria-hidden />
                            {profile.location}
                        </span>
                    ) : null}
                    <span>
                        <CalendarDays aria-hidden />
                        {new Date(profile.joinedAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long" })} 加入
                    </span>
                    {links.map((field) => (
                        <a key={field.key} href={profile.links[field.key]} target="_blank" rel="noopener noreferrer nofollow">
                            <LinkIcon aria-hidden />
                            {field.label}
                        </a>
                    ))}
                </div>
                {profile.specialties.length ? (
                    <div className="studio-profile-tags">
                        {profile.specialties.map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                ) : null}
                <dl className="studio-profile-stats">
                    <div>
                        <dt>作品</dt>
                        <dd>{profile.stats.works}</dd>
                    </div>
                    <div>
                        <dt>
                            <Heart aria-hidden />
                            获赞
                        </dt>
                        <dd>{profile.stats.likes}</dd>
                    </div>
                    <div>
                        <dt>
                            <Wand2 aria-hidden />
                            被做同款
                        </dt>
                        <dd>{profile.stats.remixes}</dd>
                    </div>
                    <div>
                        <dt>粉丝</dt>
                        <dd>{profile.stats.followers}</dd>
                    </div>
                    <div>
                        <dt>关注</dt>
                        <dd>{profile.stats.following}</dd>
                    </div>
                </dl>
            </div>
            <div className="studio-filter studio-profile-tabs" role="tablist" aria-label="主页内容">
                <button type="button" role="tab" aria-selected={tab === "works"} aria-pressed={tab === "works"} onClick={() => setTab("works")}>
                    作品
                </button>
                <button type="button" role="tab" aria-selected={tab === "liked"} aria-pressed={tab === "liked"} onClick={() => setTab("liked")}>
                    喜欢
                </button>
            </div>
            {loadingPosts ? (
                <div className="studio-empty">
                    <Spin />
                </div>
            ) : !posts.length ? (
                <div className="studio-empty">
                    <Sparkles aria-hidden />
                    <strong>{tab === "liked" ? "还没有点赞的作品" : profile.mine ? "还没有公开作品" : "还没有公开作品"}</strong>
                    {profile.mine && tab === "works" ? (
                        <>
                            <span>在「媒体」里选一个满意的作品，点「发布到社区」，它就会出现在你的主页上。</span>
                            <Link className="studio-mini-button" to="/studio/media">
                                <Check aria-hidden />
                                去选作品
                            </Link>
                        </>
                    ) : null}
                </div>
            ) : (
                <StudioPostFeed posts={posts} setPosts={setPosts} nextOffset={nextOffset} loadingMore={loadingMore} onLoadMore={(offset) => void loadPosts(offset)} guest={guest} hideAuthor={tab === "works"} />
            )}
            <StudioShareProfileModal profile={profile} open={sharing} onClose={() => setSharing(false)} />
            {profile.mine && editing ? (
                <StudioProfileEditor
                    profile={profile}
                    open={editing}
                    onClose={() => setEditing(false)}
                    onSaved={(saved) => {
                        setEditing(false);
                        setProfile(saved);
                        if (saved.handle !== handle) navigate(studioProfilePath(saved.handle, guest), { replace: true });
                    }}
                />
            ) : null}
        </div>
    );
}

/** 站内主页 /studio/u/:handle。 */
export function StudioProfilePage() {
    const { handle = "" } = useParams();
    return (
        <StudioShell title="创作者主页">
            <div className="studio-page">
                <StudioProfileContent key={handle} handle={handle} guest={false} />
            </div>
        </StudioShell>
    );
}

/** /studio/profile：跳到自己的主页（第一次进入时自动生成主页地址）。 */
export function StudioMyProfileRedirect() {
    const [handle, setHandle] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        getMyStudioProfile().then(
            (profile) => setHandle(profile.handle),
            (cause) => setError(cause instanceof Error ? cause.message : "读取失败"),
        );
    }, []);
    if (handle) return <Navigate to={studioProfilePath(handle)} replace />;
    return (
        <StudioShell title="创作者主页">
            <div className="studio-page">
                {error ? (
                    <div className="studio-empty" role="alert">
                        <strong>读取失败</strong>
                        <span>{error}</span>
                    </div>
                ) : (
                    <div className="studio-empty">
                        <Spin />
                    </div>
                )}
            </div>
        </StudioShell>
    );
}

/** 公开主页 /u/:handle：不登录也能看，方便线下活动扫码、发给客户。 */
export function StudioPublicProfilePage() {
    const { handle = "" } = useParams();
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    const guest = !user;
    return (
        <div className="studio-root studio-public">
            <header className="studio-public-bar">
                <Link to={user ? "/studio" : "/"} className="studio-public-brand">
                    <span>AI</span>AI Studio
                </Link>
                {hydrated ? (
                    user ? (
                        <Link className="studio-generate-button is-compact" to={studioProfilePath(handle)}>
                            进入 Studio
                        </Link>
                    ) : (
                        <div className="studio-public-auth">
                            <Link className="studio-mini-button" to={`/login?next=${encodeURIComponent(studioProfilePath(handle))}`}>
                                登录
                            </Link>
                            <Link className="studio-generate-button is-compact" to={`/register?next=${encodeURIComponent(studioProfilePath(handle))}`}>
                                免费注册
                            </Link>
                        </div>
                    )
                ) : null}
            </header>
            <main className="studio-page studio-public-main">
                <StudioProfileContent key={handle} handle={handle} guest={guest} />
            </main>
        </div>
    );
}
