import { STUDIO_TOOLS } from "./studio-tools";

/**
 * 工具清单：所有工具都显示（与参考产品一致）。面板可以正常上传、选择和填写；
 * 后台没有能运行它的模型时，工具页的生成按钮置灰并写明原因（见 studioBlockReason），不会假装能生成。
 */
export function useAvailableStudioTools() {
    return STUDIO_TOOLS;
}
