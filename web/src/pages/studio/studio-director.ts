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

export type DirectorRunStep = "images" | "videos" | "voice" | "render";

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
    scenes: StudioScenePlanInput[];
};

const PLAN_BLOCK = /```studio-plan\s*([\s\S]*?)```/g;
const RUN_BLOCK = /```studio-run\s*([\s\S]*?)```/g;
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
    return { visual: text(fields.visual, 2000), camera: text(fields.camera, 200), characters: stringList(fields.characters, 6, 40), voiceover: text(fields.voiceover, 1000), subtitle: text(fields.subtitle, 200) };
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
    story: Pick<StudioStory, "title" | "ratio" | "durationSeconds" | "scenes" | "shots" | "brief" | "memory">;
    characters: Array<{ name: string; description: string }>;
    brand?: string;
    kinds: StudioKind[];
};

export function directorSystemPrompt(context: DirectorPromptContext) {
    const brief = (context.story.brief || {}) as Partial<DirectorBrief>;
    const genre = directorGenre(brief.genre);
    const plan = directorPlanSnapshot(context.story);
    const memory = directorMemory(context.story.memory);
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
        "工作方式：",
        "1. 先写分镜。需要新建或修改分镜时，在回复末尾附上完整分镜（不是增量），格式：",
        "```studio-plan",
        '{"title":"项目名","memory":{"decisions":[],"constraints":[],"action_items":[],"open_questions":[],"resolved":[],"context_notes":[]},"scenes":[{"id":"保留原 ID","title":"场景名","description":"场景说明","shots":[{"id":"保留原 ID","duration":4,"visual":"画面内容，写清主体、动作、环境、光线、风格","camera":"景别与运镜","characters":["角色名"],"voiceover":"这一镜的旁白或台词","subtitle":"屏幕字幕"}]}]}',
        "```",
        `   - 每个镜头 2 到 ${MAX_SHOT_SECONDS} 秒，所有镜头时长加起来等于目标时长。修改已有镜头时必须带上原来的 id；新镜头不写 id。`,
        "   - characters 只能用角色清单里的名字；visual 不要写角色名以外的人名。",
        "   - memory 记录本项目的决定、限制、待办、待确认问题和备注，每次输出完整内容。",
        "2. 用户要求生成时，在回复末尾附上执行指令（可以和分镜同时出现，分镜先保存）：",
        "```studio-run",
        '{"step":"images","shots":[1,2]}',
        "```",
        "   - step：images（镜头画面）、videos（把画面做成视频，需要先有画面）、voice（旁白配音）、render（合成成片）。",
        "   - shots 是镜头编号，省略表示全部镜头。一次只写一个指令。",
        "3. 没有把握的地方先问用户。不要编造链接，不要声称已生成完成；生成由系统执行，进度显示在分镜面板。",
        "",
        context.characters.length ? `角色清单：\n${context.characters.map((item) => `- ${item.name}${item.description ? `：${item.description}` : ""}`).join("\n")}` : "角色清单：（无）",
        context.brand ? `\n品牌要求（所有画面和文案都要符合）：\n${context.brand}` : "",
        `\n当前分镜：${plan.length ? JSON.stringify(plan) : "（还没有）"}`,
        `\n项目记忆：${JSON.stringify(memory)}`,
    ].filter((line) => line !== undefined).join("\n");
}

/** 流式输出时隐藏还没写完的代码块。 */
export function directorVisibleText(value: string) {
    const starts = [value.indexOf("```studio-plan"), value.indexOf("```studio-run")].filter((index) => index >= 0);
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
    if (!Array.isArray(source.scenes)) return null;
    const known = new Set(characterNames);
    const scenes: StudioScenePlanInput[] = [];
    let shotCount = 0;
    for (const rawScene of source.scenes) {
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
                voiceover: text(shot.voiceover, 1000),
                subtitle: text(shot.subtitle, 200),
            };
            shots.push({ ...(typeof shot.id === "string" && shot.id.trim() ? { id: shot.id.trim() } : {}), durationSeconds: Number.isFinite(duration) ? Math.min(MAX_SHOT_SECONDS, Math.max(1, Math.round(duration))) : 4, fields });
            shotCount += 1;
        }
        if (!shots.length) continue;
        scenes.push({ ...(typeof scene.id === "string" && scene.id.trim() ? { id: scene.id.trim() } : {}), title: text(scene.title, 80) || `场景 ${scenes.length + 1}`, description: text(scene.description, 2000), shots });
    }
    if (!scenes.length) return null;
    return { title: text(source.title, 60) || undefined, memory: source.memory ? directorMemory(source.memory) : undefined, scenes };
}

export function parseDirectorRun(value: unknown, shotCount: number, newId: () => string = () => crypto.randomUUID()): DirectorRunAction | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const step = source.step;
    if (step !== "images" && step !== "videos" && step !== "voice" && step !== "render") return null;
    const action: DirectorRunAction = { id: newId(), step, status: "proposed" };
    if (Array.isArray(source.shots) && step !== "render") {
        const shots = [...new Set(source.shots.map(Number).filter((no) => Number.isInteger(no) && no >= 1 && no <= shotCount))].sort((left, right) => left - right);
        if (shots.length) action.shots = shots;
    }
    return action;
}

/** 解析导演回复：正文、分镜、执行指令。分镜无效时 planInvalid 为 true，正文照常显示。 */
export function parseDirectorReply(value: string, options: { characterNames: string[]; shotCount: number; newId?: () => string }) {
    const content = value.replace(PLAN_BLOCK, "").replace(RUN_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
    const planBlock = parseJSONBlock(value, PLAN_BLOCK);
    const plan = planBlock.found ? parseDirectorPlan(planBlock.value, options.characterNames) : null;
    const runBlock = parseJSONBlock(value, RUN_BLOCK);
    const shotCount = plan ? plan.scenes.reduce((sum, scene) => sum + scene.shots.length, 0) : options.shotCount;
    const run = runBlock.found ? parseDirectorRun(runBlock.value, shotCount, options.newId) : null;
    return { content, plan, planInvalid: planBlock.found && !plan, run };
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
export function directorStepTargets(story: Pick<StudioStory, "scenes" | "shots" | "versions">, step: Exclude<DirectorRunStep, "render">, numbers?: number[]) {
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
export function buildDirectorTimeline(story: Pick<StudioStory, "ratio" | "scenes" | "shots" | "versions">, options: { music?: DirectorMusic; subtitles?: boolean } = {}) {
    const shots = directorOrderedShots(story);
    const versions = directorVersionIndex(story);
    const clips: DirectorTimelineClip[] = [];
    const missing: number[] = [];
    const longVoice: number[] = [];
    let cursor = 0;
    shots.forEach((shot, index) => {
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
        const voice = directorActiveWork(shot, "audio", versions);
        const voiceReady = directorWorkReady(voice);
        clips.push({ id: `v-${shot.id}`, kind: media.kind === "video" ? "video" : "image", trackId: "video", startMs: cursor, durationMs: duration, sourceStartMs: 0, sourceDurationMs: duration, volume: voiceReady ? 0.3 : 1, directMedia: { id: visual.id, kind: media.kind, storageKey: media.storageKey! }, shotNo: no });
        if (voiceReady) {
            const voiceMedia = voice!.media[0];
            const length = voiceMedia.durationMs && voiceMedia.durationMs > 0 ? voiceMedia.durationMs : duration;
            if (length > duration + 300) longVoice.push(no);
            const clipped = Math.min(length, duration);
            clips.push({ id: `vo-${shot.id}`, kind: "audio", trackId: "voiceover", startMs: cursor, durationMs: clipped, sourceStartMs: 0, sourceDurationMs: clipped, volume: 1, directMedia: { id: voice!.id, kind: "audio", storageKey: voiceMedia.storageKey! }, shotNo: no });
        }
        const subtitle = directorShotFields(shot).subtitle;
        if (options.subtitles !== false && subtitle) clips.push({ id: `s-${shot.id}`, kind: "subtitle", trackId: "subtitle", startMs: cursor, durationMs: duration, sourceStartMs: 0, sourceDurationMs: duration, volume: 1, text: subtitle, shotNo: no });
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

const STEP_LABEL: Record<DirectorRunStep, string> = { images: "生成镜头画面", videos: "生成镜头视频", voice: "生成旁白配音", render: "合成成片" };

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
