// 代理商设置层：注册、邮件发件人与 Google 登录。权限由调用方（app 层）先校验，这里只按租户 ID 读写。

package auth

import (
	"encoding/json"
	"strings"
	"time"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
	"yingce/backend/internal/tenantsetting"
)

func isPlatformTenantID(tenantID string) bool {
	return tenantID == "" || tenantID == model.PlatformTenantID
}

func applyTenantMeta(updatedBy *string, updatedAt *time.Time, row *model.TenantSetting) {
	if row == nil {
		return
	}
	*updatedBy = row.UpdatedBy
	*updatedAt = row.UpdatedAt
}

// readRegistrationSettingForTenant 返回平台注册设置叠加代理商覆盖后的值。
func (s *Service) readRegistrationSettingForTenant(tenantID string) (*model.SystemSetting, registrationSettingValue, *model.TenantSetting, error) {
	setting, value, err := s.readRegistrationSetting()
	if err != nil || isPlatformTenantID(tenantID) {
		return setting, value, nil, err
	}
	row, err := s.repo.OverlayTenantSetting(tenantID, tenantsetting.KeyRegistration, &value)
	return setting, value, row, err
}

func (s *Service) RegistrationSettingForTenant(tenantID string) (*PublicRegistrationSetting, error) {
	setting, value, row, err := s.readRegistrationSettingForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	result := publicRegistrationSetting(setting, value)
	applyTenantMeta(&result.UpdatedBy, &result.UpdatedAt, row)
	return result, nil
}

func (s *Service) RegistrationEnabledForTenant(tenantID string) (bool, error) {
	_, value, _, err := s.readRegistrationSettingForTenant(tenantID)
	return value.Enabled, err
}

// RegistrationAgreementForTenant 同 RegistrationAgreement；标题未配置时用传入的品牌名兜底。
func (s *Service) RegistrationAgreementForTenant(tenantID, brandName string) (string, string) {
	_, value, row, err := s.readRegistrationSettingForTenant(tenantID)
	if err != nil {
		return "", ""
	}
	title := strings.Trim(strings.TrimSpace(value.AgreementTitle), "《》")
	if !isPlatformTenantID(tenantID) && (row == nil || !strings.Contains(row.ValueJSON, `"agreementTitle"`)) && s.mentionsPlatformBrand(title) {
		// 代理商没有自己设置时，平台填写的「OmniMuse服务协议」这类标题不能出现在代理商网站。
		title = ""
	}
	if title == "" {
		brand := strings.TrimSpace(brandName)
		if brand == "" {
			if isPlatformTenantID(tenantID) {
				brand = DefaultBrandName
			} else {
				return "服务协议", value.AgreementContent
			}
		}
		title = brand + "服务协议"
	}
	return title, value.AgreementContent
}

func (s *Service) UpdateTenantRegistrationSetting(tenantID, actorID string, req RegistrationSettingRequest) (*PublicRegistrationSetting, error) {
	_, current, _, err := s.readRegistrationSettingForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	next := registrationSettingValue{Enabled: req.Enabled, AgreementTitle: current.AgreementTitle, AgreementContent: current.AgreementContent}
	if req.AgreementTitle != nil {
		next.AgreementTitle = strings.TrimSpace(*req.AgreementTitle)
	}
	if req.AgreementContent != nil {
		next.AgreementContent = strings.TrimSpace(*req.AgreementContent)
	}
	encoded, err := tenantsetting.Filter(tenantsetting.KeyRegistration, next)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.SaveTenantSetting(tenantID, tenantsetting.KeyRegistration, encoded, actorID); err != nil {
		return nil, err
	}
	return s.RegistrationSettingForTenant(tenantID)
}

// readEmailSettingForTenant 返回平台邮件设置叠加代理商发件人与域名白名单后的值，供发信使用。
func (s *Service) readEmailSettingForTenant(tenantID string) (*model.SystemSetting, EmailSettingValue, *model.TenantSetting, error) {
	setting, value, err := s.readEmailSetting()
	if err != nil || isPlatformTenantID(tenantID) {
		return setting, value, nil, err
	}
	platformFromEmail := value.FromEmail
	row, err := s.repo.OverlayTenantSetting(tenantID, tenantsetting.KeyEmail, &value)
	if err != nil {
		return nil, EmailSettingValue{}, nil, err
	}
	value = normalizeEmailSetting(value)
	// 代理商没填发件邮箱时沿用平台的，否则发信会没有发件人。
	if value.FromEmail == "" {
		value.FromEmail = platformFromEmail
	}
	return setting, value, row, nil
}

// tenantPublicEmailSetting 是代理商管理员看到的邮件设置：SMTP 主机、账号、密码一律不返回。
func tenantPublicEmailSetting(value EmailSettingValue, brandName string, row *model.TenantSetting) *PublicEmailSetting {
	inherited := value.FromName == "" || value.FromName == DefaultBrandName || value.FromName == legacyBrandName
	value = resolveEmailSender(value, brandName)
	result := &PublicEmailSetting{
		Enabled: value.Enabled, FromEmail: value.FromEmail, FromName: value.FromName, FromNameInherited: inherited,
		RegistrationAllowedDomains: value.RegistrationAllowedDomains,
	}
	if row != nil {
		result.UpdatedBy = row.UpdatedBy
		result.CreatedAt = row.CreatedAt
		result.UpdatedAt = row.UpdatedAt
	}
	return result
}

func (s *Service) EmailSettingForTenant(tenantID, brandName string) (*PublicEmailSetting, error) {
	_, value, row, err := s.readEmailSettingForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return tenantPublicEmailSetting(value, brandName, row), nil
}

// UpdateTenantEmailSetting 只接受发件人名称、发件邮箱与注册域名白名单；SMTP 字段即使提交也被忽略。
func (s *Service) UpdateTenantEmailSetting(tenantID, actorID, brandName string, req EmailSettingRequest) (*PublicEmailSetting, error) {
	_, current, _, err := s.readEmailSettingForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	next := current
	next.FromName = strings.TrimSpace(req.FromName)
	next.FromEmail = NormalizeEmail(req.FromEmail)
	if req.RegistrationAllowedDomains != nil {
		next.RegistrationAllowedDomains = normalizeEmailDomains(req.RegistrationAllowedDomains)
	}
	if err := validateRegistrationEmailDomains(next.RegistrationAllowedDomains); err != nil {
		return nil, err
	}
	if next.FromEmail != "" && ValidateEmail(next.FromEmail) != nil {
		return nil, kernel.BadAuthRequest("发件邮箱格式不正确")
	}
	if strings.ContainsAny(next.FromName, "\r\n") {
		return nil, kernel.BadAuthRequest("发件人名称不能包含换行")
	}
	encoded, err := tenantsetting.Filter(tenantsetting.KeyEmail, next)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.SaveTenantSetting(tenantID, tenantsetting.KeyEmail, encoded, actorID); err != nil {
		return nil, err
	}
	return s.EmailSettingForTenant(tenantID, brandName)
}

// readGoogleSettingForTenant：代理商自带 Google OAuth 客户端，不继承平台的；没有配置时视为未启用。
func (s *Service) readGoogleSettingForTenant(tenantID string) (googleSettingValue, *model.TenantSetting, error) {
	if isPlatformTenantID(tenantID) {
		_, value, err := s.readGoogleSetting()
		return value, nil, err
	}
	var value googleSettingValue
	row, err := s.repo.OverlayTenantSetting(tenantID, tenantsetting.KeyGoogleOAuth, &value)
	if err != nil || row == nil {
		return googleSettingValue{}, nil, err
	}
	value.ClientSecret, err = s.host.DecryptSecret(value.ClientSecret)
	if err != nil {
		return googleSettingValue{}, nil, err
	}
	return value, row, nil
}

func (s *Service) GoogleEnabledForTenant(tenantID string) bool {
	value, _, err := s.readGoogleSettingForTenant(tenantID)
	return err == nil && value.Enabled
}

func (s *Service) GoogleSettingForTenant(tenantID string) (*PublicGoogleSetting, error) {
	value, row, err := s.readGoogleSettingForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	result := publicGoogleSetting(nil, value)
	applyTenantMeta(&result.UpdatedBy, &result.UpdatedAt, row)
	return result, nil
}

func (s *Service) UpdateTenantGoogleSetting(tenantID, actorID string, req GoogleSettingRequest) (*PublicGoogleSetting, error) {
	current, _, err := s.readGoogleSettingForTenant(tenantID)
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
	if _, err := s.repo.SaveTenantSetting(tenantID, tenantsetting.KeyGoogleOAuth, string(encoded), actorID); err != nil {
		return nil, err
	}
	return s.GoogleSettingForTenant(tenantID)
}

// flowTenantID 是这个认证服务绑定的租户；没有绑定时（后台任务）为空，表示平台。
func (s *Service) flowTenantID() string {
	if s == nil || s.repo == nil {
		return ""
	}
	return s.repo.TenantID()
}

// 注册、登录、验证码、找回密码等流程读取设置时用这三个，按请求所属的代理商合并设置。
func (s *Service) flowEmailSetting() (*model.SystemSetting, EmailSettingValue, error) {
	setting, value, _, err := s.readEmailSettingForTenant(s.flowTenantID())
	return setting, value, err
}

func (s *Service) flowGoogleSetting() (*model.SystemSetting, googleSettingValue, error) {
	value, _, err := s.readGoogleSettingForTenant(s.flowTenantID())
	return nil, value, err
}

func (s *Service) flowRegistrationEnabled() (bool, error) {
	return s.RegistrationEnabledForTenant(s.flowTenantID())
}

// mentionsPlatformBrand 判断文字里是否带有平台品牌名（默认品牌、旧品牌或平台外观里改过的品牌名）。
func (s *Service) mentionsPlatformBrand(text string) bool {
	if text == "" {
		return false
	}
	for _, brand := range []string{DefaultBrandName, legacyBrandName, strings.TrimSpace(s.host.BrandName())} {
		if brand != "" && strings.Contains(strings.ToLower(text), strings.ToLower(brand)) {
			return true
		}
	}
	return false
}
