package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const (
	platformHost = "omnimuse.io"
	agencyAHost  = "studio.agency-a.com"
	agencyBHost  = "studio.agency-b.com"
)

type tenantSettingsFixture struct {
	t      *testing.T
	db     *gorm.DB
	router *gin.Engine
}

func newTenantSettingsFixture(t *testing.T) *tenantSettingsFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	expires := time.Now().Add(time.Hour)
	for _, record := range []any{
		&model.Tenant{ID: "agency-a", Slug: "agency-a", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "da", TenantID: "agency-a", Host: agencyAHost},
		&model.Tenant{ID: "agency-b", Slug: "agency-b", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "db", TenantID: "agency-b", Host: agencyBHost},
		&model.User{ID: "platform-admin", Username: "platform-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive},
		&model.User{ID: "admin-a", TenantID: "agency-a", Username: "admin-a", Role: model.UserRoleTenantAdmin, Status: model.UserStatusActive},
		&model.User{ID: "admin-b", TenantID: "agency-b", Username: "admin-b", Role: model.UserRoleTenantAdmin, Status: model.UserStatusActive},
		&model.User{ID: "user-a", TenantID: "agency-a", Username: "user-a", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "s-admin", UserID: "platform-admin", TokenHash: auth.HashToken("t"), ExpiresAt: expires},
		&model.AuthSession{ID: "s-a", UserID: "admin-a", TokenHash: auth.HashToken("t"), ExpiresAt: expires},
		&model.AuthSession{ID: "s-b", UserID: "admin-b", TokenHash: auth.HashToken("t"), ExpiresAt: expires},
		&model.AuthSession{ID: "s-user-a", UserID: "user-a", TokenHash: auth.HashToken("t"), ExpiresAt: expires},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	dataDir := t.TempDir()
	// 预先放好设置加密密钥：Windows 上首次生成密钥时同步目录会失败，与本测试无关。
	if err := os.WriteFile(filepath.Join(dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), dataDir)
	router := gin.New()
	router.Use(TenantMiddleware(svc))
	RegisterCanvasAPI(router.Group("/api"), svc)
	return &tenantSettingsFixture{t: t, db: db, router: router}
}

func (f *tenantSettingsFixture) call(method, host, session, path string, body any) (int, map[string]any) {
	f.t.Helper()
	var reader *strings.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		reader = strings.NewReader(string(encoded))
	} else {
		reader = strings.NewReader("")
	}
	r := httptest.NewRequest(method, path, reader)
	r.Host = host
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	if session != "" {
		r.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session + ".t"})
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r)
	var envelope struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &envelope)
	return w.Code, envelope.Data
}

func (f *tenantSettingsFixture) mustCall(method, host, session, path string, body any) map[string]any {
	f.t.Helper()
	code, data := f.call(method, host, session, path, body)
	if code != http.StatusOK {
		f.t.Fatalf("%s %s on %s as %s: status %d", method, path, host, session, code)
	}
	return data
}

func nested(data map[string]any, keys ...string) any {
	var current any = data
	for _, key := range keys {
		object, _ := current.(map[string]any)
		current = object[key]
	}
	return current
}

func (f *tenantSettingsFixture) systemSettingJSON(key string) string {
	var setting model.SystemSetting
	f.db.Where("key = ?", key).Limit(1).Find(&setting)
	return setting.ValueJSON
}

func (f *tenantSettingsFixture) tenantSettingJSON(tenantID, key string) string {
	var setting model.TenantSetting
	f.db.Where("tenant_id = ? AND key = ?", tenantID, key).Limit(1).Find(&setting)
	return setting.ValueJSON
}

func TestTenantAppearanceOverrideOnlyAppliesOnItsOwnSite(t *testing.T) {
	f := newTenantSettingsFixture(t)
	current := f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/settings/appearance", nil)
	platformAppearance := current["setting"].(map[string]any)
	platformAppearance["brandName"] = "Platform Brand"
	platformAppearance["icpFilingEnabled"] = true
	platformAppearance["icpFilingNumber"] = "平台备案-001"
	f.mustCall(http.MethodPatch, platformHost, "s-admin", "/api/admin/settings/appearance", platformAppearance)

	agencyView := f.mustCall(http.MethodGet, agencyAHost, "s-a", "/api/admin/settings/appearance", nil)
	agencyAppearance := agencyView["setting"].(map[string]any)
	agencyAppearance["brandName"] = "Agency A"
	agencyAppearance["seoTitle"] = "Agency A Studio"
	// 备案号是平台专属字段，代理商提交也不能生效。
	agencyAppearance["icpFilingNumber"] = "代理商备案-999"
	agencyAppearance["icpFilingEnabled"] = false
	f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/admin/settings/appearance", agencyAppearance)

	stored := f.tenantSettingJSON("agency-a", "appearance")
	if !strings.Contains(stored, "Agency A") || strings.Contains(stored, "icpFiling") || strings.Contains(stored, "updates") {
		t.Fatalf("only whitelisted appearance fields are stored for the agency: %s", stored)
	}
	if !strings.Contains(f.systemSettingJSON("appearance"), "Platform Brand") {
		t.Fatal("an agency save must not touch the platform appearance")
	}

	// 代理商网站不显示平台的品牌和备案号；没有自己设置品牌的代理商用租户名称。
	for host, want := range map[string]string{platformHost: "Platform Brand", agencyAHost: "Agency A"} {
		public := f.mustCall(http.MethodGet, host, "", "/api/public/appearance", nil)
		if got := nested(public, "appearance", "brandName"); got != want {
			t.Fatalf("brand on %s = %v, want %s", host, got, want)
		}
	}
	if got := nested(f.mustCall(http.MethodGet, agencyBHost, "", "/api/public/appearance", nil), "appearance", "brandName"); got == "Platform Brand" || got == "" {
		t.Fatalf("an agency without its own brand must not show the platform brand, got %v", got)
	}
	if got := nested(f.mustCall(http.MethodGet, platformHost, "", "/api/public/appearance", nil), "appearance", "icpFilingNumber"); got != "平台备案-001" {
		t.Fatalf("platform ICP filing changed: %v", got)
	}
	for _, host := range []string{agencyAHost, agencyBHost} {
		if got := nested(f.mustCall(http.MethodGet, host, "", "/api/public/appearance", nil), "appearance", "icpFilingNumber"); got != "" && got != nil {
			t.Fatalf("ICP filing must not show on %s, got %v", host, got)
		}
	}
	if got := nested(f.mustCall(http.MethodGet, agencyAHost, "", "/api/public/appearance", nil), "appearance", "seoTitle"); got != "Agency A Studio" {
		t.Fatalf("agency SEO title not applied: %v", got)
	}

	// 代理商恢复默认只删自己的覆盖，平台品牌保持不变。
	f.mustCall(http.MethodDelete, agencyAHost, "s-a", "/api/admin/settings/appearance", nil)
	if got := nested(f.mustCall(http.MethodGet, agencyAHost, "", "/api/public/appearance", nil), "appearance", "brandName"); got == "Platform Brand" || got == "Agency A" {
		t.Fatalf("after reset the agency falls back to its tenant name, never the platform brand, got %v", got)
	}
	if got := nested(f.mustCall(http.MethodGet, platformHost, "", "/api/public/appearance", nil), "appearance", "brandName"); got != "Platform Brand" {
		t.Fatalf("agency reset must not reset the platform, got %v", got)
	}
}

func TestTenantAdminCannotReadOrChangeSMTPCredentials(t *testing.T) {
	f := newTenantSettingsFixture(t)
	f.mustCall(http.MethodPatch, platformHost, "s-admin", "/api/admin/settings/email", map[string]any{
		"enabled": true, "host": "smtp.platform.com", "port": 465, "username": "mailer", "password": "platform-secret",
		"encryption": "tls", "fromEmail": "noreply@omnimuse.io", "fromName": "OmniMuse",
	})
	platformBefore := f.systemSettingJSON("email")

	view := f.mustCall(http.MethodGet, agencyAHost, "s-a", "/api/admin/settings/email", nil)
	setting := view["setting"].(map[string]any)
	if setting["host"] != "" || setting["username"] != "" || setting["hasPassword"] != false || setting["port"] != float64(0) {
		t.Fatalf("agency admin must not see SMTP details: %+v", setting)
	}

	saved := f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/admin/settings/email", map[string]any{
		"enabled": false, "host": "smtp.evil.com", "port": 25, "username": "evil", "password": "stolen",
		"fromEmail": "hello@agency-a.com", "fromName": "Agency A", "registrationAllowedDomains": []string{"agency-a.com"},
	})
	if got := nested(saved, "setting", "fromName"); got != "Agency A" {
		t.Fatalf("agency sender name not saved: %v", got)
	}
	if got := nested(saved, "setting", "host"); got != "" {
		t.Fatalf("SMTP host leaked to agency admin: %v", got)
	}
	if f.systemSettingJSON("email") != platformBefore {
		t.Fatal("agency admin changed the platform SMTP setting")
	}
	stored := f.tenantSettingJSON("agency-a", "email")
	for _, forbidden := range []string{"smtp.evil.com", "stolen", "evil", "\"host\"", "\"password\"", "\"enabled\""} {
		if strings.Contains(stored, forbidden) {
			t.Fatalf("agency email layer stored a platform-only field (%s): %s", forbidden, stored)
		}
	}

	platformView := f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/settings/email", nil)
	if nested(platformView, "setting", "host") != "smtp.platform.com" || nested(platformView, "setting", "fromName") != "OmniMuse" || nested(platformView, "setting", "enabled") != true {
		t.Fatalf("platform email setting changed: %+v", platformView)
	}
}

func TestTenantAdminCannotWidenFeatureAvailability(t *testing.T) {
	f := newTenantSettingsFixture(t)
	// 平台默认：短剧开放、前台模型目录关闭。
	saved := f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/admin/settings/features", map[string]any{
		"frontendModelsEnabled": true, "shortDramaEnabled": false,
	})
	if nested(saved, "features", "frontendModelsEnabled") != false {
		t.Fatal("an agency must not open a feature the platform keeps closed")
	}
	if nested(saved, "features", "shortDramaEnabled") != false {
		t.Fatal("an agency may close a feature the platform has open")
	}
	if strings.Contains(f.tenantSettingJSON("agency-a", "feature_availability"), "frontendModels") {
		t.Fatal("the widening attempt must not be stored")
	}
	platform := f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/settings/features", nil)
	if nested(platform, "features", "shortDramaEnabled") != true {
		t.Fatal("agency changes must not reach the platform")
	}
	if got := nested(f.mustCall(http.MethodGet, agencyBHost, "s-b", "/api/admin/settings/features", nil), "features", "shortDramaEnabled"); got != true {
		t.Fatalf("agency A's choice must not affect agency B: %v", got)
	}

	// 功能守卫按网址生效：代理商关闭短剧后，它网址上的短剧接口不可用。
	if code, _ := f.call(http.MethodGet, agencyAHost, "s-user-a", "/api/projects", nil); code != http.StatusForbidden {
		t.Fatalf("short drama routes on agency A must be closed, got %d", code)
	}
	if code, _ := f.call(http.MethodGet, platformHost, "s-admin", "/api/projects", nil); code == http.StatusForbidden {
		t.Fatal("short drama routes on the platform must stay open")
	}
}

func TestTenantAdminRejectedOnPlatformOnlyEndpointsAndOtherSites(t *testing.T) {
	f := newTenantSettingsFixture(t)
	for _, endpoint := range []struct{ method, path string }{
		{http.MethodGet, "/api/admin/settings/oss"},
		{http.MethodPatch, "/api/admin/settings/billing-currency"},
		{http.MethodGet, "/api/admin/settings/runtime-policy"},
		{http.MethodPatch, "/api/admin/settings/drawing-engine"},
		{http.MethodGet, "/api/admin/settings/linuxdo"},
		{http.MethodGet, "/api/admin/settings/libtv"},
		{http.MethodGet, "/api/admin/settings/response-interception"},
		{http.MethodGet, "/api/admin/users"},
	} {
		if code, _ := f.call(endpoint.method, agencyAHost, "s-a", endpoint.path, map[string]any{}); code != http.StatusForbidden {
			t.Fatalf("%s %s must be platform-only, got %d", endpoint.method, endpoint.path, code)
		}
	}
	// 拿 A 的登录去 B 的网址：登录状态本身就不被承认。
	if code, _ := f.call(http.MethodPatch, agencyBHost, "s-a", "/api/admin/settings/registration", map[string]any{"enabled": false}); code != http.StatusUnauthorized {
		t.Fatalf("agency A's admin must not act on agency B's site, got %d", code)
	}
	// 普通代理商用户不能改设置。
	if code, _ := f.call(http.MethodPatch, agencyAHost, "s-user-a", "/api/admin/settings/registration", map[string]any{"enabled": false}); code != http.StatusForbidden {
		t.Fatalf("a regular agency user must not change settings, got %d", code)
	}

	agencyA := model.Tenant{ID: "agency-a"}
	agencyB := model.Tenant{ID: "agency-b"}
	platform := model.Tenant{ID: model.PlatformTenantID, IsPlatform: true}
	adminA := &model.User{ID: "admin-a", TenantID: "agency-a", Role: model.UserRoleTenantAdmin}
	platformAdmin := &model.User{ID: "platform-admin", Role: model.UserRoleAdmin}
	if tenantLayer, err := service.RequireTenantAdminOrAdmin(adminA, agencyA); err != nil || !tenantLayer {
		t.Fatalf("agency admin on its own site writes the tenant layer: %v %v", tenantLayer, err)
	}
	for name, check := range map[string]func() error{
		"agency admin on another agency": func() error { _, err := service.RequireTenantAdminOrAdmin(adminA, agencyB); return err },
		"agency admin on the platform":   func() error { _, err := service.RequireTenantAdminOrAdmin(adminA, platform); return err },
		"platform admin on an agency":    func() error { _, err := service.RequireTenantAdminOrAdmin(platformAdmin, agencyA); return err },
	} {
		err := check()
		var appErr *service.AuthError
		if err == nil || !errors.As(err, &appErr) || appErr.Status != http.StatusForbidden {
			t.Fatalf("%s must be forbidden, got %v", name, err)
		}
	}
	if tenantLayer, err := service.RequireTenantAdminOrAdmin(platformAdmin, platform); err != nil || tenantLayer {
		t.Fatalf("platform admin on the platform writes system settings: %v %v", tenantLayer, err)
	}
}

func TestTenantRegistrationCreditsAndSiteContentAreScopedToTheSite(t *testing.T) {
	f := newTenantSettingsFixture(t)
	f.mustCall(http.MethodPatch, platformHost, "s-admin", "/api/admin/settings/registration", map[string]any{"enabled": true, "agreementTitle": "平台协议", "agreementContent": "平台条款"})
	f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/admin/settings/registration", map[string]any{"enabled": false, "agreementTitle": "A 协议", "agreementContent": "A 条款"})

	platformAuth := f.mustCall(http.MethodGet, platformHost, "", "/api/auth/settings", nil)
	agencyAuth := f.mustCall(http.MethodGet, agencyAHost, "", "/api/auth/settings", nil)
	otherAuth := f.mustCall(http.MethodGet, agencyBHost, "", "/api/auth/settings", nil)
	if platformAuth["agreementTitle"] != "平台协议" || platformAuth["registrationEnabled"] != true {
		t.Fatalf("platform registration changed: %+v", platformAuth)
	}
	if agencyAuth["agreementTitle"] != "A 协议" || agencyAuth["agreementContent"] != "A 条款" || agencyAuth["registrationEnabled"] != false {
		t.Fatalf("agency registration override missing: %+v", agencyAuth)
	}
	if otherAuth["agreementTitle"] != "平台协议" || otherAuth["registrationEnabled"] != true {
		t.Fatalf("agency A's registration leaked to agency B: %+v", otherAuth)
	}

	before := f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/settings/credits", nil)
	saved := f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/admin/settings/credits", map[string]any{
		"signupBonusMicrocredits": 5_000_000, "checkinBonusMicrocredits": 99_000_000, "defaultMultiplierBasisPoints": 1,
	})
	if nested(saved, "policy", "signupBonusMicrocredits") != float64(5_000_000) {
		t.Fatalf("agency signup bonus not applied: %+v", saved)
	}
	if nested(saved, "policy", "checkinBonusMicrocredits") != nested(before, "policy", "checkinBonusMicrocredits") ||
		nested(saved, "policy", "defaultMultiplierBasisPoints") != nested(before, "policy", "defaultMultiplierBasisPoints") {
		t.Fatalf("non-whitelisted credit fields must be ignored: %+v", saved)
	}
	if got := f.mustCall(http.MethodGet, agencyAHost, "", "/api/auth/settings", nil)["signupBonusMicrocredits"]; got != float64(5_000_000) {
		t.Fatalf("agency signup bonus not shown on its register page: %v", got)
	}
	if got := f.mustCall(http.MethodGet, platformHost, "", "/api/auth/settings", nil)["signupBonusMicrocredits"]; got != nested(before, "policy", "signupBonusMicrocredits") {
		t.Fatalf("platform signup bonus changed: %v", got)
	}

	f.mustCall(http.MethodPut, platformHost, "s-admin", "/api/admin/studio/site-content/terms", map[string]any{"content": "平台条款正文"})
	f.mustCall(http.MethodPut, agencyAHost, "s-a", "/api/admin/studio/site-content/terms", map[string]any{"content": "A 条款正文"})
	if got := f.mustCall(http.MethodGet, agencyAHost, "", "/api/studio/site-content", nil)["terms"]; got != "A 条款正文" {
		t.Fatalf("agency terms not applied: %v", got)
	}
	if got := f.mustCall(http.MethodGet, platformHost, "", "/api/studio/site-content", nil)["terms"]; got != "平台条款正文" {
		t.Fatalf("platform terms changed: %v", got)
	}
	if got := f.mustCall(http.MethodGet, agencyBHost, "", "/api/studio/site-content", nil)["terms"]; got != "" {
		t.Fatalf("an agency without its own terms must not show the platform terms: %v", got)
	}
}

func TestTenantGoogleOAuthIsTheAgencysOwn(t *testing.T) {
	f := newTenantSettingsFixture(t)
	f.mustCall(http.MethodPatch, platformHost, "s-admin", "/api/admin/settings/google", map[string]any{
		"enabled": true, "clientId": "platform.apps.googleusercontent.com", "clientSecret": "platform-secret", "redirectUrl": "https://omnimuse.io/api/auth/google/callback",
	})
	view := f.mustCall(http.MethodGet, agencyAHost, "s-a", "/api/admin/settings/google", nil)
	if nested(view, "setting", "clientId") != "" || nested(view, "setting", "hasClientSecret") != false {
		t.Fatalf("agency must not inherit the platform Google client: %+v", view)
	}
	if f.mustCall(http.MethodGet, agencyAHost, "", "/api/auth/settings", nil)["googleEnabled"] != false {
		t.Fatal("Google login must be off on an agency site without its own client")
	}
	f.mustCall(http.MethodPatch, agencyAHost, "s-a", "/api/admin/settings/google", map[string]any{
		"enabled": true, "clientId": "agency.apps.googleusercontent.com", "clientSecret": "agency-secret", "redirectUrl": "https://studio.agency-a.com/api/auth/google/callback",
	})
	if stored := f.tenantSettingJSON("agency-a", "google_oauth"); strings.Contains(stored, "agency-secret") {
		t.Fatal("agency Google client secret must be stored encrypted")
	}
	if f.mustCall(http.MethodGet, agencyAHost, "", "/api/auth/settings", nil)["googleEnabled"] != true {
		t.Fatal("agency Google login should be enabled with its own client")
	}
	if got := nested(f.mustCall(http.MethodGet, platformHost, "s-admin", "/api/admin/settings/google", nil), "setting", "clientId"); got != "platform.apps.googleusercontent.com" {
		t.Fatalf("platform Google client changed: %v", got)
	}
}
