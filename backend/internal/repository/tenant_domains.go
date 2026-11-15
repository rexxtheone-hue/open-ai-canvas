package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// TenantDomains 列出租户的全部网址，主网址排在最前。
func (r *Repository) TenantDomains(tenantID string) ([]model.TenantDomain, error) {
	var domains []model.TenantDomain
	err := r.db.Where("tenant_id = ?", tenantID).Order("is_primary DESC").Order("created_at ASC").Find(&domains).Error
	return domains, err
}

// TenantDomain 按 ID 读取租户下的一个网址；不存在时返回 nil, nil。
func (r *Repository) TenantDomain(tenantID, id string) (*model.TenantDomain, error) {
	var domain model.TenantDomain
	if err := r.db.Where("tenant_id = ? AND id = ?", tenantID, id).First(&domain).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &domain, nil
}

// TenantDomainByHost 按网址读取；不存在时返回 nil, nil。
func (r *Repository) TenantDomainByHost(host string) (*model.TenantDomain, error) {
	var domain model.TenantDomain
	if err := r.db.Where("host = ?", host).First(&domain).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &domain, nil
}

// TenantPrimaryDomain 返回租户的主网址；没有主网址时退回最早登记的那个，都没有时返回 nil, nil。
func (r *Repository) TenantPrimaryDomain(tenantID string) (*model.TenantDomain, error) {
	domains, err := r.TenantDomains(tenantID)
	if err != nil || len(domains) == 0 {
		return nil, err
	}
	return &domains[0], nil
}

func (r *Repository) CreateTenantDomain(domain *model.TenantDomain) error {
	return r.db.Create(domain).Error
}

func (r *Repository) UpdateTenantDomainStatus(id, sslStatus, cfHostnameID string) error {
	return r.db.Model(&model.TenantDomain{}).Where("id = ?", id).Updates(map[string]any{
		"ssl_status": sslStatus, "cf_hostname_id": cfHostnameID, "updated_at": time.Now(),
	}).Error
}

// SetTenantPrimaryDomain 在一个事务里把指定网址设为主网址、其余取消。
func (r *Repository) SetTenantPrimaryDomain(tenantID, id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		if err := tx.Model(&model.TenantDomain{}).Where("tenant_id = ? AND id <> ?", tenantID, id).Updates(map[string]any{"is_primary": false, "updated_at": now}).Error; err != nil {
			return err
		}
		result := tx.Model(&model.TenantDomain{}).Where("tenant_id = ? AND id = ?", tenantID, id).Updates(map[string]any{"is_primary": true, "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func (r *Repository) DeleteTenantDomain(tenantID, id string) error {
	return r.db.Where("tenant_id = ? AND id = ?", tenantID, id).Delete(&model.TenantDomain{}).Error
}
