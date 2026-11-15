// 后台用户详情里的「作品」：按时间倒序展示该用户生成的图片、视频与音频。

import { useInfiniteQuery } from "@tanstack/react-query";
import { Alert, Button } from "antd";
import dayjs from "dayjs";

import { adminWorkMediaUrl, listAdminUserWorks } from "@/services/api/tenant-admin";
import type { StudioWork } from "@/services/api/studio";
import { AdminStatusBadge, AdminTableEmpty } from "../components/admin-ui";
import "./agencies.css";
import "./user-works-panel.css";

function WorkPreview({ work }: { work: StudioWork }) {
    const media = work.media[0];
    if (!media) return <div className="admin-user-work-placeholder">{work.status === "failed" ? "生成失败" : work.status === "succeeded" ? "无文件" : "生成中"}</div>;
    const src = adminWorkMediaUrl(media);
    if (media.kind === "video") return <video className="admin-user-work-media" src={src} controls preload="metadata" />;
    if (media.kind === "audio") return <audio className="admin-user-work-audio" src={src} controls preload="none" />;
    return (
        <a href={src} target="_blank" rel="noreferrer">
            <img className="admin-user-work-media" src={src} alt={work.prompt?.slice(0, 60) || "作品"} loading="lazy" />
        </a>
    );
}

export function UserWorksPanel({ userId }: { userId: string }) {
    const query = useInfiniteQuery({
        queryKey: ["admin", "user-works", userId],
        initialPageParam: "",
        queryFn: ({ pageParam, signal }) => listAdminUserWorks(userId, pageParam || undefined, signal),
        getNextPageParam: (page) => page.nextCursor || undefined,
    });
    const works = query.data?.pages.flatMap((page) => page.works) || [];

    if (query.error) return <Alert type="error" showIcon title="作品读取失败" description={query.error instanceof Error ? query.error.message : String(query.error)} />;
    if (!query.isLoading && works.length === 0) return <AdminTableEmpty title="还没有作品" description="用户在 Studio 或画布里生成的图片、视频会显示在这里。" />;
    return (
        <div className="admin-user-works">
            <div className="admin-user-works-grid">
                {works.map((work) => (
                    <figure key={work.id} className="admin-user-work">
                        <WorkPreview work={work} />
                        <figcaption>
                            <div className="admin-user-work-meta">
                                <span>{dayjs(work.createdAt).format("YYYY-MM-DD HH:mm")}</span>
                                {work.status === "failed" ? <AdminStatusBadge label="失败" tone="error" /> : work.status !== "succeeded" ? <AdminStatusBadge label="进行中" tone="warning" /> : null}
                            </div>
                            <p className="line-clamp-2" title={work.prompt}>
                                {work.prompt || "（无提示词）"}
                            </p>
                            {work.model ? <span className="admin-user-work-model">{work.model}</span> : null}
                        </figcaption>
                    </figure>
                ))}
            </div>
            {query.hasNextPage ? (
                <div className="flex justify-center py-3">
                    <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                        加载更多
                    </Button>
                </div>
            ) : null}
            {query.isLoading ? (
                <div className="p-6 text-sm" role="status">
                    正在读取作品…
                </div>
            ) : null}
        </div>
    );
}
