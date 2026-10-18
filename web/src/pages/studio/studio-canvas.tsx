import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listRemoteCanvasProjectsPage } from "@/services/api/user-data";
import { useUserStore } from "@/stores/use-user-store";
import { Layers, Plus, Search } from "./studio-icons";
import { StudioShell } from "./studio-shell";

/** 无限画布（Canvas）：AI Studio 里的画布，适合分镜、批量出图和多步骤串联。 */
export default function StudioCanvasPage() {
    const navigate = useNavigate();
    const userId = useUserStore((state) => state.user?.id || "");
    const [keyword, setKeyword] = useState("");
    const query = useDebouncedValue(keyword.trim(), 250);
    const projects = useQuery({
        queryKey: ["studio", "canvas-projects", userId, query],
        queryFn: ({ signal }) => listRemoteCanvasProjectsPage({ page: 1, pageSize: 60, query, signal }),
        enabled: Boolean(userId),
    });
    const items = projects.data?.projects || [];

    return (
        <StudioShell title="无限画布">
            <div className="studio-home studio-page">
                <div className="studio-section-head">
                    <div>
                        <h2>
                            无限画布 <span className="studio-post-badge">Pro</span>
                        </h2>
                        <p>在无限画布上串联多个步骤：分镜、批量出图、图生视频、对比不同版本。作品库和 Studio 共用。</p>
                    </div>
                    <button type="button" className="studio-generate-button" onClick={() => navigate("/canvas?mode=new")}>
                        <Plus aria-hidden />
                        新建画布
                    </button>
                </div>
                <div className="studio-canvas-toolbar">
                    <label className="studio-search is-compact">
                        <Search aria-hidden />
                        <input value={keyword} placeholder="搜索画布" aria-label="搜索画布" onChange={(event) => setKeyword(event.target.value)} />
                    </label>
                    <span className="studio-hint">共 {projects.data?.total ?? 0} 个</span>
                    <span style={{ flex: 1 }} />
                    <Link className="studio-mini-button" to="/canvas?mode=manage">
                        管理全部画布
                    </Link>
                </div>
                {projects.isLoading ? <p className="studio-hint">正在读取…</p> : null}
                {projects.isError ? (
                    <div className="studio-empty" role="alert">
                        <strong>画布读取失败</strong>
                        <span>{projects.error instanceof Error ? projects.error.message : ""}</span>
                    </div>
                ) : null}
                {!projects.isLoading && !projects.isError && !items.length ? (
                    <div className="studio-empty">
                        <Layers aria-hidden />
                        <strong>{query ? "没有找到相关画布" : "还没有画布"}</strong>
                        <span>新建一张画布，或在作品库点「在无限画布中编辑」把作品带进来。</span>
                        <button type="button" className="studio-mini-button" onClick={() => navigate("/canvas?mode=new")}>
                            新建画布
                        </button>
                    </div>
                ) : null}
                <div className="studio-canvas-grid">
                    {items.map((project) => (
                        <Link key={project.id} to={`/canvas/${project.id}`} className="studio-canvas-card">
                            <div className="studio-canvas-preview">
                                <ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} preferLatestImage />
                            </div>
                            <div className="studio-canvas-meta">
                                <strong>{project.title || "未命名画布"}</strong>
                                <span>
                                    {project.nodeCount} 个节点 · {new Date(project.updatedAt).toLocaleDateString("zh-CN")}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </StudioShell>
    );
}
