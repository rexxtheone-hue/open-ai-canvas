package repository

import (
	"errors"
	"sync"
	"time"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
	"yingce/backend/internal/tenantsetting"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const tenantSettingCacheTTL = 60 * time.Second

// 缓存按 gorm.Config 区分数据库：同一个库派生出的各个 Repository 副本共用一份缓存。
type tenantSettingCacheKey struct {
	config   *gorm.Config
	tenantID string
	key      string
}

type tenantSettingCacheEntry struct {
	setting *model.TenantSetting
	expires time.Time
}

var tenantSettingCache sync.Map

func (r *Repository) tenantSettingCacheKey(tenantID, key string) tenantSettingCacheKey {
	return tenantSettingCacheKey{config: r.db.Config, tenantID: tenantID, key: key}
}

// TenantSettingRow 返回代理商在某项设置上的覆盖；没有时返回 nil。
func (r *Repository) TenantSettingRow(tenantID, key string) (*model.TenantSetting, error) {
	if tenantID == "" || tenantID == model.PlatformTenantID {
		return nil, nil
	}
	cacheKey := r.tenantSettingCacheKey(tenantID, key)
	if cached, ok := tenantSettingCache.Load(cacheKey); ok {
		entry := cached.(tenantSettingCacheEntry)
		if time.Now().Before(entry.expires) {
			return copyTenantSetting(entry.setting), nil
		}
	}
	var rows []model.TenantSetting
	if err := r.db.Where("tenant_id = ? AND key = ?", tenantID, key).Limit(1).Find(&rows).Error; err != nil {
		return nil, err
	}
	var setting *model.TenantSetting
	if len(rows) > 0 {
		setting = &rows[0]
	}
	tenantSettingCache.Store(cacheKey, tenantSettingCacheEntry{setting: copyTenantSetting(setting), expires: time.Now().Add(tenantSettingCacheTTL)})
	return setting, nil
}

func copyTenantSetting(setting *model.TenantSetting) *model.TenantSetting {
	if setting == nil {
		return nil
	}
	copied := *setting
	return &copied
}

// SaveTenantSetting 按 (tenant_id, key) 写入或更新代理商覆盖，并让缓存失效。
func (r *Repository) SaveTenantSetting(tenantID, key, valueJSON, updatedBy string) (*model.TenantSetting, error) {
	if tenantID == "" || tenantID == model.PlatformTenantID {
		return nil, errors.New("平台设置不能写入代理商设置层")
	}
	now := time.Now().UTC()
	setting := model.TenantSetting{ID: kernel.NewID(), TenantID: tenantID, Key: key, ValueJSON: valueJSON, UpdatedBy: updatedBy, CreatedAt: now, UpdatedAt: now}
	err := r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value_json", "updated_by", "updated_at"}),
	}).Create(&setting).Error
	tenantSettingCache.Delete(r.tenantSettingCacheKey(tenantID, key))
	if err != nil {
		return nil, err
	}
	return r.TenantSettingRow(tenantID, key)
}

// DeleteTenantSetting 删除代理商覆盖，恢复跟随平台。
func (r *Repository) DeleteTenantSetting(tenantID, key string) error {
	err := r.db.Delete(&model.TenantSetting{}, "tenant_id = ? AND key = ?", tenantID, key).Error
	tenantSettingCache.Delete(r.tenantSettingCacheKey(tenantID, key))
	return err
}

// OverlayTenantSetting 把代理商覆盖合并进 value（指针）。平台租户或没有覆盖时 value 不变、返回 nil。
func (r *Repository) OverlayTenantSetting(tenantID, key string, value any) (*model.TenantSetting, error) {
	setting, err := r.TenantSettingRow(tenantID, key)
	if err != nil || setting == nil {
		return nil, err
	}
	if err := tenantsetting.Overlay(key, value, setting.ValueJSON); err != nil {
		return nil, err
	}
	return setting, nil
}
