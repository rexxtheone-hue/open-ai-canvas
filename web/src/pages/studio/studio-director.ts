import type { StudioKind, StudioWork } from "@/services/api/studio";
import type { StudioScenePlanInput, StudioShot, StudioShotVersion, StudioStory } from "@/services/api/studio-agents";

/** AI 导演：简报、导演 Agent 的提示词、分镜解析和成片时间线。纯函数，便于测试。 */

export type DirectorGenre = "product-ad" | "ugc" | "real-estate" | "food" | "presenter" | "brand-film" | "short-drama" | "free";

export type DirectorGenreDefinition = {
    id: DirectorGenre;
    label: string;
    description: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    pointsPlaceholder: string;
    /** 给导演的行业写法要点。 */
    guidance: string;
};

export const DIRECTOR_GENRES: DirectorGenreDefinition[] = [
    { id: "product-ad", label: "产品广告", description: "卖点清晰、节奏快、结尾行动号召", subjectLabel: "产品", subjectPlaceholder: "例如：暖杯 316 不锈钢保温杯", pointsPlaceholder: "为什么值得买：卖点、使用场景、优惠信息", guidance: "前 3 秒抓眼球（痛点或惊艳画面），中段逐个展示卖点和使用场景，结尾给出行动号召。" },
    { id: "ugc", label: "UGC 口播", description: "真人自拍感，口语化种草", subjectLabel: "产品", subjectPlaceholder: "例如：便携榨汁杯", pointsPlaceholder: "用户痛点、使用感受、想强调的卖点", guidance: "手机自拍视角、自然光、口语化旁白，像真实用户分享。" },
    { id: "real-estate", label: "房地产", description: "外观、社区、样板间", subjectLabel: "楼盘", subjectPlaceholder: "例如：滨江一号 · 三房两厅", pointsPlaceholder: "位置、户型、配套、价格区间", guidance: "航拍外观开场，依次展示社区配套、样板间空间和采光，结尾给出联系方式。" },
    { id: "food", label: "餐饮探店", description: "门头、环境、上菜、试吃", subjectLabel: "店铺", subjectPlaceholder: "例如：老街牛肉面", pointsPlaceholder: "招牌菜、环境特色、人均价格", guidance: "门头和环境建立氛围，招牌菜特写要有热气和质感，结尾报地址和人均。" },
    { id: "presenter", label: "数字人讲解", description: "讲解员面对镜头 + 要点字卡", subjectLabel: "主题", subjectPlaceholder: "例如：三分钟看懂分期免息", pointsPlaceholder: "要讲的要点，按顺序写", guidance: "讲解员正面中景为主，穿插要点画面，旁白清楚分点。" },
    { id: "brand-film", label: "品牌片", description: "电影感讲品牌故事", subjectLabel: "品牌", subjectPlaceholder: "例如：暖杯 WarmCup", pointsPlaceholder: "品牌由来、理念、想传达的情绪", guidance: "电影感构图和光影，情绪递进，旁白克制有力量。" },
    { id: "short-drama", label: "短剧", description: "剧本、角色、分镜到成片", subjectLabel: "故事", subjectPlaceholder: "例如：外卖小哥意外继承百亿家产", pointsPlaceholder: "主要人物、冲突、反转、结局", guidance: "开场即冲突，人物关系清楚，结尾留反转或悬念。台词写进旁白字段。" },
    { id: "free", label: "自由创作", description: "完全按你的描述来", subjectLabel: "主题", subjectPlaceholder: "你想做什么视频", pointsPlaceholder: "补充要求", guidance: "" },
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
    characterIds: string[];
    brandKitId?: string;
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
    characterIds: [],
};

export type DirectorRunMode = "guide" | "auto";

/** 导演默认模型：用户选过的优先，其次是性价比高的 Gemini Flash，再其次是后台默认对话模型。 */
export const DIRECTOR_DEFAULT_TEXT_MODEL = /gemini 3\.8 flash/i;

export function directorDefaultTextModel(models: string[], label: (model: string) => string, choice: string, configured: string) {
    if (choice && models.includes(choice)) return choice;
    const preferred = models.find((model) => DIRECTOR_DEFAULT_TEXT_MODEL.test(label(model) || model));
    if (preferred) return preferred;
    return models.includes(configured) ? configured : models[0] || "";
}

/** 上游限流或繁忙时依次改用的备用导演模型。 */
const DIRECTOR_FALLBACK_TEXT_MODELS = [/gemini 3\.8 flash/i, /gemini 3\.7 flash/i, /gpt-6 luna/i, /claude sonnet 5(\.5)?$/i];

export function directorFallbackTextModel(models: string[], label: (model: string) => string, current: string) {
    for (const pattern of DIRECTOR_FALLBACK_TEXT_MODELS) {
        const hit = models.find((model) => model !== current && pattern.test(label(model) || model));
        if (hit) return hit;
    }
    return "";
}

export function directorGenre(id: string | undefined) {
    return DIRECTOR_GENRES.find((genre) => genre.id === id) || DIRECTOR_GENRES[DIRECTOR_GENRES.length - 1];
}

/** 开工前的阻断原因；空字符串表示可以开始。 */
export function directorBriefError(brief: DirectorBrief) {
    const genre = directorGenre(brief.genre);
    if (!brief.subject.trim()) return `请填写${genre.subjectLabel}`;
    if (Array.from(brief.subject.trim()).length > 200) return `${genre.subjectLabel}太长，最多 200 字`;
    if (Array.from(brief.points).length > 2000) return "补充要求太长，最多 2000 字";
    if (!(DIRECTOR_DURATIONS as readonly number[]).includes(brief.durationSeconds)) return "请选择成片时长";
    if (!(DIRECTOR_RATIOS as readonly string[]).includes(brief.ratio)) return "请选择画面比例";
    return "";
}

export function directorStoryTitle(brief: Pick<DirectorBrief, "genre" | "subject">) {
    const subject = brief.subject.trim().replace(/\s+/g, " ");
    return Array.from(subject).slice(0, 30).join("") || directorGenre(brief.genre).label;
}

/** 简报写成交给导演的第一条消息。 */
export function directorKickoffMessage(brief: DirectorBrief, characterNames: string[] = []) {
    const genre = directorGenre(brief.genre);
    const deliverables = [brief.voiceover ? "旁白配音" : "", brief.subtitles ? "字幕" : "", brief.music ? "背景音乐" : ""].filter(Boolean);
    return [
        `${genre.label}：${brief.subject.trim()}`,
        `时长 ${brief.durationSeconds} 秒 · ${brief.ratio}${brief.style.trim() ? ` · ${brief.style.trim()}` : ""}`,
        brief.points.trim() ? `要求：${brief.points.trim()}` : "",
        characterNames.length ? `角色：${characterNames.join("、")}` : "",
        deliverables.length ? `包含：${deliverables.join("、")}` : "",
    ].filter(Boolean).join("\n");
}

// ---------------- 分镜 ----------------

export type DirectorShotFields = {
    visual: string;
    camera: string;
    characters: string[];
    /** 镜头所在场景，对应剧本 locations 的名字。 */
    location: string;
    voiceover: string;
    subtitle: string;
};

export type DirectorMemory = {
    decisions: string[];
    constraints: string[];
    action_items: string[];
    open_questions: string[];
    resolved: string[];
    context_notes: string[];
};

export const DIRECTOR_MEMORY_SECTIONS: Array<{ key: keyof DirectorMemory; label: string }> = [
    { key: "decisions", label: "已定方案" },
    { key: "constraints", label: "限制条件" },
    { key: "action_items", label: "待办" },
    { key: "open_questions", label: "待确认" },
    { key: "resolved", label: "已解决" },
    { key: "context_notes", label: "备注" },
];

export type DirectorRunStep = "assets" | "boards" | "images" | "videos" | "voice" | "render";

/** 剧本阶段的产出：剧本正文、主要人物和主要场景。人物三视图、场景图的生成任务记在 taskId 上。 */
export type DirectorDesignAsset = { name: string; description: string; taskId?: string };
export type DirectorDesign = { script: string; cast: DirectorDesignAsset[]; locations: DirectorDesignAsset[] };

function designAssets(value: unknown, maxItems: number): DirectorDesignAsset[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: DirectorDesignAsset[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const name = text(item.name, 40);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const taskId = text(item.taskId, 80);
        result.push({ name, description: text(item.description, 600), ...(taskId ? { taskId } : {}) });
        if (result.length >= maxItems) break;
    }
    return result;
}

export function directorDesign(settings: unknown): DirectorDesign {
    const design = ((settings as { design?: unknown } | undefined)?.design || {}) as Record<string, unknown>;
    return { script: text(design.script, 12000), cast: designAssets(design.cast, 8), locations: designAssets(design.locations, 8) };
}

/** 导演改写人物或场景时，外形描述没变的沿用已生成的图，变了的需要重新生成。 */
export function mergeDirectorDesign(current: DirectorDesign, next: Partial<DirectorDesign>): DirectorDesign {
    const keep = (previous: DirectorDesignAsset[], incoming?: DirectorDesignAsset[]) => (incoming
        ? incoming.map((item) => {
            const old = previous.find((entry) => entry.name === item.name);
            return old?.taskId && old.description === item.description ? { ...item, taskId: old.taskId } : { name: item.name, description: item.description };
        })
        : previous);
    return { script: next.script ?? current.script, cast: keep(current.cast, next.cast), locations: keep(current.locations, next.locations) };
}

/** 制作方式：board 每段先出一张分镜板再一次生成整段视频；shots 逐个镜头生成画面和视频。 */
export type DirectorProductionMode = "board" | "shots";

/** 显式设置优先；旧项目已有逐镜头产物时沿用逐镜头，避免把镜头画面误当成分镜板。 */
export function directorProductionMode(story: Pick<StudioStory, "settings" | "versions">): DirectorProductionMode {
    const mode = (story.settings as { mode?: unknown } | undefined)?.mode;
    if (mode === "board" || mode === "shots") return mode;
    return "shots";
}

export type DirectorRunAction = {
    id: string;
    step: DirectorRunStep;
    /** 镜头编号（1 开始，按分镜顺序）；为空表示全部镜头。 */
    shots?: number[];
    status: "proposed" | "done" | "skipped" | "failed";
    error?: string;
};

export type DirectorPlan = {
    title?: string;
    memory?: Partial<DirectorMemory>;
    /** 剧本阶段可以只给剧本、人物和场景，scenes 为空表示分镜还没写。 */
    design?: Partial<DirectorDesign>;
    scenes: StudioScenePlanInput[];
};

const PLAN_BLOCK = /```studio-plan\s*([\s\S]*?)```/g;
const RUN_BLOCK = /```studio-run\s*([\s\S]*?)```/g;
const ASK_BLOCK = /```studio-ask\s*([\s\S]*?)```/g;
const MAX_SHOT_SECONDS = 15;

function text(value: unknown, max: number) {
    return typeof value === "string" ? Array.from(value.trim()).slice(0, max).join("") : "";
}

function stringList(value: unknown, maxItems: number, maxChars: number) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => text(item, maxChars)).filter(Boolean).slice(0, maxItems);
}

export function directorShotFields(shot: Pick<StudioShot, "fields">): DirectorShotFields {
    const fields = shot.fields || {};
    return { visual: text(fields.visual, 2000), camera: text(fields.camera, 200), characters: stringList(fields.characters, 6, 40), location: text(fields.location, 40), voiceover: text(fields.voiceover, 1000), subtitle: text(fields.subtitle, 200) };
}

/** 按场景顺序展开的镜头，编号从 1 开始，与导演对话里的「镜头 n」一致。 */
export function directorOrderedShots(story: Pick<StudioStory, "scenes" | "shots">) {
    const sceneOrder = new Map(story.scenes.map((scene) => [scene.id, scene.sort]));
    return [...story.shots].sort((left, right) => (sceneOrder.get(left.sceneId) ?? 0) - (sceneOrder.get(right.sceneId) ?? 0) || left.sort - right.sort);
}

export function directorMemory(value: unknown): DirectorMemory {
    const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const memory = {} as DirectorMemory;
    for (const section of DIRECTOR_MEMORY_SECTIONS) memory[section.key] = stringList(source[section.key], 20, 300);
    return memory;
}

/** 当前分镜写成紧凑 JSON 交给导演，镜头带 ID，修改时保留 ID 才能保留已生成的版本。 */
export function directorPlanSnapshot(story: Pick<StudioStory, "scenes" | "shots">) {
    const shots = directorOrderedShots(story);
    return story.scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        description: scene.description,
        shots: shots.filter((shot) => shot.sceneId === scene.id).map((shot) => ({ id: shot.id, no: shots.indexOf(shot) + 1, duration: shot.durationSeconds, ...directorShotFields(shot) })),
    }));
}

export type DirectorPromptContext = {
    story: Pick<StudioStory, "title" | "ratio" | "durationSeconds" | "scenes" | "shots" | "brief" | "memory" | "settings" | "versions">;
    characters: Array<{ name: string; description: string }>;
    brand?: string;
    kinds: StudioKind[];
};

export function directorSystemPrompt(context: DirectorPromptContext) {
    const brief = (context.story.brief || {}) as Partial<DirectorBrief>;
    const genre = directorGenre(brief.genre);
    const plan = directorPlanSnapshot(context.story);
    const memory = directorMemory(context.story.memory);
    const boardMode = directorProductionMode(context.story) === "board";
    const design = directorDesign(context.story.settings);
    const capabilities = [
        context.kinds.includes("image") ? "镜头画面（图片）" : "",
        context.kinds.includes("video") ? "镜头视频" : "",
        context.kinds.includes("audio") ? "旁白配音" : "",
    ].filter(Boolean).join("、") || "暂无";
    return [
        "你是 AI Studio 的视频导演，和用户一起把想法做成成片。用用户的语言简洁回复。",
        `项目：${context.story.title}；画面比例 ${context.story.ratio}；目标时长 ${context.story.durationSeconds} 秒；类型：${genre.label}。`,
        genre.guidance ? `类型写法：${genre.guidance}` : "",
        `系统可以生成：${capabilities}，最后合成为一条带背景音乐、旁白和字幕的视频。`,
        "",
        "制作流程，按顺序推进；每一步完成后用选择题请用户确认，再进入下一步：",
        "第一步 剧本：用户给的通常只是一个概念。先把概念发展成完整剧本：故事梗概、主要人物、主要场景、按场次写清情节和台词或旁白，时长要和目标时长相符。写进 studio-plan 的 script 字段，同时列出 cast（主要人物：年龄、长相、发型、服装要写具体）和 locations（主要场景：环境、时间、光线要写具体）。这一步 scenes 留空。",
        "第二步 分镜：剧本确认后，按剧本拆成分镜写进 scenes。每个镜头的 characters 用 cast 或角色清单里的名字，location 用 locations 里的名字。",
        `第三步 人物三视图和场景图：分镜确认后输出 {"step":"assets"}，系统为每个人物生成三视图（正面全身、背面全身、面部特写），为每个场景生成场景图，之后所有画面都以它们为参考。`,
        boardMode
            ? `第四步 分镜板：输出 {"step":"boards"}。系统把相邻镜头按每段最多 ${DIRECTOR_SEGMENT_MAX_SECONDS} 秒、${DIRECTOR_SEGMENT_MAX_SHOTS} 个镜头分成一段，每段以三视图和场景图为参考生成一张分镜板。每个镜头 2 到 5 秒最合适，同一段的镜头放在同一场景，景别要有变化。`
            : `第四步 关键帧：输出 {"step":"images"}。系统为每个镜头生成一张关键帧，以出镜人物的三视图和所在场景的场景图为参考，保证人物和场景前后一致。`,
        boardMode
            ? `第五步 视频：分镜板确认后输出 {"step":"videos"}，系统按分镜板一次生成整段视频；再输出 {"step":"voice"} 生成配音、{"step":"render"} 合成成片。`
            : `第五步 视频：关键帧确认后输出 {"step":"videos"}，系统把每张关键帧做成视频；再输出 {"step":"voice"} 生成配音、{"step":"render"} 合成成片。`,
        "",
        "输出格式：",
        "1. 剧本或分镜有新增或修改时，在回复末尾附上完整内容（不是增量）：",
        "```studio-plan",
        '{"title":"项目名","script":"完整剧本","cast":[{"name":"人物名","description":"外形描述"}],"locations":[{"name":"场景名","description":"环境描述"}],"memory":{"decisions":[],"constraints":[],"action_items":[],"open_questions":[],"resolved":[],"context_notes":[]},"scenes":[{"id":"保留原 ID","title":"场次名","description":"场次说明","shots":[{"id":"保留原 ID","duration":4,"visual":"画面内容，写清主体、动作、环境、光线、风格","camera":"景别与运镜","characters":["人物名"],"location":"场景名","voiceover":"这一镜的旁白或台词","subtitle":"屏幕字幕"}]}]}',
        "```",
        `   - 每个镜头 2 到 ${MAX_SHOT_SECONDS} 秒，所有镜头时长加起来等于目标时长。修改已有镜头时必须带上原来的 id；新镜头不写 id。`,
        "   - 人物和场景名字前后保持一致；改了人物或场景的外形描述，系统会重新生成它的三视图或场景图。",
        "   - 旁白必须能在这一镜的时长内读完：中文每秒最多 4 个字，英文每秒最多 2.5 个词，超出就精简或加长镜头。",
        "   - memory 记录本项目的决定、限制、待办、待确认问题和备注，每次输出完整内容。",
        "2. 要执行生成时，在回复末尾附上执行指令，一次只写一个：",
        "```studio-run",
        '{"step":"assets"}',
        "```",
        "   - step：assets（人物三视图和场景图）、" + (boardMode ? "boards（分镜板）" : "images（关键帧）") + "、videos（视频）、voice（旁白配音）、render（合成成片）。shots 是镜头编号，省略表示全部镜头。执行前系统会自动显示积分报价，你不用自己估价。",
        "3. 需要用户在几个选项里选一个时（确认剧本、画幅、风格、方向等），在回复末尾附上选择题，用户点选后会以「Q：… A：…」发回：",
        "```studio-ask",
        '{"question":"问题","options":["选项一","选项二"]}',
        "```",
        "   - 一次只问一个问题，最多 6 个选项，选项写成用户能直接点的短句。能自己合理决定的就不要问。",
        "4. 没有把握的地方先问用户。不要编造链接，不要声称已生成完成；生成由系统执行，进度显示在右侧面板。",
        "",
        context.characters.length ? `用户角色库里的角色（已有形象，不需要再生成三视图）：\n${context.characters.map((item) => `- ${item.name}${item.description ? `：${item.description}` : ""}`).join("\n")}` : "用户角色库里的角色：（无）",
        context.brand ? `\n品牌要求（所有画面和文案都要符合）：\n${context.brand}` : "",
        design.script ? `\n当前剧本：\n${design.script}` : "\n当前剧本：（还没有）",
        `\n当前人物：${design.cast.length ? JSON.stringify(design.cast.map(({ name, description }) => ({ name, description }))) : "（还没有）"}`,
        `\n当前场景：${design.locations.length ? JSON.stringify(design.locations.map(({ name, description }) => ({ name, description }))) : "（还没有）"}`,
        `\n当前分镜：${plan.length ? JSON.stringify(plan) : "（还没有）"}`,
        `\n项目记忆：${JSON.stringify(memory)}`,
    ].filter((line) => line !== undefined).join("\n");
}

/** 流式输出时隐藏还没写完的代码块。 */
export function directorVisibleText(value: string) {
    const starts = [value.indexOf("```studio-plan"), value.indexOf("```studio-run"), value.indexOf("```studio-ask")].filter((index) => index >= 0);
    return (starts.length ? value.slice(0, Math.min(...starts)) : value).trimEnd();
}

function parseJSONBlock(value: string, pattern: RegExp) {
    const matches = [...value.matchAll(pattern)];
    if (!matches.length) return { found: false, value: undefined as unknown };
    try {
        return { found: true, value: JSON.parse(matches[matches.length - 1][1].trim()) as unknown };
    } catch {
        return { found: true, value: undefined as unknown };
    }
}

/** 校验导演输出的分镜：丢弃空镜头，时长限制在 1 到 15 秒，角色只认清单里的名字。 */
export function parseDirectorPlan(value: unknown, characterNames: string[]): DirectorPlan | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const known = new Set([...characterNames, ...designAssets(source.cast, 8).map((item) => item.name)]);
    const scenes: StudioScenePlanInput[] = [];
    let shotCount = 0;
    for (const rawScene of Array.isArray(source.scenes) ? source.scenes : []) {
        if (!rawScene || typeof rawScene !== "object") continue;
        const scene = rawScene as Record<string, unknown>;
        const shots: StudioScenePlanInput["shots"] = [];
        for (const rawShot of Array.isArray(scene.shots) ? scene.shots : []) {
            if (!rawShot || typeof rawShot !== "object" || shotCount >= 60) continue;
            const shot = rawShot as Record<string, unknown>;
            const visual = text(shot.visual, 2000);
            if (!visual) continue;
            const duration = Number(shot.duration ?? shot.durationSeconds);
            const fields: DirectorShotFields = {
                visual,
                camera: text(shot.camera, 200),
                characters: stringList(shot.characters, 6, 40).filter((name) => known.has(name)),
                location: text(shot.location, 40),
                voiceover: text(shot.voiceover, 1000),
                subtitle: text(shot.subtitle, 200),
            };
            shots.push({ ...(typeof shot.id === "string" && shot.id.trim() ? { id: shot.id.trim() } : {}), durationSeconds: Number.isFinite(duration) ? Math.min(MAX_SHOT_SECONDS, Math.max(1, Math.round(duration))) : 4, fields });
            shotCount += 1;
        }
        if (!shots.length) continue;
        scenes.push({ ...(typeof scene.id === "string" && scene.id.trim() ? { id: scene.id.trim() } : {}), title: text(scene.title, 80) || `场景 ${scenes.length + 1}`, description: text(scene.description, 2000), shots });
    }
    const design: Partial<DirectorDesign> = {};
    if (typeof source.script === "string" && source.script.trim()) design.script = text(source.script, 12000);
    if (Array.isArray(source.cast)) design.cast = designAssets(source.cast, 8);
    if (Array.isArray(source.locations)) design.locations = designAssets(source.locations, 8);
    const hasDesign = Object.keys(design).length > 0;
    if (!scenes.length && !hasDesign) return null;
    return { title: text(source.title, 60) || undefined, memory: source.memory ? directorMemory(source.memory) : undefined, ...(hasDesign ? { design } : {}), scenes };
}

export function parseDirectorRun(value: unknown, shotCount: number, newId: () => string = () => crypto.randomUUID()): DirectorRunAction | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const step = source.step;
    if (step !== "assets" && step !== "boards" && step !== "images" && step !== "videos" && step !== "voice" && step !== "render") return null;
    const action: DirectorRunAction = { id: newId(), step, status: "proposed" };
    if (Array.isArray(source.shots) && step !== "render" && step !== "assets") {
        const shots = [...new Set(source.shots.map(Number).filter((no) => Number.isInteger(no) && no >= 1 && no <= shotCount))].sort((left, right) => left - right);
        if (shots.length) action.shots = shots;
    }
    return action;
}

export type DirectorAsk = { question: string; options: string[] };

export function parseDirectorAsk(value: unknown): DirectorAsk | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const question = text(source.question, 200);
    const options = [...new Set(stringList(source.options, 6, 120))];
    return question && options.length >= 2 ? { question, options } : null;
}

/** 选择题以代码块形式留在消息正文里，显示时再拆成文字和选项卡。 */
export function directorAskBlock(ask: DirectorAsk) {
    return ["```studio-ask", JSON.stringify(ask), "```"].join("\n");
}

export function directorMessageParts(content: string): { text: string; ask: DirectorAsk | null } {
    const block = parseJSONBlock(content, ASK_BLOCK);
    return { text: content.replace(ASK_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim(), ask: block.found ? parseDirectorAsk(block.value) : null };
}

export function directorAskAnswer(ask: DirectorAsk, option: string) {
    return `Q：${ask.question}\nA：${option}`;
}

/** 解析导演回复：正文、分镜、执行指令、选择题。分镜无效时 planInvalid 为 true，正文照常显示。 */
export function parseDirectorReply(value: string, options: { characterNames: string[]; shotCount: number; newId?: () => string }) {
    const content = value.replace(PLAN_BLOCK, "").replace(RUN_BLOCK, "").replace(ASK_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
    const planBlock = parseJSONBlock(value, PLAN_BLOCK);
    const plan = planBlock.found ? parseDirectorPlan(planBlock.value, options.characterNames) : null;
    const runBlock = parseJSONBlock(value, RUN_BLOCK);
    const shotCount = plan ? plan.scenes.reduce((sum, scene) => sum + scene.shots.length, 0) : options.shotCount;
    const run = runBlock.found ? parseDirectorRun(runBlock.value, shotCount, options.newId) : null;
    const askBlock = parseJSONBlock(value, ASK_BLOCK);
    const ask = askBlock.found ? parseDirectorAsk(askBlock.value) : null;
    return { content, plan, planInvalid: planBlock.found && !plan, run, ask };
}

// ---------------- 生成 ----------------

export type DirectorCharacter = { id: string; name: string; description: string; imageResourceIds: string[] };

export function directorShotCharacters(fields: DirectorShotFields, characters: DirectorCharacter[]) {
    return fields.characters.map((name) => characters.find((item) => item.name === name)).filter((item): item is DirectorCharacter => Boolean(item));
}

/** 镜头画面的提示词：画面 + 景别 + 角色外形 + 整体风格。品牌要求由生成层追加。 */
export function directorImagePrompt(fields: DirectorShotFields, characters: DirectorCharacter[], style: string) {
    const cast = directorShotCharacters(fields, characters).filter((item) => item.description.trim());
    return [
        fields.visual,
        fields.camera ? `镜头：${fields.camera}` : "",
        cast.length ? `角色外形：${cast.map((item) => `${item.name}（${item.description.trim()}）`).join("；")}` : "",
        style.trim() ? `风格：${style.trim()}` : "",
        "画面中不要出现文字和水印",
    ].filter(Boolean).join("。");
}

// ---------------- 人物三视图、场景图、关键帧 ----------------

const TURNAROUND_LAYOUT = [
    "arranged as three vertical panels side by side, separated by thin black dividers, on a plain neutral grey studio background:",
    "- LEFT PANEL: FULL-BODY front view, standing straight, the entire outfit visible head to toe (top, jacket, pants, shoes, belt, accessories all clearly shown).",
    "- MIDDLE PANEL: FULL-BODY back view, same standing pose, showing how the outfit looks from behind.",
    "- RIGHT PANEL: a CLOSE-UP portrait of the face and shoulders (3/4 angle), large in frame, so every facial detail is crystal clear — eyes, skin, hair, expression.",
    "All three must be the EXACT same person — identical face, hairstyle, hair colour, features, body, and the same complete outfit. Only the angle and framing differ.",
    "Lighting: soft even studio lighting, neutral grey seamless background, professional fashion-lookbook / character-sheet look.",
    "Realism (very important): skin must show real pores, fine lines, natural texture and imperfections — no smoothing, no plastic look, no 3D-render feel; natural skin tone affected by ambient light; it must look like a real person photographed in a studio, not a retouched fake human.",
];

/** 人物三视图：有参考照片时按照片里的人生成，只有文字时按外形描述生成；版式和写实要求一致。 */
export function directorTurnaroundPrompt(asset: Pick<DirectorDesignAsset, "name" | "description">, options: { hasPhoto: boolean; style: string }) {
    const opening = options.hasPhoto
        ? "Based on the person image, generate a character reference sheet of the EXACT same person,"
        : `Generate a character reference sheet of one person matching this description — ${asset.name}: ${asset.description || "an ordinary adult"} —`;
    return [
        `${opening} ${TURNAROUND_LAYOUT[0]}`,
        ...TURNAROUND_LAYOUT.slice(1),
        options.hasPhoto && asset.description ? `Character notes: ${asset.name} — ${asset.description}.` : "",
        options.style.trim() ? `Overall look of the production: ${options.style.trim()}.` : "",
        "No text, labels or watermarks.",
    ].filter(Boolean).join("\n");
}

/** 场景图：不带人物的环境参考，后续关键帧以它保持场景一致。 */
export function directorLocationPrompt(asset: Pick<DirectorDesignAsset, "name" | "description">, options: { style: string }) {
    return [
        `Environment reference image of the location "${asset.name}": ${asset.description}.`,
        "Wide establishing view of the empty location, no people, showing the layout, key props, materials, time of day and lighting clearly so it can be reused as a set reference.",
        options.style.trim() ? `Style: ${options.style.trim()}.` : "Style: photorealistic cinematic still, natural motivated light, real materials and textures.",
        "No text, labels or watermarks.",
    ].join("\n");
}

/** 关键帧提示词：参考图依次是出镜人物的三视图和场景图，只用来保持人物外形和环境一致。 */
export function directorKeyframePrompt(fields: DirectorShotFields, options: { style: string; cast: string[]; location: string; ratio: string }) {
    const refs = [
        ...options.cast.map((name, index) => `参考图 ${index + 1} 是「${name}」的三视图`),
        options.location ? `参考图 ${options.cast.length + 1} 是场景「${options.location}」` : "",
    ].filter(Boolean);
    return [
        fields.visual,
        fields.camera ? `镜头：${fields.camera}` : "",
        refs.length ? `${refs.join("，")}。人物的长相、发型、服装必须和三视图完全一致，环境必须和场景图一致；只画这一个镜头的完整画面，不要画成三视图、拼图或分格` : "",
        `画幅 ${options.ratio}`,
        options.style.trim() ? `风格：${options.style.trim()}` : "",
        "画面中不要出现文字和水印",
    ].filter(Boolean).join("。");
}

export type DirectorDesignTarget = { kind: "cast" | "location"; asset: DirectorDesignAsset };

/** 需要生成三视图或场景图的人物和场景：已有角色库形象的人物跳过，已生成或正在生成的跳过。 */
export function directorDesignTargets(design: DirectorDesign, works: Map<string, StudioWork>, libraryNames: string[]): DirectorDesignTarget[] {
    const pending = (asset: DirectorDesignAsset) => {
        const work = asset.taskId ? works.get(asset.taskId) : undefined;
        if (!asset.taskId) return true;
        if (!work) return false;
        return work.status === "failed" || work.status === "cancelled";
    };
    return [
        ...design.cast.filter((asset) => !libraryNames.includes(asset.name) && pending(asset)).map((asset) => ({ kind: "cast" as const, asset })),
        ...design.locations.filter(pending).map((asset) => ({ kind: "location" as const, asset })),
    ];
}

export function directorVideoPrompt(fields: DirectorShotFields, style: string) {
    return [fields.visual, fields.camera ? `运镜：${fields.camera}` : "", style.trim() ? `风格：${style.trim()}` : ""].filter(Boolean).join("。");
}

export type DirectorVersionIndex = Map<string, StudioShotVersion>;

export function directorVersionIndex(story: Pick<StudioStory, "versions">): DirectorVersionIndex {
    return new Map(story.versions.map((version) => [version.id, version]));
}

export function directorActiveWork(shot: StudioShot, kind: "image" | "video" | "audio", versions: DirectorVersionIndex): StudioWork | undefined {
    const id = kind === "image" ? shot.activeImageVersionId : kind === "video" ? shot.activeVideoVersionId : shot.activeVoiceVersionId;
    return id ? versions.get(id)?.work : undefined;
}

export function directorWorkReady(work: StudioWork | undefined) {
    return Boolean(work && work.status === "succeeded" && work.media[0]?.storageKey);
}

export function directorWorkActive(work: StudioWork | undefined) {
    return Boolean(work && (work.status === "queued" || work.status === "running"));
}

/** 某一步需要处理的镜头：已有可用结果或正在生成的跳过，视频还要求画面已就绪。 */
export function directorStepTargets(story: Pick<StudioStory, "scenes" | "shots" | "versions">, step: "images" | "videos" | "voice", numbers?: number[]) {
    const shots = directorOrderedShots(story);
    const versions = directorVersionIndex(story);
    const picked = numbers?.length ? shots.filter((_, index) => numbers.includes(index + 1)) : shots;
    const explicit = Boolean(numbers?.length);
    return picked.filter((shot) => {
        const kind = step === "images" ? "image" : step === "videos" ? "video" : "audio";
        const work = directorActiveWork(shot, kind, versions);
        if (directorWorkActive(work)) return false;
        // 点名重做的镜头即使已有结果也重新生成；全部生成时只补缺。
        if (!explicit && directorWorkReady(work)) return false;
        if (step === "videos") return directorWorkReady(directorActiveWork(shot, "image", versions));
        if (step === "voice") return Boolean(directorShotFields(shot).voiceover);
        return true;
    });
}

// ---------------- 分镜板 ----------------

export const DIRECTOR_SEGMENT_MAX_SECONDS = 15;
export const DIRECTOR_SEGMENT_MAX_SHOTS = 4;

/** 一段 = 相邻镜头按时长和数量上限合并；分镜板和整段视频都登记在段落第一个镜头（anchor）上。 */
export type DirectorSegment = {
    no: number;
    anchor: StudioShot;
    shots: StudioShot[];
    /** 镜头在全片中的编号（1 开始）。 */
    shotNumbers: number[];
    seconds: number;
};

export function directorSegments(story: Pick<StudioStory, "scenes" | "shots">): DirectorSegment[] {
    const segments: DirectorSegment[] = [];
    directorOrderedShots(story).forEach((shot, index) => {
        const last = segments[segments.length - 1];
        const seconds = Math.max(1, shot.durationSeconds);
        if (last && last.shots.length < DIRECTOR_SEGMENT_MAX_SHOTS && last.seconds + seconds <= DIRECTOR_SEGMENT_MAX_SECONDS) {
            last.shots.push(shot);
            last.shotNumbers.push(index + 1);
            last.seconds += seconds;
            return;
        }
        segments.push({ no: segments.length + 1, anchor: shot, shots: [shot], shotNumbers: [index + 1], seconds });
    });
    return segments;
}

export function directorSegmentOfShot(segments: DirectorSegment[], shotId: string) {
    return segments.find((segment) => segment.shots.some((shot) => shot.id === shotId));
}

function shotLabel(no: number) {
    return `SHOT ${String(no).padStart(2, "0")}`;
}

function segmentCast(segment: DirectorSegment, characters: DirectorCharacter[]) {
    const names = new Set(segment.shots.flatMap((shot) => directorShotFields(shot).characters));
    return characters.filter((item) => names.has(item.name));
}

/**
 * 分镜板提示词：一张 16:9 的制作分镜表，左栏是角色和场景参考、镜头表，右侧是编号画面。
 * 由程序按固定版式拼出，不额外调用对话模型；画面内容来自导演写好的分镜。
 */
export function directorBoardPrompt(segment: DirectorSegment, characters: DirectorCharacter[], options: { style: string; ratio: string }) {
    const cast = segmentCast(segment, characters);
    const frames = segment.shots.length;
    const portrait = options.ratio === "9:16" || options.ratio === "3:4" || options.ratio === "4:5";
    const columns = frames <= 2 ? frames : portrait ? frames : 2;
    const rows = Math.ceil(frames / columns);
    const shotLines = segment.shots.map((shot, index) => {
        const fields = directorShotFields(shot);
        return `${shotLabel(index + 1)} (${shot.durationSeconds}s) — ${fields.visual}${fields.camera ? ` Camera: ${fields.camera}.` : ""}${fields.characters.length ? ` Characters: ${fields.characters.join(", ")}.` : ""}`;
    });
    return [
        "A single premium pre-production storyboard sheet on a clean warm-white background, overall canvas 16:9 landscape, elegant editorial layout with crisp sans-serif labels and generous empty gutters.",
        "LAYOUT: a narrow left column (no wider than 22% of the sheet) holds CHARACTER REFERENCE (each character shown front, three-quarter and side view with identical face, hair and wardrobe), ENVIRONMENT reference of the location, and a small SHOT TABLE (#, action, lens / camera move).",
        `The large right area holds exactly ${frames} numbered storyboard frame${frames > 1 ? "s" : ""} in a ${columns}-column by ${rows}-row grid. Every frame is an equal ${options.ratio} rectangle with a thin complete border and its caption OUTSIDE below the frame in the form "SHOT 0N · shot size · action". Keep wide empty gutters between frames; frames never touch or overlap.`,
        "CONTINUITY: every frame shows the same characters with identical faces, hair and wardrobe, in the same location with consistent lighting and color palette, so the sheet reads as one continuous scene.",
        options.style.trim() ? `VISUAL STYLE: ${options.style.trim()}.` : "VISUAL STYLE: photorealistic cinematic stills, natural motivated light, shallow depth of field.",
        "FRAMES:",
        ...shotLines,
        cast.length ? `CHARACTERS: ${cast.map((item) => `${item.name}${item.description.trim() ? ` — ${item.description.trim()}` : ""}`).join("; ")}.` : "",
        "No logos or watermarks; text appears only in labels and captions.",
    ].filter(Boolean).join("\n");
}

/** 整段视频提示词：把分镜板当参考图，按编号顺序拍成一段剪接好的视频，不能把分镜板本身画出来。 */
export function directorBoardVideoPrompt(segment: DirectorSegment, options: { style: string; ratio: string }) {
    let cursor = 0;
    const timing = segment.shots.map((shot, index) => {
        const fields = directorShotFields(shot);
        const start = cursor;
        cursor += shot.durationSeconds;
        return `${shotLabel(index + 1)} (${start}–${cursor}s): ${fields.visual}${fields.camera ? ` Camera: ${fields.camera}.` : ""}`;
    });
    return [
        `Image 1 is a storyboard design sheet. Film the characters and the location it shows as ONE edited sequence of only its numbered SHOT frames, in order (${shotLabel(1)} to ${shotLabel(segment.shots.length)}), following each frame for framing, angle, camera move, lighting and mood.`,
        `Do NOT show the sheet itself, its panels, text, tables, captions or grid. Every shot is a separate full-screen ${options.ratio} live shot with a clean cut between shots, never split-screen. The character reference views are identity guidance only, not extra shots.`,
        "Keep every character's face, hair and wardrobe identical in every shot, with exactly one instance of each character per shot.",
        options.style.trim() ? `Style: ${options.style.trim()}.` : "Style: photorealistic cinematic footage, real camera, shallow depth of field.",
        "Shot timing:",
        ...timing,
    ].join("\n");
}

/** 分镜板模式下某一步要处理的段落：点名镜头时处理它们所在的段落并允许重做，否则只补缺。 */
export function directorBoardTargets(story: Pick<StudioStory, "scenes" | "shots" | "versions">, step: "boards" | "videos", numbers?: number[]) {
    const versions = directorVersionIndex(story);
    const segments = directorSegments(story);
    const explicit = Boolean(numbers?.length);
    const picked = explicit ? segments.filter((segment) => segment.shotNumbers.some((no) => numbers!.includes(no))) : segments;
    return picked.filter((segment) => {
        const board = directorActiveWork(segment.anchor, "image", versions);
        const work = step === "boards" ? board : directorActiveWork(segment.anchor, "video", versions);
        if (directorWorkActive(work)) return false;
        if (!explicit && directorWorkReady(work)) return false;
        return step === "videos" ? directorWorkReady(board) : true;
    });
}

// ---------------- 成片 ----------------

export const DIRECTOR_RENDER_SIZE: Record<string, { width: number; height: number }> = {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
};

export type DirectorMusic = { storageKey: string; durationMs?: number; name?: string };

type RenderClip = {
    id: string;
    kind: "video" | "image" | "audio" | "subtitle";
    trackId: string;
    startMs: number;
    durationMs: number;
    sourceStartMs: number;
    sourceDurationMs: number;
    volume: number;
    text?: string;
    directMedia?: { id: string; kind: string; storageKey: string };
};

export type DirectorTimelineClip = RenderClip & { shotNo?: number };

export type DirectorTimeline = {
    version: 2;
    tracks: Array<{ id: string; kind: string; visible: boolean; muted: boolean }>;
    clips: DirectorTimelineClip[];
    durationMs: number;
    width: number;
    height: number;
    mixAudioTracks: true;
};

export const DIRECTOR_MUSIC_VOLUME = 0.2;

/**
 * 按分镜生成成片时间线：视频优先，没有视频的镜头用画面图。旁白从镜头开头起，超出镜头的部分裁掉。
 * 有旁白时压低镜头视频原声，背景音乐 0.2 音量铺满全片。missing 列出没有可用画面的镜头编号。
 */
export function buildDirectorTimeline(story: Pick<StudioStory, "ratio" | "scenes" | "shots" | "versions">, options: { music?: DirectorMusic; subtitles?: boolean; mode?: DirectorProductionMode } = {}) {
    const shots = directorOrderedShots(story);
    const versions = directorVersionIndex(story);
    const clips: DirectorTimelineClip[] = [];
    const missing: number[] = [];
    const longVoice: number[] = [];
    let cursor = 0;
    const shotOverlays = (shot: StudioShot, no: number, startMs: number, duration: number) => {
        const voice = directorActiveWork(shot, "audio", versions);
        if (directorWorkReady(voice)) {
            const voiceMedia = voice!.media[0];
            const length = voiceMedia.durationMs && voiceMedia.durationMs > 0 ? voiceMedia.durationMs : duration;
            if (length > duration + 300) longVoice.push(no);
            const clipped = Math.min(length, duration);
            clips.push({ id: `vo-${shot.id}`, kind: "audio", trackId: "voiceover", startMs, durationMs: clipped, sourceStartMs: 0, sourceDurationMs: clipped, volume: 1, directMedia: { id: voice!.id, kind: "audio", storageKey: voiceMedia.storageKey! }, shotNo: no });
        }
        const subtitle = directorShotFields(shot).subtitle;
        if (options.subtitles !== false && subtitle) clips.push({ id: `s-${shot.id}`, kind: "subtitle", trackId: "subtitle", startMs, durationMs: duration, sourceStartMs: 0, sourceDurationMs: duration, volume: 1, text: subtitle, shotNo: no });
        return directorWorkReady(voice);
    };
    if (options.mode === "board") {
        // 一段视频覆盖段内所有镜头；旁白和字幕仍按镜头在段内的起点摆放，视频比计划短时裁掉超出的镜头。
        for (const segment of directorSegments(story)) {
            const video = directorActiveWork(segment.anchor, "video", versions);
            if (!directorWorkReady(video)) {
                missing.push(...segment.shotNumbers);
                continue;
            }
            const media = video!.media[0];
            const planned = segment.seconds * 1000;
            const duration = media.durationMs && media.durationMs > 0 ? Math.min(planned, media.durationMs) : planned;
            const voiced = segment.shots.some((shot) => directorWorkReady(directorActiveWork(shot, "audio", versions)));
            clips.push({ id: `seg-${segment.anchor.id}`, kind: "video", trackId: "video", startMs: cursor, durationMs: duration, sourceStartMs: 0, sourceDurationMs: duration, volume: voiced ? 0.3 : 1, directMedia: { id: video!.id, kind: media.kind, storageKey: media.storageKey! }, shotNo: segment.shotNumbers[0] });
            let offset = 0;
            segment.shots.forEach((shot, index) => {
                if (offset >= duration) return;
                const length = Math.min(shot.durationSeconds * 1000, duration - offset);
                shotOverlays(shot, segment.shotNumbers[index], cursor + offset, length);
                offset += shot.durationSeconds * 1000;
            });
            cursor += duration;
        }
    } else shots.forEach((shot, index) => {
        const no = index + 1;
        const video = directorActiveWork(shot, "video", versions);
        const image = directorActiveWork(shot, "image", versions);
        const visual = directorWorkReady(video) ? video! : directorWorkReady(image) ? image! : undefined;
        if (!visual) {
            missing.push(no);
            return;
        }
        const media = visual.media[0];
        const planned = Math.max(1000, shot.durationSeconds * 1000);
        const duration = media.kind === "video" && media.durationMs && media.durationMs > 0 ? Math.min(planned, media.durationMs) : planned;
        const clip: DirectorTimelineClip = { id: `v-${shot.id}`, kind: media.kind === "video" ? "video" : "image", trackId: "video", startMs: cursor, durationMs: duration, sourceStartMs: 0, sourceDurationMs: duration, volume: 1, directMedia: { id: visual.id, kind: media.kind, storageKey: media.storageKey! }, shotNo: no };
        clips.push(clip);
        if (shotOverlays(shot, no, cursor, duration)) clip.volume = 0.3;
        cursor += duration;
    });
    if (options.music?.storageKey && cursor > 0) {
        const length = options.music.durationMs && options.music.durationMs > 0 ? Math.min(cursor, options.music.durationMs) : cursor;
        clips.push({ id: "music", kind: "audio", trackId: "music", startMs: 0, durationMs: length, sourceStartMs: 0, sourceDurationMs: length, volume: DIRECTOR_MUSIC_VOLUME, directMedia: { id: "music", kind: "audio", storageKey: options.music.storageKey } });
    }
    const size = DIRECTOR_RENDER_SIZE[story.ratio] || DIRECTOR_RENDER_SIZE["9:16"];
    const timeline: DirectorTimeline = {
        version: 2,
        tracks: [
            { id: "video", kind: "video", visible: true, muted: false },
            { id: "music", kind: "audio", visible: true, muted: false },
            { id: "voiceover", kind: "audio", visible: true, muted: false },
            { id: "subtitle", kind: "subtitle", visible: true, muted: false },
        ],
        clips,
        durationMs: cursor,
        ...size,
        mixAudioTracks: true,
    };
    return { timeline, missing, longVoice };
}

const STEP_LABEL: Record<DirectorRunStep, string> = { assets: "生成人物三视图和场景图", boards: "生成分镜板", images: "生成镜头画面", videos: "生成镜头视频", voice: "生成旁白配音", render: "合成成片" };

export function directorStepLabel(step: DirectorRunStep) {
    return STEP_LABEL[step];
}

export type DirectorMessageLike = { role: "user" | "assistant"; content: string; actions?: DirectorRunAction[] };

/** 导演对话历史：执行指令写成一行摘要，只保留最近若干条，并以用户消息开头。 */
export function directorHistory(messages: DirectorMessageLike[], limit = 24) {
    const history = messages.map((message) => {
        const lines = (message.actions || []).map((action) => `[${STEP_LABEL[action.step]}${action.shots?.length ? `：镜头 ${action.shots.join("、")}` : ""}｜${action.status === "done" ? "已执行" : action.status === "skipped" ? "用户跳过" : action.status === "failed" ? `失败：${action.error || ""}` : "等待确认"}]`);
        return { role: message.role, content: [message.content, ...lines].filter(Boolean).join("\n") || "（无内容）" };
    });
    const recent = history.slice(-limit);
    while (recent[0]?.role === "assistant") recent.shift();
    return recent;
}
