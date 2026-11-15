package model

import "time"

// TenantSetting 是代理商自己的设置层：读取时只把白名单字段盖在平台的 system_settings 上。
type TenantSetting struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	TenantID  string    `json:"tenantId" gorm:"size:36;not null;uniqueIndex:idx_tenant_settings_tenant_key,priority:1"`
	Key       string    `json:"key" gorm:"size:80;not null;uniqueIndex:idx_tenant_settings_tenant_key,priority:2"`
	ValueJSON string    `json:"valueJson" gorm:"type:text"`
	UpdatedBy string    `json:"updatedBy" gorm:"size:36"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
