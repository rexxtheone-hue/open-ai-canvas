package database

import (
	"sort"
	"sync"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/tenantrls"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestTenantRLSTablesMatchTenantScopedModels(t *testing.T) {
	namer := schema.NamingStrategy{}
	want := []string{"users", "studio_site_contents"}
	for _, entity := range tenantScopedModels() {
		parsed, err := schema.Parse(entity, &sync.Map{}, namer)
		if err != nil {
			t.Fatal(err)
		}
		want = append(want, parsed.Table)
	}
	got := append([]string(nil), tenantrls.Tables()...)
	sort.Strings(want)
	sort.Strings(got)
	if len(got) != len(want) {
		t.Fatalf("RLS tables = %v, want %v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("RLS tables = %v, want %v", got, want)
		}
	}
}

func TestTenantRLSMigrationIsNoOpOnSQLite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("status = %+v, %v", status, err)
	}
	if err := migrateTenantRLSPolicies(db); err != nil {
		t.Fatal(err)
	}
	var user model.User
	if err := db.Create(&model.User{ID: "u1", Username: "u1"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&user, "id = ?", "u1").Error; err != nil {
		t.Fatal(err)
	}
}
