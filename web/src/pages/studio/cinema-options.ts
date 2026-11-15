/**
 * Cinema Studio 导演选项库：用户点选，选项背后的英文描述拼进 Seedance 2.5 提示词。
 * label / hint 给客户看；prompt 是实际发给模型的描述，写具体的视觉特征，不写空泛形容词。
 * 每类第一个都是 auto：不加任何描述，交给模型和用户的场景描述决定。
 */

export type CinemaCategoryId = "genre" | "era" | "pacing" | "camera" | "lens" | "movement" | "color" | "light";

export type CinemaOption = {
    id: string;
    label: string;
    hint: string;
    prompt: string;
};

export type CinemaCategory = {
    id: CinemaCategoryId;
    label: string;
    hint: string;
    options: CinemaOption[];
};

const AUTO: CinemaOption = { id: "auto", label: "自动", hint: "按场景描述自动决定", prompt: "" };

export const CINEMA_CATEGORIES: CinemaCategory[] = [
    {
        id: "genre",
        label: "类型",
        hint: "整体的电影类型和情绪基调",
        options: [
            AUTO,
            { id: "drama", label: "剧情", hint: "克制、真实、重情绪", prompt: "grounded dramatic film, restrained performances, emotionally intimate framing" },
            { id: "thriller", label: "惊悚", hint: "紧张、不安、悬念", prompt: "tense psychological thriller, uneasy atmosphere, deliberate suspenseful staging" },
            { id: "action", label: "动作", hint: "力量感、速度、冲击", prompt: "high-energy action film, dynamic blocking, kinetic momentum and impact" },
            { id: "romance", label: "爱情", hint: "温柔、亲密、浪漫", prompt: "romantic film, tender intimate moments, soft warm emotional tone" },
            { id: "scifi", label: "科幻", hint: "未来感、科技、宏大", prompt: "cinematic science fiction, futuristic production design, sense of scale and wonder" },
            { id: "horror", label: "恐怖", hint: "阴森、压迫、未知", prompt: "atmospheric horror film, oppressive darkness, dread lurking at the edges of frame" },
            { id: "comedy", label: "喜剧", hint: "轻快、明亮、有趣", prompt: "light comedic film, bright inviting look, playful staging and expressive reactions" },
            { id: "noir", label: "黑色电影", hint: "阴影、雨夜、宿命感", prompt: "classic film noir, hard shadows, rain-slick streets, fatalistic mood" },
            { id: "fantasy", label: "奇幻", hint: "魔幻、史诗、梦境", prompt: "epic fantasy film, magical otherworldly atmosphere, mythic grandeur" },
            { id: "documentary", label: "纪录片", hint: "真实、观察、自然光", prompt: "observational documentary style, naturalistic and unstaged, authentic real-world texture" },
            { id: "commercial", label: "广告大片", hint: "精致、产品感、高级", prompt: "premium commercial film, polished glossy finish, aspirational product-hero aesthetic" },
            { id: "music_video", label: "MV", hint: "风格化、节奏感、视觉冲击", prompt: "stylized music video, bold graphic compositions, rhythmic visual energy" },
        ],
    },
    {
        id: "era",
        label: "年代",
        hint: "服装、美术和画面质感的时代",
        options: [
            AUTO,
            { id: "contemporary", label: "当代", hint: "现在的城市和生活", prompt: "set in the present day, contemporary wardrobe and modern environments" },
            { id: "near_future", label: "近未来", hint: "十几年后的世界", prompt: "set in the near future, subtly advanced technology, sleek understated design" },
            { id: "cyberpunk", label: "赛博朋克", hint: "霓虹、雨夜、高科技低生活", prompt: "cyberpunk future, dense neon signage, rain, high-tech low-life megacity" },
            { id: "y2k", label: "千禧年代", hint: "2000 年前后的潮流", prompt: "early 2000s Y2K era, glossy pop styling, period-accurate gadgets and fashion" },
            { id: "1990s", label: "90 年代", hint: "录像带、港风、复古潮流", prompt: "1990s period setting, era-accurate wardrobe, analog technology and signage" },
            { id: "1980s", label: "80 年代", hint: "霓虹、复古电子、浮夸", prompt: "1980s period setting, bold colors, analog synth-era fashion and interiors" },
            { id: "1970s", label: "70 年代", hint: "暖黄、胶片颗粒、复古", prompt: "1970s period setting, earthy wardrobe, warm vintage interiors" },
            { id: "1950s", label: "50 年代", hint: "古典、优雅、怀旧", prompt: "1950s period setting, classic tailored wardrobe, mid-century design" },
            { id: "victorian", label: "维多利亚", hint: "19 世纪欧洲", prompt: "Victorian 19th-century setting, period costumes, gaslight and ornate interiors" },
            { id: "ancient_china", label: "古代中国", hint: "古装、宫廷、江湖", prompt: "ancient China setting, traditional hanfu costumes, classical Chinese architecture" },
            { id: "medieval", label: "中世纪", hint: "城堡、骑士、石墙", prompt: "medieval setting, castles and stone halls, period armor and costumes" },
        ],
    },
    {
        id: "pacing",
        label: "节奏",
        hint: "镜头里动作和时间流动的快慢",
        options: [
            AUTO,
            { id: "slow_contemplative", label: "缓慢沉静", hint: "长镜头、留白、有余韵", prompt: "slow contemplative pacing, lingering moments, minimal motion, room to breathe" },
            { id: "steady", label: "平稳叙事", hint: "自然、清楚地讲故事", prompt: "steady measured pacing, clear natural storytelling" },
            { id: "building", label: "逐渐紧张", hint: "慢慢推向高潮", prompt: "pacing that builds tension gradually toward a climax" },
            { id: "energetic", label: "明快有力", hint: "动作多、有冲劲", prompt: "energetic brisk pacing, purposeful movement, constant forward momentum" },
            { id: "frenetic", label: "急速紧凑", hint: "快速、激烈、节拍感", prompt: "fast frenetic pacing, rapid intense action, urgent rhythm" },
            { id: "slow_motion", label: "慢动作", hint: "关键瞬间放慢", prompt: "dramatic slow motion, every detail of the movement suspended in time" },
            { id: "dreamlike", label: "梦境般", hint: "漂浮、恍惚、不真实", prompt: "dreamlike floating pacing, soft drifting motion, surreal sense of time" },
        ],
    },
    {
        id: "camera",
        label: "摄影机",
        hint: "画面的质感，像用哪种机器拍的",
        options: [
            AUTO,
            { id: "arri_alexa", label: "ARRI Alexa", hint: "好莱坞电影的主流质感", prompt: "shot on ARRI Alexa, rich natural skin tones, smooth highlight roll-off, high-end cinema look" },
            { id: "red", label: "RED", hint: "锐利、细节丰富、商业感", prompt: "shot on RED cinema camera, crisp high-detail image, punchy commercial clarity" },
            { id: "imax", label: "IMAX", hint: "宏大、清晰、史诗感", prompt: "shot on IMAX large format, immense scale, extraordinary clarity and depth" },
            { id: "film_35mm", label: "35mm 胶片", hint: "经典电影胶片颗粒", prompt: "shot on 35mm film, organic film grain, gentle halation, classic filmic texture" },
            { id: "film_16mm", label: "16mm 胶片", hint: "粗颗粒、独立电影、复古", prompt: "shot on 16mm film, pronounced grain, soft vintage indie-film character" },
            { id: "super8", label: "Super 8", hint: "家庭录像般的怀旧回忆", prompt: "shot on Super 8 film, heavy grain, faded colors, nostalgic home-movie memory" },
            { id: "vhs", label: "VHS 录像带", hint: "90 年代录像带画质", prompt: "VHS camcorder footage, low resolution, chroma bleed, tape noise and tracking lines" },
            { id: "handycam", label: "家用 DV", hint: "千禧年代家用摄像机", prompt: "early 2000s consumer DV camcorder look, slight video sharpening, candid feel" },
            { id: "iphone", label: "手机拍摄", hint: "社交媒体、真实随手拍", prompt: "shot on a smartphone, authentic social-media look, natural handheld realism" },
            { id: "drone", label: "无人机", hint: "高空俯瞰、航拍", prompt: "aerial drone cinematography, sweeping elevated perspective" },
        ],
    },
    {
        id: "lens",
        label: "镜头",
        hint: "视角宽窄和背景虚化",
        options: [
            AUTO,
            { id: "ultra_wide", label: "超广角 14mm", hint: "空间夸张、包围感", prompt: "ultra-wide 14mm lens, exaggerated perspective, expansive immersive space" },
            { id: "wide", label: "广角 24mm", hint: "交代环境、场面大", prompt: "wide 24mm lens, environment-revealing framing with natural depth" },
            { id: "normal", label: "标准 35mm", hint: "接近人眼、自然叙事", prompt: "35mm lens, natural human-eye perspective, classic narrative framing" },
            { id: "portrait", label: "人像 50mm", hint: "人物突出、背景微虚", prompt: "50mm lens, subject-focused framing, gently softened background" },
            { id: "tele", label: "长焦 85mm", hint: "背景强烈虚化、压缩感", prompt: "85mm telephoto lens, shallow depth of field, creamy background bokeh, compressed perspective" },
            { id: "long_tele", label: "超长焦 200mm", hint: "远距离偷拍感、强压缩", prompt: "200mm long telephoto lens, strongly compressed space, voyeuristic distance" },
            { id: "macro", label: "微距", hint: "极近特写、细节放大", prompt: "macro lens, extreme close-up detail, razor-thin depth of field" },
            { id: "anamorphic", label: "变形宽银幕", hint: "横向光斑、椭圆虚化", prompt: "anamorphic lens, horizontal lens flares, oval bokeh, widescreen cinematic feel" },
            { id: "fisheye", label: "鱼眼", hint: "强烈弯曲、街头风格", prompt: "fisheye lens, strong barrel distortion, edgy close perspective" },
            { id: "tilt_shift", label: "移轴", hint: "微缩模型效果", prompt: "tilt-shift lens, selective focus band, miniature-model effect" },
        ],
    },
    {
        id: "movement",
        label: "运镜",
        hint: "镜头怎么移动",
        options: [
            AUTO,
            { id: "static", label: "固定镜头", hint: "镜头不动、稳定", prompt: "locked-off static camera, no camera movement" },
            { id: "push_in", label: "缓慢推进", hint: "慢慢靠近主体", prompt: "slow push-in toward the subject" },
            { id: "pull_out", label: "缓慢拉远", hint: "从主体退开、揭示环境", prompt: "slow pull-out revealing the surroundings" },
            { id: "pan", label: "横摇", hint: "左右扫过画面", prompt: "smooth horizontal pan across the scene" },
            { id: "tracking", label: "跟拍", hint: "跟着人物移动", prompt: "tracking shot following the subject's movement" },
            { id: "orbit", label: "环绕", hint: "绕着主体转", prompt: "smooth orbit around the subject" },
            { id: "crane_up", label: "升降上摇", hint: "镜头升高、俯瞰", prompt: "crane shot rising upward to reveal the scene" },
            { id: "handheld", label: "手持", hint: "晃动、临场感", prompt: "handheld camera, subtle natural shake, immersive presence" },
            { id: "dolly_zoom", label: "滑动变焦", hint: "眩晕感、心理冲击", prompt: "dolly zoom (vertigo effect), background stretching while the subject holds size" },
            { id: "fpv", label: "FPV 穿越", hint: "高速穿梭、第一人称", prompt: "fast FPV drone flythrough, swooping through the space" },
        ],
    },
    {
        id: "color",
        label: "色调",
        hint: "整体调色风格",
        options: [
            AUTO,
            { id: "natural", label: "自然真实", hint: "准确、不过度调色", prompt: "natural true-to-life color grading, accurate skin tones" },
            { id: "teal_orange", label: "青橙", hint: "好莱坞大片经典配色", prompt: "teal and orange color grade, warm skin against cool shadows" },
            { id: "warm_golden", label: "暖金", hint: "温暖、怀旧、幸福感", prompt: "warm golden color grade, amber highlights, nostalgic glow" },
            { id: "cool_blue", label: "冷蓝", hint: "冷静、疏离、科技感", prompt: "cool blue color grade, desaturated cold tones, clinical mood" },
            { id: "bleach_bypass", label: "漂白", hint: "低饱和、高反差、粗粝", prompt: "bleach bypass look, low saturation, high contrast, gritty metallic tones" },
            { id: "pastel", label: "粉彩", hint: "柔和、梦幻、少女感", prompt: "soft pastel palette, airy lifted shadows, gentle dreamy colors" },
            { id: "neon", label: "霓虹", hint: "洋红、青色、夜店感", prompt: "saturated neon palette, magenta and cyan glow against deep blacks" },
            { id: "monochrome", label: "黑白", hint: "经典黑白、强反差", prompt: "black and white, rich monochrome tonal range, strong contrast" },
            { id: "vintage_kodak", label: "复古胶片", hint: "Kodak 胶片的暖色调", prompt: "vintage Kodak film color, warm reds and yellows, slightly faded blacks" },
            { id: "earthy", label: "大地色", hint: "棕绿、自然、质朴", prompt: "earthy muted palette, olive greens and warm browns, organic tones" },
        ],
    },
    {
        id: "light",
        label: "灯光",
        hint: "光线的方向、软硬和氛围",
        options: [
            AUTO,
            { id: "natural_daylight", label: "自然日光", hint: "白天、真实柔和", prompt: "soft natural daylight, realistic ambient illumination" },
            { id: "golden_hour", label: "黄金时刻", hint: "日落暖光、长影子", prompt: "golden hour sunlight, warm low-angle light, long soft shadows" },
            { id: "blue_hour", label: "蓝调时刻", hint: "日落后的冷蓝天色", prompt: "blue hour twilight, cool ambient sky light with warm practical lights" },
            { id: "low_key", label: "低调光", hint: "大面积暗部、戏剧性", prompt: "low-key lighting, deep shadows, single dramatic key light" },
            { id: "high_key", label: "高调光", hint: "明亮、干净、少阴影", prompt: "high-key lighting, bright even illumination, minimal shadows" },
            { id: "rembrandt", label: "伦勃朗光", hint: "经典人像侧光、脸颊三角光", prompt: "Rembrandt lighting, triangle of light on the cheek, classic painterly portrait" },
            { id: "backlit", label: "逆光轮廓", hint: "主体边缘发光、剪影感", prompt: "strong backlight, glowing rim light outlining the subject" },
            { id: "neon_practical", label: "霓虹灯光", hint: "城市招牌、彩色光源", prompt: "colored neon practical lights casting vivid glows and reflections" },
            { id: "candlelight", label: "烛光", hint: "暖橘、闪烁、亲密", prompt: "flickering candlelight, warm intimate glow, soft falloff into darkness" },
            { id: "volumetric", label: "体积光", hint: "光束、烟雾、神圣感", prompt: "volumetric light beams cutting through haze, atmospheric god rays" },
            { id: "moonlight", label: "月光", hint: "夜晚冷光、神秘", prompt: "cool moonlight, soft blue night illumination, mysterious mood" },
        ],
    },
];

export type CinemaSelection = Partial<Record<CinemaCategoryId, string>>;

/** 用户描述在前，导演选项按 类型→年代→节奏→摄影机→镜头→运镜→色调→灯光 接在后面；选 auto 或没选的类别不加内容。 */
export function buildCinemaPrompt(scene: string, selection: CinemaSelection) {
    const directions = CINEMA_CATEGORIES.flatMap((category) => {
        const option = category.options.find((item) => item.id === selection[category.id]);
        return option?.prompt ? [option.prompt] : [];
    });
    const base = scene.trim();
    if (!directions.length) return base;
    return `${base}${/[.。!！?？]$/.test(base) ? "" : "."} Cinematography: ${directions.join("; ")}.`;
}
