package database

import (
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func userIndexNames(t *testing.T, db *gorm.DB) string {
	t.Helper()
	var names []string
	if err := db.Raw("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('users', 'user_identities') AND name NOT LIKE 'sqlite_%'").Scan(&names).Error; err != nil {
		t.Fatal(err)
	}
	sort.Strings(names)
	return strings.Join(names, ",")
}

func assertTenantScopedUserIndexes(t *testing.T, db *gorm.DB) {
	t.Helper()
	names := userIndexNames(t, db)
	for _, want := range []string{"idx_users_tenant_username", "idx_users_tenant_email_nonempty", "idx_users_tenant_phone_nonempty", "idx_user_identity_tenant_provider_subject"} {
		if !strings.Contains(names, want) {
			t.Fatalf("missing %s in %s", want, names)
		}
	}
	for _, legacy := range []string{"idx_users_username", "idx_users_email_nonempty", "idx_users_phone_nonempty", "idx_user_identity_provider_subject"} {
		if strings.Contains(","+names+",", ","+legacy+",") {
			t.Fatalf("legacy global index %s survived: %s", legacy, names)
		}
	}
}

func TestTenantScopedAccountIndexes(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "tenant-accounts.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	assertTenantScopedUserIndexes(t, db)

	insert := func(id, tenant, username, email, phone string) error {
		return db.Exec("INSERT INTO users (id, tenant_id, username, email, phone) VALUES (?, ?, ?, ?, ?)", id, tenant, username, email, phone).Error
	}
	if err := insert("p1", "omnimuse", "same", "Same@Example.com", "+60123"); err != nil {
		t.Fatal(err)
	}
	if err := insert("a1", "agency-a", "same", "same@example.com", "+60123"); err != nil {
		t.Fatalf("the same account details are allowed on another tenant: %v", err)
	}
	if err := insert("p2", "omnimuse", "same", "", ""); err == nil {
		t.Fatal("username stays unique inside a tenant")
	}
	if err := insert("p3", "omnimuse", "other", "SAME@example.com", ""); err == nil {
		t.Fatal("email stays unique inside a tenant")
	}
	if err := insert("p4", "omnimuse", "third", "", "+60123"); err == nil {
		t.Fatal("phone stays unique inside a tenant")
	}

	// 模拟已上线的旧库：恢复旧的全站唯一索引后重跑 v78。
	if err := db.Exec("DELETE FROM users WHERE id = 'a1'").Error; err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"DROP INDEX idx_users_tenant_username",
		"DROP INDEX idx_users_tenant_email_nonempty",
		"DROP INDEX idx_users_tenant_phone_nonempty",
		"DROP INDEX idx_user_identity_tenant_provider_subject",
		"CREATE UNIQUE INDEX idx_users_username ON users(username)",
		"CREATE UNIQUE INDEX idx_users_email_nonempty ON users(lower(email)) WHERE email <> ''",
		"CREATE UNIQUE INDEX idx_users_phone_nonempty ON users(phone) WHERE phone <> ''",
		"CREATE UNIQUE INDEX idx_user_identity_provider_subject ON user_identities(provider, subject)",
		"INSERT INTO user_identities (id, user_id, tenant_id, provider, subject) VALUES ('i1', 'p1', '', 'google', 'sub-1')",
		"DELETE FROM schema_migrations WHERE version = 78",
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(statement, err)
		}
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	assertTenantScopedUserIndexes(t, db)
	var identityTenant string
	if err := db.Raw("SELECT tenant_id FROM user_identities WHERE id = 'i1'").Scan(&identityTenant).Error; err != nil || identityTenant != "omnimuse" {
		t.Fatalf("identity tenant backfilled from its user: %q %v", identityTenant, err)
	}
	if err := insert("a1", "agency-a", "same", "same@example.com", "+60123"); err != nil {
		t.Fatalf("converted database accepts the same account on another tenant: %v", err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal("migration is not repeatable", err)
	}
}
