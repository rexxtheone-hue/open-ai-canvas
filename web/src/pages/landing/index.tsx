import "@fontsource-variable/space-grotesk/index.css";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Languages, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { BrandLogo } from "@/components/brand/brand-logo";
import { currentLocale, setLocale } from "@/lib/i18n/runtime";
import { getAuthSettings } from "@/services/api/auth";
import { TopupOffers } from "@/components/topup-offers";
import { listTopupProducts } from "@/services/api/payments";
import { listStudioToolCovers } from "@/services/api/studio";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import "./landing.css";

const register = (next: string) => `/register?next=${encodeURIComponent(next)}`;

/** 首屏轮播：优先用后台为官网设置的 site-hero-N，没有时退回工具封面。 */
const HERO_REEL = [
    { slot: "site-hero-1", fallback: "quick-brand-film", label: "品牌短片" },
    { slot: "site-hero-2", fallback: "quick-product-ad", label: "产品广告" },
    { slot: "site-hero-3", fallback: "quick-food", label: "餐饮探店" },
    { slot: "site-hero-4", fallback: "quick-real-estate", label: "房地产看房" },
    { slot: "site-hero-5", fallback: "quick-short-drama", label: "短剧" },
    { slot: "site-hero-6", fallback: "quick-ugc", label: "真人口播" },
];

const VIDEO_TOOLS = [
    { cover: "create-video", title: "生成视频", text: "文字、图片、视频、音频任意组合作为参考，Seedance、Veo、Wan、Kling 随时切换", path: "/studio/create-video" },
    { cover: "replace-character", title: "换角色", text: "把视频里的人换成你的模特或代言人", path: "/studio/video" },
    { cover: "lip-sync", title: "对口型", text: "上传配音，人物开口说你的台词", path: "/studio/video" },
    { cover: "edit-video", title: "编辑视频", text: "一句话换背景、换衣服、去掉杂物", path: "/studio/video" },
    { cover: "extend-video", title: "延长视频", text: "从最后一帧自然接着拍", path: "/studio/video" },
    { cover: "motion-sync", title: "动作模仿", text: "让你的角色照着参考视频做动作", path: "/studio/video" },
    { cover: "video-upscale", title: "视频高清", text: "草稿放大成高清成片", path: "/studio/video" },
];

const CAMERA_MOVES = [
    { cover: "camera-dolly-zoom", title: "希区柯克变焦" },
    { cover: "camera-orbit", title: "环绕" },
    { cover: "camera-crane", title: "升降" },
    { cover: "camera-fpv", title: "FPV 穿越" },
    { cover: "camera-drone", title: "无人机航拍" },
    { cover: "camera-tracking", title: "跟踪" },
    { cover: "camera-follow", title: "跟拍" },
    { cover: "camera-handheld", title: "手持" },
    { cover: "camera-zoom-in", title: "推近" },
    { cover: "camera-zoom-out", title: "拉远" },
    { cover: "camera-pan-left", title: "左摇" },
    { cover: "camera-pan-right", title: "右摇" },
    { cover: "camera-tilt-up", title: "上仰" },
    { cover: "camera-tilt-down", title: "下俯" },
    { cover: "camera-jib", title: "摇臂" },
    { cover: "camera-static", title: "固定机位" },
];

const IMAGE_TOOLS = [
    { cover: "create-image", title: "生成图片", text: "海报、产品图、社媒配图" },
    { cover: "edit-image", title: "改图", text: "一句话改局部、换颜色" },
    { cover: "relight", title: "重新打光", text: "白天变黄昏，影棚变自然光" },
    { cover: "replace-background", title: "换背景", text: "产品放进任何场景" },
    { cover: "expand-image", title: "扩图", text: "竖图变横图，补全画面" },
    { cover: "multi-view", title: "多角度", text: "一张图生成多个视角" },
    { cover: "face-swap", title: "换脸", text: "保留姿势和服装换人" },
    { cover: "image-upscale", title: "图片高清", text: "放大到 4K 不糊" },
];

const INDUSTRIES = [
    { cover: "quick-product-ad", genre: "product-ad", title: "产品广告", text: "一张产品图，生成带卖点、配乐和字幕的 15 秒广告片" },
    { cover: "quick-ugc", genre: "ugc", title: "真人口播", text: "AI 主播拿着你的产品讲解，像顾客自拍分享" },
    { cover: "quick-food", genre: "food", title: "餐饮探店", text: "把菜品拍得诱人，适合 Facebook 和 TikTok" },
    { cover: "quick-real-estate", genre: "real-estate", title: "房地产看房", text: "房源照片变成平稳运镜的看房视频" },
    { cover: "quick-brand-film", genre: "brand-film", title: "品牌短片", text: "电影感的品牌故事，适合官网和活动开场" },
    { cover: "quick-short-drama", genre: "short-drama", title: "短剧", text: "从剧本到分镜到成片，角色前后一致" },
];

/** 作品墙：后台设置的 site-gallery-N 排在前面，之后是平台作品图。 */
const GALLERY_SLOTS = Array.from({ length: 20 }, (_, index) => `site-gallery-${index + 1}`);
const GALLERY_IMAGES = Array.from({ length: 24 }, (_, index) => `/auth/showcase/w${String(index + 1).padStart(2, "0")}.webp`);

const MODELS = ["Seedance 2.5", "Veo 3.1", "Kling 4", "Wan 3.0", "MiniMax H3", "Vidu Q4", "Grok Imagine", "Nano Banana 2.1", "GPT Image 2.6", "Midjourney V8", "Seedream 5.5"];

const FAQS = [
    { q: "不会剪辑、不会写脚本也能用吗？", a: "能。用对话模式说你想做什么，AI 会先写脚本、排好镜头，再一个个生成。想自己控制的话，可以用导演模式逐个镜头调整。" },
    { q: "积分怎么算？", a: "生成图片、视频、音频都按次扣积分，提交前就会显示要扣多少。例如 Nano Banana 2.1 一张 1K 图片 30 积分，Wan 3.0 一条 720P 5 秒视频约 208 积分。生成失败会自动退回积分。" },
    { q: "怎么付款？", a: "以马币计价，用银行卡一次性付款，不订阅、不自动续费。新用户可以先买 RM 99 新手礼包。" },
    { q: "充值的积分多久到期？", a: "每次充值单独计算，从付款当天起 12 个月有效，大额充值包 24 个月。到期前 30 天和 7 天会提醒你。" },
    { q: "可以先试用吗？", a: "可以。注册后先用赠送的积分试用，满意了再充值。" },
];

function coverSource(src: string | undefined) {
    if (!src) return { src: "", video: false };
    return src.endsWith("#video") ? { src: src.slice(0, -"#video".length), video: true } : { src, video: false };
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 视频进入画面才加载和播放，离开就暂停；系统要求减少动态时只显示第一帧。 */
function LandingMedia({ src, label, eager = false }: { src?: string; label: string; eager?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    const inView = useRef(false);
    const [visible, setVisible] = useState(eager);
    const media = coverSource(src);
    const reduced = prefersReducedMotion();
    const play = () => {
        if (inView.current && !reduced) void ref.current?.play().catch(() => undefined);
    };
    useEffect(() => {
        const element = ref.current;
        if (!media.video || !element) return;
        if (typeof IntersectionObserver === "undefined") {
            inView.current = true;
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry) return;
                inView.current = entry.isIntersecting;
                if (entry.isIntersecting) {
                    setVisible(true);
                    if (element.currentSrc && !reduced) void element.play().catch(() => undefined);
                } else element.pause();
            },
            { rootMargin: "200px" },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [media.video, media.src, reduced]);
    if (!media.src) return <span className="landing-media is-empty" aria-hidden />;
    if (!media.video) return <img className="landing-media" src={media.src} alt={label} loading={eager ? "eager" : "lazy"} decoding="async" />;
    return <video ref={ref} className="landing-media" src={visible ? `${media.src}#t=0.1` : undefined} muted loop playsInline preload="metadata" disablePictureInPicture aria-label={label} onLoadedData={play} />;
}

/** 首屏全屏轮播：一次只加载当前和下一段，每段约 5 秒后淡入下一段。 */
function HeroReel({ clips, onChange }: { clips: { src: string; label: string }[]; onChange: (index: number) => void }) {
    const [active, setActive] = useState(0);
    const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
    const reduced = prefersReducedMotion();
    const refs = useRef<(HTMLVideoElement | null)[]>([]);
    const count = clips.length;

    useEffect(() => {
        if (count < 2 || reduced) return;
        const timer = window.setInterval(() => setActive((index) => (index + 1) % count), 5200);
        return () => window.clearInterval(timer);
    }, [count, reduced]);

    useEffect(() => {
        onChange(active);
        setLoaded((previous) => (previous.has(active) && previous.has((active + 1) % count) ? previous : new Set([...previous, active, (active + 1) % count])));
        refs.current.forEach((video, index) => {
            if (!video) return;
            if (index === active && !reduced) {
                video.currentTime = 0;
                void video.play().catch(() => undefined);
            } else video.pause();
        });
    }, [active, count, reduced, onChange]);

    return (
        <div className="landing-reel" aria-hidden>
            {clips.map((clip, index) => {
                const media = coverSource(clip.src);
                if (!media.src) return null;
                return media.video ? (
                    <video
                        key={clip.src}
                        ref={(element) => {
                            refs.current[index] = element;
                        }}
                        className={index === active ? "is-active" : undefined}
                        src={loaded.has(index) ? `${media.src}#t=0.1` : undefined}
                        muted
                        playsInline
                        loop
                        preload="auto"
                    />
                ) : (
                    <img key={clip.src} className={index === active ? "is-active" : undefined} src={media.src} alt="" />
                );
            })}
        </div>
    );
}

// i18n-ignore
const LANGUAGE_LABELS = { en: "EN", zh: "中文" } as const;

function LanguageToggle() {
    const next = currentLocale === "en" ? "zh" : "en";
    return (
        <button type="button" className="landing-lang" onClick={() => setLocale(next)} aria-label={next === "en" ? "Switch to English" : "切换到中文"}>
            <Languages aria-hidden />
            <span>{LANGUAGE_LABELS[next]}</span>
        </button>
    );
}

function Pricing() {
    const navigate = useNavigate();
    const productsQuery = useQuery({ queryKey: ["landing", "topup-products"], queryFn: async () => (await listTopupProducts()).products, staleTime: 5 * 60_000 });
    if (productsQuery.isLoading) return <p className="landing-muted">正在读取充值包…</p>;
    if (productsQuery.isSuccess && !productsQuery.data.length) return <p className="landing-muted">暂未开放在线充值，请联系客服充值。</p>;
    if (!productsQuery.data?.length) {
        return (
            <p className="landing-muted">
                充值包暂时读取不到，可以 <Link to="/studio/pricing">打开充值页</Link> 查看。
            </p>
        );
    }
    return <TopupOffers products={productsQuery.data} onBuy={() => navigate(register("/studio/pricing"))} />;
}

function SectionHead({ index, title, text, action }: { index: string; title: string; text: string; action?: { to: string; label: string } }) {
    return (
        <div className="landing-head">
            <div>
                <span className="landing-meta">{index}</span>
                <h2>{title}</h2>
                <p>{text}</p>
            </div>
            {action ? (
                <Link className="landing-head-action" to={action.to}>
                    {action.label}
                    <ArrowRight aria-hidden />
                </Link>
            ) : null}
        </div>
    );
}

/** 官网首页：未登录的访客打开根路径时看到；已登录的直接进入 Studio。 */
export default function LandingPage() {
    // 代理商网站显示中性版本：不用平台的作品和封面、价格政策问答，只保留通用介绍和品牌名。
    const isPlatform = useAppearanceStore((state) => state.appearance.isPlatform !== false);
    const brandName = useAppearanceStore((state) => state.appearance.brandName) || (isPlatform ? "OmniMuse" : "");
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [heroIndex, setHeroIndex] = useState(0);
    const [prompt, setPrompt] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const coversQuery = useQuery({ queryKey: ["studio", "tool-covers"], queryFn: async () => (await listStudioToolCovers()).covers, staleTime: 10 * 60_000, enabled: isPlatform });
    const settingsQuery = useQuery({ queryKey: ["landing", "auth-settings"], queryFn: getAuthSettings, staleTime: 10 * 60_000 });
    const covers = isPlatform ? coversQuery.data || {} : {};
    // 代理商网站只保留与平台价格政策无关的问答（第一条和最后一条）。
    const faqs = isPlatform ? FAQS : FAQS.filter((_, index) => index === 0 || index === FAQS.length - 1);
    const bonus = Math.floor((settingsQuery.data?.signupBonusMicrocredits ?? 0) / 1_000_000);
    const signupLabel = bonus > 0 ? `免费注册，送 ${bonus} 积分` : "免费注册";
    const heroClips = HERO_REEL.map((clip) => ({ src: covers[clip.slot] || covers[clip.fallback] || "", label: clip.label })).filter((clip) => clip.src);
    const siteGallery = GALLERY_SLOTS.map((slot) => covers[slot]).filter((src): src is string => Boolean(src));
    // 官网作品墙凑满 24 格：后台设置的排前面，不够的用平台作品图补上。
    const gallery = [...siteGallery, ...GALLERY_IMAGES.slice(0, Math.max(0, 24 - siteGallery.length))];

    useEffect(() => {
        document.title = `${brandName} · AI 视频和图片创作`;
    }, [brandName]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const update = () => setScrolled(root.scrollTop > 24);
        root.addEventListener("scroll", update, { passive: true });
        return () => root.removeEventListener("scroll", update);
    }, []);

    const submitPrompt = (event: FormEvent) => {
        event.preventDefault();
        const text = prompt.trim();
        navigate(register(text ? `/studio/agents?q=${encodeURIComponent(text)}` : "/studio"));
    };

    const nav = [
        { href: "#video", label: "视频" },
        { href: "#camera", label: "运镜" },
        { href: "#image", label: "图片" },
        { href: "#gallery", label: "作品" },
        { href: "#pricing", label: "价格" },
    ];
    const currentClip = heroClips[heroIndex];

    return (
        <div ref={rootRef} className={`landing${isPlatform ? "" : " is-neutral"}`}>
            <header className={`landing-bar${scrolled ? " is-solid" : ""}`}>
                <div className="landing-wrap landing-bar-inner">
                    <a className="landing-brand" href="#top" aria-label={brandName}>
                        <BrandLogo className="landing-logo" theme="dark" fallback={<span className="landing-logo" />} />
                        <span>{brandName}</span>
                    </a>
                    <nav className={`landing-nav${menuOpen ? " is-open" : ""}`} aria-label="页面导航">
                        {(isPlatform ? nav : nav.filter((item) => item.href === "#pricing")).map((item) => (
                            <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                                {item.label}
                            </a>
                        ))}
                    </nav>
                    <div className="landing-bar-actions">
                        <LanguageToggle />
                        <Link className="landing-link" to="/login?next=%2Fstudio">
                            登录
                        </Link>
                        <Link className="landing-button is-primary is-small" to={register("/studio")}>
                            免费注册
                        </Link>
                        <button type="button" className="landing-menu" aria-expanded={menuOpen} aria-label="菜单" onClick={() => setMenuOpen((open) => !open)}>
                            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
                        </button>
                    </div>
                </div>
            </header>

            <main id="top">
                <section className="landing-hero">
                    {heroClips.length ? <HeroReel clips={heroClips} onChange={setHeroIndex} /> : null}
                    <div className="landing-hero-scrim" aria-hidden />
                    <div className="landing-wrap landing-hero-inner">
                        {currentClip ? (
                            <p className="landing-meta landing-hero-meta" aria-hidden>
                                {String(heroIndex + 1).padStart(2, "0")} / {String(heroClips.length).padStart(2, "0")} · {currentClip.label}
                            </p>
                        ) : null}
                        <h1>
                            <span>一句话，</span>
                            <span>拍出你的广告大片</span>
                        </h1>
                        <p className="landing-hero-lead">Seedance、Veo、Kling、Nano Banana 等顶级模型都在一个账号里。产品广告、真人口播、看房视频、短剧，说一句话就开拍。</p>
                        <form className="landing-prompt" onSubmit={submitPrompt}>
                            <label htmlFor="landing-prompt-input" className="landing-sr-only">
                                描述你想做的视频
                            </label>
                            <input id="landing-prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：给我的榴莲千层做一条 15 秒 TikTok 广告" autoComplete="off" />
                            <button type="submit" className="landing-button is-primary">
                                开始生成
                                <ArrowRight aria-hidden />
                            </button>
                        </form>
                        <p className="landing-hero-note">{bonus > 0 ? `${signupLabel}，不用绑卡` : "注册不用绑卡"}</p>
                    </div>
                </section>

                <section className="landing-models" aria-label="支持的模型">
                    <div className="landing-wrap">
                        <ul>
                            {MODELS.map((name) => (
                                <li key={name}>{name}</li>
                            ))}
                        </ul>
                    </div>
                </section>

                {isPlatform ? (
                    <>
                        <section id="video" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="01 · 视频" title="想拍什么都能拍" text="生成、换人、对口型、延长、高清，做一条视频要用的都在这里。" action={{ to: register("/studio/video"), label: "全部视频工具" }} />
                                <div className="landing-bento">
                                    {VIDEO_TOOLS.map((tool) => (
                                        <Link key={tool.cover} className="landing-tile" to={register(tool.path)}>
                                            <LandingMedia src={covers[tool.cover]} label={tool.title} />
                                            <span className="landing-tile-copy">
                                                <strong>{tool.title}</strong>
                                                <span>{tool.text}</span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section id="camera" className="landing-section is-flush">
                            <div className="landing-wrap">
                                <SectionHead index="02 · 运镜" title="电影级运镜，点一下就有" text="希区柯克变焦、环绕、FPV 穿越，不用懂摄影术语，选好镜头就能拍。" />
                            </div>
                            <div className="landing-strip" tabIndex={0} aria-label="运镜效果">
                                {CAMERA_MOVES.map((move) => (
                                    <Link key={move.cover} className="landing-strip-card" to={register("/studio/create-video")}>
                                        <LandingMedia src={covers[move.cover]} label={move.title} />
                                        <span className="landing-meta">{move.title}</span>
                                    </Link>
                                ))}
                            </div>
                        </section>

                        <section id="image" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="03 · 图片" title="产品图、海报、模特图" text="生成、改图、换背景、重新打光，电商和社媒要的图一次做完。" action={{ to: register("/studio/image"), label: "全部图片工具" }} />
                                <div className="landing-grid">
                                    {IMAGE_TOOLS.map((tool) => (
                                        <Link key={tool.cover} className="landing-tile is-square" to={register("/studio/image")}>
                                            <LandingMedia src={covers[tool.cover]} label={tool.title} />
                                            <span className="landing-tile-copy">
                                                <strong>{tool.title}</strong>
                                                <span>{tool.text}</span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section id="cases" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="04 · 行业" title="你的生意，都有现成拍法" text="选一个类型，填几句话，AI 导演按这个类型写脚本、排镜头、出成片。" />
                                <div className="landing-cases">
                                    {INDUSTRIES.map((item) => (
                                        <Link key={item.genre} className="landing-tile is-wide" to={register(`/studio/director?genre=${item.genre}`)}>
                                            <LandingMedia src={covers[item.cover]} label={item.title} />
                                            <span className="landing-tile-copy">
                                                <strong>{item.title}</strong>
                                                <span>{item.text}</span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section id="gallery" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="05 · 作品" title="都是用 OmniMuse 做的" text="没有一张是拍的。" action={{ to: register("/studio/inspire"), label: "去灵感社区" }} />
                                <div className="landing-masonry">
                                    {gallery.map((src, index) => (
                                        <figure key={src} className="landing-masonry-item">
                                            <LandingMedia src={src} label={`作品 ${index + 1}`} />
                                        </figure>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </>
                ) : null}

                <section id="pricing" className="landing-section">
                    <div className="landing-wrap">
                        <SectionHead index={isPlatform ? "06 · 价格" : "价格"} title="按次扣积分，所有模型通用" text={`马币计价，一次性付款，生成失败自动退积分。${bonus > 0 ? `注册就送 ${bonus} 积分，先试再买。` : ""}`} />
                        <Pricing />
                    </div>
                </section>

                <section id="faq" className="landing-section">
                    <div className="landing-wrap landing-faq-wrap">
                        <h2 className="landing-faq-title">常见问题</h2>
                        <div className="landing-faq">
                            {faqs.map((item) => (
                                <details key={item.q}>
                                    <summary>
                                        {item.q}
                                        <ChevronDown aria-hidden />
                                    </summary>
                                    <p>{item.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landing-final">
                    {isPlatform ? (
                        <div className="landing-final-media" aria-hidden>
                            <LandingMedia src={covers["site-final"] || covers["quick-short-film"] || covers["quick-brand-film"]} label="" />
                        </div>
                    ) : null}
                    <div className="landing-wrap">
                        <h2>今天就拍第一条</h2>
                        <p>{bonus > 0 ? `注册就送 ${bonus} 积分，不用绑卡。` : "注册不用绑卡。"}</p>
                        <Link className="landing-button is-primary is-large" to={register("/studio")}>
                            {signupLabel}
                            <ArrowRight aria-hidden />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="landing-footer">
                <div className="landing-wrap landing-footer-inner">
                    <span>
                        © {new Date().getFullYear()} {brandName}
                    </span>
                    <nav aria-label="页脚导航">
                        <a href="#pricing">价格</a>
                        <Link to="/studio">进入 Studio</Link>
                        <Link to="/login?next=%2Fstudio">登录</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
