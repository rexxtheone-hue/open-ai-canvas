package app

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

// OmniMuse 作为 MCP 的 OAuth 2.1 授权服务器：公开客户端 + PKCE(S256) + 动态注册。
// 访问令牌 1 小时，刷新令牌 90 天，每次刷新都轮换。

const (
	oauthAccessTokenTTL  = time.Hour
	oauthRefreshTokenTTL = 90 * 24 * time.Hour
	oauthCodeTTL         = 10 * time.Minute
	OAuthScope           = "omnimuse"
)

// OAuthError 按 RFC 6749 返回 error / error_description。
type OAuthError struct {
	Code        string
	Description string
}

func (e *OAuthError) Error() string { return e.Code + ": " + e.Description }

func oauthErr(code, description string) *OAuthError {
	return &OAuthError{Code: code, Description: description}
}

type OAuthClientRegistration struct {
	RedirectURIs            []string `json:"redirect_uris"`
	ClientName              string   `json:"client_name"`
	ClientURI               string   `json:"client_uri"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	GrantTypes              []string `json:"grant_types"`
	ResponseTypes           []string `json:"response_types"`
}

type OAuthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

type OAuthAuthorizeRequest struct {
	ClientID            string `json:"clientId"`
	RedirectURI         string `json:"redirectUri"`
	ResponseType        string `json:"responseType"`
	CodeChallenge       string `json:"codeChallenge"`
	CodeChallengeMethod string `json:"codeChallengeMethod"`
	State               string `json:"state"`
	Resource            string `json:"resource"`
}

type OAuthAuthorizeInfo struct {
	ClientID   string `json:"clientId"`
	ClientName string `json:"clientName"`
	ClientURI  string `json:"clientUri,omitempty"`
	RedirectTo string `json:"redirectHost"`
}

type OAuthConnection struct {
	ClientID   string     `json:"clientId"`
	ClientName string     `json:"clientName"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
}

// validOAuthRedirectURI 允许 https、本机回环 http，以及桌面客户端自己的协议（如 cursor://）。
func validOAuthRedirectURI(raw string) bool {
	if raw == "" || len(raw) > 1000 || strings.ContainsAny(raw, " \r\n") {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Fragment != "" {
		return false
	}
	switch strings.ToLower(parsed.Scheme) {
	case "https":
		return parsed.Host != ""
	case "http":
		host := parsed.Hostname()
		return host == "localhost" || host == "127.0.0.1" || host == "::1"
	case "javascript", "data", "file", "vbscript", "about", "blob":
		return false
	default:
		// 私有协议必须带点号或是已知桌面客户端，避免注册任意短协议。
		return strings.Contains(parsed.Scheme, ".") || parsed.Scheme == "cursor" || parsed.Scheme == "vscode" || parsed.Scheme == "claude" || parsed.Scheme == "windsurf"
	}
}

func (s *Service) RegisterOAuthClient(req OAuthClientRegistration) (*model.OAuthClient, error) {
	if len(req.RedirectURIs) == 0 || len(req.RedirectURIs) > 10 {
		return nil, oauthErr("invalid_redirect_uri", "redirect_uris 需要 1 到 10 个")
	}
	for _, uri := range req.RedirectURIs {
		if !validOAuthRedirectURI(uri) {
			return nil, oauthErr("invalid_redirect_uri", "不支持的回调地址："+uri)
		}
	}
	if method := strings.TrimSpace(req.TokenEndpointAuthMethod); method != "" && method != "none" {
		// 只支持公开客户端；有的客户端会请求 client_secret_post，按 none 处理即可。
		req.TokenEndpointAuthMethod = "none"
	}
	name := strings.TrimSpace(req.ClientName)
	if name == "" {
		name = "MCP 客户端"
	}
	if utf8.RuneCountInString(name) > 100 {
		name = string([]rune(name)[:100])
	}
	clientURI := strings.TrimSpace(req.ClientURI)
	if clientURI != "" && (!strings.HasPrefix(clientURI, "https://") || len(clientURI) > 500) {
		clientURI = ""
	}
	client := model.OAuthClient{ID: "mcp_" + auth.RandomToken()[:32], Name: name, RedirectURIs: strings.Join(req.RedirectURIs, "\n"), ClientURI: clientURI}
	if err := s.repo.CreateOAuthClient(&client); err != nil {
		return nil, err
	}
	return &client, nil
}

func oauthClientRedirectAllowed(client *model.OAuthClient, redirectURI string) bool {
	for _, allowed := range strings.Split(client.RedirectURIs, "\n") {
		if allowed == redirectURI {
			return true
		}
		// RFC 8252：本机回环地址允许任意端口。
		if loopbackMatches(allowed, redirectURI) {
			return true
		}
	}
	return false
}

func loopbackMatches(registered, requested string) bool {
	a, errA := url.Parse(registered)
	b, errB := url.Parse(requested)
	if errA != nil || errB != nil || a.Scheme != "http" || b.Scheme != "http" {
		return false
	}
	host := a.Hostname()
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		return false
	}
	return a.Hostname() == b.Hostname() && a.Path == b.Path && a.RawQuery == b.RawQuery
}

func (s *Service) oauthClientForAuthorize(clientID, redirectURI string) (*model.OAuthClient, error) {
	client, err := s.repo.OAuthClient(strings.TrimSpace(clientID))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, BadAuthRequest("这个应用没有登记，请回到原应用重新连接")
		}
		return nil, err
	}
	if !oauthClientRedirectAllowed(client, redirectURI) {
		return nil, BadAuthRequest("回调地址与登记的不一致，请回到原应用重新连接")
	}
	return client, nil
}

// OAuthAuthorizeInfo 给授权页展示「谁在申请」；回调地址校验不通过时不显示授权按钮。
func (s *Service) OAuthAuthorizeInfo(clientID, redirectURI string) (*OAuthAuthorizeInfo, error) {
	client, err := s.oauthClientForAuthorize(clientID, redirectURI)
	if err != nil {
		return nil, err
	}
	host := redirectURI
	if parsed, err := url.Parse(redirectURI); err == nil && parsed.Host != "" {
		host = parsed.Host
	}
	return &OAuthAuthorizeInfo{ClientID: client.ID, ClientName: client.Name, ClientURI: client.ClientURI, RedirectTo: host}, nil
}

func oauthRedirect(redirectURI string, params url.Values) string {
	separator := "?"
	if strings.Contains(redirectURI, "?") {
		separator = "&"
	}
	return redirectURI + separator + params.Encode()
}

// ApproveOAuthAuthorization 在用户点「授权」后签发授权码，返回要跳回客户端的地址。
func (s *Service) ApproveOAuthAuthorization(user *model.User, req OAuthAuthorizeRequest) (string, error) {
	if _, err := s.oauthClientForAuthorize(req.ClientID, req.RedirectURI); err != nil {
		return "", err
	}
	if req.ResponseType != "code" {
		return "", BadAuthRequest("只支持 response_type=code")
	}
	if req.CodeChallengeMethod != "S256" || len(req.CodeChallenge) < 43 || len(req.CodeChallenge) > 128 {
		return "", BadAuthRequest("缺少 PKCE（code_challenge，S256）")
	}
	if len(req.State) > 1000 || len(req.Resource) > 500 {
		return "", BadAuthRequest("授权参数过长")
	}
	plain := auth.RandomToken()
	code := model.OAuthAuthorizationCode{ID: newID(), CodeHash: auth.HashToken(plain), ClientID: req.ClientID, UserID: user.ID, TenantID: UserTenantID(user), RedirectURI: req.RedirectURI, CodeChallenge: req.CodeChallenge, Resource: req.Resource, ExpiresAt: time.Now().Add(oauthCodeTTL)}
	if err := s.repo.CreateOAuthAuthorizationCode(&code); err != nil {
		return "", err
	}
	params := url.Values{"code": {plain}}
	if req.State != "" {
		params.Set("state", req.State)
	}
	return oauthRedirect(req.RedirectURI, params), nil
}

// DenyOAuthAuthorization 用户点「取消」时按规范把 access_denied 带回客户端。
func (s *Service) DenyOAuthAuthorization(req OAuthAuthorizeRequest) (string, error) {
	if _, err := s.oauthClientForAuthorize(req.ClientID, req.RedirectURI); err != nil {
		return "", err
	}
	params := url.Values{"error": {"access_denied"}, "error_description": {"用户取消了授权"}}
	if req.State != "" {
		params.Set("state", req.State)
	}
	return oauthRedirect(req.RedirectURI, params), nil
}

func pkceS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (s *Service) issueOAuthTokens(userID, tenantID, clientID string) (*model.APIToken, *model.APIToken, OAuthTokenResponse) {
	now := time.Now()
	refreshPlain, accessPlain := newOpaqueToken(oauthRefreshTokenPrefix), newOpaqueToken(oauthAccessTokenPrefix)
	refreshExpires, accessExpires := now.Add(oauthRefreshTokenTTL), now.Add(oauthAccessTokenTTL)
	refresh := &model.APIToken{ID: newID(), UserID: userID, TenantID: tenantID, Kind: model.APITokenKindOAuthRefresh, ClientID: clientID, Prefix: refreshPlain[:len(oauthRefreshTokenPrefix)+6], TokenHash: auth.HashToken(refreshPlain), ExpiresAt: &refreshExpires}
	access := &model.APIToken{ID: newID(), UserID: userID, TenantID: tenantID, Kind: model.APITokenKindOAuthAccess, ClientID: clientID, ParentID: refresh.ID, Prefix: accessPlain[:len(oauthAccessTokenPrefix)+6], TokenHash: auth.HashToken(accessPlain), ExpiresAt: &accessExpires}
	return access, refresh, OAuthTokenResponse{AccessToken: accessPlain, TokenType: "Bearer", ExpiresIn: int(oauthAccessTokenTTL.Seconds()), RefreshToken: refreshPlain, Scope: OAuthScope}
}

// ExchangeOAuthCode 用授权码 + PKCE 校验码换取访问令牌和刷新令牌。
func (s *Service) ExchangeOAuthCode(tenant model.Tenant, clientID, code, redirectURI, verifier string) (*OAuthTokenResponse, error) {
	if code == "" || verifier == "" || clientID == "" {
		return nil, oauthErr("invalid_request", "缺少 code、code_verifier 或 client_id")
	}
	stored, err := s.repo.ConsumeOAuthAuthorizationCode(auth.HashToken(code))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, oauthErr("invalid_grant", "授权码无效、已使用或已过期")
		}
		return nil, err
	}
	if stored.ClientID != clientID || stored.RedirectURI != redirectURI {
		return nil, oauthErr("invalid_grant", "授权码与客户端或回调地址不符")
	}
	if pkceS256(verifier) != stored.CodeChallenge {
		return nil, oauthErr("invalid_grant", "PKCE 校验失败")
	}
	if stored.TenantID != tenant.ID {
		return nil, oauthErr("invalid_grant", "授权码不属于这个网站")
	}
	user, err := s.repo.User(stored.UserID)
	if err != nil || user.Status != model.UserStatusActive {
		return nil, oauthErr("invalid_grant", "账号不可用")
	}
	access, refresh, response := s.issueOAuthTokens(user.ID, stored.TenantID, clientID)
	if err := s.repo.CreateAPITokens(refresh, access); err != nil {
		return nil, err
	}
	return &response, nil
}

// RefreshOAuthToken 轮换刷新令牌；旧刷新令牌与它签发的访问令牌一并作废。
func (s *Service) RefreshOAuthToken(tenant model.Tenant, clientID, refreshToken string) (*OAuthTokenResponse, error) {
	refreshToken = strings.TrimSpace(refreshToken)
	if !strings.HasPrefix(refreshToken, oauthRefreshTokenPrefix) || len(refreshToken) > 128 {
		return nil, oauthErr("invalid_grant", "刷新令牌无效")
	}
	stored, err := s.repo.ActiveAPITokenByHash(model.APITokenKindOAuthRefresh, auth.HashToken(refreshToken))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, oauthErr("invalid_grant", "刷新令牌无效或已过期，请重新连接")
		}
		return nil, err
	}
	if clientID != "" && stored.ClientID != clientID {
		return nil, oauthErr("invalid_grant", "刷新令牌不属于这个客户端")
	}
	if stored.TenantID != tenant.ID {
		return nil, oauthErr("invalid_grant", "刷新令牌不属于这个网站")
	}
	user, err := s.repo.User(stored.UserID)
	if err != nil || user.Status != model.UserStatusActive {
		return nil, oauthErr("invalid_grant", "账号不可用")
	}
	access, refresh, response := s.issueOAuthTokens(user.ID, stored.TenantID, stored.ClientID)
	if err := s.repo.RotateOAuthRefreshToken(stored.ID, access, refresh); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, oauthErr("invalid_grant", "刷新令牌已被使用，请重新连接")
		}
		return nil, err
	}
	return &response, nil
}

func (s *Service) OAuthConnections(userID string) ([]OAuthConnection, error) {
	tokens, err := s.repo.OAuthConnections(userID)
	if err != nil {
		return nil, err
	}
	byClient := map[string]*OAuthConnection{}
	order := []string{}
	for _, token := range tokens {
		if existing := byClient[token.ClientID]; existing != nil {
			if token.CreatedAt.Before(existing.CreatedAt) {
				existing.CreatedAt = token.CreatedAt
			}
			continue
		}
		byClient[token.ClientID] = &OAuthConnection{ClientID: token.ClientID, CreatedAt: token.CreatedAt, LastUsedAt: token.LastUsedAt}
		order = append(order, token.ClientID)
	}
	clients, err := s.repo.OAuthClientsByIDs(order)
	if err != nil {
		return nil, err
	}
	for _, client := range clients {
		if connection := byClient[client.ID]; connection != nil {
			connection.ClientName = client.Name
		}
	}
	result := make([]OAuthConnection, 0, len(order))
	for _, id := range order {
		result = append(result, *byClient[id])
	}
	return result, nil
}

func (s *Service) RevokeOAuthConnection(userID, clientID string) error {
	return s.repo.RevokeOAuthClientTokens(userID, strings.TrimSpace(clientID))
}
