package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

type tenantAccountsFixture struct {
	svc      *Service
	db       *gorm.DB
	platform context.Context
	agency   context.Context
	codes    map[string]string
}

func newTenantAccountsFixture(t *testing.T) *tenantAccountsFixture {
	t.Helper()
	svc, db := newStudioTestService(t)
	// 预先放好设置密钥，避免在 Windows 上创建密钥文件时同步目录失败。
	if err := os.WriteFile(filepath.Join(svc.dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	agencyTenant := model.Tenant{ID: "agency-a", Slug: "agency-a", Name: "Agency A", Status: model.TenantStatusActive}
	for _, record := range []any{
		&agencyTenant,
		&model.SystemSetting{Key: "email", ValueJSON: `{"enabled":true,"host":"smtp.example.com","port":587,"encryption":"starttls","fromEmail":"noreply@example.com","fromName":"OmniMuse","registrationAllowedDomains":["example.com"]}`},
		&model.SystemSetting{Key: "registration", ValueJSON: `{"enabled":true}`},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	f := &tenantAccountsFixture{
		svc:      svc,
		db:       db,
		platform: WithTenant(context.Background(), TenantFromContext(nil)),
		agency:   WithTenant(context.Background(), agencyTenant),
		codes:    map[string]string{},
	}
	svc.auth.SetMailSender(func(_ auth.EmailSettingValue, to, _ string, body string) error {
		marker := "Your verification code: "
		if i := strings.Index(body, marker); i >= 0 {
			value := body[i+len(marker):]
			if end := strings.IndexByte(value, '\n'); end >= 0 {
				value = value[:end]
			}
			f.codes[to] = strings.TrimSpace(value)
		}
		return nil
	})
	return f
}

func (f *tenantAccountsFixture) register(t *testing.T, ctx context.Context, email, password string) *AuthSessionResult {
	t.Helper()
	if err := f.svc.SendRegistrationEmailCode(ctx, email); err != nil {
		t.Fatalf("send registration code to %s: %v", email, err)
	}
	result, err := f.svc.Register(ctx, RegisterRequest{Email: email, EmailCode: f.codes[email], Password: password, AcceptedTerms: true})
	if err != nil {
		t.Fatalf("register %s: %v", email, err)
	}
	return result
}

func (f *tenantAccountsFixture) storedUser(t *testing.T, id string) model.User {
	t.Helper()
	var user model.User
	if err := f.db.First(&user, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	return user
}

func TestTenantAccountsAreIndependentPerSite(t *testing.T) {
	f := newTenantAccountsFixture(t)

	// 平台仍按原规则：第一个注册的人成为管理员，不需要邮箱验证码。
	boss, err := f.svc.Register(f.platform, RegisterRequest{Username: "boss", Password: "boss-password", AcceptedTerms: true})
	if err != nil {
		t.Fatal(err)
	}
	if boss.User.Role != model.UserRoleAdmin {
		t.Fatalf("the first platform user must still become admin, got %s", boss.User.Role)
	}

	// 代理商网站上第一个注册的人只是普通用户，且照常需要邮箱验证码。
	if _, err := f.svc.Register(f.agency, RegisterRequest{Username: "sneaky", Password: "sneaky-password", AcceptedTerms: true}); err == nil {
		t.Fatal("the first agency signup must not skip email verification")
	}
	agencyUser := f.register(t, f.agency, "same@example.com", "agency-password")
	if agencyUser.User.Role != model.UserRoleUser || agencyUser.User.TenantID != "agency-a" {
		t.Fatalf("agency signup = role %s tenant %q", agencyUser.User.Role, agencyUser.User.TenantID)
	}
	if settings, err := f.svc.PublicAuthSettings(f.agency); err != nil || settings.FirstUser {
		t.Fatalf("an agency site never shows the first-admin setup: %+v %v", settings, err)
	}

	// 同一个邮箱（以及由它生成的同一个用户名）可以在平台再注册一次。
	platformUser := f.register(t, f.platform, "same@example.com", "platform-password")
	if platformUser.User.ID == agencyUser.User.ID || platformUser.User.Role != model.UserRoleUser {
		t.Fatalf("platform signup must create a separate ordinary account: %+v", platformUser.User)
	}
	if got := f.storedUser(t, platformUser.User.ID).TenantID; got != model.PlatformTenantID {
		t.Fatalf("platform signup tenant = %q", got)
	}
	if platformUser.User.Username != agencyUser.User.Username {
		t.Fatalf("usernames are unique per tenant only: %q vs %q", platformUser.User.Username, agencyUser.User.Username)
	}
	// 同一租户内仍然不能重复。
	if err := f.svc.SendRegistrationEmailCode(f.agency, "same@example.com"); err == nil {
		t.Fatal("an email stays unique inside one tenant")
	}

	login := func(ctx context.Context, password string) (*AuthSessionResult, error) {
		return f.svc.Login(ctx, LoginRequest{Username: "same@example.com", Password: password})
	}
	if result, err := login(f.agency, "agency-password"); err != nil || result.User.ID != agencyUser.User.ID {
		t.Fatalf("agency login on agency site: %+v %v", result, err)
	}
	if result, err := login(f.platform, "platform-password"); err != nil || result.User.ID != platformUser.User.ID {
		t.Fatalf("platform login on platform site: %+v %v", result, err)
	}
	if _, err := login(f.platform, "agency-password"); err == nil {
		t.Fatal("agency credentials must not sign in on the platform site")
	}
	if _, err := login(f.agency, "platform-password"); err == nil {
		t.Fatal("platform credentials must not sign in on an agency site")
	}
	if _, err := f.svc.Login(f.agency, LoginRequest{Username: "boss", Password: "boss-password"}); err == nil {
		t.Fatal("the platform admin does not exist on an agency site")
	}
}

func TestTenantVerificationCodesStayOnTheirSite(t *testing.T) {
	f := newTenantAccountsFixture(t)
	if _, err := f.svc.Register(f.platform, RegisterRequest{Username: "boss", Password: "boss-password", AcceptedTerms: true}); err != nil {
		t.Fatal(err)
	}

	// 代理商网站发出的注册验证码不能拿到平台注册。
	if err := f.svc.SendRegistrationEmailCode(f.agency, "new@example.com"); err != nil {
		t.Fatal(err)
	}
	agencyCode := f.codes["new@example.com"]
	if _, err := f.svc.Register(f.platform, RegisterRequest{Email: "new@example.com", EmailCode: agencyCode, Password: "new-password", AcceptedTerms: true}); err == nil {
		t.Fatal("a registration code from an agency site must be rejected on the platform")
	}
	if _, err := f.svc.Register(f.agency, RegisterRequest{Email: "new@example.com", EmailCode: agencyCode, Password: "new-password", AcceptedTerms: true}); err != nil {
		t.Fatalf("the code still works on its own site: %v", err)
	}

	// 验证票据同样只在发出的租户有效。
	ticket, err := f.svc.StartVerification(f.agency, nil, VerificationRequest{Purpose: "register", Method: "email", Email: "ticket@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Register(f.platform, RegisterRequest{Email: "ticket@example.com", Ticket: ticket.Ticket, EmailCode: f.codes["ticket@example.com"], Password: "ticket-password", AcceptedTerms: true}); err == nil {
		t.Fatal("a verification ticket from an agency site must be rejected on the platform")
	}

	// 两边各有一个同邮箱账号；代理商的重置码不能改平台账号的密码，反之亦然。
	agencyUser := f.register(t, f.agency, "same@example.com", "agency-password")
	platformUser := f.register(t, f.platform, "same@example.com", "platform-password")
	if err := f.svc.SendPasswordResetEmailCode(f.agency, "same@example.com"); err != nil {
		t.Fatal(err)
	}
	resetCode := f.codes["same@example.com"]
	if err := f.svc.ResetPassword(f.platform, PasswordResetRequest{Email: "same@example.com", EmailCode: resetCode, Password: "hijacked-password"}); err == nil {
		t.Fatal("an agency password reset code must be rejected on the platform")
	}
	if err := f.svc.ResetPassword(f.agency, PasswordResetRequest{Email: "same@example.com", EmailCode: resetCode, Password: "agency-new-password"}); err != nil {
		t.Fatalf("the reset code works on its own site: %v", err)
	}
	if result, err := f.svc.Login(f.platform, LoginRequest{Username: "same@example.com", Password: "platform-password"}); err != nil || result.User.ID != platformUser.User.ID {
		t.Fatalf("resetting the agency account must not touch the platform account: %+v %v", result, err)
	}
	if result, err := f.svc.Login(f.agency, LoginRequest{Username: "same@example.com", Password: "agency-new-password"}); err != nil || result.User.ID != agencyUser.User.ID {
		t.Fatalf("agency account uses its new password: %+v %v", result, err)
	}

	if err := f.svc.SendPasswordResetEmailCode(f.platform, "same@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.ResetPassword(f.agency, PasswordResetRequest{Email: "same@example.com", EmailCode: f.codes["same@example.com"], Password: "hijacked-password"}); err == nil {
		t.Fatal("a platform password reset code must be rejected on an agency site")
	}
}

func TestAdminCreatedUsersStayInTheAdminTenant(t *testing.T) {
	f := newTenantAccountsFixture(t)
	if err := f.db.Create(&model.User{ID: "agency-member", TenantID: "agency-a", Username: "member", Email: "member@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "platform-admin", TenantID: model.PlatformTenantID, Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	created, err := f.svc.CreateAdminUser(admin, CreateAdminUserRequest{Username: "member", Email: "member@example.com", Password: "Password123!", Role: model.UserRoleUser, Status: model.UserStatusActive})
	if err != nil {
		t.Fatalf("an agency account must not block the same username or email on the platform: %v", err)
	}
	if got := f.storedUser(t, created.ID).TenantID; got != model.PlatformTenantID {
		t.Fatalf("admin-created user tenant = %q", got)
	}
	page, err := f.svc.AdminUsers(admin, AdminListQuery{Keyword: "member", Page: 1, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || len(page.Users) != 1 || page.Users[0].ID != created.ID {
		t.Fatalf("platform admin search lists platform accounts only: %+v", page)
	}
}
