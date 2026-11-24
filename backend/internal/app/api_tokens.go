package app

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

const (
	apiTokenPrefix          = "om_"
	oauthAccessTokenPrefix  = "omo_"
	oauthRefreshTokenPrefix = "omr_"
	maxPersonalAPITokens    = 20
)

// APITokenView 是个人密钥列表里展示的内容；明文只在 CreatedAPIToken 里出现一次。
type APITokenView struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type CreatedAPIToken struct {
	APITokenView
	Token string `json:"token"`
}

func newOpaqueToken(prefix string) string {
	return prefix + auth.RandomToken()
}

func apiTokenView(token model.APIToken) APITokenView {
	return APITokenView{ID: token.ID, Name: token.Name, Prefix: token.Prefix, LastUsedAt: token.LastUsedAt, CreatedAt: token.CreatedAt}
}

func (s *Service) PersonalAPITokens(userID string) ([]APITokenView, error) {
	tokens, err := s.repo.PersonalAPITokens(userID)
	if err != nil {
		return nil, err
	}
	views := make([]APITokenView, 0, len(tokens))
	for _, token := range tokens {
		views = append(views, apiTokenView(token))
	}
	return views, nil
}

func (s *Service) CreatePersonalAPIToken(user *model.User, name string) (*CreatedAPIToken, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "API Key"
	}
	if utf8.RuneCountInString(name) > 40 {
		return nil, BadAuthRequest("密钥名称最多 40 个字")
	}
	count, err := s.repo.CountPersonalAPITokens(user.ID)
	if err != nil {
		return nil, err
	}
	if count >= maxPersonalAPITokens {
		return nil, BadAuthRequest("最多保留 20 个密钥，请先删除不用的")
	}
	plain := newOpaqueToken(apiTokenPrefix)
	token := model.APIToken{ID: newID(), UserID: user.ID, TenantID: UserTenantID(user), Kind: model.APITokenKindPersonal, Name: name, Prefix: plain[:len(apiTokenPrefix)+6], TokenHash: auth.HashToken(plain)}
	if err := s.repo.CreateAPIToken(&token); err != nil {
		return nil, err
	}
	return &CreatedAPIToken{APITokenView: apiTokenView(token), Token: plain}, nil
}

func (s *Service) RevokePersonalAPIToken(userID string, id string) error {
	if err := s.repo.RevokePersonalAPIToken(userID, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return NotFound("密钥不存在")
		}
		return err
	}
	return nil
}

// AuthenticateAPIToken 把 Bearer 令牌（个人密钥或 OAuth 访问令牌）解析成用户。
// 和登录会话一样要求账号启用、属于当前网址的租户；令牌只能用在开放接口和 MCP 上。
func (s *Service) AuthenticateAPIToken(raw string, tenant model.Tenant) (*model.User, *model.APIToken, error) {
	raw = strings.TrimSpace(raw)
	kind := ""
	switch {
	case strings.HasPrefix(raw, apiTokenPrefix):
		kind = model.APITokenKindPersonal
	case strings.HasPrefix(raw, oauthAccessTokenPrefix):
		kind = model.APITokenKindOAuthAccess
	default:
		return nil, nil, Unauthorized("API Key 无效")
	}
	if len(raw) > 128 {
		return nil, nil, Unauthorized("API Key 无效")
	}
	token, err := s.repo.ActiveAPITokenByHash(kind, auth.HashToken(raw))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, Unauthorized("API Key 无效或已失效")
		}
		return nil, nil, err
	}
	user, err := s.repo.User(token.UserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, Unauthorized("API Key 无效或已失效")
		}
		return nil, nil, err
	}
	if user.Status != model.UserStatusActive {
		return nil, nil, Forbidden("该账号已被禁用")
	}
	if !UserBelongsToTenant(user, tenant) || token.TenantID != UserTenantID(user) {
		return nil, nil, Unauthorized("API Key 不属于这个网站")
	}
	_ = s.repo.TouchAPIToken(token.ID, time.Now())
	return user, token, nil
}
