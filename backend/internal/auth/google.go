package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
	"yingce/backend/internal/outbound"

	"gorm.io/gorm"
)

const (
	googleSettingKey   = "google_oauth"
	googleProvider     = "google"
	googleAuthorizeURL = "https://accounts.google.com/o/oauth2/v2/auth"
)

// Token 与用户信息端点是 Google 固定地址；声明为变量只为测试替换成本地服务。
var (
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserInfoURL = "https://openidconnect.googleapis.com/v1/userinfo"
)

type GoogleSettingRequest struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	RedirectURL  string `json:"redirectUrl"`
}

type PublicGoogleSetting struct {
	Enabled         bool      `json:"enabled"`
	ClientID        string    `json:"clientId"`
	HasClientSecret bool      `json:"hasClientSecret"`
	RedirectURL     string    `json:"redirectUrl"`
	UpdatedBy       string    `json:"updatedBy"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type googleSettingValue struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	RedirectURL  string `json:"redirectUrl"`
}

// googleProfile 是 OpenID Connect userinfo 的字段子集。
type googleProfile struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func (s *Service) AdminGoogleSetting(actor *model.User) (*PublicGoogleSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	return publicGoogleSetting(setting, value), nil
}

func (s *Service) UpdateGoogleSetting(actor *model.User, req GoogleSettingRequest) (*PublicGoogleSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	currentSetting, current, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	next := googleSettingValue{Enabled: req.Enabled, ClientID: strings.TrimSpace(req.ClientID), ClientSecret: strings.TrimSpace(req.ClientSecret), RedirectURL: strings.TrimSpace(req.RedirectURL)}
	if next.ClientSecret == "" {
		next.ClientSecret = current.ClientSecret
	}
	if err := validateGoogleSetting(next); err != nil {
		return nil, err
	}
	stored := next
	stored.ClientSecret, err = s.host.EncryptSecret(next.ClientSecret)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	setting := model.SystemSetting{Key: googleSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	if currentSetting != nil {
		setting.CreatedAt = currentSetting.CreatedAt
	}
	if err := s.repo.SaveSystemSetting(&setting); err != nil {
		return nil, err
	}
	return publicGoogleSetting(&setting, next), nil
}

func (s *Service) GoogleEnabled() bool {
	_, setting, err := s.readGoogleSetting()
	return err == nil && setting.Enabled
}

func (s *Service) BeginGoogleLogin(nextPath string, acceptedTerms bool, referralCode string) (string, error) {
	count, err := s.repo.UserCount()
	if err != nil {
		return "", err
	}
	if count == 0 {
		return "", kernel.Forbidden("请先创建本地管理员账号，再开放 Google 登录")
	}
	_, setting, err := s.readGoogleSetting()
	if err != nil {
		return "", err
	}
	if !setting.Enabled {
		return "", kernel.Forbidden("Google 登录尚未启用")
	}
	referralCode = strings.ToUpper(strings.TrimSpace(referralCode))
	if len(referralCode) > 32 {
		referralCode = ""
	}
	return s.beginGoogleAuthorization(setting, &model.OAuthState{NextPath: safeOAuthNext(nextPath), AcceptedTerms: acceptedTerms, ReferralCode: referralCode})
}

func (s *Service) BeginGoogleReauthentication(actor *model.User, cookie string) (string, error) {
	user, session, err := s.profileSession(actor, cookie)
	if err != nil {
		return "", err
	}
	if _, err := s.repo.UserIdentityForUser(user.ID, googleProvider); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", kernel.Forbidden("该账号没有关联 Google 身份")
		}
		return "", err
	}
	_, setting, err := s.readGoogleSetting()
	if err != nil {
		return "", err
	}
	if !setting.Enabled {
		return "", kernel.Forbidden("Google 登录尚未启用")
	}
	return s.beginGoogleAuthorization(setting, &model.OAuthState{NextPath: "/settings?section=profile&reauth=success", ReauthUserID: user.ID, ReauthSessionID: session.ID})
}

func (s *Service) GoogleReauthenticationState(stateValue string) (bool, error) {
	if strings.TrimSpace(stateValue) == "" {
		return false, nil
	}
	return s.repo.OAuthReauthenticationState(googleProvider, HashToken(stateValue))
}

func (s *Service) beginGoogleAuthorization(setting googleSettingValue, record *model.OAuthState) (string, error) {
	state := RandomToken()
	verifier := RandomToken()
	challengeBytes := sha256.Sum256([]byte(verifier))
	record.ID, record.Provider, record.StateHash, record.CodeVerifier, record.ExpiresAt = kernel.NewID(), googleProvider, HashToken(state), verifier, time.Now().Add(10*time.Minute)
	if err := s.repo.CreateOAuthState(record); err != nil {
		return "", err
	}
	query := url.Values{
		"client_id":             {setting.ClientID},
		"redirect_uri":          {setting.RedirectURL},
		"response_type":         {"code"},
		"scope":                 {"openid email profile"},
		"state":                 {state},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(challengeBytes[:])},
		"code_challenge_method": {"S256"},
		"prompt":                {"select_account"},
	}
	return googleAuthorizeURL + "?" + query.Encode(), nil
}

func (s *Service) CompleteGoogleLogin(stateValue string, code string, cookieValue string, contexts ...LoginContext) (result *LinuxDOCallbackResult, err error) {
	var context LoginContext
	if len(contexts) > 0 {
		context = contexts[0]
	}
	event := NewLoginLog(googleProvider, "login", context)
	logFailure := true
	defer func() {
		if err != nil && logFailure {
			err = s.recordLoginFailure(event, err)
		}
	}()
	if strings.TrimSpace(stateValue) == "" || strings.TrimSpace(code) == "" {
		return nil, kernel.BadAuthRequest("Google 登录回调缺少必要参数")
	}
	state, err := s.repo.ConsumeOAuthState(googleProvider, HashToken(stateValue))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, kernel.BadAuthRequest("Google 登录状态无效或已过期，请重新登录")
	}
	if err != nil {
		return nil, err
	}
	logFailure = state.ReauthUserID == "" && state.ReauthSessionID == ""
	_, setting, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	if !setting.Enabled {
		return nil, kernel.Forbidden("Google 登录尚未启用")
	}
	var reauthUser *model.User
	var reauthSession *model.AuthSession
	if !logFailure {
		if cookieValue == "" {
			return nil, kernel.Unauthorized("重新验证需要当前登录会话")
		}
		reauthUser, reauthSession, err = s.profileSession(&model.User{ID: state.ReauthUserID}, cookieValue)
		if err != nil {
			return nil, err
		}
		if reauthSession.ID != state.ReauthSessionID {
			return nil, kernel.Unauthorized("重新验证与当前登录会话不匹配")
		}
	}
	accessToken, err := exchangeGoogleCode(setting, code, state.CodeVerifier)
	if err != nil {
		return nil, err
	}
	profile, err := fetchGoogleProfile(accessToken)
	if err != nil {
		return nil, err
	}
	if reauthUser != nil {
		if err := s.repo.ReauthenticateOAuthSession(googleProvider, reauthUser, reauthSession, profile.Subject, time.Now()); err != nil {
			return nil, profileWriteError(err)
		}
		return &LinuxDOCallbackResult{Next: "/settings?section=profile&reauth=success", Reauthenticated: true}, nil
	}
	user, err := s.googleUser(profile, state, event)
	if err != nil {
		return nil, err
	}
	loginLogUser(event, user)
	if user.Status != model.UserStatusActive {
		return nil, kernel.Forbidden("该账号已被禁用")
	}
	if err := s.host.EnsureSignupBonus(user.ID); err != nil {
		return nil, err
	}
	now := time.Now()
	user.LastLoginAt = &now
	user.UpdatedAt = now
	if err := s.repo.UpdateUserLoginTime(user.ID, now); err != nil {
		return nil, err
	}
	session, err := s.createAuthSession(user, event)
	if err != nil {
		return nil, err
	}
	return &LinuxDOCallbackResult{Session: session, Next: safeOAuthNext(state.NextPath)}, nil
}

// googleUser 找到或创建 Google 身份对应的账号。已验证邮箱与本地已验证邮箱一致时直接关联同一账号，
// 其余情况都不按邮箱合并，避免未验证邮箱导致账号被接管。
func (s *Service) googleUser(profile googleProfile, state *model.OAuthState, event *model.LoginLog) (*model.User, error) {
	identity, err := s.repo.UserIdentity(googleProvider, profile.Subject)
	if err == nil {
		identity.ProviderUsername, identity.AvatarURL, identity.UpdatedAt = profile.Email, profile.Picture, time.Now()
		if err := s.repo.Save(identity); err != nil {
			return nil, err
		}
		return s.repo.User(identity.UserID)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	email := NormalizeEmail(profile.Email)
	if profile.EmailVerified && email != "" {
		existing, err := s.repo.UserByEmail(email)
		if err == nil && existing != nil && existing.EmailVerifiedAt != nil {
			now := time.Now()
			link := &model.UserIdentity{ID: kernel.NewID(), UserID: existing.ID, Provider: googleProvider, Subject: profile.Subject, ProviderUsername: profile.Email, AvatarURL: profile.Picture, CreatedAt: now, UpdatedAt: now}
			if err := s.repo.Create(link); err != nil {
				return nil, err
			}
			return existing, nil
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	event.Source = "registration"
	policy, err := s.verificationPolicy()
	if err != nil {
		return nil, err
	}
	if policy.SMSAndEmailRegistration {
		return nil, kernel.Forbidden("平台要求短信和邮箱验证，请先通过注册页面创建账号；第三方登录不能绕过双重验证")
	}
	registrationEnabled, err := s.RegistrationEnabled()
	if err != nil {
		return nil, err
	}
	if !registrationEnabled {
		return nil, kernel.Forbidden("管理员未开放新用户注册")
	}
	if !state.AcceptedTerms {
		return nil, kernel.BadAuthRequest("请先同意" + s.AgreementTitleForMessage())
	}
	// 不套用邮箱注册的域名白名单：Google 已验证身份，且海外很多公司邮箱托管在 Google Workspace。
	user, identity, err := s.createGoogleUser(profile)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateOAuthUser(user, identity); err != nil {
		return nil, err
	}
	s.host.AttachReferral(user.ID, state.ReferralCode)
	return user, nil
}

func (s *Service) createGoogleUser(profile googleProfile) (*model.User, *model.UserIdentity, error) {
	email := NormalizeEmail(profile.Email)
	local, _, _ := strings.Cut(email, "@")
	base := strings.Trim(oauthUsernameSanitizer.ReplaceAllString(local, "_"), "_-")
	if len(base) < 3 {
		base = "user_" + shortSubject(profile.Subject)
	}
	if len(base) > 24 {
		base = base[:24]
	}
	username := base
	if existing, err := s.repo.UserByUsername(username); err == nil && existing != nil {
		username = kernel.TruncateRunes(base, 23) + "_" + shortSubject(profile.Subject)
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, err
	}
	var verifiedAt *time.Time
	if email != "" && profile.EmailVerified && ValidateEmail(email) == nil {
		if existing, err := s.repo.UserByEmail(email); err == nil && existing != nil {
			email = ""
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, err
		} else {
			now := time.Now()
			verifiedAt = &now
		}
	} else {
		email = ""
	}
	displayName := kernel.FirstNonEmpty(strings.TrimSpace(profile.Name), local, username)
	user := &model.User{ID: kernel.NewID(), Username: username, Email: email, EmailVerifiedAt: verifiedAt, DisplayName: NormalizeDisplayName(displayName, username), Role: model.UserRoleUser, Status: model.UserStatusActive}
	identity := &model.UserIdentity{ID: kernel.NewID(), UserID: user.ID, Provider: googleProvider, Subject: profile.Subject, ProviderUsername: profile.Email, AvatarURL: profile.Picture}
	return user, identity, nil
}

func (s *Service) readGoogleSetting() (*model.SystemSetting, googleSettingValue, error) {
	setting, err := s.repo.SystemSetting(googleSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, googleSettingValue{}, nil
	}
	if err != nil {
		return nil, googleSettingValue{}, err
	}
	var value googleSettingValue
	if strings.TrimSpace(setting.ValueJSON) != "" {
		if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
			return nil, googleSettingValue{}, errors.New("Google 登录配置格式无效")
		}
	}
	value.ClientSecret, err = s.host.DecryptSecret(value.ClientSecret)
	if err != nil {
		return nil, googleSettingValue{}, err
	}
	return setting, value, nil
}

func validateGoogleSetting(value googleSettingValue) error {
	if !value.Enabled {
		return nil
	}
	if value.ClientID == "" || value.ClientSecret == "" || value.RedirectURL == "" {
		return kernel.BadAuthRequest("启用 Google 登录前请填写 Client ID、Client Secret 和回调地址")
	}
	if !strings.HasSuffix(value.ClientID, ".apps.googleusercontent.com") {
		return kernel.BadAuthRequest("Client ID 应以 .apps.googleusercontent.com 结尾")
	}
	redirectURL, err := url.Parse(value.RedirectURL)
	if err != nil || redirectURL.Host == "" || (redirectURL.Scheme != "https" && !(redirectURL.Scheme == "http" && isLoopbackOAuthHost(redirectURL.Hostname()))) {
		return kernel.BadAuthRequest("Google 回调地址必须使用 HTTPS，本地回环地址可使用 HTTP")
	}
	return nil
}

func publicGoogleSetting(setting *model.SystemSetting, value googleSettingValue) *PublicGoogleSetting {
	result := &PublicGoogleSetting{Enabled: value.Enabled, ClientID: value.ClientID, HasClientSecret: value.ClientSecret != "", RedirectURL: value.RedirectURL}
	if setting != nil {
		result.UpdatedBy = setting.UpdatedBy
		result.UpdatedAt = setting.UpdatedAt
	}
	return result
}

func exchangeGoogleCode(setting googleSettingValue, code string, verifier string) (string, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {setting.ClientID},
		"client_secret": {setting.ClientSecret},
		"redirect_uri":  {setting.RedirectURL},
		"code_verifier": {verifier},
	}
	req, err := http.NewRequest(http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := outbound.OutboundHTTPClient(20 * time.Second).Do(req)
	if err != nil {
		return "", fmt.Errorf("Google Token 请求失败：%w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("Google Token 请求失败：HTTP %d", resp.StatusCode)
	}
	var payload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.AccessToken == "" {
		return "", errors.New("Google Token 响应无效")
	}
	return payload.AccessToken, nil
}

func fetchGoogleProfile(accessToken string) (googleProfile, error) {
	req, err := http.NewRequest(http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return googleProfile{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := outbound.OutboundHTTPClient(20 * time.Second).Do(req)
	if err != nil {
		return googleProfile{}, fmt.Errorf("Google 用户信息请求失败：%w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return googleProfile{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return googleProfile{}, fmt.Errorf("Google 用户信息请求失败：HTTP %d", resp.StatusCode)
	}
	var profile googleProfile
	if err := json.Unmarshal(body, &profile); err != nil || strings.TrimSpace(profile.Subject) == "" {
		return googleProfile{}, errors.New("Google 用户信息响应无效")
	}
	return profile, nil
}
