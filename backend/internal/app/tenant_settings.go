// 多租户设置：平台层（system_settings）叠加代理商层（tenant_settings）。
// 读取按请求上下文里的租户合并；写入时代理商管理员只能写自己租户的白名单字段。

package app

import (
	"context"
	"encoding/json"
	"mime/multipart"
	"strings"

	"yingce/backend/internal/model"
	"yingce/backend/internal/tenantsetting"
)

func init() {
	tenantsetting.SetContextResolver(func(ctx context.Context) string {
		tenant := TenantFromContext(ctx)
		if tenant.IsPlatform {
			return ""
		}
		return tenant.ID
	})
}

// IsTenantAdmin 判断是否为代理商管理员。
func IsTenantAdmin(user *model.User) bool {
	return user != nil && user.Role == model.UserRoleTenantAdmin
}

func settingActorTenantID(user *model.User) string {
	if user == nil || user.TenantID == "" {
		return model.PlatformTenantID
	}
	return user.TenantID
}

// RequireTenantAdminOrAdmin 校验设置类操作的身份，返回 true 表示写代理商层。
// 平台网址只认平台管理员（含按路由放行的员工）；代理商网址只认该代理商自己的管理员，
// 平台管理员暂不允许在代理商网址代为修改。
func RequireTenantAdminOrAdmin(actor *model.User, tenant model.Tenant) (bool, error) {
	if actor == nil {
		return false, Unauthorized("请先登录")
	}
	if tenant.IsPlatform {
		if actor.Role == model.UserRoleAdmin {
			return false, nil
		}
		return false, Forbidden("需要管理员权限")
	}
	switch actor.Role {
	case model.UserRoleTenantAdmin:
		if settingActorTenantID(actor) == tenant.ID {
			return true, nil
		}
		return false, Forbidden("只能管理自己网站的设置")
	case model.UserRoleAdmin:
		return false, Forbidden("平台管理员请在平台网址管理设置")
	default:
		return false, Forbidden("需要管理员权限")
	}
}

// tenantSettingScope 返回本次请求要写的代理商租户 ID；平台网址返回空字符串，调用方照旧走平台流程。
func (s *Service) tenantSettingScope(ctx context.Context, actor *model.User) (string, error) {
	tenant := TenantFromContext(ctx)
	if tenant.IsPlatform {
		return "", nil
	}
	if _, err := RequireTenantAdminOrAdmin(actor, tenant); err != nil {
		return "", err
	}
	return tenant.ID, nil
}

// layeredSettingMeta 让合并后的设置带上代理商层的修改时间，前端资源版本号随之变化。
func layeredSettingMeta(setting *model.SystemSetting, row *model.TenantSetting) *model.SystemSetting {
	if row == nil {
		return setting
	}
	merged := model.SystemSetting{Key: row.Key, UpdatedBy: row.UpdatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	if setting != nil && setting.UpdatedAt.After(row.UpdatedAt) {
		merged.UpdatedAt = setting.UpdatedAt
	}
	return &merged
}

// BrandNameFor 返回请求所属网址的品牌名；没有请求上下文的后台任务请用平台品牌。
func (s *Service) BrandNameFor(ctx context.Context) string {
	return s.tenantBrand(ctx).Name
}

// ---- 外观 ----

func (s *Service) readAppearanceForTenant(tenantID string) (*model.SystemSetting, AppearanceSetting, *model.TenantSetting, error) {
	setting, value, err := s.readAppearance()
	if err != nil || tenantID == "" {
		return setting, value, nil, err
	}
	row, err := s.repo.OverlayTenantSetting(tenantID, appearanceSettingKey, &value)
	if err != nil {
		return nil, AppearanceSetting{}, nil, err
	}
	return layeredSettingMeta(setting, row), value, row, nil
}

// AppearanceFor 是公开外观接口用的合并视图。
func (s *Service) AppearanceFor(ctx context.Context) (*PublicAppearanceSetting, error) {
	tenantID := tenantsetting.TenantID(ctx)
	if tenantID == "" {
		return s.Appearance()
	}
	setting, value, _, err := s.readAppearanceForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	value = s.resolveAvailableAppearanceAssets(value)
	return publicAppearanceSetting(setting, value), nil
}

func (s *Service) PrepareAppearanceAssetDeliveryFor(ctx context.Context, slot string, options ResourceAccessOptions, rangeHeader string) (*ResourceDelivery, error) {
	tenantID := tenantsetting.TenantID(ctx)
	if tenantID == "" {
		return s.PrepareAppearanceAssetDelivery(slot, options, rangeHeader)
	}
	_, value, _, err := s.readAppearanceForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return s.prepareAppearanceAssetDeliveryFrom(value, slot, options, rangeHeader)
}

func (s *Service) tenantAdminAppearance(tenantID string) (*AdminAppearanceSetting, error) {
	setting, value, row, err := s.readAppearanceForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	value = s.resolveAvailableAppearanceAssets(value)
	result := &AdminAppearanceSetting{AppearanceSetting: value, Public: *publicAppearanceSetting(setting, value), Configured: row != nil}
	if row != nil {
		result.UpdatedBy = row.UpdatedBy
		result.CreatedAt = row.CreatedAt
		result.UpdatedAt = row.UpdatedAt
	}
	return result, nil
}

func (s *Service) AdminAppearanceFor(ctx context.Context, actor *model.User) (*AdminAppearanceSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.AdminAppearance(actor)
	}
	return s.tenantAdminAppearance(tenantID)
}

func (s *Service) UpdateAppearanceFor(ctx context.Context, actor *model.User, value AppearanceSetting) (*AdminAppearanceSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.UpdateAppearance(actor, value)
	}
	value, err = normalizeAppearanceInput(value)
	if err != nil {
		return nil, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	_, before, _, err := s.readAppearanceForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	for _, candidate := range []struct {
		slot       string
		resourceID string
		currentID  string
	}{
		{slot: AppearanceAssetLogo, resourceID: value.LogoResourceID, currentID: before.LogoResourceID},
		{slot: AppearanceAssetDarkLogo, resourceID: value.DarkLogoResourceID, currentID: before.DarkLogoResourceID},
		{slot: AppearanceAssetVideo, resourceID: value.AuthVideoResourceID, currentID: before.AuthVideoResourceID},
		{slot: AppearanceAssetPoster, resourceID: value.AuthVideoPosterResourceID, currentID: before.AuthVideoPosterResourceID},
	} {
		if err := s.validateAppearanceResource(actor, candidate.slot, candidate.resourceID, candidate.currentID); err != nil {
			return nil, err
		}
	}
	if err := s.saveTenantLayer(actor, tenantID, appearanceSettingKey, value, "更新代理商外观配置"); err != nil {
		return nil, err
	}
	return s.tenantAdminAppearance(tenantID)
}

func (s *Service) ResetAppearanceFor(ctx context.Context, actor *model.User) (*AdminAppearanceSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.ResetAppearance(actor)
	}
	if err := s.repo.DeleteTenantSetting(tenantID, appearanceSettingKey); err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "tenant_setting.reset", "tenant_setting", tenantID+":"+appearanceSettingKey, "代理商外观恢复跟随平台", nil); err != nil {
		return nil, err
	}
	return s.tenantAdminAppearance(tenantID)
}

// UploadAppearanceAssetFor：代理商只能上传自己的 Logo、登录页视频与封面，不能上传更新公告素材。
func (s *Service) UploadAppearanceAssetFor(ctx context.Context, actor *model.User, slot string, header *multipart.FileHeader) (*model.Resource, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.UploadAppearanceAsset(actor, slot, header)
	}
	switch strings.TrimSpace(slot) {
	case AppearanceAssetLogo, AppearanceAssetDarkLogo, AppearanceAssetVideo, AppearanceAssetPoster:
	default:
		return nil, Forbidden("该外观资源只能由平台管理员上传")
	}
	return s.uploadAppearanceAssetUnchecked(actor, slot, header)
}

// ---- 积分策略（只开放注册赠送） ----

func (s *Service) creditPolicyForTenant(tenantID string) (CreditPolicy, *model.TenantSetting, error) {
	policy, err := s.creditPolicy()
	if err != nil || tenantID == "" || tenantID == model.PlatformTenantID {
		return policy, nil, err
	}
	row, err := s.repo.OverlayTenantSetting(tenantID, creditPolicySettingKey, &policy)
	if err != nil {
		return CreditPolicy{}, nil, err
	}
	if policy.ModelMultiplierBPS == nil {
		policy.ModelMultiplierBPS = map[string]int64{}
	}
	return policy, row, nil
}

func (s *Service) AdminCreditPolicyFor(ctx context.Context, actor *model.User) (CreditPolicy, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return CreditPolicy{}, err
	}
	if tenantID == "" {
		return s.AdminCreditPolicy(actor)
	}
	policy, _, err := s.creditPolicyForTenant(tenantID)
	return policy, err
}

func (s *Service) UpdateCreditPolicyFor(ctx context.Context, actor *model.User, policy CreditPolicy) (CreditPolicy, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return CreditPolicy{}, err
	}
	if tenantID == "" {
		return s.UpdateCreditPolicy(actor, policy)
	}
	current, _, err := s.creditPolicyForTenant(tenantID)
	if err != nil {
		return CreditPolicy{}, err
	}
	current.SignupBonusMicrocredits = policy.SignupBonusMicrocredits
	if err := validateCreditPolicy(current); err != nil {
		return CreditPolicy{}, err
	}
	if err := s.saveTenantLayer(actor, tenantID, creditPolicySettingKey, current, "更新代理商注册赠送积分"); err != nil {
		return CreditPolicy{}, err
	}
	next, _, err := s.creditPolicyForTenant(tenantID)
	return next, err
}

// signupBonusMicrocreditsFor 是注册页展示的赠送积分，按网址所属租户计算。
func (s *Service) signupBonusMicrocreditsFor(tenantID string) int64 {
	if enabled, err := s.platformDomain().FeatureEnabledForTenant(tenantID, FeatureCredits); err != nil || !enabled {
		return 0
	}
	policy, _, err := s.creditPolicyForTenant(tenantID)
	if err != nil {
		return 0
	}
	return policy.SignupBonusMicrocredits
}

// ---- 功能开放（代理商只能关，不能开） ----

func (s *Service) FeatureAvailabilityFor(ctx context.Context) (*PublicFeatureAvailability, error) {
	return s.platformDomain().FeatureAvailabilityForTenant(tenantsetting.TenantID(ctx))
}

func (s *Service) RequireFeatureFor(ctx context.Context, feature string) error {
	return s.platformDomain().RequireFeatureForTenant(tenantsetting.TenantID(ctx), feature)
}

func (s *Service) AdminFeatureAvailabilityFor(ctx context.Context, actor *model.User) (*PublicFeatureAvailability, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.AdminFeatureAvailability(actor)
	}
	return s.platformDomain().FeatureAvailabilityForTenant(tenantID)
}

func (s *Service) UpdateFeatureAvailabilityFor(ctx context.Context, actor *model.User, value FeatureAvailability) (*PublicFeatureAvailability, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.UpdateFeatureAvailability(actor, value)
	}
	result, err := s.platformDomain().UpdateTenantFeatureAvailability(tenantID, actor.ID, value)
	if err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "tenant_setting.update", "tenant_setting", tenantID+":"+tenantsetting.KeyFeatureAvailability, "更新代理商功能开放", value); err != nil {
		return nil, err
	}
	return result, nil
}

// ---- 推广设置（整份由代理商决定） ----

func (s *Service) affiliateSettingForTenant(tenantID string) (AffiliateSetting, error) {
	value, err := s.affiliateSetting()
	if err != nil || tenantID == "" || tenantID == model.PlatformTenantID {
		return value, err
	}
	if _, err := s.repo.OverlayTenantSetting(tenantID, affiliateSettingKey, &value); err != nil {
		return AffiliateSetting{}, err
	}
	return value, nil
}

func (s *Service) AdminAffiliateSettingFor(ctx context.Context, actor *model.User) (AffiliateSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return AffiliateSetting{}, err
	}
	if tenantID == "" {
		return s.AdminAffiliateSetting(actor)
	}
	return s.affiliateSettingForTenant(tenantID)
}

func (s *Service) UpdateAffiliateSettingFor(ctx context.Context, actor *model.User, value AffiliateSetting) (AffiliateSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return AffiliateSetting{}, err
	}
	if tenantID == "" {
		return s.UpdateAffiliateSetting(actor, value)
	}
	if err := validateAffiliateSetting(value); err != nil {
		return AffiliateSetting{}, err
	}
	if err := s.saveTenantLayer(actor, tenantID, affiliateSettingKey, value, "更新代理商推广设置"); err != nil {
		return AffiliateSetting{}, err
	}
	return s.affiliateSettingForTenant(tenantID)
}

// ---- 帮助中心内容（客服、条款、隐私） ----

func (s *Service) StudioSiteContentFor(ctx context.Context) (map[string]string, error) {
	content, err := s.StudioSiteContent()
	tenantID := tenantsetting.TenantID(ctx)
	if err != nil || tenantID == "" {
		return content, err
	}
	if _, err := s.repo.OverlayTenantSetting(tenantID, tenantsetting.KeyStudioSiteContent, &content); err != nil {
		return nil, err
	}
	return content, nil
}

func (s *Service) SaveStudioSiteContentFor(ctx context.Context, actor *model.User, key, content string) error {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return err
	}
	if tenantID == "" {
		return s.SaveStudioSiteContent(actor, key, content)
	}
	key = strings.TrimSpace(key)
	known := false
	for _, item := range StudioSiteContentKeys {
		known = known || item == key
	}
	if !known {
		return BadAuthRequest("内容项无效")
	}
	content, err = limitText(strings.TrimSpace(content), 60000, "内容太长")
	if err != nil {
		return err
	}
	layer := map[string]string{}
	row, err := s.repo.TenantSettingRow(tenantID, tenantsetting.KeyStudioSiteContent)
	if err != nil {
		return err
	}
	if row != nil && json.Unmarshal([]byte(row.ValueJSON), &layer) != nil {
		layer = map[string]string{}
	}
	layer[key] = content
	return s.saveTenantLayer(actor, tenantID, tenantsetting.KeyStudioSiteContent, layer, "更新代理商帮助中心内容")
}

// ---- 注册、邮件、Google 登录（auth 域） ----

func (s *Service) AdminRegistrationSettingFor(ctx context.Context, actor *model.User) (*PublicRegistrationSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.AdminRegistrationSetting(actor)
	}
	return s.authDomain().RegistrationSettingForTenant(tenantID)
}

func (s *Service) UpdateRegistrationSettingFor(ctx context.Context, actor *model.User, req RegistrationSettingRequest) (*PublicRegistrationSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.UpdateRegistrationSetting(actor, req)
	}
	return s.authDomain().UpdateTenantRegistrationSetting(tenantID, actor.ID, req)
}

func (s *Service) AdminEmailSettingFor(ctx context.Context, actor *model.User) (*PublicEmailSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.AdminEmailSetting(actor)
	}
	return s.authDomain().EmailSettingForTenant(tenantID, s.BrandNameFor(ctx))
}

func (s *Service) UpdateEmailSettingFor(ctx context.Context, actor *model.User, req EmailSettingRequest) (*PublicEmailSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.UpdateEmailSetting(actor, req)
	}
	return s.authDomain().UpdateTenantEmailSetting(tenantID, actor.ID, s.BrandNameFor(ctx), req)
}

func (s *Service) AdminGoogleSettingFor(ctx context.Context, actor *model.User) (*PublicGoogleSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.AdminGoogleSetting(actor)
	}
	return s.authDomain().GoogleSettingForTenant(tenantID)
}

func (s *Service) UpdateGoogleSettingFor(ctx context.Context, actor *model.User, req GoogleSettingRequest) (*PublicGoogleSetting, error) {
	tenantID, err := s.tenantSettingScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if tenantID == "" {
		return s.UpdateGoogleSetting(actor, req)
	}
	return s.authDomain().UpdateTenantGoogleSetting(tenantID, actor.ID, req)
}

// PublicAuthSettingsFor 在平台登录设置上换成代理商自己的注册开关、协议、Google 登录与赠送积分。
func (s *Service) PublicAuthSettingsFor(ctx context.Context) (*PublicAuthSettings, error) {
	settings, err := s.PublicAuthSettings(ctx)
	tenantID := tenantsetting.TenantID(ctx)
	if err != nil || tenantID == "" {
		return settings, err
	}
	domain := s.authDomain()
	// 代理商网址没有「首个注册者成为管理员」的初始化流程。
	settings.FirstUser = false
	settings.RegistrationEnabled, err = domain.RegistrationEnabledForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	settings.GoogleEnabled = domain.GoogleEnabledForTenant(tenantID)
	settings.LinuxDOEnabled = false
	settings.AgreementTitle, settings.AgreementContent = domain.RegistrationAgreementForTenant(tenantID, s.BrandNameFor(ctx))
	settings.SignupBonusMicrocredits = s.signupBonusMicrocreditsFor(tenantID)
	return settings, nil
}

// saveTenantLayer 只把白名单字段写进代理商层，并记审计。
func (s *Service) saveTenantLayer(actor *model.User, tenantID, key string, value any, summary string) error {
	encoded, err := tenantsetting.Filter(key, value)
	if err != nil {
		return err
	}
	if _, err := s.repo.SaveTenantSetting(tenantID, key, encoded, actor.ID); err != nil {
		return err
	}
	return s.appendAdminAudit(actor, "tenant_setting.update", "tenant_setting", tenantID+":"+key, summary, json.RawMessage(encoded))
}

// tenantAdminNavigation 是代理商管理员在后台能看到的设置入口（都是白名单设置）。
var tenantAdminNavigation = []string{
	"/admin/settings/appearance", "/admin/settings/registration", "/admin/settings/email",
	"/admin/settings/google", "/admin/settings/credits", "/admin/settings/features",
	"/admin/affiliate-settings", "/admin/studio/site-content",
}
