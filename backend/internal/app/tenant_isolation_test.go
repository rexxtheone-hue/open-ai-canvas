package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestAgencyAdminRouteGuard(t *testing.T) {
	for route, allowed := range map[string]bool{
		"/api/admin/users":                    true,
		"/api/admin/users/:id/ledger":         true,
		"/api/admin/api-logs/:id":             true,
		"/api/admin/settings/appearance":      true,
		"/api/admin/settings/oss":             false,
		"/api/admin/channels":                 false,
		"/api/admin/system-update/start":      false,
		"/api/admin/system-performance":       false,
		"/api/admin/agent-lessons":            false,
		"/api/admin/resources":                false,
		"/api/admin/storage/stats":            false,
		"/api/admin/tenant-billing/tenants":   false,
		"/api/admin/payments/reconciliations": false,
		"/api/projects/:id":                   true,
	} {
		if got := AgencyAdminCanAccess(route); got != allowed {
			t.Fatalf("AgencyAdminCanAccess(%s) = %v, want %v", route, got, allowed)
		}
	}
	agencyAdmin := &model.User{ID: "a", TenantID: "agency-a", Role: model.UserRoleAdmin}
	if restricted := RestrictAgencyAdminForRoute(agencyAdmin, "/api/admin/system-update/start"); restricted.Role != model.UserRoleUser || agencyAdmin.Role != model.UserRoleAdmin {
		t.Fatalf("agency admin must be demoted on platform-only routes without mutating the original: %+v", restricted)
	}
	if kept := RestrictAgencyAdminForRoute(agencyAdmin, "/api/admin/users"); kept.Role != model.UserRoleAdmin {
		t.Fatal("agency admin keeps tenant-scoped admin routes")
	}
	platformAdmin := &model.User{ID: "p", Role: model.UserRoleAdmin}
	if kept := RestrictAgencyAdminForRoute(platformAdmin, "/api/admin/system-update/start"); kept != platformAdmin {
		t.Fatal("platform admin is never restricted")
	}
}
