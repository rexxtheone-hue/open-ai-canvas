import type { CreationAttachment } from "@/pages/create/creation-assets";
import type { CharacterRepresentation, ProjectCharacterDetail } from "@/services/api/projects";
import { resolveResourceUrl } from "@/services/api/resources";

const ROLE_ORDER = ["primary", "turnaround_sheet", "front", "side", "back"];

/** 角色的图片按「主图 → 三视图 → 正面 → 侧面 → 背面」排序，与画布生成时取参考图的顺序一致。 */
export function studioCharacterImages(detail: ProjectCharacterDetail): CharacterRepresentation[] {
    const images = detail.character.representations.filter((item) => item.resourceId && (!item.mediaType || item.mediaType.startsWith("image")));
    const rank = (role: string) => {
        const index = ROLE_ORDER.indexOf(role);
        return index < 0 ? ROLE_ORDER.length : index;
    };
    return [...images].sort((left, right) => rank(left.role) - rank(right.role));
}

export function studioCharacterCover(detail: ProjectCharacterDetail) {
    const cover = studioCharacterImages(detail)[0];
    return cover ? resolveResourceUrl(`resource:${cover.resourceId}`, "") : "";
}

/** 角色主图转成工具页的图片参考。只取一张，避免占满模型的参考图上限。 */
export function studioCharacterAttachment(detail: ProjectCharacterDetail): CreationAttachment | undefined {
    const cover = studioCharacterImages(detail)[0];
    if (!cover) return undefined;
    const storageKey = `resource:${cover.resourceId}`;
    const url = resolveResourceUrl(storageKey, "");
    return { id: `character:${detail.asset.id}:${cover.resourceId}`, name: detail.asset.title, type: "image/png", dataUrl: url, url, storageKey, previewUrl: url };
}
