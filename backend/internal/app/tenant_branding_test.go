package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/cfsaas"
	"yingce/backend/internal/model"
)

type fakeCustomHostnames struct {
	mu      sync.Mutex
	created []string
	deleted []string
	status  map[string]string
	seq     int
}

func (f *fakeCustomHostnames) Create(_ context.Context, hostname string) (cfsaas.Hostname, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seq++
	id := "cf-" + string(rune('0'+f.seq))
	f.created = append(f.created, hostname)
	if f.status == nil {
		f.status = map[string]string{}
	}
	f.status[id] = "pending_validation"
	return cfsaas.Hostname{ID: id, Hostname: hostname, Status: "pending", SSLStatus: "pending_validation"}, nil
}

func (f *fakeCustomHostnames) Get(_ context.Context, id string) (cfsaas.Hostname, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	status, ok := f.status[id]
	if !ok {
		return cfsaas.Hostname{}, cfsaas.ErrNotFound
	}
	return cfsaas.Hostname{ID: id, Status: "active", SSLStatus: status}, nil
}

func (f *fakeCustomHostnames) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, id)
	delete(f.status, id)
	return nil
}

func (f *fakeCustomHostnames) FallbackOrigin() string { return "connect.example-neutral.net" }

func newTenantBrandingTestService(t *testing.T) (*Service, *model.User) {
	t.Helper()
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://omnimuse.io")
	t.Setenv("TENANT_BASE_DOMAIN", "")
	svc, db := newStudioTestService(t)
	// 预置加密密钥：Windows 上首次生成密钥时目录 fsync 会失败，与本测试无关。
	if err := os.WriteFile(filepath.Join(svc.dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin-1", TenantID: model.PlatformTenantID, Username: "admin-1", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	for _, record := range []any{
		admin,
		&model.Tenant{ID: "agency-a", Slug: "agency-a", Name: "Acme Studio", Status: model.TenantStatusActive},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	return svc, admin
}

func TestTenantDomainLifecycleWithCustomHostnames(t *testing.T) {
	svc, admin := newTenantBrandingTestService(t)
	fake := &fakeCustomHostnames{}
	svc.SetCustomHostnameClient(fake)
	ctx := context.Background()

	// 先解析一次让缓存记住「未登记 → 平台」，验证添加后缓存会失效。
	if tenant, _ := svc.ResolveTenant("studio.acme.com"); tenant.ID != model.PlatformTenantID {
		t.Fatalf("unregistered host resolved to %q", tenant.ID)
	}
	added, err := svc.AddTenantDomain(ctx, admin, "agency-a", TenantDomainRequest{Host: " Studio.Acme.com. "})
	if err != nil {
		t.Fatal(err)
	}
	if added.Host != "studio.acme.com" || !added.IsPrimary || added.SSLStatus != "pending_validation" || !added.Managed || added.CNAMETarget != "connect.example-neutral.net" {
		t.Fatalf("added domain = %+v", added)
	}
	stored, _ := svc.repo.TenantDomainByHost("studio.acme.com")
	if stored == nil || stored.CFHostnameID != "cf-1" {
		t.Fatalf("stored domain = %+v", stored)
	}
	if tenant, _ := svc.ResolveTenant("studio.acme.com"); tenant.ID != "agency-a" {
		t.Fatalf("tenant cache was not invalidated, got %q", tenant.ID)
	}
	if _, err := svc.AddTenantDomain(ctx, admin, "agency-a", TenantDomainRequest{Host: "studio.acme.com"}); err == nil {
		t.Fatal("duplicate host must be rejected")
	}
	if _, err := svc.AddTenantDomain(ctx, admin, "agency-a", TenantDomainRequest{Host: "omnimuse.io"}); err == nil {
		t.Fatal("platform host must not be assignable to an agency")
	}

	fake.status["cf-1"] = "active"
	refreshed, err := svc.RefreshTenantDomain(ctx, admin, "agency-a", added.ID)
	if err != nil || refreshed.SSLStatus != "active" {
		t.Fatalf("refresh = %+v, %v", refreshed, err)
	}
	if stored, _ := svc.repo.TenantDomainByHost("studio.acme.com"); stored.SSLStatus != "active" {
		t.Fatalf("refreshed status not stored: %+v", stored)
	}

	second, err := svc.AddTenantDomain(ctx, admin, "agency-a", TenantDomainRequest{Host: "app.acme.com"})
	if err != nil || second.IsPrimary {
		t.Fatalf("second domain = %+v, %v", second, err)
	}
	domains, err := svc.SetTenantPrimaryDomain(admin, "agency-a", second.ID)
	if err != nil || len(domains) != 2 || domains[0].ID != second.ID || !domains[0].IsPrimary || domains[1].IsPrimary {
		t.Fatalf("set primary = %+v, %v", domains, err)
	}

	domains, err = svc.RemoveTenantDomain(ctx, admin, "agency-a", second.ID)
	if err != nil || len(domains) != 1 || domains[0].ID != added.ID || !domains[0].IsPrimary {
		t.Fatalf("remove = %+v, %v", domains, err)
	}
	if len(fake.deleted) != 1 || fake.deleted[0] != "cf-2" {
		t.Fatalf("cloudflare deletes = %v", fake.deleted)
	}
	if tenant, _ := svc.ResolveTenant("app.acme.com"); tenant.ID != model.PlatformTenantID {
		t.Fatal("removed host must stop resolving to the agency")
	}

	// 权限：普通用户、代理商管理员都不能管理网址；代理商管理员可只读自己的网址。
	user := &model.User{ID: "u", TenantID: model.PlatformTenantID, Role: model.UserRoleUser}
	if _, err := svc.AddTenantDomain(ctx, user, "agency-a", TenantDomainRequest{Host: "x.acme.com"}); err == nil {
		t.Fatal("non-admin must not add domains")
	}
	agencyAdmin := &model.User{ID: "ta", TenantID: "agency-a", Role: model.UserRoleTenantAdmin}
	if _, err := svc.AdminTenantDomains(agencyAdmin, "agency-a"); err == nil {
		t.Fatal("tenant admin must not use platform domain APIs")
	}
	agencyTenant, _ := svc.ResolveTenant("studio.acme.com")
	own, err := svc.TenantOwnDomains(WithTenant(ctx, agencyTenant), agencyAdmin)
	if err != nil || len(own) != 1 || own[0].Host != "studio.acme.com" {
		t.Fatalf("tenant own domains = %+v, %v", own, err)
	}
	if _, err := svc.TenantOwnDomains(WithTenant(ctx, agencyTenant), &model.User{ID: "m", TenantID: "agency-a", Role: model.UserRoleUser}); err == nil {
		t.Fatal("agency members are not tenant admins")
	}
	if _, err := svc.TenantOwnDomains(ctx, agencyAdmin); err == nil {
		t.Fatal("tenant admin must not read domains on another tenant's site")
	}
}

func TestDefaultTenantSubdomainFromBaseDomain(t *testing.T) {
	svc, admin := newTenantBrandingTestService(t)
	t.Setenv("TENANT_BASE_DOMAIN", "Studios.Example.net")
	domains, err := svc.AdminTenantDomains(admin, "agency-a")
	if err != nil || len(domains) != 1 || domains[0].Host != "agency-a.studios.example.net" || !domains[0].IsPrimary || domains[0].Managed {
		t.Fatalf("default subdomain = %+v, %v", domains, err)
	}
	if again, _ := svc.AdminTenantDomains(admin, "agency-a"); len(again) != 1 {
		t.Fatalf("default subdomain must be created once, got %+v", again)
	}
	if tenant, _ := svc.ResolveTenant("agency-a.studios.example.net"); tenant.ID != "agency-a" {
		t.Fatalf("default subdomain resolves to %q", tenant.ID)
	}
}

func TestAddTenantDomainWithoutCloudflareConfig(t *testing.T) {
	svc, admin := newTenantBrandingTestService(t)
	t.Setenv("CF_SAAS_ZONE_ID", "")
	t.Setenv("CF_SAAS_API_TOKEN", "")
	if _, err := svc.AddTenantDomain(context.Background(), admin, "agency-a", TenantDomainRequest{Host: "studio.acme.com"}); err == nil || !strings.Contains(err.Error(), "CF_SAAS_ZONE_ID") {
		t.Fatalf("missing cloudflare config error = %v", err)
	}
	if domain, _ := svc.repo.TenantDomainByHost("studio.acme.com"); domain != nil {
		t.Fatal("no domain row may be written when cloudflare is unavailable")
	}
}

func seedAgencyDomain(t *testing.T, svc *Service) model.Tenant {
	t.Helper()
	if err := svc.repo.CreateTenantDomain(&model.TenantDomain{ID: "d-acme", TenantID: "agency-a", Host: "studio.acme.com", IsPrimary: true, SSLStatus: "active"}); err != nil {
		t.Fatal(err)
	}
	tenant, err := svc.ResolveTenant("studio.acme.com")
	if err != nil || tenant.ID != "agency-a" {
		t.Fatalf("resolve agency = %+v, %v", tenant, err)
	}
	return tenant
}

func TestPublicResourceURLUsesTenantHostAndValidates(t *testing.T) {
	svc, _ := newTenantBrandingTestService(t)
	agency := seedAgencyDomain(t, svc)
	resource := model.Resource{ID: "res-1", UserID: "admin-1", Kind: "image", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/admin-1/image/a.png", MimeType: "image/png"}
	if err := svc.repo.CreateResource(&resource); err != nil {
		t.Fatal(err)
	}
	expires := time.Now().Add(time.Hour)
	for _, tc := range []struct {
		name string
		ctx  context.Context
		host string
	}{
		{"platform", context.Background(), "omnimuse.io"},
		{"agency", WithTenant(context.Background(), agency), "studio.acme.com"},
	} {
		link, err := svc.PublicResourceURL(tc.ctx, &resource, expires)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		parsed, err := url.Parse(link)
		if err != nil || parsed.Scheme != "https" || parsed.Host != tc.host || parsed.Path != "/api/public/resources/res-1/file" {
			t.Fatalf("%s: link = %s", tc.name, link)
		}
		query := parsed.Query()
		delivery, err := svc.PreparePublicResourceDelivery("res-1", query.Get("expires"), query.Get("signature"), ResourceAccessOptions{Variant: assets.ResourceVariant(query.Get("variant")), DescribeOnly: true}, "")
		if err != nil || delivery == nil || delivery.Resource.ID != "res-1" {
			t.Fatalf("%s: signed link did not validate: %v", tc.name, err)
		}
		if _, err := svc.PreparePublicResourceDelivery("res-1", query.Get("expires"), query.Get("signature")+"x", ResourceAccessOptions{DescribeOnly: true}, ""); err == nil {
			t.Fatalf("%s: tampered signature accepted", tc.name)
		}
	}

	// 代理商还没有可用网址时，绝不退回平台网址。
	bare := model.Tenant{ID: "agency-b", Slug: "agency-b", Name: "Bare"}
	link, err := svc.PublicResourceURL(WithTenant(context.Background(), bare), &resource, expires)
	if err != nil || strings.Contains(link, "omnimuse") || !strings.HasPrefix(link, "/api/public/resources/") {
		t.Fatalf("agency without domain link = %s, %v", link, err)
	}
}

func enableTestEmail(t *testing.T, svc *Service, admin *model.User) *[]string {
	t.Helper()
	if _, err := svc.auth.UpdateEmailSetting(admin, auth.EmailSettingRequest{Enabled: true, Host: "smtp.example.com", Port: 587, FromEmail: "noreply@omnimuse.io", FromName: "OmniMuse Team"}); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	sent := []string{}
	svc.auth.SetMailSender(func(setting auth.EmailSettingValue, recipient, subject, body string) error {
		mu.Lock()
		defer mu.Unlock()
		sent = append(sent, setting.FromName+"|"+setting.FromEmail+"|"+recipient+"|"+subject+"|"+body)
		return nil
	})
	return &sent
}

func TestNoticeEmailUsesRecipientTenantBrandAndLinks(t *testing.T) {
	svc, admin := newTenantBrandingTestService(t)
	agency := seedAgencyDomain(t, svc)
	sent := enableTestEmail(t, svc, admin)
	lots := []model.CreditLot{{ID: "lot", RemainingMicrocredits: 5 * CreditScale, ExpiresAt: time.Now().Add(72 * time.Hour)}}

	if err := svc.auth.SendNoticeEmail(context.Background(), agency.ID, "m@acme.com", creditLotReminderEmail(lots, time.Now(), svc.studioLink(agency), 1)); err != nil {
		t.Fatal(err)
	}
	if err := svc.auth.SendNoticeEmail(context.Background(), model.PlatformTenantID, "p@example.com", creditLotReminderEmail(lots, time.Now(), svc.studioLink(svc.tenantByID("")), 1)); err != nil {
		t.Fatal(err)
	}
	if len(*sent) != 2 {
		t.Fatalf("sent = %v", *sent)
	}
	agencyMail, platformMail := (*sent)[0], (*sent)[1]
	if !strings.HasPrefix(agencyMail, "Acme Studio|noreply@omnimuse.io|") || !strings.Contains(agencyMail, "https://studio.acme.com/studio") || !strings.Contains(agencyMail, "The Acme Studio team") {
		t.Fatalf("agency mail = %s", agencyMail)
	}
	// 发件地址沿用平台 SMTP，是唯一允许出现平台域名的地方；正文与显示名不能有。
	if body := strings.SplitN(agencyMail, "|", 3)[2]; regexp.MustCompile(`(?i)omnimuse`).MatchString(body) {
		t.Fatalf("agency mail leaks platform brand: %s", body)
	}
	if !strings.HasPrefix(platformMail, "OmniMuse Team|noreply@omnimuse.io|") || !strings.Contains(platformMail, "https://omnimuse.io/studio") {
		t.Fatalf("platform mail changed: %s", platformMail)
	}
}

func TestAuthEmailBrandFollowsRequestTenant(t *testing.T) {
	svc, admin := newTenantBrandingTestService(t)
	agency := seedAgencyDomain(t, svc)
	host := authHost{svc: svc}
	brand := host.EmailBrand(WithTenant(context.Background(), agency), "")
	if brand.Name != "Acme Studio" || brand.IsPlatform || brand.SiteURL != "https://studio.acme.com/" || brand.AccentColor == "" {
		t.Fatalf("agency email brand = %+v", brand)
	}
	if byID := host.EmailBrand(context.Background(), "agency-a"); byID.Name != "Acme Studio" {
		t.Fatalf("brand by tenant id = %+v", byID)
	}
	platform := host.EmailBrand(context.Background(), "")
	if platform.Name != "OmniMuse" || !platform.IsPlatform || platform.SiteURL != "" || platform.AccentColor != "" {
		t.Fatalf("platform email brand = %+v", platform)
	}
	_ = admin
}

var platformLeak = regexp.MustCompile(`(?i)omnimuse`)

// 漏出检查：代理商网站对外的公开设置、外观、邮件和媒体链接里不能出现平台品牌。
func TestAgencyOutputsDoNotLeakPlatformBrand(t *testing.T) {
	svc, admin := newTenantBrandingTestService(t)
	agency := seedAgencyDomain(t, svc)
	ctx := WithTenant(context.Background(), agency)

	// 平台后台把画布助手和外观文案都写成了平台品牌。
	current, err := svc.AdminAppearance(admin)
	if err != nil {
		t.Fatal(err)
	}
	next := current.AppearanceSetting
	next.Canvas.AgentName = "OmniMuse"
	next.Canvas.WelcomeTitle = "欢迎来到 OMNIMUSE"
	next.AuthHeroDescription = "OmniMuse 让创作更简单"
	next.SEOKeywords = "omnimuse, ai"
	next.FooterCopyright = "© OmniMuse"
	if _, err := svc.UpdateAppearance(admin, next); err != nil {
		t.Fatal(err)
	}

	appearance, err := svc.PublicAppearanceFor(ctx)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(map[string]any{"appearance": appearance})
	if n := len(platformLeak.FindAll(encoded, -1)); n != 0 {
		t.Fatalf("public appearance leaks platform brand %d times: %s", n, encoded)
	}
	if appearance.IsPlatform || appearance.BrandName != "Acme Studio" || appearance.Canvas.AgentName != "Acme Studio" {
		t.Fatalf("agency appearance = %+v", appearance)
	}
	platformAppearance, err := svc.PublicAppearanceFor(context.Background())
	if err != nil || !platformAppearance.IsPlatform || platformAppearance.BrandName != "OmniMuse" || platformAppearance.Canvas.AgentName != "OmniMuse" {
		t.Fatalf("platform appearance changed: %+v, %v", platformAppearance, err)
	}

	sent := enableTestEmail(t, svc, admin)
	if err := svc.SendRegistrationEmailCode(ctx, "new@acme.com"); err != nil && !errors.Is(err, auth.ErrEmailNotConfigured) {
		t.Logf("registration email skipped: %v", err)
	}
	if err := svc.auth.SendNoticeEmail(ctx, "", "m@acme.com", auth.EmailContent{Subject: "Hello", Heading: "Hi", ButtonText: "Open", ButtonURL: svc.studioLink(agency)}); err != nil {
		t.Fatal(err)
	}
	if len(*sent) == 0 {
		t.Fatal("no email sent")
	}
	for _, mail := range *sent {
		fields := strings.SplitN(mail, "|", 3)
		if n := len(platformLeak.FindAllString(fields[0]+fields[2], -1)); n != 0 {
			t.Fatalf("agency email leaks platform brand %d times: %s", n, mail)
		}
	}

	resource := model.Resource{ID: "res-leak", UserID: "admin-1", Kind: "image", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/admin-1/image/b.png", MimeType: "image/png"}
	if err := svc.repo.CreateResource(&resource); err != nil {
		t.Fatal(err)
	}
	link, err := svc.PublicResourceURL(ctx, &resource, time.Now().Add(time.Hour))
	if err != nil || platformLeak.MatchString(link) {
		t.Fatalf("agency media link = %s, %v", link, err)
	}
	if svc.studioLink(agency) != "https://studio.acme.com/studio" {
		t.Fatalf("agency studio link = %s", svc.studioLink(agency))
	}
}
