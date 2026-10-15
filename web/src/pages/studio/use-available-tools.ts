import { useEffectiveConfig } from "@/stores/use-config-store";
import { studioSpecialtyAvailable } from "./studio-specialty";
import { STUDIO_TOOLS } from "./studio-tools";

/** H6：后台没有能用的模型时，专项工具不出现在任何列表里。 */
export function useAvailableStudioTools() {
    const config = useEffectiveConfig();
    return STUDIO_TOOLS.filter((tool) => !tool.specialty || studioSpecialtyAvailable(config, tool.id));
}
