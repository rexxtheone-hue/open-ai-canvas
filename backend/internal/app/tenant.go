// 多租户：按网址认出租户，并把租户放进请求上下文。

package app

import (
	"context"
	"net"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

const tenantCacheTTL = 60 * time.Second

type tenantCacheEntry struct {
	tenant  model.Tenant
	expires time.Time
}

type tenantContextKey struct{}

// NormalizeTenantHost 去掉端口、结尾的点，并转成小写。
func NormalizeTenantHost(host string) string {
	host = strings.TrimSpace(host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.TrimSuffix(strings.ToLower(host), ".")
}

// ResolveTenant 返回网址对应的租户。没有登记的网址（omnimuse.io、服务器 IP、本机开发）都归平台租户。
func (s *Service) ResolveTenant(host string) (model.Tenant, error) {
	host = NormalizeTenantHost(host)
	if cached, ok := s.tenantCache.Load(host); ok {
		entry := cached.(tenantCacheEntry)
		if time.Now().Before(entry.expires) {
			return entry.tenant, nil
		}
	}
	tenant, err := s.repo.TenantByHost(host)
	if err != nil {
		return model.Tenant{}, err
	}
	if tenant == nil {
		tenant, err = s.repo.Tenant(model.PlatformTenantID)
		if err != nil {
			return model.Tenant{}, err
		}
	}
	if tenant == nil {
		// 迁移还没跑到 v77 时的保底：当作平台租户。
		tenant = &model.Tenant{ID: model.PlatformTenantID, Slug: model.PlatformTenantID, Status: model.TenantStatusActive, IsPlatform: true}
	}
	s.tenantCache.Store(host, tenantCacheEntry{tenant: *tenant, expires: time.Now().Add(tenantCacheTTL)})
	return *tenant, nil
}

// InvalidateTenantCache 在租户或网址变更后调用，让下一个请求重新读取。
func (s *Service) InvalidateTenantCache() {
	s.tenantCache.Range(func(key, _ any) bool {
		s.tenantCache.Delete(key)
		return true
	})
}

func WithTenant(ctx context.Context, tenant model.Tenant) context.Context {
	return context.WithValue(ctx, tenantContextKey{}, tenant)
}

// TenantFromContext 取出请求所属的租户；后台任务等没有请求的地方返回平台租户。
func TenantFromContext(ctx context.Context) model.Tenant {
	if ctx != nil {
		if tenant, ok := ctx.Value(tenantContextKey{}).(model.Tenant); ok {
			return tenant
		}
	}
	return model.Tenant{ID: model.PlatformTenantID, Slug: model.PlatformTenantID, Status: model.TenantStatusActive, IsPlatform: true}
}

// UserTenantID 返回账号所属的租户；旧数据没有租户时视为平台。
func UserTenantID(user *model.User) string {
	if user == nil || user.TenantID == "" {
		return model.PlatformTenantID
	}
	return user.TenantID
}

// UserBelongsToTenant 判断已登录用户是否属于这个网址的租户；旧数据没有租户时视为平台用户。
func UserBelongsToTenant(user *model.User, tenant model.Tenant) bool {
	if user == nil {
		return false
	}
	owner := user.TenantID
	if owner == "" {
		owner = model.PlatformTenantID
	}
	return owner == tenant.ID
}
