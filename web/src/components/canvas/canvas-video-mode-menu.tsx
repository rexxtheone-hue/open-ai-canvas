import { Dropdown, type MenuProps } from "antd";
import { Check, ChevronDown, Columns2, FastForward, Image as ImageIcon, Layers, PencilLine, Type } from "lucide-react";
import type { ReactNode } from "react";

import type { VideoCapabilityConfig } from "@/lib/model-capabilities";
import { VIDEO_MODES, videoModeLabel, videoModeUnavailableReason, type VideoMode, type VideoModeInput } from "@/lib/video-modes";

const icons: Record<VideoMode, ReactNode> = {
    text_to_video: <Type />,
    reference_to_video: <Layers />,
    image_to_video: <ImageIcon />,
    first_last_frame: <Columns2 />,
    inpaint: <PencilLine />,
    extend: <FastForward />,
};

/** 画布视频节点的生成模式下拉；value 为当前生效模式（显式选择或按素材推断）。 */
export function CanvasVideoModeMenu({
    profile,
    input,
    value,
    explicit,
    onChange,
    stroke,
    muted,
    compact = false,
}: {
    profile: VideoCapabilityConfig | undefined;
    input: VideoModeInput;
    value: VideoMode;
    explicit: boolean;
    onChange: (mode: VideoMode) => void;
    stroke: string;
    muted: string;
    compact?: boolean;
}) {
    const items: MenuProps["items"] = [
        { key: "heading", type: "group", label: "视频生成模式" },
        ...VIDEO_MODES.map((mode) => {
            const reason = videoModeUnavailableReason(profile, mode.value, input);
            return {
                key: mode.value,
                disabled: Boolean(reason),
                icon: icons[mode.value],
                label: (
                    <div className="flex min-w-[200px] items-center gap-2 py-0.5">
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[var(--fs-small)] font-medium">{mode.label}</span>
                            <span className="truncate text-[var(--fs-tiny)] opacity-60">{reason || mode.description}</span>
                        </div>
                        {mode.value === value ? <Check className="size-3.5 shrink-0" /> : null}
                    </div>
                ),
            };
        }),
        ...(!explicit ? [{ key: "hint", type: "group" as const, label: "未手动选择时，按连线素材自动判断模式" }] : []),
    ];
    return (
        <Dropdown trigger={["click"]} menu={{ items, selectable: true, selectedKeys: [value], onClick: ({ key }) => onChange(key as VideoMode) }}>
            <button
                type="button"
                aria-label={`视频生成模式：${videoModeLabel(value)}`}
                className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[var(--fs-tiny)] transition-colors [&_.lucide]:size-3"
                style={{ borderColor: stroke, color: muted }}
            >
                {icons[value]}
                {compact ? null : <span className="max-w-[72px] truncate">{videoModeLabel(value)}</span>}
                <ChevronDown />
            </button>
        </Dropdown>
    );
}
