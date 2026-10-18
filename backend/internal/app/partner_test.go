package app

import (
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newPartnerTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.SystemSetting{}, &model.AdminAuditEvent{}, &model.StudioProfile{}, &model.PartnerApplication{},
		&model.AffiliateAccount{}, &model.AffiliateReferral{}, &model.AffiliateCommission{}, &model.AffiliatePayout{},
		&model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	return &Service{repo: repository.New(db)}, db
}

func TestStaffRolesOnlyReachWhitelistedAdminRoutes(t *testing.T) {
	cases := []struct {
		role   model.UserRole
		method string
		route  string
		want   bool
	}{
		{model.UserRoleOperator, "GET", "/api/admin/announcements", true},
		{model.UserRoleOperator, "PATCH", "/api/admin/partner-applications/:id", true},
		{model.UserRoleOperator, "GET", "/api/admin/users", true},
		{model.UserRoleOperator, "PATCH", "/api/admin/users/:id", false},
		{model.UserRoleOperator, "GET", "/api/admin/channels", false},
		{model.UserRoleOperator, "PUT", "/api/admin/studio/plans/:id", false},
		{model.UserRoleSupport, "POST", "/api/admin/users/:id/credits/adjust", true},
		{model.UserRoleSupport, "POST", "/api/admin/billing-orders/:id/resolve", true},
		{model.UserRoleSupport, "GET", "/api/admin/analytics/overview", false},
		{model.UserRoleSupport, "PATCH", "/api/admin/settings/billing-currency", false},
		{model.UserRoleFinance, "GET", "/api/admin/analytics/overview", true},
		{model.UserRoleFinance, "PATCH", "/api/admin/affiliate-payouts/:id", true},
		{model.UserRoleFinance, "GET", "/api/admin/settings/billing-currency", true},
		{model.UserRoleFinance, "PATCH", "/api/admin/settings/billing-currency", false},
		{model.UserRoleFinance, "GET", "/api/admin/channels/:id/models", false},
		{model.UserRoleUser, "GET", "/api/admin/users", false},
	}
	for _, tc := range cases {
		if got := StaffCanAccess(tc.role, tc.method, tc.route); got != tc.want {
			t.Errorf("%s %s %s = %v, want %v", tc.role, tc.method, tc.route, got, tc.want)
		}
	}
	operator := &model.User{ID: "op", Role: model.UserRoleOperator}
	if elevated := ElevateStaffForRoute(operator, "GET", "/api/admin/announcements"); elevated.Role != model.UserRoleAdmin || elevated.StaffRole != model.UserRoleOperator || operator.Role != model.UserRoleOperator {
		t.Fatalf("elevated = %#v original = %#v", elevated, operator)
	}
	if same := ElevateStaffForRoute(operator, "GET", "/api/admin/channels"); same.Role != model.UserRoleOperator {
		t.Fatalf("operator reached channels: %#v", same)
	}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	if same := ElevateStaffForRoute(admin, "GET", "/api/admin/channels"); same != admin {
		t.Fatal("super admin must pass through unchanged")
	}
}

func TestStaffCannotManageAccountsEvenWhenElevated(t *testing.T) {
	svc, db := newPartnerTestService(t)
	target := model.User{ID: "u1", Username: "member", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&target).Error; err != nil {
		t.Fatal(err)
	}
	elevated := &model.User{ID: "op", Role: model.UserRoleAdmin, StaffRole: model.UserRoleOperator}
	if _, err := svc.UpdateUser(elevated, "u1", UpdateUserRequest{Role: model.UserRoleAdmin}); err == nil || !strings.Contains(err.Error(), "超级管理员") {
		t.Fatalf("staff changed a role: %v", err)
	}
	if err := svc.DeleteUser(elevated, "u1"); err == nil {
		t.Fatal("staff deleted a user")
	}
	if _, err := svc.CreateAdminUser(elevated, CreateAdminUserRequest{Username: "x", Password: "Password123!", Role: model.UserRoleAdmin, Status: model.UserStatusActive}); err == nil {
		t.Fatal("staff created an admin")
	}
	if !validUserRole(model.UserRoleFinance) || validUserRole("owner") {
		t.Fatal("role validation")
	}
}

func TestPartnerApplicationsAndAffiliateCommissionLifecycle(t *testing.T) {
	svc, db := newPartnerTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	affiliateUser := model.User{ID: "aff", Username: "promoter", DisplayName: "推广达人", Role: model.UserRoleUser, Status: model.UserStatusActive, CreatedAt: time.Now().Add(-48 * time.Hour)}
	buyer := model.User{ID: "buyer", Username: "buyer", DisplayName: "小明同学", Role: model.UserRoleUser, Status: model.UserStatusActive, CreatedAt: time.Now()}
	oldUser := model.User{ID: "old", Username: "old", Role: model.UserRoleUser, Status: model.UserStatusActive, CreatedAt: time.Now().Add(-2 * time.Hour)}
	for _, user := range []*model.User{&affiliateUser, &buyer, &oldUser, admin} {
		if err := db.Create(user).Error; err != nil {
			t.Fatal(err)
		}
	}

	if _, err := svc.SubmitPartnerApplication(&affiliateUser, PartnerApplicationRequest{Kind: "creator", Message: "太短"}); err == nil {
		t.Fatal("accepted a too-short application")
	}
	creatorApp, err := svc.SubmitPartnerApplication(&affiliateUser, PartnerApplicationRequest{Kind: "creator", Message: "我做 AI 短视频两年，作品见主页。"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SubmitPartnerApplication(&affiliateUser, PartnerApplicationRequest{Kind: "creator", Message: "重复提交一份新的申请说明。"}); err == nil {
		t.Fatal("duplicate pending application")
	}
	if _, err := svc.ReviewPartnerApplication(admin, creatorApp.ID, PartnerReviewRequest{Action: "approve"}); err != nil {
		t.Fatal(err)
	}
	profile, err := svc.repo.StudioProfile("aff")
	if err != nil || profile == nil || profile.CreatorVerifiedAt == nil {
		t.Fatalf("profile = %#v, err = %v", profile, err)
	}

	affApp, err := svc.SubmitPartnerApplication(&affiliateUser, PartnerApplicationRequest{Kind: "affiliate", Message: "我有 2 万粉丝的 TikTok 账号，想推广。", Contact: "wa 0123"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ReviewPartnerApplication(admin, affApp.ID, PartnerReviewRequest{Action: "approve", RateBP: 3000}); err != nil {
		t.Fatal(err)
	}
	account, _ := svc.repo.AffiliateAccount("aff")
	if account == nil || len(account.Code) != 8 || account.CommissionRateBP != 3000 {
		t.Fatalf("account = %#v", account)
	}

	svc.AttachReferral("aff", account.Code)
	svc.AttachReferral("old", account.Code)
	svc.AttachReferral("buyer", strings.ToLower(account.Code))
	if ref, _ := svc.repo.AffiliateReferral("aff"); ref != nil {
		t.Fatal("self referral")
	}
	if ref, _ := svc.repo.AffiliateReferral("old"); ref != nil {
		t.Fatal("existing user re-attributed")
	}
	if ref, _ := svc.repo.AffiliateReferral("buyer"); ref == nil || ref.AffiliateUserID != "aff" {
		t.Fatalf("buyer referral = %#v", ref)
	}

	paidAt := time.Now()
	order := &model.PaymentOrder{ID: "order-1", UserID: "buyer", AmountFen: 10_000, Currency: "MYR", Status: model.PaymentOrderCredited, ProviderPaidAt: &paidAt}
	svc.recordAffiliateCommission(order)
	svc.recordAffiliateCommission(order)
	svc.recordAffiliateCommission(&model.PaymentOrder{ID: "order-old", UserID: "old", AmountFen: 10_000, Currency: "MYR", Status: model.PaymentOrderCredited})
	var commissions []model.AffiliateCommission
	db.Find(&commissions)
	if len(commissions) != 1 || commissions[0].AmountFen != 3_000 || commissions[0].RateBP != 3000 {
		t.Fatalf("commissions = %#v", commissions)
	}

	if _, err := svc.RequestAffiliatePayout(&affiliateUser, AffiliatePayoutRequest{Kind: "credits", Currency: "MYR"}); err == nil || !strings.Contains(err.Error(), "冷却期") {
		t.Fatalf("payout during hold: %v", err)
	}
	db.Model(&model.AffiliateCommission{}).Where("id = ?", commissions[0].ID).Update("available_at", time.Now().UTC().Add(-time.Hour))

	if _, err := svc.RequestAffiliatePayout(&affiliateUser, AffiliatePayoutRequest{Kind: "cash", Currency: "MYR", Details: "Maybank 张三 1234567890"}); err == nil || !strings.Contains(err.Error(), "RM50") {
		t.Fatalf("cash below minimum: %v", err)
	}
	payout, err := svc.RequestAffiliatePayout(&affiliateUser, AffiliatePayoutRequest{Kind: "credits", Currency: "MYR"})
	if err != nil {
		t.Fatal(err)
	}
	// RM30 ÷ RM0.01 × 1.1 = 3300 积分。
	if payout.Status != model.AffiliatePayoutCompleted || payout.AmountFen != 3_000 || payout.CreditsMicrocredits != 3_300_000_000 {
		t.Fatalf("payout = %#v", payout)
	}
	credit, _ := svc.repo.CreditAccount("aff")
	if credit.AvailableMicrocredits != 3_300_000_000 {
		t.Fatalf("credits = %d", credit.AvailableMicrocredits)
	}
	if _, err := svc.RequestAffiliatePayout(&affiliateUser, AffiliatePayoutRequest{Kind: "credits", Currency: "MYR"}); err == nil {
		t.Fatal("commission paid twice")
	}

	// 现金提现：驳回后佣金回到可提取余额。
	svc.recordAffiliateCommission(&model.PaymentOrder{ID: "order-2", UserID: "buyer", AmountFen: 50_000, Currency: "MYR", Status: model.PaymentOrderCredited, ProviderPaidAt: &paidAt})
	db.Model(&model.AffiliateCommission{}).Where("payment_order_id = ?", "order-2").Update("available_at", time.Now().UTC().Add(-time.Hour))
	cash, err := svc.RequestAffiliatePayout(&affiliateUser, AffiliatePayoutRequest{Kind: "cash", Currency: "MYR", Details: "Maybank 张三 1234567890"})
	if err != nil || cash.Status != model.AffiliatePayoutRequested || cash.AmountFen != 15_000 {
		t.Fatalf("cash = %#v, err = %v", cash, err)
	}
	finance := &model.User{ID: "fin", Role: model.UserRoleAdmin, StaffRole: model.UserRoleFinance}
	if _, err := svc.ReviewAffiliatePayout(finance, cash.ID, AffiliatePayoutReview{Action: "reject"}); err == nil {
		t.Fatal("reject without reason")
	}
	if _, err := svc.ReviewAffiliatePayout(finance, cash.ID, AffiliatePayoutReview{Action: "reject", Note: "账号信息不完整"}); err != nil {
		t.Fatal(err)
	}
	status, err := svc.MyPartnerStatus(&affiliateUser)
	if err != nil || status.Affiliate == nil || len(status.Affiliate.Balances) != 1 || status.Affiliate.Balances[0].Available != 15_000 || status.Affiliate.Referrals != 1 {
		t.Fatalf("status = %#v, err = %v", status.Affiliate, err)
	}
	if status.Affiliate.Commissions[0].ReferredName != "小**学" {
		t.Fatalf("referred name not masked: %q", status.Affiliate.Commissions[0].ReferredName)
	}
	again, err := svc.RequestAffiliatePayout(&affiliateUser, AffiliatePayoutRequest{Kind: "cash", Currency: "MYR", Details: "Maybank 张三 1234567890"})
	if err != nil {
		t.Fatal(err)
	}
	if paid, err := svc.ReviewAffiliatePayout(finance, again.ID, AffiliatePayoutReview{Action: "paid", Note: "已转账"}); err != nil || paid.Status != model.AffiliatePayoutPaid {
		t.Fatalf("paid = %#v, err = %v", paid, err)
	}

	// 撤销推广资格后不再产生佣金。
	if _, err := svc.ReviewPartnerApplication(admin, affApp.ID, PartnerReviewRequest{Action: "revoke", Note: "违规推广"}); err != nil {
		t.Fatal(err)
	}
	svc.recordAffiliateCommission(&model.PaymentOrder{ID: "order-3", UserID: "buyer", AmountFen: 10_000, Currency: "MYR", Status: model.PaymentOrderCredited, ProviderPaidAt: &paidAt})
	var count int64
	db.Model(&model.AffiliateCommission{}).Count(&count)
	if count != 2 {
		t.Fatalf("commission after revoke, count = %d", count)
	}
}
