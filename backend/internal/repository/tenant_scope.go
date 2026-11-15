package repository

import (
	"strings"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// TenantIDOrPlatform 把空租户当作平台租户，旧数据和后台任务都按平台处理。
func TenantIDOrPlatform(tenantID string) string {
	if tenantID = strings.TrimSpace(tenantID); tenantID == "" {
		return model.PlatformTenantID
	}
	return tenantID
}

// scopeTenant 把查询限制在一个租户内；column 为空时用 tenant_id，联表查询时传带表别名的列名。
func scopeTenant(db *gorm.DB, tenantID string, column ...string) *gorm.DB {
	name := "tenant_id"
	if len(column) > 0 && column[0] != "" {
		name = column[0]
	}
	return db.Where(name+" = ?", TenantIDOrPlatform(tenantID))
}

// TenantUsers 是一个租户的全部用户，供后台统计使用。
func (r *Repository) TenantUsers(tenantID string) ([]model.User, error) {
	var users []model.User
	err := scopeTenant(r.db, tenantID).Order("created_at desc").Find(&users).Error
	return users, err
}

// TenantAPICallLog 供后台按 ID 查看调用记录，只能看到本租户的记录。
func (r *Repository) TenantAPICallLog(tenantID, id string) (*model.ApiCallLog, error) {
	var log model.ApiCallLog
	if err := scopeTenant(r.db, tenantID).First(&log, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &log, nil
}
