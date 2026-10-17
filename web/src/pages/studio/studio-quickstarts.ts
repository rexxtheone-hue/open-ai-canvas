import { Briefcase, Building2, Film, Megaphone, MicVocal, Store, UserRound, type LucideIcon } from "./studio-icons";

import type { DirectorGenre } from "./studio-director";

/** 首页和导演首页共用的「按行业快速开始」卡片。封面由管理员在后台上传（ID 为 coverId），没有时显示渐变海报。 */
export type StudioQuickStart = {
    genre: DirectorGenre;
    coverId: string;
    label: string;
    icon: LucideIcon;
    gradient: [string, string];
    badge?: "热门" | "新";
};

export const STUDIO_QUICK_STARTS: StudioQuickStart[] = [
    { genre: "product-ad", coverId: "quick-product-ad", label: "产品广告", icon: Megaphone, gradient: ["#f7971e", "#c0392b"], badge: "热门" },
    { genre: "ugc", coverId: "quick-ugc", label: "UGC 口播", icon: UserRound, gradient: ["#ff6a88", "#7f53ac"] },
    { genre: "real-estate", coverId: "quick-real-estate", label: "房地产", icon: Building2, gradient: ["#56ccf2", "#2f80ed"], badge: "新" },
    { genre: "food", coverId: "quick-food", label: "餐饮探店", icon: Store, gradient: ["#f2994a", "#eb5757"] },
    { genre: "presenter", coverId: "quick-presenter", label: "数字人讲解", icon: MicVocal, gradient: ["#43cea2", "#185a9d"] },
    { genre: "brand-film", coverId: "quick-brand-film", label: "品牌片", icon: Briefcase, gradient: ["#d9a441", "#5a3d0c"] },
    { genre: "short-drama", coverId: "quick-short-drama", label: "短剧", icon: Film, gradient: ["#8e2de2", "#4a00e0"], badge: "新" },
];
