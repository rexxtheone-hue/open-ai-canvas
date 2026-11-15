// 多租户白标：租户品牌、发件人与对外网址。
//
// 接缝说明（给设置分层那一片接入用）：
//   - tenantBrandFor(tenant) 目前平台读平台外观设置的品牌名，代理商读租户表的 Name；
//     设置分层上线后，改为读该租户自己的 appearance（品牌名、主色、Logo）即可，调用方不用动。
//   - tenantSenderFor(tenant) 目前返回空发件人（= 平台 SMTP 地址 + 品牌名作显示名）；
//     之后改为读该租户 email 设置里的 fromName / fromEmail。
//   - tenantSiteURL(tenant) 平台用存储设置的 publicBaseUrl，代理商用主网址。

package app

import (
	"context"
	"net/url"
	"strings"
	"time"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

// TenantBrand 是租户对外展示的品牌。
type TenantBrand struct {
	Name        string `json:"name"`
	AccentColor string `json:"accentColor,omitempty"`
	LogoURL     string `json:"logoUrl,omitempty"`
	IsPlatform  bool   `json:"isPlatform"`
}

// TenantSender 是租户邮件的发件人；字段为空表示沿用平台 SMTP 配置。
type TenantSender struct {
	FromName  string
	FromEmail string
}

// 代理商没有设置主色时，邮件和页面用这个中性的主色（不沿用平台的品牌紫）。
const defaultTenantAccentColor = "#2f6fed"

func (s *Service) tenantBrand(ctx context.Context) TenantBrand {
	return s.tenantBrandFor(TenantFromContext(ctx))
}

// TenantBrand 供 handler 使用（分享页标题等）。
func (s *Service) TenantBrand(ctx context.Context) TenantBrand {
	return s.tenantBrand(ctx)
}

func (s *Service) tenantBrandFor(tenant model.Tenant) TenantBrand {
	if tenant.IsPlatform || tenant.ID == "" || tenant.ID == model.PlatformTenantID {
		return TenantBrand{Name: s.appearanceBrandName(), IsPlatform: true}
	}
	name := strings.TrimSpace(tenant.Name)
	if name == "" {
		name = strings.TrimSpace(tenant.Slug)
	}
	brand := TenantBrand{Name: name, AccentColor: defaultTenantAccentColor}
	// 代理商在后台设置过品牌名或配色时以其设置为准。
	var own AppearanceSetting
	if row, err := s.repo.OverlayTenantSetting(tenant.ID, appearanceSettingKey, &own); err == nil && row != nil {
		if strings.TrimSpace(own.BrandName) != "" {
			brand.Name = strings.TrimSpace(own.BrandName)
		}
		if skin, ok := tenantSkinByID(own); ok && skin.Tokens.Light.AuthAccent != "" {
			brand.AccentColor = skin.Tokens.Light.AuthAccent
		}
	}
	return brand
}

func (s *Service) tenantSender(ctx context.Context) TenantSender {
	return s.tenantSenderFor(TenantFromContext(ctx))
}

func (s *Service) tenantSenderFor(tenant model.Tenant) TenantSender {
	if tenant.IsPlatform || tenant.ID == "" || tenant.ID == model.PlatformTenantID {
		return TenantSender{}
	}
	var own auth.EmailSettingValue
	if row, err := s.repo.OverlayTenantSetting(tenant.ID, "email", &own); err != nil || row == nil {
		return TenantSender{}
	}
	return TenantSender{FromName: strings.TrimSpace(own.FromName), FromEmail: strings.TrimSpace(own.FromEmail)}
}

// tenantByID 读取租户；空 ID、读取失败或不存在时按平台处理（旧数据都属于平台）。
func (s *Service) tenantByID(id string) model.Tenant {
	if id == "" || id == model.PlatformTenantID {
		return TenantFromContext(context.Background())
	}
	tenant, err := s.repo.Tenant(id)
	if err != nil || tenant == nil {
		return TenantFromContext(context.Background())
	}
	return *tenant
}

// tenantSiteURL 是租户的对外根地址。代理商优先用证书已生效的主网址；一个可用网址都没有时返回 nil（绝不退回平台网址）。
func (s *Service) tenantSiteURL(tenant model.Tenant) *url.URL {
	if tenant.IsPlatform || tenant.ID == "" || tenant.ID == model.PlatformTenantID {
		base, err := s.publicResourceBaseURL()
		if err != nil {
			return nil
		}
		return base
	}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil || len(domains) == 0 {
		return nil
	}
	chosen := domains[0]
	if chosen.SSLStatus != "active" {
		for _, domain := range domains {
			if domain.SSLStatus == "active" {
				chosen = domain
				break
			}
		}
	}
	return &url.URL{Scheme: "https", Host: chosen.Host, Path: "/"}
}

// tenantLink 把站内路径拼成租户网址上的绝对链接；没有可用网址时返回空串。
func (s *Service) tenantLink(tenant model.Tenant, path string) string {
	base := s.tenantSiteURL(tenant)
	if base == nil {
		return ""
	}
	return strings.TrimRight(base.String(), "/") + "/" + strings.TrimLeft(path, "/")
}

// emailBrand 把租户品牌与发件人合成邮件用的品牌。
func (s *Service) emailBrand(tenant model.Tenant) auth.EmailBrand {
	brand := s.tenantBrandFor(tenant)
	sender := s.tenantSenderFor(tenant)
	result := auth.EmailBrand{Name: brand.Name, FromName: sender.FromName, FromEmail: sender.FromEmail, IsPlatform: brand.IsPlatform}
	if !brand.IsPlatform {
		result.AccentColor = brand.AccentColor
		result.SiteURL = s.tenantLink(tenant, "/")
	}
	return result
}

func (h authHost) EmailBrand(ctx context.Context, tenantID string) auth.EmailBrand {
	if h.svc == nil {
		return auth.EmailBrand{Name: auth.DefaultBrandName, IsPlatform: true}
	}
	if tenantID != "" {
		return h.svc.emailBrand(h.svc.tenantByID(tenantID))
	}
	return h.svc.emailBrand(TenantFromContext(ctx))
}

// PublicResourceURL 返回浏览器或邮件里使用的绝对签名地址，主机是租户自己的网址；
// 签名只覆盖资源与有效期、不含主机，所以在任何租户网址上都能通过校验。
func (s *Service) PublicResourceURL(ctx context.Context, resource *model.Resource, expiresAt time.Time) (string, error) {
	if resource == nil {
		return "", NotFound("资源不存在")
	}
	relative, err := s.signedResourceAccessURL(resource, assets.VariantOriginal, expiresAt, false)
	if err != nil {
		return "", err
	}
	base := s.tenantSiteURL(TenantFromContext(ctx))
	if base == nil {
		return relative, nil
	}
	ref, err := url.Parse(relative)
	if err != nil {
		return "", err
	}
	return base.ResolveReference(ref).String(), nil
}

// tenantSkinByID 在代理商自己的皮肤里找选中的皮肤，找不到再找内置皮肤。
func tenantSkinByID(value AppearanceSetting) (AppearanceSkinTheme, bool) {
	id := strings.TrimSpace(value.SkinID)
	if id == "" {
		return AppearanceSkinTheme{}, false
	}
	for _, themes := range [][]AppearanceSkinTheme{value.SkinThemes, defaultAppearanceSkinThemes()} {
		for _, theme := range themes {
			if theme.ID == id {
				return theme, true
			}
		}
	}
	return AppearanceSkinTheme{}, false
}
