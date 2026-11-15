package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

func TestCreateAgencyTenantSendsInviteWithoutUsablePassword(t *testing.T) {
	f := newTenantBillingFixture(t, 25)
	var sent []string
	f.svc.tenantNoticeEmailHook = func(recipient string, content auth.EmailContent) error {
		sent = append(sent, recipient+"|"+content.Subject+"|"+strings.Join(content.Body, " "))
		return nil
	}
	actor := &model.User{ID: "root", TenantID: model.PlatformTenantID, Role: model.UserRoleAdmin}
	result, err := f.svc.CreateAgencyTenant(context.Background(), actor, CreateAgencyTenantRequest{Name: "Coach Lim", Slug: "coach-lim", AdminEmail: "lim@coach.my", AdminUsername: "lim", SendInvite: true})
	if err != nil {
		t.Fatal(err)
	}
	if !result.InviteSent || len(sent) != 1 || !strings.HasPrefix(sent[0], "lim@coach.my|") || !strings.Contains(sent[0], "Forgot password") {
		t.Fatalf("invite email not sent as expected: %+v %v", result, sent)
	}
	if strings.Contains(sent[0], "OmniMuse") {
		t.Fatalf("agency invite must not carry the platform brand: %s", sent[0])
	}
	var admin model.User
	if err := f.db.First(&admin, "tenant_id = ? AND username = ?", result.Tenant.Tenant.ID, "lim").Error; err != nil {
		t.Fatal(err)
	}
	if admin.PasswordHash == "" || admin.Role != model.UserRoleTenantAdmin || admin.EmailVerifiedAt == nil {
		t.Fatalf("invited admin must exist with a random password and a verified email: %+v", admin)
	}

	// 员工角色（StaffRole）不能开设代理商。
	staff := &model.User{ID: "ops", TenantID: model.PlatformTenantID, Role: model.UserRoleAdmin, StaffRole: model.UserRoleOperator}
	if _, err := f.svc.CreateAgencyTenant(context.Background(), staff, CreateAgencyTenantRequest{Name: "X", Slug: "x-agency", AdminEmail: "x@x.my", AdminUsername: "xadmin", AdminPassword: "Secret#12345"}); err == nil {
		t.Fatal("platform staff must not provision agencies")
	}
}

func TestTenantModelPriceCatalogShowsPoolAndRetailButNoCost(t *testing.T) {
	f := newTenantBillingFixture(t, 25)
	tenant := model.Tenant{ID: testAgencyID}
	admin := &model.User{ID: "agency-admin", TenantID: testAgencyID, Role: model.UserRoleTenantAdmin}
	multiplier := 1.5
	if _, err := f.svc.SaveTenantRetailPrice(admin, tenant, TenantRetailPriceRequest{ChannelModelID: "cm", Multiplier: &multiplier}); err != nil {
		t.Fatal(err)
	}
	catalog, err := f.svc.TenantModelPriceCatalog(admin, tenant)
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog.Models) != 1 || len(catalog.Models[0].Tiers) != 1 {
		t.Fatalf("unexpected catalog: %+v", catalog)
	}
	item, tier := catalog.Models[0], catalog.Models[0].Tiers[0]
	// 25% 折扣：池扣减 = 1 × 75 / 85，向上取整到微积分。
	if item.AgencyDiscountPercent != 25 || tier.PlatformUnitMicrocredits != 1_000_000 || tier.PoolUnitMicrocredits != 882_353 || tier.RetailUnitMicrocredits != 1_500_000 || item.RuleID == "" {
		t.Fatalf("unexpected prices: %+v %+v", item, tier)
	}
	encoded, _ := json.Marshal(catalog)
	if strings.Contains(strings.ToLower(string(encoded)), "cost") {
		t.Fatalf("catalog must not expose platform cost: %s", encoded)
	}
	if _, err := f.svc.TenantModelPriceCatalog(&model.User{ID: "u", TenantID: testAgencyID, Role: model.UserRoleUser}, tenant); err == nil {
		t.Fatal("customers must not read the price catalog")
	}
}
