import { useState } from "react";
import { useReducedMotion } from "motion/react";

const SLIDES = [
    { key: "seedance", name: "Seedance 2.0", title: "SEEDANCE 2.0", description: "电影级 AI 视频，参考图与音频一起生成", tags: ["4K", "有声视频"] },
    { key: "nano-banana", name: "Nano Banana 2.1", title: "NANO BANANA 2.1", description: "Google 最新图像模型，文字与排版更清晰", tags: ["4K"] },
    { key: "gpt-image", name: "GPT Image 2.5", title: "GPT IMAGE 2.5", description: "OpenAI 最新图像模型，精准编辑每一处细节", tags: ["高画质"] },
    { key: "avatar", name: "数字人", title: "数字人口播", description: "一张照片就能开口说话，支持多语言配音", tags: ["口型同步"] },
] as const;

const SLIDE_SECONDS = 5;

/** 注册窗口左侧的产品展示：四段平台作品轮播，底部进度条可点击跳转。 */
export function AuthShowcase() {
    const reducedMotion = useReducedMotion();
    const [index, setIndex] = useState(0);
    const slide = SLIDES[index];
    const next = () => setIndex((value) => (value + 1) % SLIDES.length);

    return (
        <section className="auth-showcase-panel" aria-label="平台能力展示">
            {reducedMotion ? (
                <img key={slide.key} className="auth-showcase-media" src={`/auth/slides/${slide.key}.webp`} alt="" />
            ) : (
                <video key={slide.key} className="auth-showcase-media" src={`/auth/slides/${slide.key}.mp4`} poster={`/auth/slides/${slide.key}.webp`} autoPlay muted loop playsInline preload="auto" />
            )}
            <div className="auth-showcase-shade" aria-hidden />
            <div className="auth-showcase-copy">
                <div className="flex flex-wrap gap-1.5">
                    {slide.tags.map((tag) => (
                        <span key={tag} className="auth-showcase-tag">
                            {tag}
                        </span>
                    ))}
                </div>
                <h3 className="auth-showcase-title">{slide.title}</h3>
                <p className="auth-showcase-description">{slide.description}</p>
                <div className="auth-showcase-steps" role="tablist">
                    {SLIDES.map((item, itemIndex) => (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={itemIndex === index}
                            className="auth-showcase-step"
                            data-state={itemIndex < index ? "done" : itemIndex === index ? "active" : "idle"}
                            onClick={() => setIndex(itemIndex)}
                        >
                            <span className="auth-showcase-bar">
                                <span key={itemIndex === index ? `${item.key}-${index}` : item.key} style={{ animationDuration: `${SLIDE_SECONDS}s` }} onAnimationEnd={itemIndex === index ? next : undefined} />
                            </span>
                            {item.name}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}
