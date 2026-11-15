package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestTenantFoundationMigratesExistingUsersToPlatform(t *testing.T) {
	_, db := newStudioTestService(t)
	var platform model.Tenant
	if err := db.First(&platform, "id = ?", model.PlatformTenantID).Error; err != nil || !platform.IsPlatform {
		t.Fatalf("platform tenant must exist after migration: %+v %v", platform, err)
	}
	user := model.User{ID: "u1", Username: "u1", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	var stored model.User
	db.First(&stored, "id = ?", "u1")
	if stored.TenantID != model.PlatformTenantID {
		t.Fatalf("a user created without a tenant belongs to the platform, got %q", stored.TenantID)
	}
}

func TestResolveTenantByHost(t *testing.T) {
	svc, db := newStudioTestService(t)
	db.Create(&model.Tenant{ID: "agency-a", Slug: "agency-a", Name: "Agency A", Status: model.TenantStatusActive})
	db.Create(&model.TenantDomain{ID: "d1", TenantID: "agency-a", Host: "studio.agency-a.com", IsPrimary: true})

	for host, want := range map[string]string{
		"studio.agency-a.com":     "agency-a",
		"Studio.Agency-A.com:443": "agency-a",
		"studio.agency-a.com.":    "agency-a",
		"omnimuse.io":             model.PlatformTenantID,
		"159.223.73.125:3000":     model.PlatformTenantID,
		"localhost:3100":          model.PlatformTenantID,
		"unknown.example.com":     model.PlatformTenantID,
	} {
		tenant, err := svc.ResolveTenant(host)
		if err != nil {
			t.Fatal(err)
		}
		if tenant.ID != want {
			t.Fatalf("%s resolved to %q, want %q", host, tenant.ID, want)
		}
	}
}

func TestUserBelongsToTenant(t *testing.T) {
	platform := model.Tenant{ID: model.PlatformTenantID, IsPlatform: true}
	agency := model.Tenant{ID: "agency-a"}
	legacy := &model.User{ID: "old"}
	if !UserBelongsToTenant(legacy, platform) || UserBelongsToTenant(legacy, agency) {
		t.Fatal("users without a tenant are platform users only")
	}
	member := &model.User{ID: "m", TenantID: "agency-a"}
	if !UserBelongsToTenant(member, agency) || UserBelongsToTenant(member, platform) {
		t.Fatal("an agency user is only signed in on that agency's site")
	}
}
