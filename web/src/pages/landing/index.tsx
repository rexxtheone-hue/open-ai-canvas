import "@fontsource-variable/space-grotesk/index.css";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, Clapperboard, Languages, Menu, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const HERO_TILES = ["quick-product-ad", "quick-ugc", "quick-food", "quick-real-estate", "quick-brand-film", "replace-character"];

const CASES = [
    { cover: "quick-product-ad", genre: "product-ad", title: "产品广告", text: "一张产品图，生成带卖点、配乐和字幕的 15 秒广告片。" },
    { cover: "quick-ugc", genre: "ugc", title: "真人口播", text: "AI 主播拿着你的产品讲解，像顾客自拍分享一样自然。" },
    { cover: "quick-real-estate", genre: "real-estate", title: "房地产看房", text: "房源照片直接变成平稳运镜的看房视频，不改动真实房况。" },
    { cover: "quick-food", genre: "food", title: "餐饮探店", text: "把菜品拍得诱人，做成适合 Facebook 和 TikTok 的短视频。" },
    { cover: "quick-brand-film", genre: "brand-film", title: "品牌短片", text: "用电影感的短片讲你的品牌故事，适合官网和活动开场。" },
    { cover: "quick-social", genre: "social", title: "社媒日更", text: "每天要发的短视频和图片，一次规划好，批量做出来。" },
];

const STEPS = [
    { icon: Sparkles, title: "说出你要什么", text: "输入一句话，或上传产品图、房源照片、参考视频。中文、英文都可以。" },
    { icon: Clapperboard, title: "AI 写脚本、排镜头", text: "自动规划镜头、台词、配音和配乐，每个镜头都能单独修改。" },
    { icon: Wand2, title: "生成并下载", text: "直接下载高清视频，发到 Facebook、Instagram、TikTok 和小红书。" },
];

const TOOLS = [
    { cover: "create-video", title: "生成视频", text: "图片、视频、音频任意组合作为参考" },
    { cover: "replace-character", title: "换角色", text: "把视频里的人换成你的模特或代言人" },
    { cover: "lip-sync", title: "对口型", text: "上传配音，人物开口说你的台词" },
    { cover: "edit-video", title: "编辑视频", text: "一句话换背景、换衣服、去掉杂物" },
    { cover: "voice-clone", title: "声音克隆", text: "录一段声音，之后的配音都用你的声线" },
    { cover: "create-image", title: "生成图片", text: "海报、产品图、社媒配图" },
    { cover: "video-upscale", title: "视频高清", text: "把草稿视频放大成高清成片" },
    { cover: "add-sound-effect", title: "视频配音效", text: "自动按画面配上环境声和音效" },
];

const MODELS = ["Seedance 2.5", "Veo 3.1", "Wan 3.0", "MiniMax H3", "Vidu Q4", "Grok Imagine", "Nano Banana 2.1", "GPT Image 2.5", "Midjourney", "Seedream 5.0", "Lyria 3 Pro"];

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

/** 视频封面进入画面才加载和播放，离开就暂停；系统要求减少动态时只显示第一帧。 */
function LandingMedia({ src, label }: { src?: string; label: string }) {
    const ref = useRef<HTMLVideoElement>(null);
    const inView = useRef(false);
    const [visible, setVisible] = useState(false);
    const media = coverSource(src);
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
            { rootMargin: "120px" },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [media.video, media.src, reduced]);
    if (!media.src) return <span className="landing-media is-empty" aria-hidden />;
    if (!media.video) return <img className="landing-media" src={media.src} alt={label} loading="lazy" />;
    return <video ref={ref} className="landing-media" src={visible ? `${media.src}#t=0.1` : undefined} muted loop playsInline preload="metadata" disablePictureInPicture aria-label={label} onLoadedData={play} />;
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
    if (!productsQuery.data?.length) {
        return (
            <p className="landing-muted">
                充值包暂时读取不到，可以 <Link to="/studio/pricing">打开充值页</Link> 查看。
            </p>
        );
    }
    return <TopupOffers products={productsQuery.data} onBuy={() => navigate(register("/studio/pricing"))} />;
}

/** 官网落地页：未登录的访客打开根路径时看到；已登录的直接进入 Studio。 */
export default function LandingPage() {
    const brandName = useAppearanceStore((state) => state.appearance.brandName) || "OmniMuse";
    const [menuOpen, setMenuOpen] = useState(false);
    const coversQuery = useQuery({ queryKey: ["studio", "tool-covers"], queryFn: async () => (await listStudioToolCovers()).covers, staleTime: 10 * 60_000 });
    const settingsQuery = useQuery({ queryKey: ["landing", "auth-settings"], queryFn: getAuthSettings, staleTime: 10 * 60_000 });
    const covers = coversQuery.data || {};
    const bonus = Math.floor((settingsQuery.data?.signupBonusMicrocredits ?? 0) / 1_000_000);
    const signupLabel = bonus > 0 ? `免费注册，送 ${bonus} 积分` : "免费注册";

    useEffect(() => {
        document.title = `${brandName} · AI 广告视频与内容创作`;
    }, [brandName]);

    const nav = [
        { href: "#cases", label: "应用场景" },
        { href: "#tools", label: "工具" },
        { href: "#pricing", label: "价格" },
        { href: "#faq", label: "常见问题" },
    ];

    return (
        <div className="landing">
            <header className="landing-bar">
                <div className="landing-wrap landing-bar-inner">
                    <a className="landing-brand" href="#top" aria-label={brandName}>
                        <BrandLogo className="landing-logo" theme="dark" fallback={<span className="landing-logo" />} />
                        <span>{brandName}</span>
                    </a>
                    <nav className={`landing-nav${menuOpen ? " is-open" : ""}`} aria-label="页面导航">
                        {nav.map((item) => (
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
                    <div className="landing-wrap landing-hero-inner">
                        <div className="landing-hero-copy">
                            <span className="landing-eyebrow">AI 广告视频工作台</span>
                            <h1>
                                <span>不用拍摄团队，</span>
                                <span>也能天天出广告视频</span>
                            </h1>
                            <p>上传产品图或说一句话，{brandName} 帮你做产品广告、真人口播、看房视频和品牌短片。Seedance、Veo、Wan 等顶级模型，一个账号全部能用。</p>
                            <div className="landing-hero-actions">
                                <Link className="landing-button is-primary is-large" to={register("/studio")}>
                                    {signupLabel}
                                    <ArrowRight aria-hidden />
                                </Link>
                                <a className="landing-button is-large" href="#cases">
                                    看看能做什么
                                </a>
                            </div>
                            <ul className="landing-hero-points">
                                <li>
                                    <Check aria-hidden />
                                    马币计价，按次扣积分
                                </li>
                                <li>
                                    <Check aria-hidden />
                                    生成失败自动退积分
                                </li>
                                <li>
                                    <Check aria-hidden />
                                    会员作品可商用
                                </li>
                            </ul>
                        </div>
                        <div className="landing-hero-reel" aria-hidden>
                            {HERO_TILES.map((id) => (
                                <div key={id} className="landing-tile">
                                    <LandingMedia src={covers[id]} label="" />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landing-models" aria-label="支持的模型">
                    <div className="landing-wrap">
                        <span>汇集主流 AI 模型</span>
                        <ul>
                            {MODELS.map((name) => (
                                <li key={name}>{name}</li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section id="cases" className="landing-section">
                    <div className="landing-wrap">
                        <div className="landing-head">
                            <h2>你的生意，都用得上</h2>
                            <p>选一个场景，填几句话，AI 按这个类型的拍法帮你出片。</p>
                        </div>
                        <div className="landing-cases">
                            {CASES.map((item) => (
                                <Link key={item.genre} className="landing-case" to={register(`/studio/director?genre=${item.genre}`)}>
                                    <div className="landing-case-media">
                                        <LandingMedia src={covers[item.cover]} label={item.title} />
                                    </div>
                                    <div className="landing-case-body">
                                        <h3>{item.title}</h3>
                                        <p>{item.text}</p>
                                        <span className="landing-case-cta">
                                            试试看
                                            <ArrowRight aria-hidden />
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landing-section is-tinted">
                    <div className="landing-wrap">
                        <div className="landing-head">
                            <h2>三步出片</h2>
                            <p>不用学剪辑软件，也不用请演员和摄影师。</p>
                        </div>
                        <ol className="landing-steps">
                            {STEPS.map((step, index) => (
                                <li key={step.title}>
                                    <span className="landing-step-index">{String(index + 1).padStart(2, "0")}</span>
                                    <step.icon aria-hidden />
                                    <h3>{step.title}</h3>
                                    <p>{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section id="tools" className="landing-section">
                    <div className="landing-wrap">
                        <div className="landing-head">
                            <h2>一个账号，全套工具</h2>
                            <p>从生成、修改到配音、高清，做一条视频要用的都在这里。</p>
                        </div>
                        <div className="landing-tools">
                            {TOOLS.map((tool) => (
                                <div key={tool.cover} className="landing-tool">
                                    <div className="landing-tool-media">
                                        <LandingMedia src={covers[tool.cover]} label={tool.title} />
                                    </div>
                                    <h3>{tool.title}</h3>
                                    <p>{tool.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="pricing" className="landing-section is-tinted">
                    <div className="landing-wrap">
                        <div className="landing-head">
                            <h2>简单透明的价格</h2>
                            <p>充越多，送越多，积分所有模型通用。{bonus > 0 ? `注册就送 ${bonus} 积分，先试再买。` : ""}</p>
                        </div>
                        <Pricing />
                    </div>
                </section>

                <section id="faq" className="landing-section">
                    <div className="landing-wrap landing-faq-wrap">
                        <div className="landing-head">
                            <h2>常见问题</h2>
                        </div>
                        <div className="landing-faq">
                            {FAQS.map((item) => (
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
                    <div className="landing-wrap">
                        <h2>今天就做出第一条广告视频</h2>
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
