package database

import (
	"fmt"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// tenantScopedModels 是需要跨用户查询（后台列表、公开内容、报表）的表；只属于单个用户的数据靠 user_id 隔离，不在这里。
func tenantScopedModels() []any {
	return []any{
		&model.TopupProduct{},
		&model.PaymentOrder{},
		&model.RedeemBatch{},
		&model.RedeemCode{},
		&model.Announcement{},
		&model.BannerAnnouncement{},
		&model.StudioPost{},
		&model.StudioFeedback{},
		&model.PartnerApplication{},
		&model.AffiliateAccount{},
		&model.AffiliateCommission{},
		&model.AffiliatePayout{},
		&model.LoginLog{},
		&model.AdminAuditEvent{},
		&model.ApiCallLog{},
		&model.Task{},
		&model.BillingOrder{},
	}
}

// migrateTenantScopedTables 给跨用户的表加上 tenant_id，现有数据全部归平台租户；只新增栏位，旧版程序照常可用。
func migrateTenantScopedTables(tx *gorm.DB) error {
	for _, entity := range tenantScopedModels() {
		if !tx.Migrator().HasTable(entity) {
			continue
		}
		if !tx.Migrator().HasColumn(entity, "TenantID") {
			if err := tx.Migrator().AddColumn(entity, "TenantID"); err != nil {
				return fmt.Errorf("增加租户栏位：%w", err)
			}
		}
		if err := tx.Model(entity).Unscoped().Where("tenant_id IS NULL OR tenant_id = ''").UpdateColumn("tenant_id", model.PlatformTenantID).Error; err != nil {
			return fmt.Errorf("现有数据归入平台租户：%w", err)
		}
		if !tx.Migrator().HasIndex(entity, "TenantID") {
			if err := tx.Migrator().CreateIndex(entity, "TenantID"); err != nil {
				return fmt.Errorf("租户索引：%w", err)
			}
		}
	}
	return migrateStudioSiteContentTenant(tx)
}

// migrateStudioSiteContentTenant 把帮助中心内容的主键从 key 改成（tenant_id, key）。
func migrateStudioSiteContentTenant(tx *gorm.DB) error {
	entity := &model.StudioSiteContent{}
	if !tx.Migrator().HasTable(entity) {
		return tx.AutoMigrate(entity)
	}
	if tx.Migrator().HasColumn(entity, "TenantID") {
		return nil
	}
	if tx.Dialector.Name() == "postgres" {
		for _, statement := range []string{
			"ALTER TABLE studio_site_contents ADD COLUMN tenant_id varchar(36) NOT NULL DEFAULT 'omnimuse'",
			"ALTER TABLE studio_site_contents DROP CONSTRAINT IF EXISTS studio_site_contents_pkey",
			`ALTER TABLE studio_site_contents ADD PRIMARY KEY (tenant_id, "key")`,
		} {
			if err := tx.Exec(statement).Error; err != nil {
				return fmt.Errorf("帮助中心内容改为按租户保存：%w", err)
			}
		}
		return nil
	}
	// SQLite 不能修改主键，只能重建表再搬数据。
	if err := tx.Migrator().RenameTable("studio_site_contents", "studio_site_contents_pre_v80"); err != nil {
		return err
	}
	if err := tx.Migrator().CreateTable(entity); err != nil {
		return err
	}
	if err := tx.Exec("INSERT INTO studio_site_contents (tenant_id, key, content, updated_at) SELECT ?, key, content, updated_at FROM studio_site_contents_pre_v80", model.PlatformTenantID).Error; err != nil {
		return err
	}
	return tx.Migrator().DropTable("studio_site_contents_pre_v80")
}
