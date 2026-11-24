package model

import "time"

const (
	APITokenKindPersonal     = "personal"
	APITokenKindOAuthAccess  = "oauth_access"
	APITokenKindOAuthRefresh = "oauth_refresh"
)

// APIToken 是开放接口（命令行工具、MCP）用的访问凭证。只保存哈希；明文只在创建时返回一次。
// 个人密钥由用户在 Studio 里生成；OAuth 令牌由 MCP 客户端授权后签发，绑定 ClientID。
type APIToken struct {
	ID         string     `json:"id" gorm:"primaryKey;size:36"`
	UserID     string     `json:"-" gorm:"index;size:36;not null"`
	TenantID   string     `json:"-" gorm:"size:36;not null;default:'omnimuse'"`
	Kind       string     `json:"kind" gorm:"size:16;index;not null"`
	Name       string     `json:"name" gorm:"size:80"`
	ClientID   string     `json:"clientId,omitempty" gorm:"size:64;index"`
	Prefix     string     `json:"prefix" gorm:"size:16"`
	TokenHash  string     `json:"-" gorm:"size:64;uniqueIndex;not null"`
	ParentID   string     `json:"-" gorm:"size:36;index"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	ExpiresAt  *time.Time `json:"expiresAt" gorm:"index"`
	RevokedAt  *time.Time `json:"-" gorm:"index"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// OAuthClient 是 MCP 客户端通过动态注册（RFC 7591）登记的公开客户端，只用 PKCE，不发客户端密钥。
type OAuthClient struct {
	ID           string    `json:"clientId" gorm:"primaryKey;size:64"`
	Name         string    `json:"clientName" gorm:"size:120"`
	RedirectURIs string    `json:"-" gorm:"type:text;not null"`
	ClientURI    string    `json:"clientUri" gorm:"size:500"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// OAuthAuthorizationCode 是用户在授权页同意后签发的一次性授权码，10 分钟内换取令牌。
type OAuthAuthorizationCode struct {
	ID            string     `json:"-" gorm:"primaryKey;size:36"`
	CodeHash      string     `json:"-" gorm:"size:64;uniqueIndex;not null"`
	ClientID      string     `json:"-" gorm:"size:64;index;not null"`
	UserID        string     `json:"-" gorm:"size:36;index;not null"`
	TenantID      string     `json:"-" gorm:"size:36;not null;default:'omnimuse'"`
	RedirectURI   string     `json:"-" gorm:"type:text;not null"`
	CodeChallenge string     `json:"-" gorm:"size:128;not null"`
	Resource      string     `json:"-" gorm:"size:500"`
	ExpiresAt     time.Time  `json:"-" gorm:"index"`
	UsedAt        *time.Time `json:"-"`
	CreatedAt     time.Time  `json:"-"`
}
