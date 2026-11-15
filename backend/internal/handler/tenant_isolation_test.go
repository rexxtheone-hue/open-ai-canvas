package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func sweepJSON(t *testing.T, body string) map[string]any {
	t.Helper()
	var envelope struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &envelope); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
	return envelope.Data
}

func TestSweepAllowlistsAreCurrent(t *testing.T) {
	f := newSweepFixture(t)
	registered := map[string]bool{}
	for _, route := range f.router.Routes() {
		registered[route.Method+" "+route.Path] = true
	}
	for key, reason := range sweepSkipRoutes {
		if !registered[key] || strings.TrimSpace(reason) == "" {
			t.Fatalf("stale or unexplained sweep skip entry %q (%q)", key, reason)
		}
	}
	for prefix, reason := range sweepPlatformCrossTenantRoutes {
		found := false
		for key := range registered {
			if strings.Contains(key, " "+prefix) {
				found = true
				break
			}
		}
		if !found || strings.TrimSpace(reason) == "" {
			t.Fatalf("stale or unexplained platform cross-tenant entry %q", prefix)
		}
	}
}

func TestFailedLoginOfUnknownAccountIsLoggedUnderRequestTenant(t *testing.T) {
	f := newSweepFixture(t)
	body := []byte(`{"username":"nobody@example.com","password":"wrong-password"}`)
	if result := f.do(http.MethodPost, agencyAHost, "", "/api/auth/login", body); result.code != http.StatusUnauthorized {
		t.Fatalf("login with unknown account: %d %s", result.code, result.body)
	}
	var logs []model.LoginLog
	f.db.Where("user_id IS NULL AND result = ?", "failed").Find(&logs)
	if len(logs) != 1 || logs[0].TenantID != "agency-a" {
		t.Fatalf("failed login log must belong to the request tenant: %+v", logs)
	}
	// 被拒绝的第三方登录回调（没有账号可对应）同样记在请求租户名下。
	if result := f.do(http.MethodGet, agencyAHost, "", "/api/auth/google/callback?error=access_denied", nil); result.code == 0 {
		t.Fatalf("google callback: %+v", result)
	}
	var rejected []model.LoginLog
	f.db.Where("method = ?", "google").Find(&rejected)
	for _, log := range rejected {
		if log.TenantID != "agency-a" {
			t.Fatalf("rejected oauth login must belong to the request tenant: %+v", log)
		}
	}
}

func TestAgencyRegistrationAgreementNeverShowsPlatformBrand(t *testing.T) {
	f := newSweepFixture(t)
	if err := f.db.Create(&model.SystemSetting{Key: "registration", ValueJSON: `{"enabled":true,"agreementTitle":"OmniMuse服务协议","agreementContent":"条款"}`}).Error; err != nil {
		t.Fatal(err)
	}
	platform := sweepJSON(t, f.do(http.MethodGet, platformHost, "", "/api/auth/settings", nil).body)
	if platform["agreementTitle"] != "OmniMuse服务协议" {
		t.Fatalf("platform keeps its own agreement title: %v", platform["agreementTitle"])
	}
	agency := sweepJSON(t, f.do(http.MethodGet, agencyAHost, "", "/api/auth/settings", nil).body)
	if agency["agreementTitle"] != "Agency A服务协议" {
		t.Fatalf("agency site must fall back to its own brand: %v", agency["agreementTitle"])
	}
	// 注册时未勾选协议的报错同样不能出现平台品牌。
	result := f.do(http.MethodPost, agencyAHost, "", "/api/auth/register", []byte(`{"username":"newcomer","password":"password-123456","email":"newcomer@example.com"}`))
	if strings.Contains(result.body, "OmniMuse") {
		t.Fatalf("registration error on an agency site mentions the platform brand: %s", result.body)
	}
	// 代理商自己填写的标题照常生效。
	f.restoreSession("s-tadmin-a")
	if result := f.do(http.MethodPatch, agencyAHost, "s-tadmin-a", "/api/admin/settings/registration", []byte(`{"enabled":true,"agreementTitle":"A 家协议","agreementContent":"A 条款"}`)); result.code != http.StatusOK {
		t.Fatalf("agency saves its own agreement: %d %s", result.code, result.body)
	}
	agency = sweepJSON(t, f.do(http.MethodGet, agencyAHost, "", "/api/auth/settings", nil).body)
	if agency["agreementTitle"] != "A 家协议" {
		t.Fatalf("agency's own agreement title: %v", agency["agreementTitle"])
	}
}

func TestPlatformOperatorPagesRejectAgencyAccounts(t *testing.T) {
	f := newSweepFixture(t)
	for _, path := range []string{
		"/api/admin/agent-lessons", "/api/admin/storage/stats", "/api/admin/resources", "/api/admin/system-performance",
		"/api/admin/settings/oss", "/api/admin/text-replay-stats", "/api/admin/channels", "/api/admin/system-update",
	} {
		for _, session := range []string{"s-tadmin-a", "s-sadmin-a"} {
			f.restoreSession(session)
			if result := f.do(http.MethodGet, agencyAHost, session, path, nil); result.code != http.StatusForbidden {
				t.Fatalf("%s as %s on agency site: %d %s", path, session, result.code, result.body)
			}
		}
		f.restoreSession("s-platform-admin")
		if result := f.do(http.MethodGet, platformHost, "s-platform-admin", path, nil); result.code == http.StatusForbidden || result.code == http.StatusUnauthorized {
			t.Fatalf("%s as platform admin: %d %s", path, result.code, result.body)
		}
	}
	// 代理商 admin 角色仍可使用已按租户隔离的后台接口。
	f.restoreSession("s-sadmin-a")
	if result := f.do(http.MethodGet, agencyAHost, "s-sadmin-a", "/api/admin/users", nil); result.code != http.StatusOK || strings.Contains(result.body, "ZZ") {
		t.Fatalf("agency admin users list: %d %s", result.code, result.body)
	}
}

func TestShareLinksOnlyOpenOnTheOwnersSite(t *testing.T) {
	f := newSweepFixture(t)
	if result := f.do(http.MethodGet, agencyBHost, "", "/api/public/canvas-shares/"+sweepShareTokenB, nil); result.code != http.StatusOK || !strings.Contains(result.body, "ZZB-canvas-title") {
		t.Fatalf("share opens on the owner's site: %d %s", result.code, result.body)
	}
	for _, host := range []string{agencyAHost, platformHost} {
		if result := f.do(http.MethodGet, host, "", "/api/public/canvas-shares/"+sweepShareTokenB, nil); result.code != http.StatusNotFound {
			t.Fatalf("share of agency B on %s: %d %s", host, result.code, result.body)
		}
	}
	if result := f.do(http.MethodGet, agencyBHost, "", "/api/public/canvas-shares/"+sweepShareTokenP, nil); result.code != http.StatusNotFound {
		t.Fatalf("platform share on agency B site: %d %s", result.code, result.body)
	}
}

func TestPublicSkillsStayInsideTheirTenant(t *testing.T) {
	f := newSweepFixture(t)
	f.restoreSession("s-user-a")
	list := f.do(http.MethodGet, agencyAHost, "s-user-a", "/api/skills", nil)
	if list.code != http.StatusOK || strings.Contains(list.body, "ZZB") || strings.Contains(list.body, "ZZP") {
		t.Fatalf("agency A skill market must not list other tenants' public skills: %d %s", list.code, list.body)
	}
	if detail := f.do(http.MethodGet, agencyAHost, "s-user-a", "/api/skills/zb-skill", nil); detail.code == http.StatusOK {
		t.Fatalf("other tenant's public skill by id: %d %s", detail.code, detail.body)
	}
	f.restoreSession("s-user-b")
	if own := f.do(http.MethodGet, agencyBHost, "s-user-b", "/api/skills", nil); !strings.Contains(own.body, "ZZB-skill-name") {
		t.Fatalf("owner tenant still sees its skill: %d %s", own.code, own.body)
	}
}

func TestBuiltinSkillAuthorUsesAgencyBrand(t *testing.T) {
	f := newSweepFixture(t)
	if err := f.db.Create(&model.Skill{ID: "builtin-demo", OwnerID: "yingce-system", AuthorName: "OmniMuse", Name: "内置演示", SourceType: "builtin", Status: 1}).Error; err != nil {
		t.Fatal(err)
	}
	f.restoreSession("s-user-a")
	agency := f.do(http.MethodGet, agencyAHost, "s-user-a", "/api/skills", nil)
	if !strings.Contains(agency.body, "内置演示") || strings.Contains(agency.body, "OmniMuse") || !strings.Contains(agency.body, "Agency A") {
		t.Fatalf("agency users see built-in skills under the agency brand: %d %s", agency.code, agency.body)
	}
	f.restoreSession("s-platform-user")
	platform := f.do(http.MethodGet, platformHost, "s-platform-user", "/api/skills", nil)
	if !strings.Contains(platform.body, "OmniMuse") {
		t.Fatalf("platform keeps the original author: %d %s", platform.code, platform.body)
	}
}
