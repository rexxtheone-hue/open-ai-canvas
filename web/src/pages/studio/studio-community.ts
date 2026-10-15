import type { StudioRemix, StudioWork } from "@/services/api/studio";
import { studioToolById, studioToolForKind } from "./studio-tools";

/** 做同款：优先打开原作品用的工具；工具已下线或类型不符时回到同类型的生成工具。 */
export function studioRemixToolPath(remix: Pick<StudioRemix, "kind" | "tool">) {
    const original = remix.tool ? studioToolById(remix.tool) : undefined;
    if (original && original.kind === remix.kind) return original.path;
    return studioToolForKind(remix.kind)?.path || "/studio/video";
}

/** 转成工具页「用同样设置再生成」能读取的作品结构，复用同一条回填逻辑。 */
export function studioRemixAsWork(remix: StudioRemix): StudioWork {
    return {
        id: "remix",
        kind: remix.kind,
        tool: remix.tool,
        prompt: remix.prompt,
        // 作品记录了用户自己的补充说明时以它为准（专项工具可能为空），否则用提示词。
        settings: { userPrompt: remix.prompt, ...remix.settings },
        favorite: false,
        media: [],
    } as unknown as StudioWork;
}
