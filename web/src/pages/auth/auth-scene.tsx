import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageSwitch } from "@/lib/i18n/language-switch";
import { SiteComplianceFooter } from "@/components/layout/site-compliance-footer";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { brandStudioLabel, useAppearanceStore } from "@/stores/use-appearance-store";
import { useThemeStore } from "@/stores/use-theme-store";
import "./auth-scene.css";

const authCopy = {
    login: {
        eyebrow: "WELCOME BACK",
        title: "进入创作现场",
        description: "继续编辑你的画布、素材与生成任务。",
    },
    register: {
        eyebrow: "CREATE ACCOUNT",
        title: "免费开始创作",
        description: "注册后即可使用视频、图片、配音等全部 AI 工具。",
    },
    recovery: {
        eyebrow: "ACCOUNT RECOVERY",
        title: "重新设置密码",
        description: "验证账号邮箱后，设置一个新的登录密码。",
    },
} as const;

const SHOWCASE_COLUMNS = [
    ["w01", "w05", "w09", "w13", "w17", "w21"],
    ["w02", "w06", "w10", "w14", "w18", "w22"],
    ["w03", "w07", "w11", "w15", "w19", "w23"],
    ["w04", "w08", "w12", "w16", "w20", "w24"],
];

const CAPABILITIES = ["视频", "图片", "配音", "广告", "角色"];

export function LinuxDOIcon() {
    return (
        <span
            aria-hidden
            className="size-5 shrink-0 rounded-full"
            style={{
                background: "linear-gradient(to bottom, #1d1d1f 0 33.333%, #efefef 33.333% 66.666%, #feb005 66.666% 100%)",
                boxShadow: "0 0 0 1px rgba(255,255,255,.14)",
            }}
        />
    );
}

/** Google 品牌规范要求使用官方四色 G 标志。 */
export function GoogleIcon() {
    return (
        <svg aria-hidden viewBox="0 0 48 48" className="size-5 shrink-0">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
    );
}

/** 内置品牌画面：用平台自己生成的作品铺成缓慢滚动的作品墙；后台配置了品牌影片时改为播放影片。 */
function ShowcaseWall({ still }: { still: boolean }) {
    return (
        <div aria-hidden className="auth-showcase absolute inset-0 overflow-hidden" data-still={still || undefined}>
            <div className="auth-showcase-grid">
                {SHOWCASE_COLUMNS.map((column, index) => (
                    <div key={index} className="auth-showcase-column" style={{ animationDuration: `${68 + index * 9}s`, animationDirection: index % 2 ? "reverse" : "normal" }}>
                        {[...column, ...column].map((name, item) => (
                            <img key={`${name}-${item}`} src={`/auth/showcase/${name}.webp`} alt="" width={440} height={440} loading={item < column.length ? "eager" : "lazy"} decoding="async" draggable={false} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AuthScene() {
    const appearance = useAppearanceStore((state) => state.appearance);
    const theme = useThemeStore((state) => state.theme);
    const location = useLocation();
    const reducedMotion = useReducedMotion();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [manualVideoActive, setManualVideoActive] = useState(false);
    const [videoPlaying, setVideoPlaying] = useState(false);
    const [failedPosterURL, setFailedPosterURL] = useState("");
    const recovery = location.pathname === "/forgot-password";
    const activeTab = location.pathname === "/register" ? "register" : "login";
    const copy = recovery ? authCopy.recovery : activeTab === "register" ? authCopy.register : authCopy.login;
    // 只有后台明确配置了品牌影片才播放；内置默认使用作品墙。
    const customVideo = Boolean(appearance.authVideoConfigured && appearance.authVideoUrl);
    const automaticVideoActive = appearance.authVideoAutoplay && !reducedMotion;
    const videoActive = customVideo && (automaticVideoActive || manualVideoActive);
    const titleLines = appearance.authHeroTitle.split("\n");

    useEffect(() => {
        setManualVideoActive(false);
        setVideoPlaying(false);
    }, [appearance.authVideoUrl, appearance.authVideoAutoplay]);

    const playVideo = () => {
        setManualVideoActive(true);
        requestAnimationFrame(() => {
            void videoRef.current?.play().catch(() => setVideoPlaying(false));
        });
    };

    return (
        <main className="auth-scene h-dvh min-h-0 overflow-y-auto lg:overflow-hidden">
            <div className="grid min-h-full lg:h-full lg:grid-cols-[minmax(0,1.3fr)_minmax(500px,1fr)]">
                <section className="auth-scene-hero relative min-h-[360px] overflow-hidden sm:min-h-[400px] lg:min-h-0" aria-label={`${appearance.brandName}品牌影片`}>
                    {!customVideo ? (
                        <ShowcaseWall still={Boolean(reducedMotion)} />
                    ) : videoActive ? (
                        <video ref={videoRef} className="absolute inset-0 size-full object-cover" src={appearance.authVideoUrl} poster={appearance.authVideoPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} />
                    ) : appearance.authVideoPosterUrl && failedPosterURL !== appearance.authVideoPosterUrl ? (
                        <img className="absolute inset-0 size-full object-cover" src={appearance.authVideoPosterUrl} alt="" decoding="async" onError={() => setFailedPosterURL(appearance.authVideoPosterUrl)} />
                    ) : null}
                    <div aria-hidden className="auth-scene-hero-overlay absolute inset-0" />
                    <div aria-hidden className="auth-scene-video-blend absolute inset-y-0 right-0 hidden w-[clamp(56px,6vw,120px)] lg:block" />
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-5 sm:p-7 lg:p-9">
                        <Link to="/" className="auth-scene-brand inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight transition-opacity hover:opacity-80">
                            <BrandLogo theme={theme} className="size-8" alt="" fallback={<span className="size-8 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />} />
                            {appearance.brandName}
                        </Link>
                        {customVideo ? (
                            <button type="button" className="auth-scene-hero-control inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[var(--fs-label)] backdrop-blur-xl transition disabled:cursor-default" onClick={playVideo} disabled={videoPlaying} aria-pressed={videoPlaying}>
                                <Play className="size-3 fill-current" />
                                {videoPlaying ? "创作正在发生" : "播放品牌影片"}
                            </button>
                        ) : null}
                    </div>
                    <motion.div
                        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                        className="absolute inset-x-0 bottom-0 max-w-2xl p-5 sm:p-7 lg:p-12"
                    >
                        <p className="auth-scene-hero-eyebrow text-[11px] font-semibold tracking-[0.22em]">{brandStudioLabel(appearance)}</p>
                        <h1 className="auth-scene-hero-title mt-3 max-w-xl text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl lg:text-[3.4rem]">
                            {titleLines.map((line, index) => (
                                <span key={index} className={index === titleLines.length - 1 && titleLines.length > 1 ? "auth-scene-hero-accent block" : "block"}>
                                    {line}
                                </span>
                            ))}
                        </h1>
                        {appearance.authHeroDescription ? <p className="auth-scene-hero-muted mt-4 max-w-xl whitespace-pre-line text-sm leading-6 sm:text-base sm:leading-7">{appearance.authHeroDescription}</p> : null}
                        <ul className="mt-5 hidden flex-wrap gap-2 sm:flex" aria-label="创作能力">
                            {CAPABILITIES.map((item) => (
                                <li key={item} className="auth-scene-chip rounded-full px-3 py-1 text-xs font-medium backdrop-blur-md">
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                </section>

                <section className="auth-scene-form-pane relative flex min-h-[660px] flex-col items-center overflow-y-auto px-4 pt-20 sm:px-8 lg:min-h-0 lg:px-10 lg:pt-20">
                    <div aria-hidden className="auth-scene-glow pointer-events-none absolute inset-0 overflow-hidden" />
                    <Link to="/" className="auth-scene-return absolute right-5 top-5 z-20 inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs backdrop-blur-xl transition lg:right-8 lg:top-8">
                        <ArrowLeft className="size-3.5" />
                        返回首页
                    </Link>
                    <LanguageSwitch compact className="absolute left-5 top-5 z-20 h-9 lg:left-8 lg:top-8" />

                    <div className="relative flex w-full flex-1 items-center justify-center">
                        <motion.div
                            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            layout={!reducedMotion}
                            transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                            className="my-auto w-full max-w-[440px]"
                        >
                            <div className="auth-scene-card h-auto overflow-hidden rounded-[22px] backdrop-blur-2xl">
                                <section aria-label={copy.title} className={`flex flex-col ${recovery ? "min-h-[600px]" : ""}`}>
                                    <header className="px-6 pb-5 pt-7 sm:px-8 sm:pt-8">
                                        <p className="auth-scene-eyebrow text-[11px] font-semibold tracking-[0.2em]">{copy.eyebrow}</p>
                                        <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight">{copy.title}</h2>
                                        <p className="auth-scene-muted mt-2 text-sm leading-6">{copy.description}</p>
                                    </header>
                                    <div key={location.pathname} className={`${!recovery && activeTab === "login" ? "" : "flex-1"} px-6 pb-7 pt-1 sm:px-8 sm:pb-8`}>
                                        <Outlet />
                                    </div>
                                </section>
                            </div>
                        </motion.div>
                    </div>
                    <SiteComplianceFooter variant="auth" className="relative inset-auto w-full shrink-0" />
                </section>
            </div>
        </main>
    );
}
