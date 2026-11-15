// 多租户：代理商自定义网址（Cloudflare for SaaS 自定义主机名）与默认子域名。

package app

import (
	"context"
	"errors"
	"net"
	"os"
	"strings"
	"time"

	"yingce/backend/internal/cfsaas"
	"yingce/backend/internal/model"
)

// 默认子域名由平台的通配证书覆盖，不需要在 Cloudflare 单独登记。
const tenantDomainSSLWildcard = "active"

type TenantDomainView struct {
	ID                 string    `json:"id"`
	Host               string    `json:"host"`
	IsPrimary          bool      `json:"isPrimary"`
	SSLStatus          string    `json:"sslStatus"`
	Managed            bool      `json:"managed"`
	CNAMETarget        string    `json:"cnameTarget,omitempty"`
	VerificationErrors []string  `json:"verificationErrors,omitempty"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type TenantDomainRequest struct {
	Host    string `json:"host"`
	Primary bool   `json:"primary"`
}

// SetCustomHostnameClient 替换 Cloudflare 客户端；测试注入假实现。
func (s *Service) SetCustomHostnameClient(client cfsaas.Client) {
	s.customHostnamesMu.Lock()
	defer s.customHostnamesMu.Unlock()
	s.customHostnames = client
}

func (s *Service) customHostnameClient() (cfsaas.Client, error) {
	s.customHostnamesMu.Lock()
	defer s.customHostnamesMu.Unlock()
	if s.customHostnames != nil {
		return s.customHostnames, nil
	}
	cfg, ok := cfsaas.ConfigFromEnv()
	if !ok {
		return nil, NewAppError(503, "尚未配置 Cloudflare for SaaS（CF_SAAS_ZONE_ID / CF_SAAS_API_TOKEN），无法添加自定义网址")
	}
	s.customHostnames = cfsaas.New(cfg)
	return s.customHostnames, nil
}

// tenantBaseDomain 是代理商默认子域名的上级域名（TENANT_BASE_DOMAIN），未设置时不生成默认子域名。
func tenantBaseDomain() string {
	return NormalizeTenantHost(strings.TrimPrefix(strings.TrimSpace(os.Getenv("TENANT_BASE_DOMAIN")), "*."))
}

// requirePlatformAdmin 只允许平台超级管理员（员工角色不下放网址管理）。
func (s *Service) requirePlatformAdmin(actor *model.User) error {
	if err := s.requireSuperAdmin(actor); err != nil {
		return err
	}
	if actor.TenantID != "" && actor.TenantID != model.PlatformTenantID {
		return Forbidden("需要平台管理员权限")
	}
	return nil
}

func (s *Service) adminTenant(tenantID string) (*model.Tenant, error) {
	tenant, err := s.repo.Tenant(strings.TrimSpace(tenantID))
	if err != nil {
		return nil, err
	}
	if tenant == nil {
		return nil, NotFound("租户不存在")
	}
	return tenant, nil
}

func (s *Service) tenantDomainViews(domains []model.TenantDomain) []TenantDomainView {
	target := ""
	if client, err := s.customHostnameClient(); err == nil {
		target = client.FallbackOrigin()
	}
	views := make([]TenantDomainView, 0, len(domains))
	for _, domain := range domains {
		view := TenantDomainView{ID: domain.ID, Host: domain.Host, IsPrimary: domain.IsPrimary, SSLStatus: domain.SSLStatus, Managed: domain.CFHostnameID != "", CreatedAt: domain.CreatedAt, UpdatedAt: domain.UpdatedAt}
		if view.Managed {
			view.CNAMETarget = target
		}
		views = append(views, view)
	}
	return views
}

// EnsureDefaultTenantDomain 在设置了 TENANT_BASE_DOMAIN 时为代理商建立 <slug>.<base> 默认网址；已存在则不动。
func (s *Service) EnsureDefaultTenantDomain(tenantID string) error {
	base := tenantBaseDomain()
	if base == "" {
		return nil
	}
	tenant, err := s.repo.Tenant(tenantID)
	if err != nil || tenant == nil || tenant.IsPlatform {
		return err
	}
	host := NormalizeTenantHost(tenant.Slug + "." + base)
	if err := validateTenantHost(host); err != nil {
		return err
	}
	existing, err := s.repo.TenantDomainByHost(host)
	if err != nil || existing != nil {
		return err
	}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil {
		return err
	}
	now := time.Now()
	domain := model.TenantDomain{ID: newID(), TenantID: tenant.ID, Host: host, IsPrimary: len(domains) == 0, SSLStatus: tenantDomainSSLWildcard, CreatedAt: now, UpdatedAt: now}
	if err := s.repo.CreateTenantDomain(&domain); err != nil {
		return err
	}
	s.InvalidateTenantCache()
	return nil
}

func (s *Service) AdminTenantDomains(actor *model.User, tenantID string) ([]TenantDomainView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.adminTenant(tenantID)
	if err != nil {
		return nil, err
	}
	if err := s.EnsureDefaultTenantDomain(tenant.ID); err != nil {
		return nil, err
	}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil {
		return nil, err
	}
	return s.tenantDomainViews(domains), nil
}

// AddTenantDomain 登记代理商自己的网址：先在 Cloudflare 建自定义主机名（HTTP 验证 DV 证书），再写入网址表。
func (s *Service) AddTenantDomain(ctx context.Context, actor *model.User, tenantID string, req TenantDomainRequest) (*TenantDomainView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.adminTenant(tenantID)
	if err != nil {
		return nil, err
	}
	if tenant.IsPlatform {
		return nil, BadAuthRequest("平台自己的网址不通过这里管理")
	}
	host := NormalizeTenantHost(req.Host)
	if err := validateTenantHost(host); err != nil {
		return nil, err
	}
	if s.isPlatformHost(host) {
		return nil, BadAuthRequest("不能把平台网址分配给代理商")
	}
	if existing, err := s.repo.TenantDomainByHost(host); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, NewAppError(409, "这个网址已被使用")
	}
	client, err := s.customHostnameClient()
	if err != nil {
		return nil, err
	}
	created, err := client.Create(ctx, host)
	if err != nil {
		return nil, WrapAppError(502, "Cloudflare 登记网址失败", err)
	}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	domain := model.TenantDomain{ID: newID(), TenantID: tenant.ID, Host: host, IsPrimary: false, SSLStatus: created.SSLStatus, CFHostnameID: created.ID, CreatedAt: now, UpdatedAt: now}
	if err := s.repo.CreateTenantDomain(&domain); err != nil {
		// 本地写入失败时撤回 Cloudflare 上的登记，避免留下孤儿主机名。
		_ = client.Delete(ctx, created.ID)
		return nil, err
	}
	if req.Primary || len(domains) == 0 {
		if err := s.repo.SetTenantPrimaryDomain(tenant.ID, domain.ID); err != nil {
			return nil, err
		}
		domain.IsPrimary = true
	}
	s.InvalidateTenantCache()
	_ = s.appendAdminAudit(actor, "tenant.domain.add", "tenant_domain", domain.ID, "添加代理商网址 "+host, map[string]any{"tenantId": tenant.ID, "host": host, "sslStatus": domain.SSLStatus})
	view := s.tenantDomainViews([]model.TenantDomain{domain})[0]
	view.VerificationErrors = created.VerificationErrors
	return &view, nil
}

// RefreshTenantDomain 从 Cloudflare 读取最新证书状态。
func (s *Service) RefreshTenantDomain(ctx context.Context, actor *model.User, tenantID, domainID string) (*TenantDomainView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	domain, err := s.adminTenantDomain(tenantID, domainID)
	if err != nil {
		return nil, err
	}
	var verification []string
	if domain.CFHostnameID != "" {
		client, err := s.customHostnameClient()
		if err != nil {
			return nil, err
		}
		current, err := client.Get(ctx, domain.CFHostnameID)
		if errors.Is(err, cfsaas.ErrNotFound) {
			current = cfsaas.Hostname{ID: domain.CFHostnameID, SSLStatus: "missing"}
		} else if err != nil {
			return nil, WrapAppError(502, "读取 Cloudflare 网址状态失败", err)
		}
		verification = current.VerificationErrors
		if current.SSLStatus != domain.SSLStatus {
			if err := s.repo.UpdateTenantDomainStatus(domain.ID, current.SSLStatus, domain.CFHostnameID); err != nil {
				return nil, err
			}
			domain.SSLStatus = current.SSLStatus
			domain.UpdatedAt = time.Now()
			s.InvalidateTenantCache()
		}
	}
	view := s.tenantDomainViews([]model.TenantDomain{*domain})[0]
	view.VerificationErrors = verification
	return &view, nil
}

func (s *Service) SetTenantPrimaryDomain(actor *model.User, tenantID, domainID string) ([]TenantDomainView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	domain, err := s.adminTenantDomain(tenantID, domainID)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SetTenantPrimaryDomain(domain.TenantID, domain.ID); err != nil {
		return nil, err
	}
	s.InvalidateTenantCache()
	_ = s.appendAdminAudit(actor, "tenant.domain.primary", "tenant_domain", domain.ID, "设为代理商主网址 "+domain.Host, map[string]any{"tenantId": domain.TenantID, "host": domain.Host})
	domains, err := s.repo.TenantDomains(domain.TenantID)
	if err != nil {
		return nil, err
	}
	return s.tenantDomainViews(domains), nil
}

// RemoveTenantDomain 先删 Cloudflare 主机名再删本地记录；Cloudflare 上已不存在也照常删除。
func (s *Service) RemoveTenantDomain(ctx context.Context, actor *model.User, tenantID, domainID string) ([]TenantDomainView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	domain, err := s.adminTenantDomain(tenantID, domainID)
	if err != nil {
		return nil, err
	}
	if domain.CFHostnameID != "" {
		client, err := s.customHostnameClient()
		if err != nil {
			return nil, err
		}
		if err := client.Delete(ctx, domain.CFHostnameID); err != nil && !errors.Is(err, cfsaas.ErrNotFound) {
			return nil, WrapAppError(502, "Cloudflare 删除网址失败", err)
		}
	}
	if err := s.repo.DeleteTenantDomain(domain.TenantID, domain.ID); err != nil {
		return nil, err
	}
	domains, err := s.repo.TenantDomains(domain.TenantID)
	if err != nil {
		return nil, err
	}
	// 删掉的是主网址时，把剩下最早的一个顶上，保证邮件和链接始终有网址可用。
	if domain.IsPrimary && len(domains) > 0 {
		if err := s.repo.SetTenantPrimaryDomain(domain.TenantID, domains[0].ID); err != nil {
			return nil, err
		}
		domains[0].IsPrimary = true
	}
	s.InvalidateTenantCache()
	_ = s.appendAdminAudit(actor, "tenant.domain.remove", "tenant_domain", domain.ID, "删除代理商网址 "+domain.Host, map[string]any{"tenantId": domain.TenantID, "host": domain.Host})
	return s.tenantDomainViews(domains), nil
}

// TenantOwnDomains 是代理商管理员查看自己网址的只读接口。
func (s *Service) TenantOwnDomains(ctx context.Context, actor *model.User) ([]TenantDomainView, error) {
	if actor == nil {
		return nil, Unauthorized("请先登录")
	}
	tenant := TenantFromContext(ctx)
	if !UserBelongsToTenant(actor, tenant) {
		return nil, Forbidden("无权查看此网站的网址")
	}
	if actor.Role != model.UserRoleTenantAdmin && actor.Role != model.UserRoleAdmin {
		return nil, Forbidden("需要代理商管理员权限")
	}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil {
		return nil, err
	}
	return s.tenantDomainViews(domains), nil
}

func (s *Service) adminTenantDomain(tenantID, domainID string) (*model.TenantDomain, error) {
	tenant, err := s.adminTenant(tenantID)
	if err != nil {
		return nil, err
	}
	domain, err := s.repo.TenantDomain(tenant.ID, strings.TrimSpace(domainID))
	if err != nil {
		return nil, err
	}
	if domain == nil {
		return nil, NotFound("网址不存在")
	}
	return domain, nil
}

// isPlatformHost 判断是否为平台自己的对外网址（存储设置的公网地址）。
func (s *Service) isPlatformHost(host string) bool {
	base, err := s.publicResourceBaseURL()
	return err == nil && base != nil && NormalizeTenantHost(base.Host) == host
}

func validateTenantHost(host string) error {
	if host == "" || len(host) > 253 || !strings.Contains(host, ".") || net.ParseIP(host) != nil {
		return BadAuthRequest("请输入完整的网址，例如 studio.example.com")
	}
	for _, label := range strings.Split(host, ".") {
		if label == "" || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return BadAuthRequest("网址格式不正确：" + host)
		}
		for _, char := range label {
			if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '-' {
				return BadAuthRequest("网址格式不正确：" + host)
			}
		}
	}
	return nil
}
