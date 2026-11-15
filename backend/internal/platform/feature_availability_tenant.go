package platform

import (
	"yingce/backend/internal/model"
	"yingce/backend/internal/tenantsetting"
)

// readFeatureAvailabilityForTenant：代理商只能关闭平台已开放的功能，合并结果 = 平台 AND 代理商。
func (s *Service) readFeatureAvailabilityForTenant(tenantID string) (*model.SystemSetting, FeatureAvailability, *model.TenantSetting, error) {
	setting, value, err := s.readFeatureAvailability()
	if err != nil || tenantID == "" || tenantID == model.PlatformTenantID {
		return setting, value, nil, err
	}
	row, err := s.repo.OverlayTenantSetting(tenantID, tenantsetting.KeyFeatureAvailability, &value)
	return setting, value, row, err
}

func (s *Service) FeatureAvailabilityForTenant(tenantID string) (*PublicFeatureAvailability, error) {
	setting, value, row, err := s.readFeatureAvailabilityForTenant(tenantID)
	if err != nil {
		return nil, err
	}
	result := publicFeatureAvailability(setting, value)
	if row != nil {
		result.Configured = true
		result.UpdatedBy = row.UpdatedBy
		result.UpdatedAt = row.UpdatedAt
	}
	return result, nil
}

func (s *Service) FeatureEnabledForTenant(tenantID, feature string) (bool, error) {
	_, value, _, err := s.readFeatureAvailabilityForTenant(tenantID)
	if err != nil {
		return false, err
	}
	return featureFlag(value, feature)
}

func (s *Service) RequireFeatureForTenant(tenantID, feature string) error {
	enabled, err := s.FeatureEnabledForTenant(tenantID, feature)
	if err != nil {
		return err
	}
	if enabled {
		return nil
	}
	return featureDisabledError(feature)
}

// UpdateTenantFeatureAvailability 只记下代理商关闭的开关；想打开平台已关闭的功能会被忽略。权限由调用方校验。
func (s *Service) UpdateTenantFeatureAvailability(tenantID, actorID string, value FeatureAvailability) (*PublicFeatureAvailability, error) {
	_, platformValue, err := s.readFeatureAvailability()
	if err != nil {
		return nil, err
	}
	encoded, err := tenantsetting.FilterRestrict(platformValue, value)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.SaveTenantSetting(tenantID, tenantsetting.KeyFeatureAvailability, encoded, actorID); err != nil {
		return nil, err
	}
	return s.FeatureAvailabilityForTenant(tenantID)
}
