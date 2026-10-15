import type { CreationAttachment } from "@/pages/create/creation-assets";
import { resolveResourceUrl } from "@/services/api/resources";
import type { StudioCharacter } from "@/services/api/studio-agents";
import type { StudioChatAttachment } from "./studio-chat";

/** Studio 自己的角色库：形象图是本人的图片资源，第一张为主图。 */

export function studioCharacterImageUrl(resourceId: string) {
    return resolveResourceUrl(`resource:${resourceId}`, "");
}

export function studioCharacterCover(character: StudioCharacter) {
    const first = character.imageResourceIds[0];
    return first ? studioCharacterImageUrl(first) : "";
}

/** 角色形象作为参考素材。默认只取主图，避免占满模型的参考图上限。 */
export function studioCharacterAttachments(character: StudioCharacter, limit = 1): CreationAttachment[] {
    return character.imageResourceIds.slice(0, limit).map((resourceId, index) => {
        const storageKey = `resource:${resourceId}`;
        const url = resolveResourceUrl(storageKey, "");
        return { id: `character:${character.id}:${resourceId}`, name: index ? `${character.name} ${index + 1}` : character.name, type: "image/png", dataUrl: url, url, storageKey, previewUrl: url };
    });
}

export function studioCharacterChatAttachment(character: StudioCharacter): StudioChatAttachment | null {
    const resourceId = character.imageResourceIds[0];
    if (!resourceId) return null;
    return { id: `character:${character.id}:${resourceId}`, kind: "image", name: character.name, url: "", storageKey: `resource:${resourceId}`, mimeType: "image/png" };
}

/** 角色写进提示词的说明：名字和外形描述。 */
export function studioCharacterBrief(character: Pick<StudioCharacter, "name" | "description">) {
    const description = character.description.trim();
    return description ? `${character.name}：${description}` : character.name;
}
