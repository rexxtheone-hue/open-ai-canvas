import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Sparkles, Waypoints } from "./studio-icons";

import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { getStudioPreference, saveStudioPreference, type StudioSurface } from "@/services/api/studio";
import { useUserStore } from "@/stores/use-user-store";
import "./studio.css";

const SURFACE_PATHS: Record<StudioSurface, string> = { studio: "/studio", canvas: "/canvas" };

/** 规则 E1–E4：根路径让用户在 AI Studio 和 AI Canvas 之间选择，登录用户直接进入上次的选择。 */
export default function StudioEntryPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const forceChoose = searchParams.get("choose") === "1";
    const [lastSurface, setLastSurface] = useState<StudioSurface | null>(null);
    const [checking, setChecking] = useState(true);
    const [saving, setSaving] = useState<StudioSurface | null>(null);

    useEffect(() => {
        if (!hydrated) return;
        if (!user) {
            setChecking(false);
            return;
        }
        const controller = { cancelled: false };
        setChecking(true);
        getStudioPreference()
            .then((preference) => {
                if (controller.cancelled) return;
                const surface = preference.surface === "studio" || preference.surface === "canvas" ? preference.surface : null;
                setLastSurface(surface);
                if (surface && !forceChoose) {
                    navigate(SURFACE_PATHS[surface], { replace: true });
                    return;
                }
                setChecking(false);
            })
            .catch(() => {
                if (!controller.cancelled) setChecking(false);
            });
        return () => {
            controller.cancelled = true;
        };
    }, [forceChoose, hydrated, navigate, user]);

    const choose = async (surface: StudioSurface) => {
        if (saving) return;
        if (!user) {
            // E2：未登录先去登录，登录后回到所选界面。
            navigate(`/login?next=${encodeURIComponent(SURFACE_PATHS[surface])}`);
            return;
        }
        setSaving(surface);
        try {
            await saveStudioPreference(surface);
        } catch {
            // 偏好保存失败不阻止进入；下次进入时仍会显示选择页。
        } finally {
            setSaving(null);
        }
        navigate(SURFACE_PATHS[surface]);
    };

    if (!hydrated || checking) return <FullScreenLoader label="正在打开" detail="读取上次使用的界面" />;

    return (
        <main className="studio-entry-page">
            <h1>今天想怎么创作？</h1>
            <p>两种方式共用同一个账号、积分和作品，随时可以切换。</p>
            <div className="studio-entry-choices">
                <button type="button" className="studio-entry-choice" onClick={() => void choose("studio")} disabled={Boolean(saving)} aria-busy={saving === "studio"}>
                    {lastSurface === "studio" ? <span className="studio-entry-last">上次使用</span> : null}
                    <Sparkles aria-hidden />
                    <strong>AI Studio</strong>
                    <span>一句话或一个工具，直接出成品。</span>
                    <ul>
                        <li>生成图片、视频、配音</li>
                        <li>AI 导演一键成片</li>
                        <li>模板和行业快捷入口</li>
                    </ul>
                </button>
                <button type="button" className="studio-entry-choice" onClick={() => void choose("canvas")} disabled={Boolean(saving)} aria-busy={saving === "canvas"}>
                    {lastSurface === "canvas" ? <span className="studio-entry-last">上次使用</span> : null}
                    <Waypoints aria-hidden />
                    <strong>AI Canvas</strong>
                    <span>无限画布，自由搭建每一步流程。</span>
                    <ul>
                        <li>节点连线，精细控制</li>
                        <li>画布 Agent 协作</li>
                        <li>分镜、时间线与剪辑</li>
                    </ul>
                </button>
            </div>
        </main>
    );
}
