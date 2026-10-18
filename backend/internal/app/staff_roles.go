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

func isStaffRole(role model.UserRole) bool {
	_, ok := staffPermissions[role]
	return ok
}

func validUserRole(role model.UserRole) bool {
	return role == model.UserRoleAdmin || role == model.UserRoleUser || isStaffRole(role)
}

// StaffCanAccess 判断员工角色能否调用某个管理接口。
func StaffCanAccess(role model.UserRole, method, route string) bool {
	route = strings.TrimPrefix(route, "/api")
	for _, rule := range staffPermissions[role] {
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

// ElevateStaffForRoute 让员工在白名单内的管理接口上通过 RequireAdmin，其余请求保持原角色。
// 返回的是副本，原始角色保存在 StaffRole，供超级管理员专属操作拒绝。
func ElevateStaffForRoute(user *model.User, method, route string) *model.User {
	if user == nil || !isStaffRole(user.Role) || !StaffCanAccess(user.Role, method, route) {
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
	rules := staffPermissions[role]
	prefixes := make([]string, 0, len(rules))
	for _, rule := range rules {
		prefixes = append(prefixes, rule.prefix)
	}
	return prefixes
}
