import { Briefcase, Building2, Clapperboard, Film, Globe, Lightbulb, Megaphone, MicVocal, Music, Sparkles, Store, UserRound, Video, type LucideIcon } from "./studio-icons";

import type { DirectorGenre, DirectorReference } from "./studio-director";

/**
 * 首页和导演首页共用的「快速开始」。每种类型有自己的表单，提交时把填写内容按固定格式写成交给导演的第一条消息，
 * 上传的图片和歌曲作为参考素材存进简报。封面由管理员在后台上传（ID 为 coverId），没有时显示渐变海报。
 */
export type QuickStartField =
    | { kind: "text"; key: string; label: string; placeholder: string; optional?: boolean; maxLength?: number }
    | { kind: "textarea"; key: string; label: string; placeholder: string; optional?: boolean; maxLength: number }
    | { kind: "chips"; key: string; label: string; options: string[]; optional?: boolean; custom?: boolean }
    /** 图片上传：每张图按 refLabel + 序号命名（例如「产品图1」），导演在分镜里按这个名字引用。 */
    | { kind: "images"; key: string; label: string; hint: string; refLabel: string; max: number; min?: number; optional?: boolean }
    /** 歌曲：上传后作为成片背景音乐。 */
    | { kind: "song"; key: string; label: string; optional?: boolean }
    /** 人物：从角色库选，或者用文字描述。 */
    | { kind: "characters"; key: string; label: string; max: number; optional?: boolean };

export type QuickStartValues = {
    text: Record<string, string>;
    refs: Record<string, DirectorReference[]>;
    /** 角色库里选中的人物名字和文字描述的人物。 */
    cast: Record<string, { names: string[]; described: string }>;
    durationSeconds: number;
    ratio: string;
};

export type StudioQuickStart = {
    genre: DirectorGenre;
    coverId: string;
    label: string;
    icon: LucideIcon;
    gradient: [string, string];
    badge?: "热门" | "新";
    headline: string;
    subtitle: string;
    cta: string;
    fields: QuickStartField[];
    /** 作为项目标题的字段。 */
    titleKey: string;
    /** 作为画面风格交给生成的字段。 */
    styleKey?: string;
    ratio: string;
    durationSeconds: number;
    voiceover?: boolean;
    subtitles?: boolean;
    /** 至少填写其中一项才能开始。 */
    requireOneOf?: string[];
    requireOneOfHint?: string;
    buildPrompt: (values: QuickStartValues) => string;
};

function lines(items: Array<string | null | false | undefined>) {
    return items.filter((item): item is string => typeof item === "string").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function refLine(label: string, refs: DirectorReference[] | undefined) {
    return refs?.length ? `【${label}】${refs.map((item) => `@${item.label}`).join("、")}` : null;
}

function castLines(cast: { names: string[]; described: string } | undefined, label = "主要人物") {
    if (!cast) return [];
    const items = [...cast.names.map((name) => `${name}（角色库已有形象）`), ...(cast.described.trim() ? [cast.described.trim()] : [])];
    return items.length ? [`【${label}】`, ...items.map((item) => `- ${item}`)] : [];
}

function value(values: QuickStartValues, key: string) {
    return (values.text[key] || "").trim();
}

function durationLine(values: QuickStartValues) {
    return `【时长】约 ${values.durationSeconds} 秒，画幅 ${values.ratio}`;
}

const FILM_STYLES = ["电影感", "实验性", "黑白", "动画", "艺术风"];
const TRAILER_GENRES = ["喜剧", "惊悚", "动作", "科幻", "爱情", "恐怖", "剧情", "奇幻"];
const SOCIAL_VIBES = ["轻松", "搞笑", "励志", "治愈", "高级"];
const DRAMA_VIBES = ["爱情", "惊悚", "喜剧", "恐怖"];
const EXPLAINER_STYLES = ["电影感", "白板", "极简", "插画"];

export const STUDIO_QUICK_STARTS: StudioQuickStart[] = [
    {
        genre: "short-film", coverId: "quick-short-film", label: "短片", icon: Clapperboard, gradient: ["#355c7d", "#0f2027"],
        headline: "拍一支短片", subtitle: "真实故事，任凭情感流淌。", cta: "执导我的短片",
        fields: [
            { kind: "textarea", key: "story", label: "你的影片讲的是什么？", placeholder: "写下你的故事、感受，甚至只是一种情绪……", maxLength: 5000 },
            { kind: "chips", key: "style", label: "视觉风格", options: FILM_STYLES, custom: true, optional: true },
            { kind: "images", key: "assets", label: "添加参考", hint: "人物、场景或风格参考图，最多 4 张", refLabel: "参考图", max: 4, optional: true },
        ],
        titleKey: "story", styleKey: "style", ratio: "16:9", durationSeconds: 45,
        buildPrompt: (values) => lines([
            "制作一支短片，要求如下：", "",
            `【短片内容】${value(values, "story")}`,
            value(values, "style") ? `【视觉风格】${value(values, "style")}` : null,
            durationLine(values),
            refLine("参考素材", values.refs.assets),
        ]),
    },
    {
        genre: "music-video", coverId: "quick-music-video", label: "音乐视频", icon: Music, gradient: ["#f953c6", "#3a1c71"], badge: "新",
        headline: "做一支音乐视频", subtitle: "一首歌，任何情绪，无限氛围。", cta: "制作我的音乐视频",
        fields: [
            { kind: "song", key: "song", label: "你的歌曲" },
            { kind: "characters", key: "cast", label: "谁出现在视频里？", max: 1, optional: true },
            { kind: "textarea", key: "direction", label: "画面方向", placeholder: "描述画面的感觉：场景、光线、色彩、情绪、风格……", maxLength: 500, optional: true },
        ],
        titleKey: "direction", ratio: "9:16", durationSeconds: 30, voiceover: false,
        buildPrompt: (values) => lines([
            "制作一支音乐视频，要求如下：", "",
            refLine("音乐", values.refs.song),
            ...castLines(values.cast.cast, "MV 主角"),
            value(values, "direction") ? `【画面方向】${value(values, "direction")}` : null,
            durationLine(values),
            "画面节奏跟着音乐走，不要旁白配音。",
        ]),
    },
    {
        genre: "real-estate", coverId: "quick-real-estate", label: "房地产", icon: Building2, gradient: ["#56ccf2", "#2f80ed"], badge: "新",
        headline: "做一支看房视频", subtitle: "把房源照片做成运镜流畅的视频。", cta: "执导我的看房视频",
        fields: [
            { kind: "images", key: "photos", label: "添加房源照片", hint: "至少 3 张，最多 20 张", refLabel: "房源图", min: 3, max: 20 },
            { kind: "text", key: "name", label: "楼盘名称", placeholder: "例如：滨江一号 · 三房两厅", optional: true, maxLength: 60 },
            { kind: "textarea", key: "highlights", label: "对视频有什么偏好？", placeholder: "例如：从外观开始，重点拍厨房和泳池，节奏平缓温馨。", maxLength: 500, optional: true },
        ],
        titleKey: "name", ratio: "16:9", durationSeconds: 30, subtitles: false,
        buildPrompt: (values) => lines([
            `用上传的 ${values.refs.photos?.length || 0} 张房源照片制作一支看房视频。`, "",
            value(values, "name") ? `【楼盘】${value(values, "name")}` : null,
            refLine("房源照片", values.refs.photos),
            value(values, "highlights") ? `【补充要求】${value(values, "highlights")}` : null,
            durationLine(values), "",
            "这些是同一套真实房源的实拍照片，必须保持原样：不能虚构房间、家具、人物或转场，不能改风格或改光线。",
            "照片允许时按 外观 → 入口 → 客厅 → 厨房/餐厅 → 卧室 → 浴室 → 户外 的顺序，最后停在最好看的主镜头。",
            "不要屏幕文字、字幕、Logo、水印或价格。",
        ]),
    },
    {
        genre: "product-ad", coverId: "quick-product-ad", label: "产品广告", icon: Megaphone, gradient: ["#f7971e", "#c0392b"], badge: "热门",
        headline: "能卖货的产品广告", subtitle: "AI 驱动，影棚品质，为吸引注意而生。", cta: "执导我的产品广告",
        fields: [
            { kind: "images", key: "images", label: "产品图片", hint: "多角度、包装、使用中的照片，最多 8 张", refLabel: "产品图", max: 8 },
            { kind: "text", key: "productName", label: "产品叫什么？", placeholder: "例如：暖杯 316 保温杯", maxLength: 60 },
            { kind: "textarea", key: "whyBuy", label: "为什么值得买？", placeholder: "写出核心卖点、效果和带来的感受。", maxLength: 300 },
        ],
        titleKey: "productName", ratio: "9:16", durationSeconds: 30,
        buildPrompt: (values) => lines([
            "制作一支产品广告，要求如下：", "",
            refLine("产品图片", values.refs.images),
            `【产品名称】${value(values, "productName")}`,
            `【产品卖点】${value(values, "whyBuy")}`,
            durationLine(values),
            "出现产品的镜头都用 refs 引用产品图，保证外观和包装一致。",
        ]),
    },
    {
        genre: "social", coverId: "quick-social", label: "社交内容", icon: Video, gradient: ["#ff9a8b", "#ff6a88"],
        headline: "做一条社交视频", subtitle: "你出镜，讲你的故事，拍完就能发。", cta: "执导我的视频",
        fields: [
            { kind: "characters", key: "creator", label: "谁出镜？", max: 1 },
            { kind: "textarea", key: "talkingAbout", label: "他们在聊什么？", placeholder: "例如：分享一个改变我作息的小习惯", maxLength: 500 },
            { kind: "chips", key: "vibe", label: "整体氛围", options: SOCIAL_VIBES, custom: true, optional: true },
        ],
        titleKey: "talkingAbout", styleKey: "vibe", ratio: "9:16", durationSeconds: 30,
        buildPrompt: (values) => lines([
            "制作一条 UGC 风格的社交视频，要求如下：", "",
            ...castLines(values.cast.creator, "出镜人物"),
            `【视频内容】${value(values, "talkingAbout")}`,
            value(values, "vibe") ? `【氛围】${value(values, "vibe")}` : null,
            durationLine(values),
        ]),
    },
    {
        genre: "ugc", coverId: "quick-ugc", label: "UGC 广告", icon: UserRound, gradient: ["#ff6a88", "#7f53ac"],
        headline: "能卖货的 UGC 广告", subtitle: "真实的人，真实的瞬间，为吸引注意而生。", cta: "执导我的 UGC 广告",
        fields: [
            { kind: "images", key: "images", label: "产品参考", hint: "多角度、包装、使用中的照片，最多 8 张", refLabel: "产品图", max: 8, optional: true },
            { kind: "text", key: "productName", label: "产品名称", placeholder: "例如：便携榨汁杯", maxLength: 60 },
            { kind: "textarea", key: "points", label: "产品卖点", placeholder: "例如：深层保湿、改善肤质、成分干净、效果看得见", maxLength: 500 },
            { kind: "characters", key: "actor", label: "谁来出镜？", max: 1, optional: true },
        ],
        titleKey: "productName", ratio: "9:16", durationSeconds: 30,
        buildPrompt: (values) => lines([
            "制作一支 UGC 带货广告，要求如下：", "",
            refLine("产品图片", values.refs.images),
            `【产品名称】${value(values, "productName")}`,
            `【产品卖点】${value(values, "points")}`,
            ...castLines(values.cast.actor, "出镜达人"),
            durationLine(values),
            values.refs.images?.length ? "出现产品的镜头都用 refs 引用产品图，保证外观和包装一致。" : null,
        ]),
    },
    {
        genre: "short-drama", coverId: "quick-short-drama", label: "微短剧", icon: Film, gradient: ["#8e2de2", "#4a00e0"], badge: "新",
        headline: "做一集微短剧", subtitle: "短、上头、为竖屏而生。", cta: "执导我的微短剧",
        fields: [
            { kind: "characters", key: "characters", label: "故事里有谁？", max: 4 },
            { kind: "textarea", key: "story", label: "故事里发生了什么？", placeholder: "例如：咖啡师总在杯子里发现神秘的纸条", maxLength: 5000 },
            { kind: "chips", key: "vibe", label: "剧情风格", options: DRAMA_VIBES, custom: true, optional: true },
        ],
        titleKey: "story", styleKey: "vibe", ratio: "9:16", durationSeconds: 60,
        buildPrompt: (values) => lines([
            "制作一集微短剧，要求如下：", "",
            ...castLines(values.cast.characters),
            `【剧情】${value(values, "story")}`,
            value(values, "vibe") ? `【剧情风格】${value(values, "vibe")}` : null,
            durationLine(values),
        ]),
    },
    {
        genre: "brand-film", coverId: "quick-brand-film", label: "品牌片", icon: Briefcase, gradient: ["#d9a441", "#5a3d0c"],
        headline: "把品牌故事拍成片", subtitle: "说出你的品牌主张，我们把它拍出来。", cta: "执导我的品牌片",
        fields: [
            { kind: "text", key: "brandName", label: "品牌名称", placeholder: "例如：暖杯 WarmCup", maxLength: 60 },
            { kind: "textarea", key: "standsFor", label: "你的品牌代表什么？", placeholder: "你的价值观、使命，以及与众不同之处……", maxLength: 500 },
            { kind: "textarea", key: "feeling", label: "看完之后，观众应该有什么感受？", placeholder: "你想留给观众的情绪……", maxLength: 100 },
            { kind: "images", key: "assets", label: "添加参考", hint: "Logo、产品或风格参考图，最多 4 张", refLabel: "品牌素材", max: 4, optional: true },
        ],
        titleKey: "brandName", ratio: "16:9", durationSeconds: 45,
        buildPrompt: (values) => lines([
            "制作一支品牌片，要求如下：", "",
            `【品牌名称】${value(values, "brandName")}`,
            `【品牌主张】${value(values, "standsFor")}`,
            `【观众看完的感受】${value(values, "feeling")}`,
            durationLine(values),
            refLine("参考素材", values.refs.assets),
        ]),
    },
    {
        genre: "explainer", coverId: "quick-explainer", label: "讲解视频", icon: Lightbulb, gradient: ["#43cea2", "#185a9d"],
        headline: "让人一看就懂的讲解视频", subtitle: "用简单的步骤讲清楚一件事。", cta: "执导我的讲解视频",
        fields: [
            { kind: "textarea", key: "topic", label: "你想讲解什么？", placeholder: "例如：光合作用怎么运作、为什么睡眠很重要、我们的新功能怎么用……", maxLength: 500 },
            { kind: "text", key: "audience", label: "观众是谁？", placeholder: "例如：高中生、职场人士、新客户", maxLength: 60 },
            { kind: "chips", key: "style", label: "视觉风格", options: EXPLAINER_STYLES, optional: true },
            { kind: "images", key: "assets", label: "添加参考", hint: "截图、图表或风格参考，最多 4 张", refLabel: "参考图", max: 4, optional: true },
        ],
        titleKey: "topic", styleKey: "style", ratio: "9:16", durationSeconds: 45,
        buildPrompt: (values) => lines([
            "制作一支讲解视频，要求如下：", "",
            `【讲解主题】${value(values, "topic")}`,
            `【目标观众】${value(values, "audience")}`,
            value(values, "style") ? `【视觉风格】${value(values, "style")}` : null,
            durationLine(values),
            refLine("参考素材", values.refs.assets),
        ]),
    },
    {
        genre: "trailer", coverId: "quick-trailer", label: "电影预告片", icon: Sparkles, gradient: ["#232526", "#b31217"],
        headline: "把你的点子做成电影预告片", subtitle: "每个故事都从一种感觉开始。", cta: "执导我的预告片",
        fields: [
            { kind: "textarea", key: "concept", label: "描述你的概念", placeholder: "例如：迷途的宇航员收到一个不该存在的信号……", maxLength: 500 },
            { kind: "chips", key: "genre", label: "类型", options: TRAILER_GENRES, custom: true, optional: true },
            { kind: "images", key: "assets", label: "添加参考", hint: "人物、场景或风格参考图，最多 4 张", refLabel: "参考图", max: 4, optional: true },
        ],
        titleKey: "concept", styleKey: "genre", ratio: "16:9", durationSeconds: 30,
        buildPrompt: (values) => lines([
            "制作一支电影预告片，要求如下：", "",
            `【剧情概念】${value(values, "concept")}`,
            value(values, "genre") ? `【影片类型】${value(values, "genre")}` : null,
            durationLine(values),
            refLine("参考素材", values.refs.assets),
        ]),
    },
    {
        genre: "promo", coverId: "quick-promo", label: "宣传视频", icon: Globe, gradient: ["#a1c4fd", "#6a5af9"],
        headline: "做一支宣传视频", subtitle: "放上网址或几张图，我们来打造揭晓时刻。", cta: "开始制作宣传视频",
        fields: [
            { kind: "text", key: "name", label: "网站或产品名称", placeholder: "例如：OmniMuse", optional: true, maxLength: 60 },
            { kind: "text", key: "link", label: "网站链接", placeholder: "https://…（可选）", optional: true, maxLength: 300 },
            { kind: "images", key: "logo", label: "Logo", hint: "上传 Logo，会原样出现在片中", refLabel: "Logo", max: 1, optional: true },
            { kind: "images", key: "materials", label: "网站素材", hint: "网站截图、介绍文档、营销图，最多 12 张", refLabel: "网站素材", max: 12, optional: true },
            { kind: "textarea", key: "brief", label: "创意方向", placeholder: "介绍你的产品，写出主要功能或卖点，以及对视频的想法", maxLength: 500, optional: true },
        ],
        titleKey: "name", ratio: "16:9", durationSeconds: 30,
        requireOneOf: ["link", "logo", "materials"], requireOneOfHint: "请至少填写网站链接，或上传 Logo、网站素材",
        buildPrompt: (values) => lines([
            "制作一支宣传视频，要求如下：", "",
            value(values, "name") ? `【名称】${value(values, "name")}` : null,
            value(values, "link") ? `【网站链接】${value(values, "link")}` : null,
            values.refs.logo?.length ? `【Logo】@${values.refs.logo[0].label}，这是品牌真实的标志，必须原样使用。` : null,
            refLine("网站素材", values.refs.materials),
            value(values, "brief") ? `【创意方向】${value(values, "brief")}` : null,
            durationLine(values),
        ]),
    },
    {
        genre: "food", coverId: "quick-food", label: "餐饮探店", icon: Store, gradient: ["#f2994a", "#eb5757"],
        headline: "做一支探店视频", subtitle: "门头、环境、上菜、试吃。", cta: "执导我的探店视频",
        fields: [
            { kind: "text", key: "shop", label: "店铺名称", placeholder: "例如：老街牛肉面", maxLength: 60 },
            { kind: "textarea", key: "points", label: "招牌菜和特色", placeholder: "招牌菜、环境特色、人均价格、地址", maxLength: 500 },
            { kind: "images", key: "photos", label: "店铺和菜品照片", hint: "门头、环境、菜品，最多 8 张", refLabel: "店铺图", max: 8, optional: true },
        ],
        titleKey: "shop", ratio: "9:16", durationSeconds: 30,
        buildPrompt: (values) => lines([
            "制作一支餐饮探店视频，要求如下：", "",
            `【店铺】${value(values, "shop")}`,
            `【招牌菜和特色】${value(values, "points")}`,
            refLine("店铺照片", values.refs.photos),
            durationLine(values),
            values.refs.photos?.length ? "出现店铺和菜品的镜头用 refs 引用对应照片，保证外观一致。" : null,
        ]),
    },
    {
        genre: "presenter", coverId: "quick-presenter", label: "数字人讲解", icon: MicVocal, gradient: ["#11998e", "#38ef7d"],
        headline: "数字人讲解视频", subtitle: "讲解员面对镜头，配要点画面。", cta: "执导我的讲解视频",
        fields: [
            { kind: "characters", key: "presenter", label: "讲解员", max: 1, optional: true },
            { kind: "text", key: "topic", label: "讲解主题", placeholder: "例如：三分钟看懂分期免息", maxLength: 100 },
            { kind: "textarea", key: "points", label: "要讲的要点", placeholder: "按顺序写出要讲的要点", maxLength: 1000 },
        ],
        titleKey: "topic", ratio: "9:16", durationSeconds: 45,
        buildPrompt: (values) => lines([
            "制作一支数字人讲解视频，要求如下：", "",
            ...castLines(values.cast.presenter, "讲解员"),
            `【主题】${value(values, "topic")}`,
            `【要点】${value(values, "points")}`,
            durationLine(values),
        ]),
    },
];

/** 「新建项目」和角色库「交给 AI 导演」用的自由创作表单，不出现在快速开始卡片里。 */
export const STUDIO_FREE_START: StudioQuickStart = {
    genre: "free", coverId: "quick-free", label: "自由创作", icon: Sparkles, gradient: ["#434343", "#000000"],
    headline: "新建导演项目", subtitle: "说说你的想法，导演会先写成剧本。", cta: "开始导演",
    fields: [
        { kind: "textarea", key: "idea", label: "你想做什么视频？", placeholder: "产品、故事、风格、给谁看……", maxLength: 5000 },
        { kind: "characters", key: "cast", label: "角色", max: 3, optional: true },
        { kind: "images", key: "assets", label: "添加参考", hint: "产品、人物、场景或风格参考图，最多 4 张", refLabel: "参考图", max: 4, optional: true },
    ],
    titleKey: "idea", ratio: "9:16", durationSeconds: 30,
    buildPrompt: (values) => lines([
        value(values, "idea"),
        "",
        ...castLines(values.cast.cast, "角色"),
        refLine("参考素材", values.refs.assets),
        durationLine(values),
    ]),
};

export function studioQuickStart(genre: string | null | undefined) {
    return STUDIO_QUICK_STARTS.find((item) => item.genre === genre) || (genre === "free" ? STUDIO_FREE_START : undefined);
}

/** 表单还不能提交的原因；空字符串表示可以开始。 */
export function quickStartError(config: StudioQuickStart, values: QuickStartValues) {
    for (const field of config.fields) {
        if (field.kind === "images") {
            const count = values.refs[field.key]?.length || 0;
            if (field.min && count < field.min) return `${field.label}至少 ${field.min} 张`;
            if (!field.optional && !count) return `请上传${field.label}`;
            continue;
        }
        if (field.kind === "song") {
            if (!field.optional && !values.refs[field.key]?.length) return "请上传歌曲";
            continue;
        }
        if (field.kind === "characters") {
            const cast = values.cast[field.key];
            if (!field.optional && !cast?.names.length && !cast?.described.trim()) return `请选择或描述「${field.label}」`;
            continue;
        }
        const text = (values.text[field.key] || "").trim();
        if (!field.optional && !text) return `请填写「${field.label}」`;
        if ("maxLength" in field && field.maxLength && Array.from(text).length > field.maxLength) return `「${field.label}」最多 ${field.maxLength} 字`;
    }
    if (config.requireOneOf?.length) {
        const filled = config.requireOneOf.some((key) => (values.text[key] || "").trim() || values.refs[key]?.length);
        if (!filled) return config.requireOneOfHint || "请至少填写一项";
    }
    return "";
}

/** 项目标题：标题字段的前 30 个字，没有时用类型名。 */
export function quickStartTitle(config: StudioQuickStart, values: QuickStartValues) {
    const source = (values.text[config.titleKey] || "").trim().replace(/\s+/g, " ");
    return Array.from(source).slice(0, 30).join("") || config.label;
}
