package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// TenantBySlug 按短名读取租户；不存在时返回 nil, nil。
func (r *Repository) TenantBySlug(slug string) (*model.Tenant, error) {
	var tenant model.Tenant
	if err := r.db.Where("lower(slug) = lower(?)", slug).First(&tenant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &tenant, nil
}

// CreateAgencyTenant 在一个事务里建代理商租户和它的第一个管理员。
func (r *Repository) CreateAgencyTenant(tenant *model.Tenant, admin *model.User) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(tenant).Error; err != nil {
			return err
		}
		if err := tx.Create(admin).Error; err != nil {
			return err
		}
		return tx.Create(&model.CreditAccount{UserID: admin.ID}).Error
	})
}

// UpdateTenantFields 只更新名称和状态；平台租户不在这里改。
func (r *Repository) UpdateTenantFields(id string, name *string, status *model.TenantStatus, now time.Time) error {
	updates := map[string]any{"updated_at": now}
	if name != nil {
		updates["name"] = *name
	}
	if status != nil {
		updates["status"] = *status
	}
	result := r.db.Model(&model.Tenant{}).Where("id = ? AND is_platform = ?", id, false).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// TenantUsersByRole 返回租户内某个角色的账号，按创建时间排序。
func (r *Repository) TenantUsersByRole(tenantID string, role model.UserRole) ([]model.User, error) {
	var users []model.User
	err := scopeTenant(r.db, tenantID).Where("role = ?", role).Order("created_at").Find(&users).Error
	return users, err
}

// TenantUserRoleCounts 返回租户内各角色的账号数。
func (r *Repository) TenantUserRoleCounts(tenantID string) (map[model.UserRole]int64, error) {
	var rows []struct {
		Role  model.UserRole
		Count int64
	}
	err := scopeTenant(r.db.Model(&model.User{}), tenantID).Select("role, count(*) as count").Group("role").Scan(&rows).Error
	counts := make(map[model.UserRole]int64, len(rows))
	for _, row := range rows {
		counts[row.Role] = row.Count
	}
	return counts, err
}

type TenantCustomerExportRow struct {
	Username              string
	Email                 string
	Phone                 string
	CreatedAt             time.Time
	AvailableMicrocredits int64
}

// TenantCustomerExportRows 返回租户内全部普通用户及可用积分，供代理商导出客户名单。
func (r *Repository) TenantCustomerExportRows(tenantID string, limit int) ([]TenantCustomerExportRow, error) {
	var rows []TenantCustomerExportRow
	err := scopeTenant(r.db.Table("users"), tenantID, "users.tenant_id").
		Select("users.username, users.email, users.phone, users.created_at, coalesce(credit_accounts.available_microcredits, 0) as available_microcredits").
		Joins("left join credit_accounts on credit_accounts.user_id = users.id").
		Where("users.role = ?", model.UserRoleUser).
		Order("users.created_at").Limit(limit).Scan(&rows).Error
	return rows, err
}
