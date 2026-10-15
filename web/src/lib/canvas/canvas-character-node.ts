import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasNodeType, type CanvasNodeData, type Position } from "@/types/canvas";

type CharacterPayload = Extract<InsertAssetPayload, { kind: "character" }>;

/** 角色卡节点：竖版海报式主视觉，默认 3:4。 */
export function createCharacterCardNode(payload: CharacterPayload, center: Position): CanvasNodeData {
    const width = 264;
    const height = 352;
    return {
        id: `character-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: CanvasNodeType.Text,
        title: payload.title,
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        width,
        height,
        metadata: {
            workflowKind: "character",
            characterAssetId: payload.assetId,
            characterVersionId: payload.versionId,
            characterVersionPolicy: "current",
            characterName: payload.title,
            characterPrompt: payload.prompt,
            characterAliases: payload.aliases,
            characterDefinition: payload.definition,
            characterCoverUrl: payload.coverUrl,
            characterVisualStatus: payload.visualStatus,
            characterVoiceStatus: payload.voiceStatus,
            characterVoiceName: payload.voiceName,
            characterVoiceProfile: payload.voiceProfile,
            characterVoiceInstructions: payload.voiceInstructions,
            assetId: payload.assetId,
            status: "success",
            fontSize: 14,
        },
    } satisfies CanvasNodeData;
}
