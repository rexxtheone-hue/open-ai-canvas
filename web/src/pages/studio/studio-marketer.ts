import type { Skill, SkillExpert } from "@/services/api/skills";

/** AI Marketer：Studio 对话 + 专家（工作方法 + 固定技能组）。纯函数与静态目录，便于测试。 */

export const MARKETER_DEFAULT_EXPERT = "marketing-expert";

/** 营销模式里显示的专家，顺序即侧栏顺序；其余专家只在专家市场出现。 */
export const MARKETER_EXPERT_IDS = ["marketing-expert", "ecommerce-video-expert", "ad-campaign-expert", "social-content-expert"];

export type MarketerQuickStart = { label: string; expertId: string; prompt: string };

export type MarketerQuickGroup = { id: string; label: string; items: MarketerQuickStart[] };

export const MARKETER_QUICK_GROUPS: MarketerQuickGroup[] = [
    {
        id: "insight",
        label: "市场洞察",
        items: [
            { label: "品类机会", expertId: "marketing-expert", prompt: "帮我找一个有潜力的产品品类。先问清楚我的目标市场、预算和供应链能力，再给出 3 个机会品类、各自的理由、风险和验证方法。" },
            { label: "爆品趋势", expertId: "marketing-expert", prompt: "最近我所在品类有哪些正在起量的爆品和卖点趋势？先问我品类和平台，再按「趋势 / 代表产品 / 为什么火 / 我能怎么跟」整理成表格。" },
            { label: "竞品拆解", expertId: "marketing-expert", prompt: "帮我拆解一个竞品：我会给你链接或截图。请分析它的定位、价格、卖点、内容打法和评价里的痛点，最后告诉我怎么差异化。" },
        ],
    },
    {
        id: "listing",
        label: "商品与评价",
        items: [
            { label: "标题优化", expertId: "marketing-expert", prompt: "帮我优化商品标题和五点卖点。先问我产品、平台和核心关键词，给出 3 个版本并说明每个版本的思路。" },
            { label: "评价洞察", expertId: "marketing-expert", prompt: "我会贴一批买家评价，请帮我提炼好评点、差评原因和未被满足的需求，并给出详情页和产品改进建议。" },
            { label: "详情页文案", expertId: "ad-campaign-expert", prompt: "帮我写一套详情页文案：首屏主张、核心卖点、使用场景、信任背书和行动号召。先问清楚产品和目标人群。" },
        ],
    },
    {
        id: "content",
        label: "内容与达人",
        items: [
            { label: "UGC 脚本", expertId: "ecommerce-video-expert", prompt: "为我的产品写 3 条 15-30 秒的 TikTok UGC 带货脚本，三种不同钩子，用表格写清时间段、画面、台词和卖点。" },
            { label: "带货视频", expertId: "ecommerce-video-expert", prompt: "用我上传的产品图做一条带货短视频：先给分镜脚本，我确认后再生成关键帧和视频。" },
            { label: "小红书种草", expertId: "social-content-expert", prompt: "为我的产品策划 5 篇小红书素人种草笔记：标题、封面文案、正文要点和话题标签。" },
        ],
    },
    {
        id: "ads",
        label: "广告投放",
        items: [
            { label: "素材矩阵", expertId: "ad-campaign-expert", prompt: "围绕我的核心卖点做一组投放素材矩阵：痛点型、结果型、反常识型 3 个钩子，每个写明测试假设、文案和画面。" },
            { label: "投放计划", expertId: "ad-campaign-expert", prompt: "帮我做一份 30 天的广告投放计划：受众分层、素材节奏、预算分配和每周复盘指标。先问清楚预算和平台。" },
            { label: "ROAS 复盘", expertId: "ad-campaign-expert", prompt: "我会贴上投放数据，请帮我复盘 ROAS：哪些素材和人群该加预算、哪些该停，以及下一轮测试什么。" },
        ],
    },
];

export type MarketerShowcase = { title: string; description: string; expertId: string; prompt: string; gradient: string };

export const MARKETER_SHOWCASES: MarketerShowcase[] = [
    {
        title: "营销洞察报告",
        description: "一句话说出你的生意，拿到市场、竞品和机会的完整判断",
        expertId: "marketing-expert",
        prompt: "给我做一份营销洞察报告：先了解我的产品和市场，然后分析市场机会、主要竞品、目标人群和三个最值得做的增长动作。",
        gradient: "linear-gradient(135deg, #3b1d6e 0%, #a23cff 55%, #ff7ad9 100%)",
    },
    {
        title: "产品图变带货视频",
        description: "上传产品图，自动写脚本、出关键帧、生成 UGC 带货视频",
        expertId: "ecommerce-video-expert",
        prompt: "我会上传产品图，请帮我做一条 TikTok UGC 带货视频：先选模版写分镜脚本，我确认后再生成。",
        gradient: "linear-gradient(135deg, #1d3b6e 0%, #3c8dff 55%, #7af0ff 100%)",
    },
    {
        title: "爆款广告复刻",
        description: "拆解一条爆款广告的结构，换成你的产品重新做一条",
        expertId: "ad-campaign-expert",
        prompt: "我会给你一条爆款广告，请拆解它的钩子、节奏和卖点结构，然后用我的产品复刻一条新的广告脚本和画面。",
        gradient: "linear-gradient(135deg, #6e1d2c 0%, #ff5c5c 55%, #ffc27a 100%)",
    },
    {
        title: "小红书种草套装",
        description: "一次拿到多篇笔记的标题、封面、正文和配图",
        expertId: "social-content-expert",
        prompt: "为我的产品做一套小红书种草内容：5 篇笔记的标题、封面文案、正文和配图提示词，风格要像真实用户分享。",
        gradient: "linear-gradient(135deg, #1d6e4a 0%, #2fd18b 55%, #d6ff7a 100%)",
    },
];

/** Studio 对话没有画布工具；专家工作方法里提到画布的地方按本对话的素材理解。 */
const STUDIO_EXPERT_NOTE = [
    "## 在 Studio 对话中工作",
    "- 这里没有画布：工作方法里说的「画布节点」「产品参考资产」，就是本对话里的素材编号 #n。",
    "- 需要出图、出视频、配音时，按系统要求的生成计划格式给出计划；生成前把关键参数说清楚。",
    "- 不编造数据；用户没给的数据，说明缺什么、去哪里拿。",
].join("\n");

export function studioExpertPrompt(expert: Pick<SkillExpert, "name" | "persona">) {
    return `# 当前专家：${expert.name}\n\n${expert.persona.trim()}\n\n${STUDIO_EXPERT_NOTE}`;
}

function terms(value: string) {
    const text = value.toLowerCase();
    const words = text.match(/[a-z0-9]{2,}/g) || [];
    const han = text.replace(/[^一-鿿]/g, "");
    const bigrams: string[] = [];
    for (let index = 0; index < han.length - 1; index += 1) bigrams.push(han.slice(index, index + 2));
    return new Set([...words, ...bigrams]);
}

/**
 * 每轮从专家技能组里挑出与本轮需求最相关的几个（Studio 一轮最多注入 max 个技能正文）。
 * 按技能名称和描述与需求的词重合度排序；同分保持专家配置顺序，没有任何重合时取前 max 个。
 */
export function pickExpertSkills(installed: Skill[], expertSkillIds: string[], prompt: string, max: number) {
    const candidates = expertSkillIds.flatMap((id) => installed.filter((skill) => skill.skillId === id && skill.isAdded));
    if (candidates.length <= max) return candidates;
    const wanted = terms(prompt);
    const scored = candidates.map((skill, order) => {
        let score = 0;
        for (const term of terms(`${skill.skillName} ${skill.description || ""}`)) if (wanted.has(term)) score += 1;
        return { skill, order, score };
    });
    scored.sort((left, right) => right.score - left.score || left.order - right.order);
    return scored.slice(0, max).map((item) => item.skill);
}

/** 营销模式下的专家排序：营销专家在前，其余按目录顺序。 */
export function marketerExperts(experts: SkillExpert[]) {
    const rank = (expert: SkillExpert) => {
        const index = MARKETER_EXPERT_IDS.indexOf(expert.expertId);
        return index === -1 ? MARKETER_EXPERT_IDS.length : index;
    };
    return [...experts].sort((left, right) => rank(left) - rank(right));
}
