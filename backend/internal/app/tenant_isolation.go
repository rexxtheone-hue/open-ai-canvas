// 多租户隔离加固：代理商网站上的管理员（含员工角色）只能使用已按租户隔离的后台接口。
//
// 签名链接的取舍：
//   - /public/resources/:id/file?sig=… 是能力链接（capability URL）：签名只覆盖资源与有效期、不含网址，
//     邮件、模型供应商回源、CDN 都依赖它跨网址可用；它只返回原始媒体字节，不带任何品牌或页面，所以不按网址限制。
//   - 画布分享页会以「当前网址的品牌」展示内容，所以分享令牌只在作者所属租户的网址上有效，
//     在别家网址上一律 404（见 sharedCanvasOnHost）。

package app

import (
	"context"
	"strings"

	"yingce/backend/internal/model"
	"yingce/backend/internal/tenantrls"
)

func init() {
	// 行级安全只认请求里真的带着的租户；后台任务没有租户，不能被当成平台租户而被策略挡住。
	tenantrls.SetContextResolver(func(ctx context.Context) (string, bool) {
		if ctx == nil {
			return "", false
		}
		tenant, ok := ctx.Value(tenantContextKey{}).(model.Tenant)
		if !ok || tenant.ID == "" {
			return "", false
		}
		return tenant.ID, true
	})
}

// agencyAdminRoutePrefixes 是已经按 userTenantID(actor) 隔离数据的后台接口（不含 /api 前缀）。
// 其余后台接口（渠道、模型、计费成本、插件、系统更新、存储、经验库等）是全站共用配置，默认拒绝。
var agencyAdminRoutePrefixes = []string{
	"/admin/users", "/admin/references",
	"/admin/analytics", "/admin/api-logs", "/admin/login-logs", "/admin/billing-orders",
	"/admin/payments/orders", "/admin/payments/products", "/admin/redeem-batches",
	"/admin/announcements", "/admin/announcement-images", "/admin/banner-announcements",
	"/admin/studio/community", "/admin/studio/feedback", "/admin/studio/site-content",
	"/admin/partner-applications", "/admin/affiliates", "/admin/affiliate-payouts",
}

// AgencyAdminCanAccess 判断代理商租户的管理员能否进入某个后台接口。
func AgencyAdminCanAccess(route string) bool {
	route = strings.TrimPrefix(route, "/api")
	if !strings.HasPrefix(route, "/admin") {
		return true
	}
	for _, prefix := range agencyAdminRoutePrefixes {
		if strings.HasPrefix(route, prefix) {
			return true
		}
	}
	// 代理商管理员的白名单（staff_roles.go）是唯一来源：这里只看路径，方法由路由层的 TenantAdminRouteAllowed 把关。
	for _, rules := range [][]staffRule{tenantAdminElevatedRules, tenantAdminSettingRules} {
		for _, rule := range rules {
			if strings.HasPrefix(route, rule.prefix) {
				return true
			}
		}
	}
	return false
}

func isPlatformAccount(user *model.User) bool {
	return user != nil && (user.TenantID == "" || user.TenantID == model.PlatformTenantID)
}

// RestrictAgencyAdminForRoute 在 ElevateStaffForRoute 之后调用：代理商租户的管理员访问全站共用的后台接口时降为普通用户，
// 让 RequireAdmin 返回 403。返回的是副本。
func RestrictAgencyAdminForRoute(user *model.User, route string) *model.User {
	if user == nil || isPlatformAccount(user) || user.Role != model.UserRoleAdmin || AgencyAdminCanAccess(route) {
		return user
	}
	restricted := *user
	if restricted.StaffRole == "" {
		restricted.StaffRole = user.Role
	}
	restricted.Role = model.UserRoleUser
	return &restricted
}

// RequirePlatformOperator 供 handler 直接校验（经验库后台）。
func (s *Service) RequirePlatformOperator(actor *model.User) error {
	return s.requirePlatformOperator(actor)
}

// requirePlatformOperator 用于全站共用的后台数据（经验库、存储统计、系统性能）：平台的管理员和获准的员工可用，代理商一律拒绝。
func (s *Service) requirePlatformOperator(actor *model.User) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	if !isPlatformAccount(actor) {
		return Forbidden("需要平台管理员权限")
	}
	return nil
}
