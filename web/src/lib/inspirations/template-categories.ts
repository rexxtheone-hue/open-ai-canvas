import type { CreationInspiration } from "./catalog";

/**
 * 模板的统一分类（AI Canvas 和 AI Studio 共用）：几个外部来源各有一套分类码，这里按用途合并成一套给用户挑；
 * 没有分类码的条目按标题和简介里的关键词归类，都对不上的放进「其他」。
 */
export const TEMPLATE_CATEGORIES = [
    { id: "product", label: "产品广告" },
    { id: "ugc", label: "口播测评" },
    { id: "social", label: "社媒爆款" },
    { id: "portrait", label: "人像写真" },
    { id: "fashion", label: "时尚穿搭" },
    { id: "cinematic", label: "电影短剧" },
    { id: "action", label: "动作奇幻" },
    { id: "anime", label: "动漫插画" },
    { id: "design", label: "海报设计" },
    { id: "3d", label: "3D 与游戏" },
    { id: "life", label: "生活旅行" },
    { id: "kids", label: "亲子教育" },
    { id: "music", label: "音乐舞蹈" },
    { id: "comedy", label: "搞笑整活" },
    { id: "other", label: "其他" },
] as const;

export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]["id"];

/** 来源分类码 → 统一分类。 */
const CODE_TO_CATEGORY: Record<string, TemplateCategoryId> = {
    "product-commercial-shotlist": "product",
    "product-marketing": "product",
    product: "product",
    "ecommerce-main-image": "product",
    "handheld-ugc-vlog": "ugc",
    "ugc-creator-review": "ugc",
    "dialogue-performance-beats": "ugc",
    "social-media-post": "social",
    "youtube-thumbnail": "social",
    portrait: "portrait",
    "profile-avatar": "portrait",
    japan: "portrait",
    "fashion-lookbook": "fashion",
    fashion: "fashion",
    "cinematic-narrative-short": "cinematic",
    "retro-found-footage": "cinematic",
    "pov-continuous-take": "cinematic",
    "time-freeze-rewind": "cinematic",
    "storyboard-grid-to-video": "cinematic",
    "timeline-shot-script": "cinematic",
    "character-reference-lock": "cinematic",
    "process-transformation-montage": "cinematic",
    "combat-choreography": "action",
    "epic-fantasy-scifi": "action",
    "horror-suspense": "action",
    "sports-extreme": "action",
    "car-vehicle": "action",
    "anime-style-lock": "anime",
    anime: "anime",
    "3d-cartoon": "anime",
    "stop-motion-cadence": "anime",
    illustration: "anime",
    "comic-storyboard": "anime",
    poster: "design",
    brand: "design",
    "infographic-edu-visual": "design",
    "3d": "3d",
    "game-asset": "3d",
    "game-ui-livestream": "3d",
    "travel-city-walk": "life",
    "food-asmr": "life",
    "pet-animal": "life",
    "music-beat-sync-mv": "music",
    "meme-comedy": "comedy",
};

/** 没有分类码时按关键词归类，按顺序匹配，先命中的优先。 */
const KEYWORD_RULES: Array<[TemplateCategoryId, RegExp]> = [
    ["product", /广告|产品|商品|电商|护肤|美妆|香水|面膜|唇|饮料|汽水|能量|相机|通勤包|红牛/],
    ["kids", /幼儿|幼童|萌娃|宝宝|孩子|小女儿|学字母|英语|教学|课堂|实验/],
    ["comedy", /搞笑|喜剧|反转|乌龙|荒诞|逗笑|风波|大乱|误夸|误抢|误触|恶作剧|慌乱|围观|俏皮|洗澡/],
    ["music", /舞蹈|跳舞|轻舞|说唱|歌手|MV|卡点/i],
    ["action", /决战|激战|格斗|对决|追逐|追击|剑|枪|武|丧尸|战士|特工|爆炸|巨兽|魔法|超能力|机甲|外星|末日|怪|仙侠|恶汉|营救|导弹|特效|变身|召唤|跑酷|遇袭|侠|化身|力量|交锋|大战|子弹时间|追捕|奇境|冒险|穿越|浮岛|古堡|守护者|杂技|跃入|第一视角|爆发/],
    ["fashion", /时尚|换装|造型|变装|模特|穿搭|梳妆|墨镜|发色/],
    ["design", /信息图|海报|地图|卡片|引言卡|Slides|专利|拼图|标题图|UI|样机|黑板/i],
    ["anime", /动漫|卡通|像素|涂鸦|彩铅|浮世绘|水彩|手绘/],
    ["cinematic", /恋|情侣|约会|吻|短剧|霸总|新娘|邂逅|心上人|电影感|纪录|直播|对谈|审讯|倾诉|雨夜|指尖/],
    [
        "life",
        /旅行|旅|漫步|散步|游记|城市|街|露营|骑行|美食|烘焙|炸鸡|蛋糕|咖啡|意面|泡菜|厨|健身|晨练|训练|瑜伽|篮球|网球|进球|运动|滑板|猫|狗|兔|鸭|动物|日常|早晨|清晨|午后|家庭|拥抱|一天|通勤|聚会|生日|晚骑|父女|母子|快递|水果|甜点|迷你|微缩|漫游|女孩|女学生/,
    ],
];

const CATEGORY_IDS = new Set<string>(TEMPLATE_CATEGORIES.map((item) => item.id));

function matchKeywords(text: string): TemplateCategoryId | undefined {
    for (const [category, pattern] of KEYWORD_RULES) {
        if (pattern.test(text)) return category;
    }
    return undefined;
}

export function templateCategoryOf(item: Pick<CreationInspiration, "category" | "title" | "description" | "prompt">): TemplateCategoryId {
    const code = item.category?.trim() ?? "";
    // 自建模板直接存统一分类的 id。
    if (CATEGORY_IDS.has(code)) return code as TemplateCategoryId;
    const mapped = code ? CODE_TO_CATEGORY[code] : undefined;
    if (mapped) return mapped;
    // 先看标题和简介；界面切到其他语言时标题会被翻译，再用不翻译的提示词正文兜底。
    return matchKeywords(`${item.title} ${item.description || ""}`) ?? matchKeywords(item.prompt || "") ?? "other";
}

/** 统计各分类的数量：多的排前面，「其他」放最后。两边的分类栏都用它，顺序一致。 */
export function templateCategoryCounts(items: Array<Pick<CreationInspiration, "category" | "title" | "description" | "prompt">>) {
    const counts = new Map<TemplateCategoryId, number>();
    for (const item of items) {
        const id = templateCategoryOf(item);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return TEMPLATE_CATEGORIES.filter((option) => counts.get(option.id))
        .map((option) => ({ id: option.id, label: option.label, count: counts.get(option.id) ?? 0 }))
        .sort((left, right) => (left.id === "other" ? 1 : 0) - (right.id === "other" ? 1 : 0) || right.count - left.count);
}

export function templateCategoryLabel(id: TemplateCategoryId): string {
    return TEMPLATE_CATEGORIES.find((item) => item.id === id)?.label ?? "其他";
}
