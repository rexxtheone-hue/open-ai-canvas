import { useState } from "react";
import { Popover, Slider, Switch } from "antd";
import { Check, ChevronRight, Info, RotateCcw } from "./studio-icons";

import type { StudioSpecialtyOption } from "./studio-specialty";

type FieldProps = {
    option: StudioSpecialtyOption;
    value: string;
    onChange: (value: string) => void;
};

function InfoTip({ text }: { text?: string }) {
    if (!text) return null;
    return (
        <Popover content={<div className="studio-popup studio-option-info">{text}</div>} trigger={["hover", "click"]} arrow={false}>
            <button type="button" className="studio-icon-button is-ghost is-tiny" aria-label="说明"><Info aria-hidden /></button>
        </Popover>
    );
}

function formatNumber(value: number, step = 1) {
    const digits = step < 1 ? String(step).split(".")[1]?.length || 2 : 0;
    return value.toFixed(digits);
}

/** 专项工具的一个选项：平铺按钮、弹出列表、多选、滑块或开关。 */
export function StudioOptionField({ option, value, onChange }: FieldProps) {
    const [open, setOpen] = useState(false);
    const type = option.type || "chips";

    if (type === "toggle") {
        return (
            <div className="studio-block">
                <label className="studio-switch-row">
                    <span>{option.label}<InfoTip text={option.info} /></span>
                    <Switch checked={value === "on"} onChange={(checked) => onChange(checked ? "on" : "off")} aria-label={option.label} />
                </label>
            </div>
        );
    }

    if (type === "slider") {
        const min = option.min ?? 0;
        const max = option.max ?? 1;
        const step = option.step ?? 1;
        const number = Number(value);
        const fallback = Number(option.default ?? min);
        const current = Number.isFinite(number) ? number : fallback;
        return (
            <div className="studio-block studio-slider-block">
                <div className="studio-block-title">
                    <span>{option.label}<InfoTip text={option.info} /></span>
                    <span className="studio-slider-value">
                        {formatNumber(current, step)}{option.unit || ""}
                        {current !== fallback ? <button type="button" className="studio-icon-button is-ghost is-tiny" aria-label={`重置${option.label}`} title="重置" onClick={() => onChange(String(fallback))}><RotateCcw aria-hidden /></button> : null}
                    </span>
                </div>
                <Slider min={min} max={max} step={step} value={current} onChange={(next) => onChange(String(next))} tooltip={{ formatter: (next) => `${formatNumber(Number(next), step)}${option.unit || ""}` }} aria-label={option.label} />
                <div className="studio-slider-scale"><span>{option.minLabel || `${min}${option.unit || ""}`}</span><span>{option.maxLabel || `${max}${option.unit || ""}`}</span></div>
            </div>
        );
    }

    if (type === "select" || type === "multi") {
        const picked = type === "multi" ? value.split(",").filter(Boolean) : [value];
        const summary = type === "multi"
            ? picked.length ? option.choices.filter((choice) => picked.includes(choice.value)).map((choice) => choice.label).join("、") : "请选择"
            : option.choices.find((choice) => choice.value === value)?.label || option.choices[0]?.label || "";
        const toggle = (choiceValue: string) => {
            if (type !== "multi") {
                onChange(choiceValue);
                setOpen(false);
                return;
            }
            const next = picked.includes(choiceValue) ? picked.filter((item) => item !== choiceValue) : [...picked, choiceValue];
            onChange(option.choices.map((choice) => choice.value).filter((item) => next.includes(item)).join(","));
        };
        const allPicked = type === "multi" && picked.length === option.choices.length;
        return (
            <div className="studio-block">
                <Popover
                    open={open}
                    onOpenChange={setOpen}
                    trigger="click"
                    placement="right"
                    arrow={false}
                    content={(
                        <div className="studio-popup studio-option-list" role="listbox" aria-label={option.label} aria-multiselectable={type === "multi"}>
                            <strong>{option.label}{type === "multi" ? `（${picked.length}/${option.choices.length}）` : ""}</strong>
                            {type === "multi" ? (
                                <button type="button" role="option" aria-selected={allPicked} className="studio-option-item" onClick={() => onChange(allPicked ? "" : option.choices.map((choice) => choice.value).join(","))}>
                                    <span>全部</span>{allPicked ? <Check aria-hidden /> : null}
                                </button>
                            ) : null}
                            {option.choices.map((choice) => (
                                <div key={choice.value}>
                                    {choice.group ? <div className="studio-option-group">{choice.group}</div> : null}
                                    <button type="button" role="option" aria-selected={picked.includes(choice.value)} className="studio-option-item" onClick={() => toggle(choice.value)}>
                                        <span>{choice.label}</span>{picked.includes(choice.value) ? <Check aria-hidden /> : null}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                >
                    <button type="button" className="studio-row-button" aria-label={`${option.label}：${summary}`}>
                        <span><small>{option.label}{type === "multi" ? ` ${picked.length}/${option.choices.length}` : ""}</small><b>{summary}</b></span>
                        <ChevronRight aria-hidden />
                    </button>
                </Popover>
                {option.info ? <p className="studio-hint">{option.info}</p> : null}
            </div>
        );
    }

    return (
        <div className="studio-block">
            <div className="studio-block-title"><span>{option.label}<InfoTip text={option.info} /></span></div>
            <div className="studio-chip-list" role="group" aria-label={option.label}>
                {option.choices.map((choice) => (
                    <button key={choice.value} type="button" aria-pressed={value === choice.value} onClick={() => onChange(choice.value)}>{choice.label}</button>
                ))}
            </div>
        </div>
    );
}
