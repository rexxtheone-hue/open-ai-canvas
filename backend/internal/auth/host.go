package auth

import (
	"context"
	"strings"
	"sync"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

const DefaultBrandName = "OmniMuse"

// legacyBrandName 是改名前的默认品牌；按它保存的发件人名仍视为「跟随品牌」。
const legacyBrandName = "影策"

// Host 由组合根注入，避免 auth → service 回环。
type Host interface {
	RequireAdmin(user *model.User) error
	EncryptSecret(value string) (string, error)
	DecryptSecret(value string) (string, error)
	SettingsEncryptionKey() ([]byte, error)
	BrandName() string
	// EmailBrand 返回邮件品牌与发件人：tenantID 非空时按该租户，否则按 ctx 里的请求租户。
	EmailBrand(ctx context.Context, tenantID string) EmailBrand
	EnsureSignupBonus(userID string) error
	// SignupBonusMicrocredits 是新用户注册赠送的积分，注册页用来展示「注册即送」。
	SignupBonusMicrocredits() int64
	// AttachReferral 为刚注册的账号记录推广归属；失败不影响注册。
	AttachReferral(userID, code string)
	RecordActivity(userID string, event string, count int)
	AllowRequest(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
	RequestRetryAfter(ctx context.Context, key string, window time.Duration) time.Duration
}

type nopHost struct{}

func (nopHost) RequireAdmin(user *model.User) error { return nil }
func (nopHost) EncryptSecret(value string) (string, error) {
	return value, nil
}
func (nopHost) DecryptSecret(value string) (string, error) {
	return value, nil
}
func (nopHost) SettingsEncryptionKey() ([]byte, error) { return nil, nil }
func (nopHost) BrandName() string                      { return DefaultBrandName }
func (nopHost) EnsureSignupBonus(string) error         { return nil }
func (nopHost) SignupBonusMicrocredits() int64         { return 0 }
func (nopHost) AttachReferral(string, string)          {}
func (nopHost) RecordActivity(string, string, int)     {}
func (nopHost) AllowRequest(context.Context, string, int, time.Duration) (bool, error) {
	return true, nil
}
func (nopHost) RequestRetryAfter(context.Context, string, time.Duration) time.Duration {
	return 0
}
func (nopHost) EmailBrand(context.Context, string) EmailBrand {
	return EmailBrand{Name: DefaultBrandName, IsPlatform: true}
}

type Service struct {
	repo       *repository.Repository
	host       Host
	mailSender func(EmailSettingValue, string, string, string) error
	// locks 在同一服务按租户派生的副本之间共用。
	locks *serviceLocks
	sms   SMSDelivery
}

type serviceLocks struct {
	emailCode    sync.Mutex
	registration sync.Mutex
}

type SMSDelivery interface {
	Available(string) (bool, error)
	SendCode(context.Context, string, string, string) error
}

func (s *Service) SetSMSDelivery(delivery SMSDelivery) { s.sms = delivery }

func New(repo *repository.Repository, host Host, mailSender func(EmailSettingValue, string, string, string) error) *Service {
	if host == nil {
		host = nopHost{}
	}
	return &Service{repo: repo, host: host, mailSender: mailSender, locks: &serviceLocks{}}
}

// ForTenant 返回只在指定租户内查找、创建账号的副本；邮件、短信与锁和原服务共用。
func (s *Service) ForTenant(tenantID string) *Service {
	return &Service{repo: s.repo.ForTenant(tenantID), host: s.host, mailSender: s.mailSender, locks: s.locks, sms: s.sms}
}

// tenantID 是新账号、验证码要记上的租户；未绑定租户时视为平台。
func (s *Service) tenantID() string {
	if id := s.repo.TenantID(); id != "" {
		return id
	}
	return model.PlatformTenantID
}

// firstUserBootstrap 判断是否处于「首个注册者成为管理员」的初始化阶段；只对平台生效，
// 代理商网站的管理员由平台开设，第一个注册的人也只是普通用户。
func (s *Service) firstUserBootstrap() (bool, error) {
	if s.tenantID() != model.PlatformTenantID {
		return false, nil
	}
	count, err := s.repo.UserCount()
	if err != nil {
		return false, err
	}
	return count == 0, nil
}

func (s *Service) SetMailSender(fn func(EmailSettingValue, string, string, string) error) {
	if s == nil {
		return
	}
	s.mailSender = fn
}

type brandHost struct {
	nopHost
	name string
}

func (h brandHost) BrandName() string {
	if strings.TrimSpace(h.name) == "" {
		return DefaultBrandName
	}
	return h.name
}

func (h brandHost) EmailBrand(context.Context, string) EmailBrand {
	return EmailBrand{Name: h.BrandName(), IsPlatform: true}
}
