/**
 * Web Locks 只在 HTTPS（安全上下文）下提供。站点暂时以 http 访问时，持久化退回同标签页内排队，
 * 只牺牲多标签同时写同一画布的保护；安全上下文里缺少 Web Locks 仍然拒绝写入。
 */
export function insecureContextWithoutWebLocks() {
    return typeof window !== "undefined" && (window as { isSecureContext?: boolean }).isSecureContext === false;
}
