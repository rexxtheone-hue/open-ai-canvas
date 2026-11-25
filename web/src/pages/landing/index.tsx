import "@fontsource-variable/space-grotesk/index.css";
import AlibabaLogo from "@lobehub/icons/es/Alibaba/components/Mono";
import ClaudeLogo from "@lobehub/icons/es/Claude/components/Mono";
import CursorLogo from "@lobehub/icons/es/Cursor/components/Mono";
import McpLogo from "@lobehub/icons/es/MCP/components/Mono";
import ByteDanceLogo from "@lobehub/icons/es/ByteDance/components/Mono";
import DeepMindLogo from "@lobehub/icons/es/DeepMind/components/Mono";
import GeminiLogo from "@lobehub/icons/es/Gemini/components/Mono";
import GrokLogo from "@lobehub/icons/es/Grok/components/Mono";
import KlingLogo from "@lobehub/icons/es/Kling/components/Mono";
import MidjourneyLogo from "@lobehub/icons/es/Midjourney/components/Mono";
import MinimaxLogo from "@lobehub/icons/es/Minimax/components/Mono";
import OpenAILogo from "@lobehub/icons/es/OpenAI/components/Mono";
import ViduLogo from "@lobehub/icons/es/Vidu/components/Mono";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Copy, Languages, Menu, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "react-router";

import { BrandLogo } from "@/components/brand/brand-logo";
import { currentLocale, setLocale } from "@/lib/i18n/runtime";
import { getAuthSettings } from "@/services/api/auth";
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
// 每格先按素材比例占好位置，图片加载、视频滚远释放时高度都不变，滚动时作品墙不会跳。
const GALLERY_RATIOS = ["9/16", "9/16", "9/16", "9/16", "3/4", "3/4", "16/9", "1/1", "9/16", "3/2", "3/4", "1/1", "16/9", "3/4", "3/4", "1/1", "9/16", "3/2", "3/4", "16/9"];
const GALLERY_SLOTS = GALLERY_RATIOS.map((ratio, index) => ({ slot: `site-gallery-${index + 1}`, ratio }));
const GALLERY_IMAGES = Array.from({ length: 24 }, (_, index) => ({ src: `/auth/showcase/w${String(index + 1).padStart(2, "0")}.webp`, ratio: "1/1" }));

/** 同一句提示词交给四个模型，并排播放；视频由后台 site-compare-* 栏位提供。 */
const COMPARE_PROMPT = "槟城海边的傍晚，一位穿白色亚麻衬衫的女生赤脚走在湿沙滩上，手里拿着一杯冰拉茶，海浪冲上脚踝，她回头对镜头微笑。";
const COMPARE_MODELS = [
    { slot: "site-compare-seedance", name: "Seedance 2.5" },
    { slot: "site-compare-veo", name: "Veo 3.1" },
    { slot: "site-compare-kling", name: "Kling 4" },
    { slot: "site-compare-wan", name: "Wan 3.0" },
];

/** 能接入的 AI 助手，标志用单色版本显示成白色。 */
const AGENT_APPS = [
    { name: "Claude", logo: ClaudeLogo },
    { name: "ChatGPT", logo: OpenAILogo },
    { name: "Cursor", logo: CursorLogo },
    { name: "MCP", logo: McpLogo },
    { name: "CLI", logo: SquareTerminal },
];

/** 模型条：厂商标志用单色版本，跟着文字颜色显示成白色。 */
const MODELS = [
    { name: "Seedance 2.5", logo: ByteDanceLogo },
    { name: "Veo 3.1", logo: DeepMindLogo },
    { name: "Kling 4", logo: KlingLogo },
    { name: "Wan 3.0", logo: AlibabaLogo },
    { name: "MiniMax H3", logo: MinimaxLogo },
    { name: "Vidu Q4", logo: ViduLogo },
    { name: "Grok Imagine", logo: GrokLogo },
    { name: "Nano Banana 2.1", logo: GeminiLogo },
    { name: "GPT Image 2.6", logo: OpenAILogo },
    { name: "Midjourney V8", logo: MidjourneyLogo },
    { name: "Seedream 5.5", logo: ByteDanceLogo },
];

function coverSource(src: string | undefined) {
    if (!src) return { src: "", video: false };
    return src.endsWith("#video") ? { src: src.slice(0, -"#video".length), video: true } : { src, video: false };
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 访客开了省流量、网络是 2G，或系统要求减少动态时，视频只显示第一帧，不自动播放。 */
const shouldHoldMotion = () => {
    if (prefersReducedMotion()) return true;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return Boolean(connection?.saveData || connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g");
};

/**
 * 懒加载视频：快滚到时（上下 600px）才挂上地址开始下载，滚远了就卸掉释放内存和解码器；
 * 露出至少 30% 才播放，其余时间暂停。一页几十段视频时，同时在播的只有画面里那几段。
 */
function LandingMedia({ src, label, eager = false }: { src?: string; label: string; eager?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    const showing = useRef(false);
    const [near, setNear] = useState(eager);
    const media = coverSource(src);
    const hold = shouldHoldMotion();
    const play = () => {
        if (showing.current && !hold) void ref.current?.play().catch(() => undefined);
    };
    useEffect(() => {
        const element = ref.current;
        if (!media.video || !element) return;
        if (typeof IntersectionObserver === "undefined") {
            showing.current = true;
            setNear(true);
            return;
        }
        const nearObserver = new IntersectionObserver(([entry]) => entry && setNear(entry.isIntersecting), { rootMargin: "600px 0px" });
        const playObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry) return;
                showing.current = entry.isIntersecting;
                if (entry.isIntersecting) play();
                else element.pause();
            },
            { threshold: 0.3 },
        );
        nearObserver.observe(element);
        playObserver.observe(element);
        return () => {
            nearObserver.disconnect();
            playObserver.disconnect();
        };
        // play 只读 ref，不需要作为依赖。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [media.video, media.src, hold]);
    useEffect(() => {
        const element = ref.current;
        // 卸掉地址后要 load() 一次，浏览器才会真正释放已缓冲的数据。
        if (!near && element?.getAttribute("src") === null && element.currentSrc) element.load();
    }, [near]);
    if (!media.src) return <span className="landing-media is-empty" aria-hidden />;
    if (!media.video) return <img className="landing-media" src={media.src} alt={label} loading={eager ? "eager" : "lazy"} decoding="async" />;
    return <video ref={ref} className="landing-media" src={near ? `${media.src}#t=0.1` : undefined} muted loop playsInline preload={near ? "metadata" : "none"} disablePictureInPicture aria-label={label} onLoadedData={play} />;
}

/**
 * 首屏全屏轮播：只挂上一段、当前段和下一段的地址（淡入淡出要用到上一段），其余不下载；
 * 首屏滚出画面或切到别的标签页时停止轮播并暂停，回来再继续。
 */
function HeroReel({ clips, onChange }: { clips: { src: string; label: string }[]; onChange: (index: number) => void }) {
    const [active, setActive] = useState(0);
    const [onScreen, setOnScreen] = useState(true);
    const hold = shouldHoldMotion();
    const rootRef = useRef<HTMLDivElement>(null);
    const refs = useRef<(HTMLVideoElement | null)[]>([]);
    const count = clips.length;
    const running = onScreen && !hold && count > 1;

    useEffect(() => {
        const element = rootRef.current;
        if (!element || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => entry && setOnScreen(entry.isIntersecting && document.visibilityState === "visible"), { threshold: 0.2 });
        const onVisibility = () => setOnScreen(document.visibilityState === "visible" && element.getBoundingClientRect().bottom > 0);
        observer.observe(element);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => setActive((index) => (index + 1) % count), 5200);
        return () => window.clearInterval(timer);
    }, [running, count]);

    useEffect(() => {
        onChange(active);
        refs.current.forEach((video, index) => {
            if (!video) return;
            if (index === active && onScreen && !hold) {
                if (video.paused && video.currentTime > 4.5) video.currentTime = 0;
                void video.play().catch(() => undefined);
            } else video.pause();
        });
    }, [active, onScreen, hold, onChange]);

    const keep = (index: number) => index === active || index === (active + 1) % count || index === (active - 1 + count) % count;
    return (
        <div ref={rootRef} className="landing-reel" aria-hidden>
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
                        src={keep(index) ? `${media.src}#t=0.1` : undefined}
                        muted
                        playsInline
                        loop
                        preload={index === active ? "auto" : keep(index) ? "metadata" : "none"}
                        onLoadedData={(event) => {
                            if (index === active && onScreen && !hold) void event.currentTarget.play().catch(() => undefined);
                        }}
                    />
                ) : (
                    <img key={clip.src} className={index === active ? "is-active" : undefined} src={media.src} alt="" />
                );
            })}
        </div>
    );
}

// i18n-ignore
const HEADING_JOIN = { en: " and ", zh: "、" } as const;

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

/** 一行可复制的地址或命令。 */
function CopyLine({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        });
    };
    return (
        <div className="landing-copy">
            <span className="landing-meta">{label}</span>
            <div>
                <code>{value}</code>
                <button type="button" onClick={copy} aria-label={copied ? "已复制" : `复制${label}`}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                </button>
            </div>
        </div>
    );
}

/** 在 Claude、ChatGPT 里直接出片：MCP 地址、命令行安装和对话、终端示意。 */
function AgentsSection({ index, brandName, origin, covers }: { index: string; brandName: string; origin: string; covers: Record<string, string> }) {
    return (
        <section id="agents" className="landing-section">
            <div className="landing-wrap landing-agents">
                <div className="landing-agents-copy">
                    <span className="landing-meta">{index}</span>
                    <h2>
                        {"在"}{" "}
                        <span className="landing-inline-logo">
                            <ClaudeLogo aria-hidden />
                            Claude
                        </span>
                        {HEADING_JOIN[currentLocale === "en" ? "en" : "zh"]}
                        <span className="landing-inline-logo">
                            <OpenAILogo aria-hidden />
                            ChatGPT
                        </span>{" "}
                        {"里直接出片"}
                    </h2>
                    <p>把 {brandName} 连到你常用的 AI 助手，聊着天就把图片和视频做出来，扣的是同一个账号的积分。投手和代理商也可以用命令行批量出素材。</p>
                    <ul className="landing-agents-apps" aria-label="支持的 AI 助手">
                        {AGENT_APPS.map((app) => (
                            <li key={app.name}>
                                <app.logo size={18} aria-hidden />
                                {app.name}
                            </li>
                        ))}
                    </ul>
                    <CopyLine label="MCP 连接地址" value={`${origin}/mcp`} />
                    <CopyLine label="安装命令行（Mac / Linux）" value={`curl -fsSL ${origin}/install.sh | sh`} />
                    <Link className="landing-head-action" to="/studio/mcp">
                        查看接入教程
                        <ArrowRight aria-hidden />
                    </Link>
                </div>
                <div className="landing-agents-demo" aria-hidden>
                    <div className="landing-chat">
                        <div className="landing-chat-head">
                            <ClaudeLogo size={16} />
                            Claude
                        </div>
                        <p className="landing-chat-user">帮我用 Seedance 做一条槟城海边的冰拉茶广告，横屏 5 秒</p>
                        <div className="landing-chat-reply">
                            <span className="landing-meta">omnimuse · generate_video</span>
                            <p>做好了，用了 1,612 积分。视频也存进了你的作品库。</p>
                            <div className="landing-chat-media">
                                <LandingMedia src={covers["site-compare-seedance"] || covers["quick-ugc"]} label="" />
                            </div>
                        </div>
                    </div>
                    <pre className="landing-terminal">
                        <code>
                            <span className="is-muted">$ </span>omnimuse video "槟城海边，女生拿冰拉茶回头微笑" -m "Seedance 2.5" -d 5{"\n"}
                            <span className="is-muted">This will use 1612 credits. Continue? [Y/n] </span>y{"\n"}
                            <span className="is-muted">9d175493 succeeded 100% 1m32s</span>
                            {"\n"}Saved ./omnimuse-9d175493.mp4
                        </code>
                    </pre>
                </div>
            </div>
        </section>
    );
}

function SectionHead({ index, title, text, action, controls }: { index: string; title: string; text: string; action?: { to: string; label: string }; controls?: ReactNode }) {
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
            {controls}
        </div>
    );
}

/** 横向滚动条的左右箭头：不显示滚动条，每次翻大约一屏的卡片；到头时对应箭头变灰。 */
function StripControls({ target }: { target: RefObject<HTMLDivElement | null> }) {
    const [edges, setEdges] = useState({ start: true, end: false });
    useEffect(() => {
        const element = target.current;
        if (!element) return;
        const update = () => setEdges({ start: element.scrollLeft <= 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4 });
        update();
        element.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            element.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [target]);
    const page = (direction: 1 | -1) => {
        const element = target.current;
        if (element) element.scrollBy({ left: direction * Math.max(element.clientWidth * 0.8, 240), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };
    return (
        <div className="landing-strip-controls">
            <button type="button" aria-label="上一组" disabled={edges.start} onClick={() => page(-1)}>
                <ArrowLeft aria-hidden />
            </button>
            <button type="button" aria-label="下一组" disabled={edges.end} onClick={() => page(1)}>
                <ArrowRight aria-hidden />
            </button>
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
    const origin = typeof window === "undefined" ? "https://omnimuse.io" : window.location.origin;
    const rootRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const coversQuery = useQuery({ queryKey: ["studio", "tool-covers"], queryFn: async () => (await listStudioToolCovers()).covers, staleTime: 10 * 60_000, enabled: isPlatform });
    const settingsQuery = useQuery({ queryKey: ["landing", "auth-settings"], queryFn: getAuthSettings, staleTime: 10 * 60_000 });
    const covers = isPlatform ? coversQuery.data || {} : {};
    const bonus = Math.floor((settingsQuery.data?.signupBonusMicrocredits ?? 0) / 1_000_000);
    const signupLabel = bonus > 0 ? `免费注册，送 ${bonus} 积分` : "免费注册";
    const heroClips = HERO_REEL.map((clip) => ({ src: covers[clip.slot] || covers[clip.fallback] || "", label: clip.label })).filter((clip) => clip.src);
    const siteGallery = GALLERY_SLOTS.flatMap(({ slot, ratio }) => (covers[slot] ? [{ src: covers[slot], ratio }] : []));
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
        { href: "#cases", label: "应用场景" },
        { href: "#video", label: "视频" },
        { href: "#image", label: "图片" },
        { href: "#agents", label: "MCP / CLI" },
        { href: "#models", label: "模型" },
        { href: "#camera", label: "运镜" },
        { href: "#gallery", label: "作品" },
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
                        {(isPlatform ? nav : nav.filter((item) => item.href === "#agents")).map((item) => (
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
                    <div className="landing-marquee">
                        {/* 两份一样的清单首尾相接，向左平移一份的宽度后无缝循环；第二份只给眼睛看。 */}
                        {[0, 1].map((copy) => (
                            <ul key={copy} aria-hidden={copy === 1 || undefined}>
                                {MODELS.map((model) => (
                                    <li key={model.name}>
                                        <model.logo size={18} aria-hidden />
                                        {model.name}
                                    </li>
                                ))}
                            </ul>
                        ))}
                    </div>
                </section>

                {isPlatform ? (
                    <>
                        <section id="cases" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="01 · 应用场景" title="你的生意，都有现成拍法" text="选一个类型，填几句话，AI 导演按这个类型写脚本、排镜头、出成片。" />
                                <div className="landing-cases">
                                    {INDUSTRIES.map((item) => (
                                        <Link key={item.genre} className="landing-tile is-wide" to={register(`/studio/director?genre=${item.genre}`)}>
                                            <LandingMedia src={covers[`site-case-${item.genre}`] || covers[item.cover]} label={item.title} />
                                            <span className="landing-tile-copy">
                                                <strong>{item.title}</strong>
                                                <span>{item.text}</span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section id="video" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="02 · 视频" title="想拍什么都能拍" text="生成、换人、对口型、延长、高清，做一条视频要用的都在这里。" action={{ to: register("/studio/video"), label: "全部视频工具" }} />
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

                        <AgentsSection index="04 · MCP / CLI" brandName={brandName} origin={origin} covers={covers} />

                        {COMPARE_MODELS.some((model) => covers[model.slot]) ? (
                            <section id="models" className="landing-section">
                                <div className="landing-wrap">
                                    <SectionHead index="05 · 模型" title="同一句话，四个模型" text="不同模型各有所长。一个账号全部能用，挑最合适的那个，不用另外订阅。" action={{ to: register("/studio/create-video"), label: "自己试一句" }} />
                                    <p className="landing-compare-prompt">
                                        <span className="landing-meta">提示词</span>
                                        {COMPARE_PROMPT}
                                    </p>
                                    <div className="landing-compare">
                                        {COMPARE_MODELS.map((model) => (
                                            <figure key={model.slot} className="landing-compare-item">
                                                <LandingMedia src={covers[model.slot]} label={model.name} />
                                                <figcaption className="landing-meta">{model.name} · 6s · 1080p</figcaption>
                                            </figure>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        <section id="camera" className="landing-section is-flush">
                            <div className="landing-wrap">
                                <SectionHead index="06 · 运镜" title="电影级运镜，点一下就有" text="希区柯克变焦、环绕、FPV 穿越，不用懂摄影术语，选好镜头就能拍。" controls={<StripControls target={stripRef} />} />
                            </div>
                            <div ref={stripRef} className="landing-strip" tabIndex={0} aria-label="运镜效果">
                                {CAMERA_MOVES.map((move) => (
                                    <Link key={move.cover} className="landing-strip-card" to={register("/studio/create-video")}>
                                        <LandingMedia src={covers[move.cover]} label={move.title} />
                                        <span className="landing-meta">{move.title}</span>
                                    </Link>
                                ))}
                            </div>
                        </section>

                        <section id="gallery" className="landing-section">
                            <div className="landing-wrap">
                                <SectionHead index="07 · 作品" title="都是用 OmniMuse 做的" text="没有一张是拍的。" action={{ to: register("/studio/inspire"), label: "去灵感社区" }} />
                                <div className="landing-masonry">
                                    {gallery.map((item, index) => (
                                        <figure key={item.src} className="landing-masonry-item" style={{ aspectRatio: item.ratio }}>
                                            <LandingMedia src={item.src} label={`作品 ${index + 1}`} />
                                        </figure>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </>
                ) : null}

                {isPlatform ? null : <AgentsSection index="MCP / CLI" brandName={brandName} origin={origin} covers={covers} />}

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
                        <p className="landing-final-note">马币计价 · 按次扣积分 · 生成失败自动退积分</p>
                    </div>
                </section>
            </main>

            <footer className="landing-footer">
                <div className="landing-wrap landing-footer-inner">
                    <span>
                        © {new Date().getFullYear()} {brandName}
                        {isPlatform ? <span className="landing-footer-origin"> · 在马来西亚用心打造</span> : null}
                    </span>
                    <nav aria-label="页脚导航">
                        <Link to="/studio/pricing">价格</Link>
                        <Link to="/studio">进入 Studio</Link>
                        <Link to="/login?next=%2Fstudio">登录</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
