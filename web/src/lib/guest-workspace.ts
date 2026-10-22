// 访客不登录也能打开的工作台页面：可以浏览工具、填写参数、看价格；
// 生成、上传、保存等需要账号的操作再弹出注册 / 登录窗口。
// 个人数据页面（素材、画布、项目、个人资料、设置、后台）仍然要求登录。
const GUEST_STUDIO_PAGES = new Set([
    "agents",
    "director",
    "tools",
    "video",
    "image",
    "audio",
    "character",
    "world",
    "inspire",
    "templates",
    "creators",
    "pricing",
    "help",
    "terms",
    "create-image",
    "create-video",
    "create-audio",
    "frame-to-video",
    "text-to-video",
]);

export function isGuestWorkspacePath(pathname: string) {
    if (pathname === "/" || pathname === "/create" || pathname === "/studio") return true;
    const match = /^\/studio\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
    if (!match) return false;
    const [, page, child] = match;
    if (page === "tools" || page === "u") return page === "u" ? Boolean(child) : true;
    return !child && GUEST_STUDIO_PAGES.has(page);
}
