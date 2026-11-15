package handler

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
	"yingce/backend/internal/service"
)

var routeParamPattern = regexp.MustCompile(`[:*][A-Za-z]+`)

func (f *tenantSettingsFixture) raw(method, host, session, path string) *httptest.ResponseRecorder {
	f.t.Helper()
	r := httptest.NewRequest(method, path, nil)
	r.Host = host
	if session != "" {
		r.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session + ".t"})
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r)
	return w
}

func (f *tenantSettingsFixture) addSession(id, userID string) {
	f.t.Helper()
	if err := f.db.Create(&model.AuthSession{ID: id, UserID: userID, TokenHash: auth.HashToken("t"), ExpiresAt: time.Now().Add(time.Hour)}).Error; err != nil {
		f.t.Fatal(err)
	}
}

// 枚举整个路由表：白名单以外的每个 /admin 接口，代理商管理员都必须拿到 403。
func TestTenantAdminForbiddenOnEveryPlatformOnlyAdminRoute(t *testing.T) {
	f := newTenantSettingsFixture(t)
	checked := 0
	for _, route := range f.router.Routes() {
		if !strings.HasPrefix(route.Path, "/api/admin/") || service.TenantAdminRouteAllowed(route.Method, route.Path) {
			continue
		}
		path := routeParamPattern.ReplaceAllString(route.Path, "x")
		if code, _ := f.call(route.Method, agencyAHost, "s-a", path, map[string]any{}); code != http.StatusForbidden {
			t.Errorf("%s %s: tenant admin got %d, want 403", route.Method, route.Path, code)
		}
		checked++
	}
	if checked < 100 {
		t.Fatalf("only %d platform-only admin routes were enumerated; the router walk is broken", checked)
	}
	for _, path := range []string{"/api/admin/tenants", "/api/admin/tenant-billing/tenants", "/api/admin/tenant-billing/agency-discounts", "/api/admin/channels", "/api/admin/api-logs", "/api/admin/analytics/overview"} {
		if code, _ := f.call(http.MethodGet, agencyAHost, "s-a", path, nil); code != http.StatusForbidden {
			t.Fatalf("GET %s must be platform-only, got %d", path, code)
		}
	}
	// 平台管理员在平台网址上不受影响。
	for _, path := range []string{"/api/admin/users", "/api/admin/tenants", "/api/admin/channels", "/api/admin/references", "/api/admin/tenant-billing/tenants"} {
		f.mustCall(http.MethodGet, platformHost, "s-admin", path, nil)
	}
	refs := f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/references", nil)
	if _, ok := refs["channels"]; !ok {
		t.Fatal("platform admin references must still include channels")
	}
}

func TestTenantAdminUsesWhitelistedAdminPagesScopedToItsTenant(t *testing.T) {
	f := newTenantSettingsFixture(t)
	for _, record := range []any{
		&model.User{ID: "user-b", TenantID: "agency-b", Username: "user-b", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.User{ID: "user-p", Username: "user-p", Role: model.UserRoleUser, Status: model.UserStatusActive},
	} {
		if err := f.db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	users := f.mustCall(http.MethodGet, agencyAHost, "s-a", "/api/admin/users", nil)
	listed := map[string]bool{}
	for _, item := range users["users"].([]any) {
		listed[item.(map[string]any)["id"].(string)] = true
	}
	if !listed["user-a"] || listed["user-b"] || listed["user-p"] || listed["platform-admin"] {
		t.Fatalf("agency admin must only see its own users: %v", listed)
	}
	refs := f.mustCall(http.MethodGet, agencyAHost, "s-a", "/api/admin/references", nil)
	if channels, _ := refs["channels"].([]any); len(channels) != 0 {
		t.Fatalf("platform channels must not leak to an agency admin: %v", channels)
	}
	for _, path := range []string{"/api/admin/users/user-a/detail", "/api/admin/users/user-a/tasks", "/api/admin/users/user-a/works", "/api/admin/login-logs", "/api/admin/announcements", "/api/admin/redeem-batches", "/api/admin/payments/orders", "/api/admin/payments/products"} {
		f.mustCall(http.MethodGet, agencyAHost, "s-a", path, nil)
	}
	for _, path := range []string{"/api/admin/users/user-b/works", "/api/admin/users/user-b/detail", "/api/admin/users/user-p/tasks"} {
		if code, _ := f.call(http.MethodGet, agencyAHost, "s-a", path, nil); code == http.StatusOK {
			t.Fatalf("%s: another tenant's user must not be visible", path)
		}
	}
	// 作品文件：别家客户的资源当作不存在。
	if err := f.db.Create(&model.Resource{ID: "res-b", UserID: "user-b", Kind: "image", Status: "ready"}).Error; err != nil {
		t.Fatal(err)
	}
	if code, _ := f.call(http.MethodGet, agencyAHost, "s-a", "/api/admin/resources/res-b/file", nil); code != http.StatusNotFound {
		t.Fatalf("agency admin must not read another tenant's resource, got %d", code)
	}
	if code, _ := f.call(http.MethodGet, agencyAHost, "s-a", "/api/admin/resources", nil); code != http.StatusForbidden {
		t.Fatalf("platform storage listing must stay platform-only, got %d", code)
	}
		// 代理商管理员能给自己的客户调账，不能给别家用户调账，也不能改账号或角色。
	f.mustCall(http.MethodPost, agencyAHost, "s-a", "/api/admin/users/user-a/credits/adjust", map[string]any{"amountMicrocredits": 5_000_000, "note": "welcome"})
	if code, _ := f.call(http.MethodPost, agencyAHost, "s-a", "/api/admin/users/user-b/credits/adjust", map[string]any{"amountMicrocredits": 5_000_000, "note": "x"}); code == http.StatusOK {
		t.Fatal("agency admin must not adjust another tenant's user")
	}
	if code, _ := f.call(http.MethodPatch, agencyAHost, "s-a", "/api/admin/users/user-a", map[string]any{"role": "admin"}); code != http.StatusForbidden {
		t.Fatalf("agency admin must not change roles, got %d", code)
	}
	// 普通客户不会因为白名单被当成管理员。
	if code, _ := f.call(http.MethodGet, agencyAHost, "s-user-a", "/api/admin/users", nil); code != http.StatusForbidden {
		t.Fatalf("a customer must not open admin pages, got %d", code)
	}
}

func TestPlatformAdminProvisionsAndSuspendsAgency(t *testing.T) {
	t.Setenv("TENANT_BASE_DOMAIN", "omnimuse.app")
	f := newTenantSettingsFixture(t)
	created := f.mustCall(http.MethodPost, platformHost, "s-admin", "/api/admin/tenants", map[string]any{
		"name": "Agency C", "slug": "agency-c", "adminEmail": "Boss@Agency-C.com", "adminUsername": "bossc", "adminPassword": "Secret#12345",
	})
	tenantID, _ := nested(created, "tenant", "tenant", "id").(string)
	if tenantID == "" || nested(created, "tenant", "primaryDomain", "host") != "agency-c.omnimuse.app" || nested(created, "tenant", "adminCount") != float64(1) {
		t.Fatalf("unexpected provisioning result: %v", created)
	}
	var tenant model.Tenant
	if err := f.db.First(&tenant, "id = ?", tenantID).Error; err != nil {
		t.Fatal(err)
	}
	if tenant.Status != model.TenantStatusActive || tenant.IsPlatform || tenant.FeeFreeUntil == nil || tenant.FeeFreeUntil.Before(time.Now().AddDate(0, 2, -1)) {
		t.Fatalf("agency must start active with two fee-free months: %+v", tenant)
	}
	var admin model.User
	if err := f.db.First(&admin, "tenant_id = ? AND username = ?", tenantID, "bossc").Error; err != nil {
		t.Fatal(err)
	}
	if admin.Role != model.UserRoleTenantAdmin || admin.EmailVerifiedAt == nil || admin.Email != "boss@agency-c.com" {
		t.Fatalf("first agency admin wrong: %+v", admin)
	}
	var audits int64
	f.db.Model(&model.AdminAuditEvent{}).Where("action = ? AND target_id = ?", "tenant.create", tenantID).Count(&audits)
	if audits != 1 {
		t.Fatal("provisioning must be audit-logged")
	}
	// 新网址立刻生效，新管理员可以用自己的后台。
	f.addSession("s-c", admin.ID)
	f.mustCall(http.MethodGet, "agency-c.omnimuse.app", "s-c", "/api/tenant-admin/staff", nil)

	for _, body := range []map[string]any{
		{"name": "Dup", "slug": "agency-c", "adminEmail": "x@y.com", "adminUsername": "dupx", "adminPassword": "Secret#12345"},
		{"name": "Reserved", "slug": "omnimuse", "adminEmail": "x@y.com", "adminUsername": "resx", "adminPassword": "Secret#12345"},
		{"name": "Bad", "slug": "Bad Slug!", "adminEmail": "x@y.com", "adminUsername": "badx", "adminPassword": "Secret#12345"},
		{"name": "NoMail", "slug": "nomail", "adminEmail": "", "adminUsername": "nomail", "adminPassword": "Secret#12345"},
	} {
		if code, _ := f.call(http.MethodPost, platformHost, "s-admin", "/api/admin/tenants", body); code == http.StatusOK {
			t.Fatalf("invalid provisioning request accepted: %v", body)
		}
	}
	if code, _ := f.call(http.MethodPost, agencyAHost, "s-a", "/api/admin/tenants", map[string]any{"name": "X", "slug": "x-agency"}); code != http.StatusForbidden {
		t.Fatalf("agency admin must not provision agencies, got %d", code)
	}

	list := f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/tenants", nil)
	if items := list["tenants"].([]any); len(items) != 3 {
		t.Fatalf("expected three agencies, got %d", len(items))
	}

	// 停用后该代理商网址整站 403，恢复后重新可用；平台租户不能改。
	f.mustCall(http.MethodPatch, platformHost, "s-admin", "/api/admin/tenants/agency-a", map[string]any{"status": "suspended"})
	if code, _ := f.call(http.MethodGet, agencyAHost, "", "/api/public/appearance", nil); code != http.StatusForbidden {
		t.Fatalf("suspended agency site must answer 403, got %d", code)
	}
	if code, _ := f.call(http.MethodGet, agencyAHost, "s-a", "/api/tenant-admin/staff", nil); code != http.StatusForbidden {
		t.Fatalf("suspended agency admin console must answer 403, got %d", code)
	}
	f.mustCall(http.MethodGet, agencyBHost, "", "/api/public/appearance", nil)
	f.mustCall(http.MethodPatch, platformHost, "s-admin", "/api/admin/tenants/agency-a", map[string]any{"status": "active"})
	f.mustCall(http.MethodGet, agencyAHost, "", "/api/public/appearance", nil)
	if code, _ := f.call(http.MethodPatch, platformHost, "s-admin", "/api/admin/tenants/"+model.PlatformTenantID, map[string]any{"status": "suspended"}); code == http.StatusOK {
		t.Fatal("platform tenant must be immutable")
	}
	if code, _ := f.call(http.MethodPatch, platformHost, "s-admin", "/api/admin/tenants/agency-a", map[string]any{"status": "closed"}); code == http.StatusOK {
		t.Fatal("only active or suspended are accepted")
	}

	added := f.mustCall(http.MethodPost, platformHost, "s-admin", "/api/admin/tenants/agency-a/admins", map[string]any{"username": "second-a", "email": "second@a.com", "password": "Secret#12345"})
	if nested(added, "user", "username") != "second-a" {
		t.Fatalf("unexpected add admin result: %v", added)
	}
	var second model.User
	f.db.First(&second, "tenant_id = ? AND username = ?", "agency-a", "second-a")
	if second.Role != model.UserRoleTenantAdmin {
		t.Fatalf("added admin must be a tenant admin: %+v", second)
	}
}

func TestTenantAdminManagesOnlyItsOwnStaff(t *testing.T) {
	f := newTenantSettingsFixture(t)
	created := f.mustCall(http.MethodPost, agencyAHost, "s-a", "/api/tenant-admin/staff", map[string]any{"username": "helper-a", "email": "helper@a.com", "password": "Secret#12345"})
	helperID, _ := nested(created, "user", "id").(string)
	var helper model.User
	f.db.First(&helper, "id = ?", helperID)
	if helper.TenantID != "agency-a" || helper.Role != model.UserRoleTenantAdmin {
		t.Fatalf("staff must be a tenant admin of agency A: %+v", helper)
	}
	staff := f.mustCall(http.MethodGet, agencyAHost, "s-a", "/api/tenant-admin/staff", nil)
	if items := staff["users"].([]any); len(items) != 2 {
		t.Fatalf("agency A has two admins now, got %d", len(items))
	}
	f.addSession("s-helper", helperID)
	f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/tenant-admin/staff/"+helperID, map[string]any{"status": "disabled"})
	var sessions int64
	f.db.Model(&model.AuthSession{}).Where("user_id = ?", helperID).Count(&sessions)
	if sessions != 0 {
		t.Fatal("disabling staff must end their sessions")
	}
	for name, request := range map[string]struct {
		session, path string
		body          map[string]any
	}{
		"disable self":           {"s-a", "/api/tenant-admin/staff/admin-a", map[string]any{"status": "disabled"}},
		"disable a customer":     {"s-a", "/api/tenant-admin/staff/user-a", map[string]any{"status": "disabled"}},
		"disable another agency": {"s-a", "/api/tenant-admin/staff/admin-b", map[string]any{"status": "disabled"}},
		"disable platform admin": {"s-a", "/api/tenant-admin/staff/platform-admin", map[string]any{"status": "disabled"}},
		"customer manages staff": {"s-user-a", "/api/tenant-admin/staff/" + helperID, map[string]any{"status": "active"}},
	} {
		if code, _ := f.call(http.MethodPatch, agencyAHost, request.session, request.path, request.body); code == http.StatusOK {
			t.Fatalf("%s must be rejected", name)
		}
	}
	// 只剩一个可用管理员时不能停用它（由另一个已停用的管理员发起同样会被拒绝）。
	var adminA model.User
	f.db.First(&adminA, "id = ?", "admin-a")
	if adminA.Status != model.UserStatusActive {
		t.Fatal("agency admin must still be active")
	}
	if code, _ := f.call(http.MethodPost, platformHost, "s-admin", "/api/tenant-admin/staff", map[string]any{"username": "p", "email": "p@p.com", "password": "Secret#12345"}); code != http.StatusForbidden {
		t.Fatalf("platform host has no agency staff, got %d", code)
	}
	if code, _ := f.call(http.MethodPost, agencyAHost, "s-user-a", "/api/tenant-admin/staff", map[string]any{"username": "p2", "email": "p2@p.com", "password": "Secret#12345"}); code != http.StatusForbidden {
		t.Fatalf("customers cannot add staff, got %d", code)
	}
}

func TestTenantCustomerExportIsScopedToTheSite(t *testing.T) {
	f := newTenantSettingsFixture(t)
	for _, record := range []any{
		&model.User{ID: "user-a2", TenantID: "agency-a", Username: "alice", Email: "alice@a.com", Phone: "+60123", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.CreditAccount{UserID: "user-a2", AvailableMicrocredits: 1_234_560_000},
		&model.User{ID: "user-b", TenantID: "agency-b", Username: "bob", Email: "bob@b.com", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.User{ID: "user-p", Username: "paula", Email: "paula@p.com", Role: model.UserRoleUser, Status: model.UserStatusActive},
	} {
		if err := f.db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	w := f.raw(http.MethodGet, agencyAHost, "s-a", "/api/tenant-admin/customers/export")
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("export failed: %d %s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "username,email,phone,created_at,credit_balance") || !strings.Contains(body, "alice,alice@a.com,+60123") && !strings.Contains(body, "alice,alice@a.com,'+60123") {
		t.Fatalf("export missing agency customer: %s", body)
	}
	if !strings.Contains(body, "1234.56") {
		t.Fatalf("export must carry the credit balance: %s", body)
	}
	for _, other := range []string{"bob", "paula", "admin-a", "platform-admin"} {
		if strings.Contains(body, other) {
			t.Fatalf("export leaked %s: %s", other, body)
		}
	}
	if code := f.raw(http.MethodGet, agencyAHost, "s-user-a", "/api/tenant-admin/customers/export").Code; code != http.StatusForbidden {
		t.Fatalf("customers cannot export, got %d", code)
	}
	if code := f.raw(http.MethodGet, platformHost, "s-admin", "/api/tenant-admin/customers/export").Code; code != http.StatusForbidden {
		t.Fatalf("platform host has no agency export, got %d", code)
	}
	if code := f.raw(http.MethodGet, agencyBHost, "s-a", "/api/tenant-admin/customers/export").Code; code != http.StatusUnauthorized {
		t.Fatalf("agency A's session must not work on agency B, got %d", code)
	}
}
