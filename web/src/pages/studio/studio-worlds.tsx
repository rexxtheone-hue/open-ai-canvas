import { useEffect, useMemo, useRef, useState } from "react";
import { App, Input, Popover } from "antd";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box, Check, Compass, Globe, ImagePlus, Loader2, Plus, Sparkles, Upload, Wand2, X } from "lucide-react";
import { useNavigate } from "react-router";
import * as THREE from "three";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { CreditSymbol } from "@/constant/credits";
import type { CreationAttachment } from "@/pages/create/creation-assets";
import { listStudioWorks, type StudioWork } from "@/services/api/studio";
import { STUDIO_ATTACH_KEY } from "./studio-agent";
import { studioImageDefaultRatio, studioImageRatioSupported } from "./studio-generation";
import { studioMediaSrc } from "./studio-library";
import { promptFromImage, studioTextModel } from "./studio-prompt-tools";
import { buildSpecialtyState, studioSpecialtySpec } from "./studio-specialty";
import { studioAttachmentFromMedia, uploadStudioFile, useStudioTool } from "./use-studio-tool";

const PANO_TOOL = "create-pano";
const MAX_WORLD_IMAGES = 4;

/** 世界模板：点「使用」把描述填进「创建世界」。 */
export const STUDIO_WORLD_TEMPLATES: Array<{ name: string; prompt: string }> = [
    { name: "日落雪山湖", prompt: "清澈的高山湖泊倒映着雪峰，四周是野花和松林，温暖的金色夕阳在山谷里投下长长的影子" },
    { name: "粉彩酒店大堂", prompt: "韦斯·安德森风格的对称酒店大堂，粉色与薄荷绿配色，双弧形楼梯配金色栏杆，水晶吊灯，丝绒沙发整齐排列" },
    { name: "糖果梦境", prompt: "卡通风格的糖果世界，棉花糖般的粉色山丘，巨大的棒棒糖像树一样排列，焦糖小路通向姜饼小屋，天空飘着棉花糖云" },
    { name: "教堂与花园", prompt: "宏伟的哥特式大教堂和对称的法式花园，修剪整齐的树篱和喷泉，晴朗的午后阳光" },
    { name: "圣托里尼海岸村", prompt: "希腊圣托里尼白色房屋和蓝色圆顶沿着悬崖排列，俯瞰湛蓝的爱琴海" },
    { name: "魔法树屋图书馆", prompt: "巨树中的魔法图书馆，螺旋书架环绕树干，萤火虫般的光点漂浮，温暖的灯笼光" },
    { name: "秋日日式庭院", prompt: "秋天的日式庭院，红枫倒映在锦鲤池中，木桥和石灯笼，宁静的禅意氛围" },
    { name: "未来飞船指挥舱", prompt: "未来感飞船指挥中心，环形控制台和全息屏幕，舷窗外是星云和行星" },
    { name: "废弃火车站", prompt: "被藤蔓覆盖的废弃火车站，阳光从破碎的玻璃顶棚洒下，生锈的列车停在站台" },
    { name: "日落水城", prompt: "漂浮在水面上的威尼斯式城市，日落时分的金色光线，贡多拉在运河里穿行" },
    { name: "云端蒸汽朋克都市", prompt: "云层之上的蒸汽朋克都市，黄铜齿轮塔楼和飞艇，蒸汽缭绕" },
    { name: "极光冰雪酒店", prompt: "冰雪雕成的酒店房间，透明冰墙外是绿色的北极光，柔和的蓝白灯光" },
    { name: "绿植咖啡馆", prompt: "温馨的咖啡馆室内，满是绿植和吊灯，木质桌椅，午后阳光透过大窗户" },
    { name: "江南水乡古镇", prompt: "黄昏时分的江南水乡古镇，石桥、乌篷船和红灯笼倒映在河面" },
];

function panoWorks(works: StudioWork[]) {
    return works.filter((work) => work.status === "succeeded" && work.media[0]?.kind === "image");
}

/** 360° 全景查看器：拖动转动视角，滚轮缩放。 */
export function StudioPanoViewer({ src }: { src: string }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !src) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(host.clientWidth, host.clientHeight);
        host.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, host.clientWidth / host.clientHeight, 1, 1100);
        const geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x222222 });
        scene.add(new THREE.Mesh(geometry, material));
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(src, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            material.map = texture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        }, undefined, () => setError("全景图加载失败"));
        let lon = 0;
        let lat = 0;
        let drag: { x: number; y: number; lon: number; lat: number } | null = null;
        let frame = 0;
        const render = () => {
            lat = Math.max(-85, Math.min(85, lat));
            const phi = THREE.MathUtils.degToRad(90 - lat);
            const theta = THREE.MathUtils.degToRad(lon);
            camera.lookAt(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
            renderer.render(scene, camera);
            frame = requestAnimationFrame(render);
        };
        render();
        const down = (event: PointerEvent) => {
            drag = { x: event.clientX, y: event.clientY, lon, lat };
            renderer.domElement.setPointerCapture(event.pointerId);
        };
        const move = (event: PointerEvent) => {
            if (!drag) return;
            lon = drag.lon - (event.clientX - drag.x) * 0.15;
            lat = drag.lat + (event.clientY - drag.y) * 0.15;
        };
        const up = () => {
            drag = null;
        };
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            camera.fov = Math.max(35, Math.min(95, camera.fov + event.deltaY * 0.05));
            camera.updateProjectionMatrix();
        };
        const resize = () => {
            renderer.setSize(host.clientWidth, host.clientHeight);
            camera.aspect = host.clientWidth / host.clientHeight;
            camera.updateProjectionMatrix();
        };
        const canvas = renderer.domElement;
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("wheel", wheel, { passive: false });
        window.addEventListener("resize", resize);
        return () => {
            cancelAnimationFrame(frame);
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("wheel", wheel);
            window.removeEventListener("resize", resize);
            material.map?.dispose();
            material.dispose();
            geometry.dispose();
            renderer.dispose();
            canvas.remove();
        };
    }, [src]);
    return <div ref={hostRef} className="studio-pano-viewer">{error ? <p className="studio-hint is-warn">{error}</p> : null}</div>;
}

/** 把一个世界交给角色入景或漫游镜头。 */
function useWorldHandoff() {
    const navigate = useNavigate();
    const { message } = App.useApp();
    return (attachment: CreationAttachment, target: "cast-in-scene" | "world-cam") => {
        try {
            window.sessionStorage.setItem(STUDIO_ATTACH_KEY, JSON.stringify({ kind: target === "world-cam" ? "video" : "image", attachments: [attachment], slot: target === "world-cam" ? "world" : "scene" }));
        } catch {
            message.error("浏览器存储不可用，无法带入世界");
            return;
        }
        navigate(`/studio/tools/${target}`);
    };
}

type CreateWorldProps = { open: boolean; onClose: () => void; initialPrompt?: string; onCreated?: () => void };

/** 创建世界：从图片或文字生成 360° 全景草稿；3D 世界等后台支持后开放。 */
export function StudioCreateWorldModal({ open, onClose, initialPrompt = "", onCreated }: CreateWorldProps) {
    const { message } = App.useApp();
    const [step, setStep] = useState<"choose" | "image" | "describe">("choose");
    const [images, setImages] = useState<CreationAttachment[]>([]);
    const [text, setText] = useState("");
    const [uploading, setUploading] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [describing, setDescribing] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const spec = studioSpecialtySpec(PANO_TOOL)!;
    // 只用图片创建时没有文字描述，用参考图的场景补全。
    const sceneText = text.trim() || (step === "image" && images.length ? "延续参考图中的场景、光线和风格，补全成完整的环境" : "");
    const specialty = useMemo(() => buildSpecialtyState(spec, { reference: step === "image" ? images : [] }, sceneText, {}), [images, sceneText, spec, step]);
    const studio = useStudioTool("image", PANO_TOOL, { specialty, brand: false });
    const { config, resolvedModel, updateImage, update } = studio;
    const recentImages = useQuery({ queryKey: ["studio", "world-image-history"], queryFn: async ({ signal }) => (await listStudioWorks({ kind: "image", pageSize: 40 }, signal)).works.filter((work) => work.status === "succeeded" && work.media[0]), enabled: open && historyOpen });

    useEffect(() => {
        if (!open) return;
        setStep(initialPrompt ? "describe" : "choose");
        setText(initialPrompt);
        setImages([]);
    }, [initialPrompt, open]);

    useEffect(() => {
        update({ attachments: step === "image" ? images : [] });
    }, [images, step, update]);

    const ratioOk = Boolean(resolvedModel && studioImageRatioSupported(config, resolvedModel, "2:1"));
    useEffect(() => {
        if (!resolvedModel) return;
        updateImage({ ratio: ratioOk ? "2:1" : studioImageDefaultRatio(config, resolvedModel) });
    }, [config, ratioOk, resolvedModel, updateImage]);

    const addFiles = async (files: File[]) => {
        setUploading(true);
        try {
            for (const file of files.slice(0, MAX_WORLD_IMAGES - images.length)) {
                const attachment = await uploadStudioFile(file);
                setImages((current) => [...current, attachment].slice(0, MAX_WORLD_IMAGES));
            }
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "上传失败");
        } finally {
            setUploading(false);
        }
    };

    const imageToPrompt = async () => {
        if (!images[0] || describing) return;
        setDescribing(true);
        try {
            setText(await promptFromImage(config, "image", images[0], "把这张图扩展成一个可以 360° 环视的完整场景"));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "识别失败");
        } finally {
            setDescribing(false);
        }
    };

    const preview = async () => {
        const result = await studio.submit();
        if (result.created) {
            message.success("已开始生成 360° 全景，完成后在世界库和作品库里查看");
            onCreated?.();
            onClose();
        } else if (result.error) message.error(result.error);
    };

    const actions = (
        <div className="studio-world-actions">
            <p className="studio-hint">先预览一个全景草稿，满意后再做成 3D 世界。</p>
            {!ratioOk && resolvedModel ? <p className="studio-hint is-warn">当前模型不支持 2:1 画幅，会用默认比例生成，结果可能不是标准全景图。</p> : null}
            <button type="button" className="studio-world-action" disabled={Boolean(studio.blockReason) || studio.submitting || uploading} onClick={() => void preview()}>
                <Globe aria-hidden />
                <span><b>{studio.submitting ? "提交中…" : "预览 360° 全景"}</b><small>预计约 30 秒</small></span>
                {studio.creditsEnabled && studio.credits !== null ? <em><CreditSymbol />{studio.credits.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</em> : null}
            </button>
            <button type="button" className="studio-world-action" disabled title="后台还没有支持「3D 世界」的模型">
                <Box aria-hidden />
                <span><b>创建 3D 世界</b><small>后台还没有支持「3D 世界」的模型</small></span>
            </button>
            {studio.blockReason ? <p className="studio-block-reason">{studio.blockReason}</p> : null}
        </div>
    );

    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(620px, calc(100vw - 32px))" title={null} footer={null} onCancel={onClose}>
            <div className="studio-popup studio-voice-create">
                {step === "choose" ? (
                    <>
                        <h3>创建世界</h3>
                        <p className="studio-hint">创建一个世界，为视频故事提供前后一致的场景背景。</p>
                        <button type="button" className="studio-voice-choice" onClick={() => setStep("image")}>
                            <ImagePlus aria-hidden />
                            <span><b>从图片创建</b><small>把图片扩展成可以环视的完整世界</small></span>
                        </button>
                        <button type="button" className="studio-voice-choice" onClick={() => setStep("describe")}>
                            <Wand2 aria-hidden />
                            <span><b>描述你的世界</b><small>把想法变成沉浸式的世界</small></span>
                        </button>
                    </>
                ) : step === "image" ? (
                    <>
                        <h3><button type="button" className="studio-icon-button is-ghost" aria-label="返回" onClick={() => setStep("choose")}><ArrowLeft aria-hidden /></button>从图片创建</h3>
                        <div className="studio-world-images" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"))); }}>
                            {images.map((image) => (
                                <div key={image.id} className="studio-ref-slot is-filled">
                                    <img src={image.previewUrl} alt={image.name} />
                                    <button type="button" className="studio-ref-remove" aria-label={`移除 ${image.name}`} onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}><X aria-hidden /></button>
                                </div>
                            ))}
                            {images.length < MAX_WORLD_IMAGES ? (
                                <div className="studio-world-drop">
                                    {uploading ? <Loader2 className="studio-spin" aria-hidden /> : <Upload aria-hidden />}
                                    <small>添加图片（最多 {MAX_WORLD_IMAGES} 张），可拖拽上传</small>
                                    <div className="studio-voice-sample-actions">
                                        <button type="button" className="studio-mini-button" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload aria-hidden />上传图片</button>
                                        <Popover
                                            open={historyOpen}
                                            onOpenChange={setHistoryOpen}
                                            trigger="click"
                                            arrow={false}
                                            content={(
                                                <div className="studio-popup studio-world-history">
                                                    <strong>从作品选择</strong>
                                                    {recentImages.isLoading ? <p className="studio-hint">正在加载…</p> : recentImages.data?.length ? (
                                                        <div className="studio-world-history-grid">
                                                            {recentImages.data.map((work) => (
                                                                <button key={work.id} type="button" aria-label={work.prompt} onClick={() => { setImages((current) => current.length >= MAX_WORLD_IMAGES ? current : [...current, studioAttachmentFromMedia(work, work.media[0])]); setHistoryOpen(false); }}>
                                                                    <img src={studioMediaSrc(work.media[0])} alt="" loading="lazy" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <p className="studio-hint">还没有生成的图片。</p>}
                                                </div>
                                            )}
                                        >
                                            <button type="button" className="studio-mini-button">从作品选择</button>
                                        </Popover>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <Input.TextArea value={text} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} placeholder="可选：补充想要的场景细节" onChange={(event) => setText(event.target.value)} aria-label="补充描述" />
                        <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; void addFiles(files); }} />
                        {actions}
                    </>
                ) : (
                    <>
                        <h3><button type="button" className="studio-icon-button is-ghost" aria-label="返回" onClick={() => setStep("choose")}><ArrowLeft aria-hidden /></button>描述你的世界</h3>
                        <Input.TextArea value={text} autoSize={{ minRows: 4, maxRows: 10 }} maxLength={2000} showCount placeholder="例如：黄昏时分的江南水乡古镇，石桥、乌篷船和红灯笼倒映在河面。" onChange={(event) => setText(event.target.value)} aria-label="描述你的世界" />
                        <div className="studio-voice-sample-actions">
                            <Popover trigger="click" arrow={false} content={(
                                <div className="studio-popup studio-option-list">
                                    <strong>灵感示例</strong>
                                    {STUDIO_WORLD_TEMPLATES.map((template) => (
                                        <button key={template.name} type="button" className="studio-option-item is-rich" onClick={() => setText(template.prompt)}>
                                            <span><b>{template.name}</b><small>{template.prompt}</small></span>
                                        </button>
                                    ))}
                                </div>
                            )}>
                                <button type="button" className="studio-mini-button"><Sparkles aria-hidden />灵感示例</button>
                            </Popover>
                            <button type="button" className="studio-mini-button" disabled={uploading || describing || !studioTextModel(config, true)} title={!studioTextModel(config, true) ? "后台还没有能看图的文本模型" : "上传一张图，自动写出世界描述"} onClick={() => (images[0] ? void imageToPrompt() : fileRef.current?.click())}>
                                {describing ? <Loader2 className="studio-spin" aria-hidden /> : <ImagePlus aria-hidden />}{images[0] ? "根据图片写描述" : "看图写描述"}
                            </button>
                            {images[0] ? <span className="studio-hint">已选 1 张图</span> : null}
                        </div>
                        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadStudioFile(file).then((attachment) => setImages([attachment])).catch((cause) => message.error(cause instanceof Error ? cause.message : "上传失败")); }} />
                        {actions}
                    </>
                )}
            </div>
        </AppModal>
    );
}

/** 我的世界网格：全景草稿，可以环视、放进场景或拍漫游镜头。 */
export function StudioWorldGrid({ enabled = true, filter = "all", onCreate, onUsed }: { enabled?: boolean; filter?: "all" | "3d" | "draft"; onCreate: () => void; onUsed?: () => void }) {
    const [viewing, setViewing] = useState<StudioWork | null>(null);
    const handoff = useWorldHandoff();
    const worlds = useQuery({ queryKey: ["studio", "worlds"], queryFn: async ({ signal }) => panoWorks((await listStudioWorks({ kind: "image", tool: PANO_TOOL, pageSize: 60 }, signal)).works), enabled });
    const list = filter === "3d" ? [] : worlds.data || [];
    const use = (work: StudioWork, target: "cast-in-scene" | "world-cam") => {
        handoff(studioAttachmentFromMedia(work, work.media[0]), target);
        onUsed?.();
    };
    return (
        <>
            {worlds.isLoading ? <p className="studio-hint">正在加载…</p> : list.length ? (
                <div className="studio-world-grid">
                    {list.map((work) => (
                        <article key={work.id} className="studio-world-card">
                            <img src={studioMediaSrc(work.media[0])} alt="" loading="lazy" />
                            <div className="studio-world-card-body">
                                <b title={work.prompt}>{work.prompt || "未命名世界"}</b>
                                <small>全景草稿</small>
                                <div className="studio-voice-sample-actions">
                                    <button type="button" className="studio-mini-button" onClick={() => setViewing(work)}><Compass aria-hidden />进入</button>
                                    <Popover trigger="click" arrow={false} content={(
                                        <div className="studio-popup studio-menu">
                                            <button type="button" className="studio-menu-item" onClick={() => use(work, "cast-in-scene")}>把角色放进这个世界</button>
                                            <button type="button" className="studio-menu-item" onClick={() => use(work, "world-cam")}>在这个世界拍漫游镜头</button>
                                        </div>
                                    )}>
                                        <button type="button" className="studio-mini-button is-primary"><Check aria-hidden />使用</button>
                                    </Popover>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            ) : (
                <div className="studio-voice-empty">
                    <p>{filter === "3d" ? "还没有 3D 世界。后台支持 3D 世界后，可以把全景草稿做成 3D 世界。" : "还没有世界。"}</p>
                    <button type="button" className="studio-mini-button is-primary" onClick={onCreate}><Plus aria-hidden />创建世界</button>
                </div>
            )}
            <AppModal rootClassName="studio-modal" open={Boolean(viewing)} width="min(1100px, calc(100vw - 32px))" title={viewing?.prompt || "世界"} footer={null} onCancel={() => setViewing(null)} destroyOnHidden>
                {viewing ? <StudioPanoViewer src={studioMediaSrc(viewing.media[0])} /> : null}
                <p className="studio-hint">按住拖动环视四周，滚轮缩放。</p>
            </AppModal>
        </>
    );
}

type LibraryProps = { open: boolean; onClose: () => void; onCreate: (prompt?: string) => void };

/** 世界库：我的世界（全景草稿）和世界模板。 */
export function StudioWorldLibraryModal({ open, onClose, onCreate }: LibraryProps) {
    const [tab, setTab] = useState<"mine" | "templates">("mine");
    const [filter, setFilter] = useState<"all" | "3d" | "draft">("all");
    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(920px, calc(100vw - 32px))" title="世界库" footer={null} onCancel={onClose}>
            <div className="studio-popup studio-voice-library">
                <div className="studio-voice-toolbar">
                    <div className="studio-picker-sources" role="tablist" aria-label="世界来源">
                        <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>我的世界</button>
                        <button type="button" role="tab" aria-selected={tab === "templates"} onClick={() => setTab("templates")}>世界模板</button>
                    </div>
                    {tab === "mine" ? (
                        <div className="studio-picker-sources" role="tablist" aria-label="世界类型">
                            {([["all", "全部"], ["3d", "3D 世界"], ["draft", "全景草稿"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
                        </div>
                    ) : null}
                </div>
                {tab === "mine" ? (
                    <StudioWorldGrid enabled={open} filter={filter} onUsed={onClose} onCreate={() => { onClose(); onCreate(); }} />
                ) : (
                    <div className="studio-voice-list">
                        {STUDIO_WORLD_TEMPLATES.map((template) => (
                            <div key={template.name} className="studio-voice-row">
                                <span className="studio-voice-avatar"><Globe aria-hidden size={15} /></span>
                                <span className="studio-voice-name"><b>{template.name}</b><small>{template.prompt}</small></span>
                                <button type="button" className="studio-mini-button is-primary" onClick={() => { onClose(); onCreate(template.prompt); }}><Check aria-hidden />使用</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppModal>
    );
}

/** 创建角色：从图片、文字描述或一步步搭建。 */
export function StudioCreateCharacterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const navigate = useNavigate();
    const go = (path: string) => {
        onClose();
        navigate(path);
    };
    return (
        <AppModal rootClassName="studio-modal" open={open} width="min(560px, calc(100vw - 32px))" title={null} footer={null} onCancel={onClose}>
            <div className="studio-popup studio-voice-create">
                <h3>创建角色</h3>
                <p className="studio-hint">做一个可以反复使用的角色，之后的图片和视频都能保持同一张脸。</p>
                <button type="button" className="studio-voice-choice" onClick={() => go("/studio/characters?create=1")}>
                    <ImagePlus aria-hidden />
                    <span><b>从图片开始</b><small>上传几张照片，直接建成角色</small></span>
                </button>
                <button type="button" className="studio-voice-choice" onClick={() => go("/studio/tools/create-character")}>
                    <Wand2 aria-hidden />
                    <span><b>描述你的角色</b><small>用文字描述外形，生成角色设定图后存进角色库</small></span>
                </button>
                <button type="button" className="studio-voice-choice" onClick={() => go("/studio/tools/create-character?build=1")}>
                    <Sparkles aria-hidden />
                    <span><b>一步步搭建</b><small>选性别、年龄、画风和画面，组合出一个角色</small></span>
                </button>
            </div>
        </AppModal>
    );
}
