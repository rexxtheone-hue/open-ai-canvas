package database

import (
	"fmt"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// migrateTenantSettings 建立代理商设置层表；只新增，不改平台的 system_settings。
func migrateTenantSettings(tx *gorm.DB) error {
	if err := tx.AutoMigrate(&model.TenantSetting{}); err != nil {
		return fmt.Errorf("创建租户设置表：%w", err)
	}
	return nil
}
