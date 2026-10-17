import type { LucideIcon } from "./studio-icons";
import { Link } from "react-router";

type PosterProps = {
    title: string;
    icon: LucideIcon;
    gradient: [string, string];
    cover?: string;
    badge?: string;
    to?: string;
    onClick?: () => void;
};

/** 海报卡片：上方大图（管理员封面或渐变海报），底部渐隐条显示图标和标题。 */
export function StudioPosterCard({ title, icon: Icon, gradient, cover, badge, to, onClick }: PosterProps) {
    const style = { ["--poster-a" as string]: gradient[0], ["--poster-b" as string]: gradient[1] };
    const body = (
        <>
            <span className="studio-poster-art" aria-hidden>
                {cover ? <img src={cover} alt="" loading="lazy" /> : <Icon className="studio-poster-glyph" />}
            </span>
            {badge ? <em className="studio-poster-badge">{badge}</em> : null}
            <span className="studio-poster-title"><Icon aria-hidden />{title}</span>
        </>
    );
    if (to) return <Link to={to} className="studio-poster" style={style}>{body}</Link>;
    return <button type="button" className="studio-poster" style={style} onClick={onClick}>{body}</button>;
}
