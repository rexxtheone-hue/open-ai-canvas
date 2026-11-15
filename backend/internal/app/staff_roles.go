package app

import (
	"strings"

	"yingce/backend/internal/model"
)

// staffRule 按 Gin 路由模板（不含 /api 前缀）做前缀匹配；methods 为空表示任意方法。
type staffRule struct {
	methods []string
	prefix  string
}

func readOnly(prefix string) staffRule  { return staffRule{methods: []string{"GET"}, prefix: prefix} }
func anyMethod(prefix string) staffRule { return staffRule{prefix: prefix} }
func only(method, prefix string) staffRule {
	return staffRule{methods: []string{method}, prefix: prefix}
}

var userLookupRules = []staffRule{readOnly("/admin/users"), readOnly("/admin/references")}

// staffPermissions 默认拒绝：只有列出的管理接口对员工开放。渠道、密钥、成本价、系统设置、
// 插件与账号角色只属于超级管理员。
var staffPermissions = map[model.UserRole][]staffRule{
	model.UserRoleOperator: append([]staffRule{
		anyMethod("/admin/announcements"), anyMethod("/admin/announcement-images"), anyMethod("/admin/banner-announcements"),
		anyMethod("/admin/studio/community"), anyMethod("/admin/studio/feedback"), anyMethod("/admin/studio/site-content"),
		anyMethod("/admin/studio/tool-covers"), readOnly("/admin/studio/plans"),
		anyMethod("/admin/workbench/tools"), anyMethod("/admin/agent-lessons"), anyMethod("/admin/skill-curation"),
		anyMethod("/admin/partner-applications"), readOnly("/admin/affiliates"),
	}, userLookupRules...),
	model.UserRoleSupport: append([]staffRule{
		only("POST", "/admin/users/:id/credits/adjust"),
		readOnly("/admin/billing-orders"), only("POST", "/admin/billing-orders/"),
		readOnly("/admin/payments/orders"), only("POST", "/admin/payments/orders/:id/query"),
		readOnly("/admin/api-logs/"), readOnly("/admin/api-logs"), only("POST", "/admin/api-logs/"),
		readOnly("/admin/login-logs"), readOnly("/admin/redeem-batches"),
		readOnly("/admin/partner-applications"),
	}, userLookupRules...),
	model.UserRoleFinance: append([]staffRule{
		readOnly("/admin/analytics"), readOnly("/admin/model-pricings"),
		readOnly("/admin/billing-orders"),
		readOnly("/admin/payments/orders"), only("POST", "/admin/payments/orders/:id/query"), anyMethod("/admin/payments/reconciliations"),
		anyMethod("/admin/redeem-batches"),
		anyMethod("/admin/affiliates"), anyMethod("/admin/affiliate-payouts"), anyMethod("/admin/affiliate-settings"),
		readOnly("/admin/settings/billing-currency"),
	}, userLookupRules...),
}

// tenantAdminElevatedRules 是代理商管理员在自己网址上可用的、本就按管理员所在租户隔离数据的管理接口。
// 设置类接口（外观、注册、邮件等）不在这里：它们走 RequireTenantAdminOrAdmin，按原角色判断。
var tenantAdminElevatedRules = []staffRule{
	readOnly("/admin/users"), readOnly("/admin/references"),
	only("POST", "/admin/users/:id/credits/adjust"), readOnly("/admin/resources/:id/file"),
	readOnly("/admin/login-logs"),
	anyMethod("/admin/announcements"), anyMethod("/admin/announcement-images"), anyMethod("/admin/banner-announcements"),
	anyMethod("/admin/redeem-batches"),
	anyMethod("/admin/payments/products"), readOnly("/admin/payments/orders"),
	only("POST", "/admin/payments/orders/:id/query"), only("POST", "/admin/payments/orders/:id/close"),
	anyMethod("/admin/studio/community"), anyMethod("/admin/studio/feedback"),
	anyMethod("/admin/partner-applications"), anyMethod("/admin/affiliates"), anyMethod("/admin/affiliate-payouts"),
}

func matchStaffRules(rules []staffRule, method, route string) bool {
	route = strings.TrimPrefix(route, "/api")
	for _, rule := range rules {
		if !strings.HasPrefix(route, rule.prefix) {
			continue
		}
		if len(rule.methods) == 0 {
			return true
		}
		for _, allowed := range rule.methods {
			if allowed == method || (allowed == "GET" && method == "HEAD") {
				return true
			}
		}
	}
	return false
}

// TenantAdminCanAccess 判断代理商管理员能否按管理员身份调用某个管理接口。
func TenantAdminCanAccess(method, route string) bool {
	return matchStaffRules(tenantAdminElevatedRules, method, route)
}

// tenantAdminSettingRules 是代理商管理员按原角色调用、由 RequireTenantAdminOrAdmin 写代理商层的设置接口。
var tenantAdminSettingRules = []staffRule{
	anyMethod("/admin/settings/appearance"), anyMethod("/admin/settings/registration"), anyMethod("/admin/settings/email"),
	anyMethod("/admin/settings/google"), anyMethod("/admin/settings/credits"), anyMethod("/admin/settings/features"),
	anyMethod("/admin/affiliate-settings"), anyMethod("/admin/studio/site-content"),
}

// TenantAdminRouteAllowed 判断代理商管理员能否进入某个 /admin 接口；其余 /admin 接口在路由层直接 403。
func TenantAdminRouteAllowed(method, route string) bool {
	return TenantAdminCanAccess(method, route) || matchStaffRules(tenantAdminSettingRules, method, route)
}

func isStaffRole(role model.UserRole) bool {
	_, ok := staffPermissions[role]
	return ok
}

func validUserRole(role model.UserRole) bool {
	return role == model.UserRoleAdmin || role == model.UserRoleUser || isStaffRole(role)
}

// StaffCanAccess 判断员工角色能否调用某个管理接口。
func StaffCanAccess(role model.UserRole, method, route string) bool {
	return matchStaffRules(staffPermissions[role], method, route)
}

// ElevateStaffForRoute 让员工在白名单内的管理接口上通过 RequireAdmin，其余请求保持原角色。
// 返回的是副本，原始角色保存在 StaffRole，供超级管理员专属操作拒绝。
// 代理商管理员只在自己（非平台）租户内提升；数据隔离靠各接口按管理员所在租户过滤。
func ElevateStaffForRoute(user *model.User, method, route string) *model.User {
	if user == nil {
		return user
	}
	if user.Role == model.UserRoleTenantAdmin {
		if UserTenantID(user) == model.PlatformTenantID || !TenantAdminCanAccess(method, route) {
			return user
		}
	} else if !isStaffRole(user.Role) || !StaffCanAccess(user.Role, method, route) {
		return user
	}
	elevated := *user
	elevated.StaffRole = user.Role
	elevated.Role = model.UserRoleAdmin
	return &elevated
}

// requireSuperAdmin 用于账号角色、建删管理员等不能下放给员工的操作。
func (s *Service) requireSuperAdmin(actor *model.User) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	if actor.StaffRole != "" {
		return Forbidden("只有超级管理员可以执行此操作")
	}
	return nil
}

// StaffNavigation 返回当前账号在后台可见的入口前缀，前端据此过滤菜单。
func StaffNavigation(role model.UserRole) []string {
	if role == model.UserRoleTenantAdmin {
		return append([]string(nil), tenantAdminNavigation...)
	}
	rules := staffPermissions[role]
	prefixes := make([]string, 0, len(rules))
	for _, rule := range rules {
		prefixes = append(prefixes, rule.prefix)
	}
	return prefixes
}
