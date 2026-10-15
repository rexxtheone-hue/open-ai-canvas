/** AI 导演：把结构化需求编译成画布 Agent 的开场指令。纯函数，便于测试。 */

export type DirectorGenre = "product-ad" | "ugc" | "real-estate" | "food" | "presenter" | "brand-film" | "short-drama" | "free";

export type DirectorGenreDefinition = {
    id: DirectorGenre;
    label: string;
    description: string;
    /** 对应后端场景预设（GET /skills/presets），挂上这组技能再开工。 */
    presetId: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    pointsPlaceholder: string;
};

export const DIRECTOR_GENRES: DirectorGenreDefinition[] = [
    { id: "product-ad", label: "产品广告", description: "卖点清晰、节奏快、结尾行动号召", presetId: "ad-full-chain", subjectLabel: "产品", subjectPlaceholder: "例如：暖杯 316 不锈钢保温杯", pointsPlaceholder: "卖点、使用场景、优惠信息" },
    { id: "ugc", label: "UGC 口播", description: "真人自拍感，口语化种草", presetId: "ad-full-chain", subjectLabel: "产品", subjectPlaceholder: "例如：便携榨汁杯", pointsPlaceholder: "用户痛点、使用感受、想强调的卖点" },
    { id: "real-estate", label: "房地产", description: "外观、社区、样板间", presetId: "ad-full-chain", subjectLabel: "楼盘", subjectPlaceholder: "例如：滨江一号 · 三房两厅", pointsPlaceholder: "位置、户型、配套、价格区间" },
    { id: "food", label: "餐饮探店", description: "门头、环境、上菜、试吃", presetId: "ad-full-chain", subjectLabel: "店铺", subjectPlaceholder: "例如：老街牛肉面", pointsPlaceholder: "招牌菜、环境特色、人均价格" },
    { id: "presenter", label: "数字人讲解", description: "讲解员面对镜头 + 要点字卡", presetId: "ai-performer", subjectLabel: "主题", subjectPlaceholder: "例如：三分钟看懂分期免息", pointsPlaceholder: "要讲的要点，按顺序写" },
    { id: "brand-film", label: "品牌片", description: "电影感讲品牌故事", presetId: "brand-positioning", subjectLabel: "品牌", subjectPlaceholder: "例如：暖杯 WarmCup", pointsPlaceholder: "品牌由来、理念、想传达的情绪" },
    { id: "short-drama", label: "短剧", description: "剧本、角色、分镜到成片", presetId: "short-drama-starter", subjectLabel: "故事", subjectPlaceholder: "例如：外卖小哥意外继承百亿家产", pointsPlaceholder: "主要人物、冲突、反转、结局" },
    { id: "free", label: "自由创作", description: "完全按你的描述来", presetId: "", subjectLabel: "主题", subjectPlaceholder: "你想做什么视频", pointsPlaceholder: "补充要求" },
];

export const DIRECTOR_DURATIONS = [15, 30, 45, 60] as const;
export const DIRECTOR_RATIOS = ["9:16", "16:9", "1:1"] as const;

export type DirectorBrief = {
    genre: DirectorGenre;
    subject: string;
    points: string;
    durationSeconds: number;
    ratio: string;
    style: string;
    voiceover: boolean;
    subtitles: boolean;
    music: boolean;
    budgetCredits: number;
};

export type DirectorContext = {
    brand?: { name: string; prompt: string };
    characters?: Array<{ name: string }>;
    skillIds?: string[];
};

export const DEFAULT_DIRECTOR_BRIEF: DirectorBrief = {
    genre: "product-ad",
    subject: "",
    points: "",
    durationSeconds: 30,
    ratio: "9:16",
    style: "",
    voiceover: true,
    subtitles: true,
    music: true,
    budgetCredits: 300,
};

export const DIRECTOR_BUDGET_MIN = 20;
export const DIRECTOR_BUDGET_MAX = 100000;

export function directorGenre(id: DirectorGenre) {
    return DIRECTOR_GENRES.find((genre) => genre.id === id) || DIRECTOR_GENRES[0];
}

/** 开工前的阻断原因；空字符串表示可以开始。 */
export function directorBriefError(brief: DirectorBrief) {
    const genre = directorGenre(brief.genre);
    if (!brief.subject.trim()) return `请填写${genre.subjectLabel}`;
    if (Array.from(brief.subject.trim()).length > 200) return `${genre.subjectLabel}太长，最多 200 字`;
    if (Array.from(brief.points).length > 2000) return "补充要求太长，最多 2000 字";
    if (!(DIRECTOR_DURATIONS as readonly number[]).includes(brief.durationSeconds)) return "请选择成片时长";
    if (!(DIRECTOR_RATIOS as readonly string[]).includes(brief.ratio)) return "请选择画面比例";
    if (!Number.isFinite(brief.budgetCredits) || brief.budgetCredits < DIRECTOR_BUDGET_MIN || brief.budgetCredits > DIRECTOR_BUDGET_MAX) return `预算上限需要在 ${DIRECTOR_BUDGET_MIN} 到 ${DIRECTOR_BUDGET_MAX} 积分之间`;
    return "";
}

/**
 * 编译开场指令。text 发给 Agent（含技能引用），displayText 显示在对话里。
 * 流程要求与 D1-D6 一致：先出方案和分镜等用户确认，再按镜头生成，最后合成时间线。
 */
export function compileDirectorPrompt(brief: DirectorBrief, context: DirectorContext = {}) {
    const genre = directorGenre(brief.genre);
    const subject = brief.subject.trim();
    const points = brief.points.trim();
    const style = brief.style.trim();
    const deliverables = [brief.voiceover ? "旁白配音" : "", brief.subtitles ? "字幕" : "", brief.music ? "背景音乐" : ""].filter(Boolean);
    const summary = [
        `【AI 导演】${genre.label}：${subject}`,
        `时长 ${brief.durationSeconds} 秒 · ${brief.ratio}${style ? ` · ${style}` : ""}`,
        points ? `要求：${points}` : "",
        context.characters?.length ? `角色：${context.characters.map((item) => item.name).join("、")}` : "",
        context.brand ? `品牌：${context.brand.name}` : "",
        deliverables.length ? `包含：${deliverables.join("、")}` : "",
        `预算上限：${brief.budgetCredits} 积分`,
    ].filter(Boolean);
    const instructions = [
        "请作为导演帮我完成这支视频，按下面的步骤推进：",
        "1. 先写创意方案和分镜脚本（每个镜头写清画面、景别、运镜、台词或旁白、时长），镜头总时长要等于成片时长。写完先停下来等我确认，不要直接生成。",
        "2. 我确认后，再按镜头生成画面和视频；每次生成前告诉我用什么模型、预计花多少积分。",
        context.characters?.length ? "3. 画布上已有的角色卡是本片角色，生成涉及这些角色的画面时必须使用对应角色卡保持形象一致。" : "3. 需要固定形象的角色，先用角色卡建好再生成镜头。",
        `4. 镜头完成后放进时间线，按分镜顺序排好${deliverables.length ? `，并补上${deliverables.join("、")}` : ""}。`,
        `5. 所有生成的总花费不能超过 ${brief.budgetCredits} 积分；预计会超出时先停下来问我。`,
    ];
    const brandBlock = context.brand ? `\n\n品牌要求（所有画面和文案都要符合）：\n${context.brand.prompt}` : "";
    const skillRefs = context.skillIds?.length ? `\n\n参考技能：${context.skillIds.map((id) => `@[skill:${id}]`).join(" ")}` : "";
    const displayText = summary.join("\n");
    const text = `${displayText}\n\n${instructions.join("\n")}${brandBlock}${skillRefs}`;
    return { text, displayText };
}

/** 导演项目在画布列表里的标题前缀，Studio 用它找回导演项目。 */
export const DIRECTOR_TITLE_PREFIX = "AI 导演 · ";
/** 界面语言会翻译前缀，切换语言后仍要认出以前建的导演项目。 */
const DIRECTOR_TITLE_PREFIXES = [DIRECTOR_TITLE_PREFIX, "AI Director · "];

export function directorProjectSubject(title: string) {
    const prefix = DIRECTOR_TITLE_PREFIXES.find((item) => title.startsWith(item));
    return prefix === undefined ? null : title.slice(prefix.length) || title;
}

export function directorProjectTitle(brief: DirectorBrief) {
    const subject = brief.subject.trim().replace(/\s+/g, " ");
    return `${DIRECTOR_TITLE_PREFIX}${Array.from(subject).slice(0, 30).join("") || directorGenre(brief.genre).label}`;
}
