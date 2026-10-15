import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";

import { ModelIcon, ModelPriceSummary } from "@/components/model-picker";
import { compatibleModelInGroup, groupModelsByDisplayName, modelCompatibilityError, type ModelRequirements } from "@/lib/model-selection";
import { modelDisplayName, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import type { StudioKind } from "@/services/api/studio";
import { studioModelChips } from "./studio-model-chips";

/** 面板里的模型卡片：图标 + 「模型」+ 名称，点开右侧模型面板。 */
export function StudioModelCard({ config, model, open, onToggle }: { config: AiConfig; model: string; open: boolean; onToggle: () => void }) {
    return (
        <button type="button" className="studio-model-card" aria-expanded={open} aria-label="选择模型" onClick={onToggle}>
            <span className="studio-model-icon"><ModelIcon config={config} model={model} /></span>
            <span className="studio-model-card-text"><small>模型</small><b>{model ? modelDisplayName(config, model) || model : "后台还没有可用的模型"}</b></span>
            <ChevronRight aria-hidden />
        </button>
    );
}

/**
 * 模型面板：覆盖作品库区域，每行显示能力标签和价格。
 * 同名模型的多条线路合成一行，选择时按当前素材挑兼容的线路；不兼容的整行置灰并说明原因。
 */
export function StudioModelPanel({
    config,
    kind,
    value,
    requirements,
    filter,
    onChange,
    onClose,
}: {
    config: AiConfig;
    kind: StudioKind;
    value: string;
    requirements: ModelRequirements;
    filter?: (model: string) => boolean;
    onChange: (model: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const groups = useMemo(() => {
        const models = selectableModelsByCapability(config, kind).filter((model) => !filter || filter(model));
        return groupModelsByDisplayName(config, models);
    }, [config, filter, kind]);
    const keyword = query.trim().toLowerCase();
    const visible = keyword ? groups.filter((group) => group.label.toLowerCase().includes(keyword)) : groups;

    return (
        <aside className="studio-model-panel" aria-label="选择模型">
            <div className="studio-switcher-head">
                <strong>模型</strong>
                <label className="studio-search is-compact">
                    <Search aria-hidden />
                    <input value={query} placeholder="搜索模型" aria-label="搜索模型" onChange={(event) => setQuery(event.target.value)} />
                </label>
                <button type="button" className="studio-icon-button" aria-label="关闭" onClick={onClose}><X aria-hidden /></button>
            </div>
            <div className="studio-model-scroll">
                {visible.length ? null : <p className="studio-hint">{groups.length ? "没有找到相关模型" : "后台还没有支持这个工具的模型"}</p>}
                {visible.map((group) => {
                    const target = compatibleModelInGroup(config, group.models, requirements, value) || group.models[0];
                    const reason = modelCompatibilityError(config, target, requirements);
                    const selected = group.models.includes(value);
                    const chips = studioModelChips(config, target, kind);
                    return (
                        <button
                            key={group.key}
                            type="button"
                            className="studio-model-row"
                            aria-pressed={selected}
                            disabled={Boolean(reason) && !selected}
                            title={reason || undefined}
                            onClick={() => {
                                onChange(target);
                                onClose();
                            }}
                        >
                            <span className="studio-model-icon"><ModelIcon config={config} model={target} /></span>
                            <span className="studio-model-row-main">
                                <b>{group.label}</b>
                                {reason ? <small className="is-warn">{reason}</small> : null}
                            </span>
                            <span className="studio-model-chips">
                                {chips.map((chip) => <i key={chip}>{chip}</i>)}
                            </span>
                            <span className="studio-model-price"><ModelPriceSummary config={config} model={target} capability={kind} requirements={requirements} /></span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
