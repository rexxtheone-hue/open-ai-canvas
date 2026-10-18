import { Navigate, useLocation } from "react-router";

/** 根路径直接进入 AI Studio；画布等功能都在 Studio 里，不再让用户选择产品。未登录时由 /studio 的登录守卫跳转。 */
export default function StudioEntryPage() {
    const { search } = useLocation();
    const params = new URLSearchParams(search);
    params.delete("choose");
    const query = params.toString();
    return <Navigate to={`/studio${query ? `?${query}` : ""}`} replace />;
}
