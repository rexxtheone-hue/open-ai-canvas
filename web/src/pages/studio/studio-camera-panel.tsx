import { Check, Info, X } from "lucide-react";

import { CAMERA_MOVES, cameraMoveCoverId, type StudioCameraMove } from "./studio-prompt-tools";
import { useStudioToolCovers } from "./use-studio-tool-meta";

/** 没有后台上传示意图时，用一个小场景动画演示镜头怎么动。 */
function CameraMovePreview({ move }: { move: StudioCameraMove["value"] }) {
    return (
        <span className={`studio-camera-scene is-${move}`} aria-hidden>
            <span className="studio-camera-world">
                <i className="studio-camera-sun" />
                <i className="studio-camera-hill is-back" />
                <i className="studio-camera-hill is-front" />
                <i className="studio-camera-tree is-a" />
                <i className="studio-camera-tree is-b" />
                <i className="studio-camera-tree is-c" />
            </span>
            <i className="studio-camera-subject" />
        </span>
    );
}

type CameraPanelProps = {
    open: boolean;
    /** 当前提示词，用来标出已经加过的运镜。 */
    prompt: string;
    onPick: (move: StudioCameraMove) => void;
    onClose: () => void;
};

/** 「镜头运动」面板：覆盖在作品库上，点一张卡片把运镜写进提示词。 */
export function StudioCameraPanel({ open, prompt, onPick, onClose }: CameraPanelProps) {
    const covers = useStudioToolCovers();
    if (!open) return null;
    return (
        <aside className="studio-camera-panel" aria-label="镜头运动">
            <button type="button" className="studio-icon-button studio-camera-close" aria-label="关闭" onClick={onClose}><X aria-hidden /></button>
            <header className="studio-camera-head">
                <h2>镜头运动</h2>
                <p>选择一种运镜效果，为生成的视频增添动感和电影质感。</p>
            </header>
            <p className="studio-camera-tip"><Info aria-hidden />提示：运镜效果搭配支持运镜的视频模型使用效果最佳，可以一次叠加多个。</p>
            <div className="studio-camera-grid">
                {CAMERA_MOVES.map((move) => {
                    const cover = covers[cameraMoveCoverId(move.value)];
                    const used = prompt.includes(move.prompt);
                    return (
                        <button key={move.value} type="button" className="studio-camera-card" aria-pressed={used} title={move.prompt} onClick={() => onPick(move)}>
                            <span className="studio-camera-media">
                                {cover ? <img src={cover} alt="" loading="lazy" /> : <CameraMovePreview move={move.value} />}
                                {used ? <span className="studio-picker-check"><Check aria-hidden /></span> : null}
                            </span>
                            <span className="studio-camera-label">{move.label}</span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
