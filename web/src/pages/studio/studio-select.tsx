import { useState, type ReactNode } from "react";
import { Popover } from "antd";

import { Check, ChevronDown } from "./studio-icons";

export type StudioSelectOption = { value: string; label: string; hint?: string };

/**
 * Studio 风格的下拉选择：替代浏览器自带的 select（原生下拉是白底系统样式，和暗色界面不搭）。
 * 外观由 className 决定（默认胶囊样式），弹出的是和其他菜单一致的暗色列表，当前项带勾。
 */
export function StudioSelect({
    value,
    options,
    onChange,
    ariaLabel,
    icon,
    className = "studio-pill-select",
    title,
    placement = "topLeft",
    empty = "无可用选项",
}: {
    value: string;
    options: StudioSelectOption[];
    onChange: (value: string) => void;
    ariaLabel: string;
    icon?: ReactNode;
    className?: string;
    title?: string;
    placement?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
    empty?: string;
}) {
    const [open, setOpen] = useState(false);
    const current = options.find((option) => option.value === value);
    return (
        <Popover
            trigger="click"
            placement={placement}
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            classNames={{ root: "studio-popup studio-select-popup" }}
            content={
                <div className="studio-menu studio-select-menu" role="menu" aria-label={ariaLabel}>
                    {options.length ? (
                        options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={option.value === value}
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                <span className="studio-select-option">
                                    <span>{option.label}</span>
                                    {option.hint ? <small>{option.hint}</small> : null}
                                </span>
                                {option.value === value ? <Check className="studio-menu-check" aria-hidden /> : null}
                            </button>
                        ))
                    ) : (
                        <span className="studio-select-empty">{empty}</span>
                    )}
                </div>
            }
        >
            <button type="button" className={`${className} studio-select-trigger`} aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open} title={title}>
                {icon}
                <span className="studio-select-value">{current?.label ?? (options.length ? "" : empty)}</span>
                <ChevronDown className="studio-select-chevron" aria-hidden />
            </button>
        </Popover>
    );
}
