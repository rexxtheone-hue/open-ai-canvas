package database

import (
	"path/filepath"
	"testing"

	"yingce/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTenantScopedTablesMigrationBackfillsPlatformTenant(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "migration.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	// 模拟 v80 之前的结构：公告没有 tenant_id，帮助中心内容只按 key 做主键。
	for _, statement := range []string{
		"DROP TABLE announcements",
		"CREATE TABLE announcements (id varchar(36) PRIMARY KEY, title varchar(120), content text, image_resource_id varchar(36), level varchar(24), pinned numeric, status varchar(24), created_by varchar(36), published_at datetime, closed_at datetime, created_at datetime, updated_at datetime)",
		"INSERT INTO announcements (id, title, status) VALUES ('old', '旧公告', 'active')",
		"DROP TABLE studio_site_contents",
		"CREATE TABLE studio_site_contents (key varchar(32) PRIMARY KEY, content text, updated_at datetime)",
		"INSERT INTO studio_site_contents (key, content) VALUES ('terms', '旧条款')",
		"DELETE FROM schema_migrations WHERE version = 80",
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(statement, err)
		}
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	var announcement model.Announcement
	if err := db.First(&announcement, "id = ?", "old").Error; err != nil || announcement.TenantID != model.PlatformTenantID {
		t.Fatalf("existing announcements belong to the platform: %+v %v", announcement, err)
	}
	if !db.Migrator().HasIndex(&model.Announcement{}, "TenantID") {
		t.Fatal("tenant_id must be indexed")
	}
	var content model.StudioSiteContent
	if err := db.First(&content, "key = ?", "terms").Error; err != nil || content.TenantID != model.PlatformTenantID || content.Content != "旧条款" {
		t.Fatalf("existing site content belongs to the platform: %+v %v", content, err)
	}
	// 新主键允许每个租户各存一份。
	if err := db.Create(&model.StudioSiteContent{TenantID: "agency-a", Key: "terms", Content: "代理商条款"}).Error; err != nil {
		t.Fatalf("another tenant can store its own terms: %v", err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal("migration is not repeatable", err)
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("schema status: %#v %v", status, err)
	}
}
