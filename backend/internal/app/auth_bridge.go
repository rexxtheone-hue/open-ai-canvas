package app

import (
	"context"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

const SessionCookieName = auth.SessionCookieName

type (
	EmailCodeCooldownError     = auth.EmailCodeCooldownError
	RegisterRequest            = auth.RegisterRequest
	LoginRequest               = auth.LoginRequest
	LoginContext               = auth.LoginContext
	PublicAuthSettings         = auth.PublicAuthSettings
	AuthSessionResult          = auth.AuthSessionResult
	AuthUser                   = auth.AuthUser
	RegistrationSettingRequest = auth.RegistrationSettingRequest
	PublicRegistrationSetting  = auth.PublicRegistrationSetting
	PasswordResetRequest       = auth.PasswordResetRequest
	EmailSettingRequest        = auth.EmailSettingRequest
	PublicEmailSetting         = auth.PublicEmailSetting
	LinuxDOSettingRequest      = auth.LinuxDOSettingRequest
	PublicLinuxDOSetting       = auth.PublicLinuxDOSetting
	LinuxDOCallbackResult      = auth.LinuxDOCallbackResult
	GoogleSettingRequest       = auth.GoogleSettingRequest
	PublicGoogleSetting        = auth.PublicGoogleSetting
	LibTVSettingRequest        = auth.LibTVSettingRequest
	PublicLibTVSetting         = auth.PublicLibTVSetting
	LibTVImportRequest         = auth.LibTVImportRequest
	LibTVImportResult          = auth.LibTVImportResult
	LibTVCanvasConnection      = auth.LibTVCanvasConnection
	LibTVCanvasNode            = auth.LibTVCanvasNode
	LibTVImportIssue           = auth.LibTVImportIssue
	LibTVImportMetadata        = auth.LibTVImportMetadata
	LibTVImportWarning         = auth.LibTVImportWarning
	TapNowImportRequest        = auth.TapNowImportRequest
	TapNowImportResult         = auth.TapNowImportResult
	TapNowCanvasConnection     = auth.TapNowCanvasConnection
	TapNowCanvasNode           = auth.TapNowCanvasNode
	TapNowImportIssue          = auth.TapNowImportIssue
	TapNowImportMetadata       = auth.TapNowImportMetadata
	TapNowImportWarning        = auth.TapNowImportWarning
)

type authHost struct {
	svc *Service
}

func (h authHost) RequireAdmin(user *model.User) error {
	if h.svc == nil {
		return nil
	}
	return h.svc.RequireAdmin(user)
}

func (h authHost) EncryptSecret(value string) (string, error) {
	if h.svc == nil {
		return value, nil
	}
	return h.svc.encryptSettingSecret(value)
}

func (h authHost) DecryptSecret(value string) (string, error) {
	if h.svc == nil {
		return value, nil
	}
	return h.svc.decryptSettingSecret(value)
}

func (h authHost) SettingsEncryptionKey() ([]byte, error) {
	if h.svc == nil {
		return nil, nil
	}
	return h.svc.settingsEncryptionKey()
}

func (h authHost) BrandName() string {
	if h.svc == nil {
		return auth.DefaultBrandName
	}
	return h.svc.appearanceBrandName()
}

func (h authHost) AttachReferral(userID, code string) {
	h.svc.AttachReferral(userID, code)
}

func (h authHost) EnsureSignupBonus(userID string) error {
	if h.svc == nil {
		return nil
	}
	return h.svc.ensureSignupBonus(userID)
}

func (h authHost) SignupBonusMicrocredits() int64 {
	if h.svc == nil {
		return 0
	}
	return h.svc.signupBonusMicrocredits()
}

func (h authHost) RecordActivity(userID string, event string, count int) {
	if h.svc == nil {
		return
	}
	h.svc.recordActivity(userID, event, count)
}

func (h authHost) AllowRequest(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	if h.svc == nil {
		return true, nil
	}
	return h.svc.AllowRequest(ctx, key, limit, window)
}

func (h authHost) RequestRetryAfter(ctx context.Context, key string, window time.Duration) time.Duration {
	if h.svc == nil {
		return 0
	}
	return h.svc.RequestRetryAfter(ctx, key, window)
}

func (s *Service) authDomain() *auth.Service {
	if s == nil {
		return auth.New(nil, nil, nil)
	}
	if s.auth != nil {
		return s.auth
	}
	domain := auth.New(s.repo, authHost{svc: s}, nil)
	domain.SetSMSDelivery(s.smsDomain())
	return domain
}

// authFor 返回绑定到请求所属租户的认证服务：账号查找、注册、验证码都只在这个租户内。
func (s *Service) authFor(ctx context.Context) *auth.Service {
	return s.authDomain().ForTenant(TenantFromContext(ctx).ID)
}

// authForUser 返回绑定到账号所属租户的认证服务，用于已登录用户的资料与绑定操作。
func (s *Service) authForUser(user *model.User) *auth.Service {
	return s.authDomain().ForTenant(UserTenantID(user))
}

func (s *Service) PublicAuthSettings(ctx context.Context) (*PublicAuthSettings, error) {
	return s.authFor(ctx).PublicAuthSettings()
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (*AuthSessionResult, error) {
	return s.authFor(ctx).Register(req)
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (*AuthSessionResult, error) {
	return s.authFor(ctx).Login(req)
}

func (s *Service) LoginRateLimitSubject(ctx context.Context, account string) (string, error) {
	return s.authFor(ctx).LoginRateLimitSubject(account)
}

func (s *Service) Logout(cookieValue string, contexts ...LoginContext) error {
	return s.authDomain().Logout(cookieValue, contexts...)
}

func (s *Service) CurrentUser(cookieValue string) (*model.User, error) {
	return s.authDomain().CurrentUser(cookieValue)
}

func (s *Service) PublicAuthUser(user *model.User) (AuthUser, error) {
	return s.authDomain().PublicAuthUser(user)
}

func (s *Service) AdminRegistrationSetting(actor *model.User) (*PublicRegistrationSetting, error) {
	return s.authDomain().AdminRegistrationSetting(actor)
}

func (s *Service) UpdateRegistrationSetting(actor *model.User, req RegistrationSettingRequest) (*PublicRegistrationSetting, error) {
	return s.authDomain().UpdateRegistrationSetting(actor, req)
}

func (s *Service) RegistrationEnabled() (bool, error) {
	return s.authDomain().RegistrationEnabled()
}

func (s *Service) SendPasswordResetEmailCode(ctx context.Context, rawEmail string) error {
	return s.authFor(ctx).SendPasswordResetEmailCode(ctx, rawEmail)
}

func (s *Service) ResetPassword(ctx context.Context, req PasswordResetRequest) error {
	return s.authFor(ctx).ResetPassword(req)
}

func (s *Service) AdminEmailSetting(actor *model.User) (*PublicEmailSetting, error) {
	return s.authDomain().AdminEmailSetting(actor)
}

func (s *Service) UpdateEmailSetting(actor *model.User, req EmailSettingRequest) (*PublicEmailSetting, error) {
	return s.authDomain().UpdateEmailSetting(actor, req)
}

func (s *Service) EmailEnabled() (bool, error) {
	return s.authDomain().EmailEnabled()
}

func (s *Service) SendRegistrationEmailCode(ctx context.Context, rawEmail string) error {
	return s.authFor(ctx).SendRegistrationEmailCode(ctx, rawEmail)
}

func (s *Service) VerifyRegistrationEmailCode(ctx context.Context, email string, rawCode string) (*model.EmailVerificationCode, error) {
	return s.authFor(ctx).VerifyRegistrationEmailCode(email, rawCode)
}

func (s *Service) AdminLinuxDOSetting(actor *model.User) (*PublicLinuxDOSetting, error) {
	return s.authDomain().AdminLinuxDOSetting(actor)
}

func (s *Service) UpdateLinuxDOSetting(actor *model.User, req LinuxDOSettingRequest) (*PublicLinuxDOSetting, error) {
	return s.authDomain().UpdateLinuxDOSetting(actor, req)
}

func (s *Service) AdminGoogleSetting(actor *model.User) (*PublicGoogleSetting, error) {
	return s.authDomain().AdminGoogleSetting(actor)
}

func (s *Service) UpdateGoogleSetting(actor *model.User, req GoogleSettingRequest) (*PublicGoogleSetting, error) {
	return s.authDomain().UpdateGoogleSetting(actor, req)
}

func (s *Service) BeginGoogleLogin(ctx context.Context, nextPath string, acceptedTerms bool, referralCode string) (string, error) {
	return s.authFor(ctx).BeginGoogleLogin(nextPath, acceptedTerms, referralCode)
}

func (s *Service) CompleteGoogleLogin(ctx context.Context, stateValue string, code string, cookieValue string, contexts ...LoginContext) (*LinuxDOCallbackResult, error) {
	return s.authFor(ctx).CompleteGoogleLogin(stateValue, code, cookieValue, contexts...)
}

func (s *Service) BeginGoogleReauthentication(actor *model.User, cookie string) (string, error) {
	return s.authForUser(actor).BeginGoogleReauthentication(actor, cookie)
}

func (s *Service) GoogleReauthenticationState(ctx context.Context, stateValue string) (bool, error) {
	return s.authFor(ctx).GoogleReauthenticationState(stateValue)
}

func (s *Service) LinuxDOEnabled() bool {
	return s.authDomain().LinuxDOEnabled()
}

func (s *Service) BeginLinuxDOLogin(ctx context.Context, nextPath string, acceptedTerms bool) (string, error) {
	return s.authFor(ctx).BeginLinuxDOLogin(nextPath, acceptedTerms)
}

func (s *Service) CompleteLinuxDOLogin(ctx context.Context, stateValue string, code string, cookieValue string, contexts ...LoginContext) (*LinuxDOCallbackResult, error) {
	return s.authFor(ctx).CompleteLinuxDOLogin(stateValue, code, cookieValue, contexts...)
}

func (s *Service) AdminLibTVSetting(actor *model.User) (*PublicLibTVSetting, error) {
	return s.authDomain().AdminLibTVSetting(actor)
}

func (s *Service) UpdateLibTVSetting(actor *model.User, req LibTVSettingRequest) (*PublicLibTVSetting, error) {
	return s.authDomain().UpdateLibTVSetting(actor, req)
}

func (s *Service) TestLibTV(actor *model.User, projectUUID string) error {
	return s.authDomain().TestLibTV(actor, projectUUID)
}

func (s *Service) ImportLibTV(userID, canvasProjectID, projectUUID string) (*LibTVImportResult, error) {
	return s.authDomain().ImportLibTV(userID, canvasProjectID, projectUUID)
}

func (s *Service) ImportTapNow(userID, canvasProjectID, shareID string) (*TapNowImportResult, error) {
	return s.authDomain().ImportTapNow(userID, canvasProjectID, shareID)
}

func hashPassword(password string) (string, error) {
	return auth.HashPassword(password)
}

func normalizeUsername(value string) string {
	return auth.NormalizeUsername(value)
}

func normalizeEmail(value string) string {
	return auth.NormalizeEmail(value)
}

func normalizeDisplayName(value string, fallback string) string {
	return auth.NormalizeDisplayName(value, fallback)
}

func validateUsername(value string) error {
	return auth.ValidateUsername(value)
}

func validatePassword(value string) error {
	return auth.ValidatePassword(value)
}

func validateEmail(value string) error {
	return auth.ValidateEmail(value)
}

func hashToken(token string) string {
	return auth.HashToken(token)
}

func randomToken() string {
	return auth.RandomToken()
}
