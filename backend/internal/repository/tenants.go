package repository

import (
	"errors"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// TenantByHost 返回网址对应的租户；网址没有登记时返回 nil, nil。
func (r *Repository) TenantByHost(host string) (*model.Tenant, error) {
	var domain model.TenantDomain
	if err := r.db.Where("host = ?", host).First(&domain).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return r.Tenant(domain.TenantID)
}

// Tenant 按 ID 读取租户；不存在时返回 nil, nil。
func (r *Repository) Tenant(id string) (*model.Tenant, error) {
	var tenant model.Tenant
	if err := r.db.Where("id = ?", id).First(&tenant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &tenant, nil
}
