package app

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

// PublicAppearanceFor 返回请求网址所属租户的公开外观。平台原样返回；代理商换成租户品牌，
// 并去掉平台专属的内容（平台 Logo、更新公告、购买链接、备案号等），不让平台品牌出现在代理商网站上。
func (s *Service) PublicAppearanceFor(ctx context.Context) (*PublicAppearanceSetting, error) {
	setting, err := s.Appearance()
	if err != nil {
		return nil, err
	}
	tenant := TenantFromContext(ctx)
	brand := s.tenantBrandFor(tenant)
	if brand.IsPlatform {
		return setting, nil
	}
	return agencyPublicAppearance(*setting, tenant, brand, s.appearanceBrandName()), nil
}

var appearanceSlugCleaner = regexp.MustCompile(`[^a-z0-9-]+`)

func agencyPublicAppearance(value PublicAppearanceSetting, tenant model.Tenant, brand TenantBrand, platformBrand string) *PublicAppearanceSetting {
	defaults := defaultAppearanceSetting()
	name := brand.Name
	value.IsPlatform = false
	value.BrandName = name
	value.BrandSlug = strings.Trim(appearanceSlugCleaner.ReplaceAllString(strings.ToLower(tenant.Slug), "-"), "-")
	if value.BrandSlug == "" {
		value.BrandSlug = "studio"
	}
	value.Updates = UpdateAnnouncement{Releases: []UpdateRelease{}}
	value.LogoURL, value.DarkLogoURL = brand.LogoURL, brand.LogoURL
	value.LogoConfigured, value.DarkLogoConfigured = brand.LogoURL != "", brand.LogoURL != ""
	value.AuthHeroTitle = defaults.AuthHeroTitle
	value.AuthHeroDescription = ""
	if value.AuthVideoConfigured || value.AuthVideoPosterConfigured {
		value.AuthVideoURL, value.AuthVideoPosterURL = defaultAppearanceVideoURL, defaultAppearancePosterURL
		value.AuthVideoConfigured, value.AuthVideoPosterConfigured = false, false
	}
	value.SEOTitle = name
	value.SEODescription = name + "，AI 创作工作台：视频、图片、配音与广告，一站完成。"
	value.SEOKeywords = ""
	value.FooterCopyright = fmt.Sprintf("© %d %s. All rights reserved.", time.Now().Year(), name)
	value.ICPFilingEnabled, value.ICPFilingNumber = false, ""
	value.RedeemPurchaseURL = ""
	value.Canvas = scrubBrand(value.Canvas, platformBrand, name)
	return &value
}

// scrubBrand 把结构里所有字符串中的平台品牌名（不分大小写）换成租户品牌名，兜住后台自定义文案里写死的品牌。
func scrubBrand[T any](value T, platformBrand, tenantBrand string) T {
	encoded, err := json.Marshal(value)
	if err != nil {
		return value
	}
	patterns := []string{regexp.QuoteMeta(platformDefaultBrand)}
	if platformBrand = strings.TrimSpace(platformBrand); platformBrand != "" && !strings.EqualFold(platformBrand, platformDefaultBrand) {
		patterns = append(patterns, regexp.QuoteMeta(platformBrand))
	}
	replacement, _ := json.Marshal(tenantBrand)
	inner := strings.Trim(string(replacement), `"`)
	scrubbed := regexp.MustCompile(`(?i)`+strings.Join(patterns, "|")).ReplaceAllLiteralString(string(encoded), inner)
	var result T
	if err := json.Unmarshal([]byte(scrubbed), &result); err != nil {
		return value
	}
	return result
}

const platformDefaultBrand = defaultAppearanceBrandName
