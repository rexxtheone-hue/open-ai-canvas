package app

import (
	"context"
	"testing"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

type tenantFixture struct {
	svc                        *Service
	db                         *gorm.DB
	platformAdmin, agencyAdmin *model.User
	platformUser, agencyUser   *model.User
	platformCtx, agencyCtx     context.Context
}

func newTenantFixture(t *testing.T) tenantFixture {
	t.Helper()
	svc, db := newStudioTestService(t)
	agency := model.Tenant{ID: "agency-a", Slug: "agency-a", Name: "Agency A", Status: model.TenantStatusActive}
	if err := db.Create(&agency).Error; err != nil {
		t.Fatal(err)
	}
	f := tenantFixture{svc: svc, db: db,
		platformAdmin: &model.User{ID: "p-admin", Username: "padmin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, TenantID: model.PlatformTenantID},
		agencyAdmin:   &model.User{ID: "a-admin", Username: "aadmin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, TenantID: "agency-a"},
		platformUser:  &model.User{ID: "p-user", Username: "puser", Role: model.UserRoleUser, Status: model.UserStatusActive, TenantID: model.PlatformTenantID},
		agencyUser:    &model.User{ID: "a-user", Username: "auser", Role: model.UserRoleUser, Status: model.UserStatusActive, TenantID: "agency-a"},
		platformCtx:   WithTenant(context.Background(), model.Tenant{ID: model.PlatformTenantID, IsPlatform: true}),
		agencyCtx:     WithTenant(context.Background(), agency),
	}
	for _, user := range []*model.User{f.platformAdmin, f.agencyAdmin, f.platformUser, f.agencyUser} {
		if err := db.Create(user).Error; err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func TestTenantScopedAnnouncements(t *testing.T) {
	f := newTenantFixture(t)
	created, err := f.svc.CreateAnnouncement(f.agencyAdmin, CreateAnnouncementRequest{Title: "代理商公告", Content: "x", Level: model.AnnouncementLevelInfo})
	if err != nil {
		t.Fatal(err)
	}
	if created.TenantID != "agency-a" {
		t.Fatalf("announcement tenant = %q", created.TenantID)
	}
	platformPage, err := f.svc.AdminAnnouncementPage(f.platformAdmin, AdminListQuery{})
	if err != nil || platformPage.Total != 0 {
		t.Fatalf("platform admin must not list agency announcements: %+v %v", platformPage, err)
	}
	agencyPage, _ := f.svc.AdminAnnouncementPage(f.agencyAdmin, AdminListQuery{})
	if agencyPage.Total != 1 {
		t.Fatalf("agency admin sees its announcement: %+v", agencyPage)
	}
	if feed, _ := f.svc.UserAnnouncements(f.platformUser); len(feed.Announcements) != 0 || feed.UnreadCount != 0 {
		t.Fatalf("platform users must not see agency announcements: %+v", feed)
	}
	if feed, _ := f.svc.UserAnnouncements(f.agencyUser); len(feed.Announcements) != 1 || feed.UnreadCount != 1 {
		t.Fatalf("agency users see their announcement: %+v", feed)
	}
	if unread, err := f.svc.MarkAnnouncementsRead(f.platformUser, []string{created.ID}); err != nil || unread != 0 {
		t.Fatalf("marking a foreign announcement is a no-op: %d %v", unread, err)
	}
	if _, err := f.svc.CloseAnnouncement(f.platformAdmin, created.ID); err == nil {
		t.Fatal("platform admin must not close agency announcements")
	}
	if _, err := f.svc.UpdateAnnouncement(f.platformAdmin, created.ID, UpdateAnnouncementRequest{Title: "改", Level: model.AnnouncementLevelInfo}); err == nil {
		t.Fatal("platform admin must not edit agency announcements")
	}

	banner, err := f.svc.CreateBannerAnnouncement(f.agencyAdmin, CreateBannerAnnouncementRequest{Title: "代理商通知", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	if active, _ := f.svc.ActiveBannerAnnouncements(f.platformCtx); len(active) != 0 {
		t.Fatalf("platform site must not show agency banners: %+v", active)
	}
	if active, _ := f.svc.ActiveBannerAnnouncements(f.agencyCtx); len(active) != 1 {
		t.Fatalf("agency site shows its banner: %+v", active)
	}
	if err := f.svc.DeleteBannerAnnouncement(f.platformAdmin, banner.ID); err == nil {
		t.Fatal("platform admin must not delete agency banners")
	}
	if page, _ := f.svc.AdminBannerAnnouncementPage(f.platformAdmin, AdminListQuery{}); page.Total != 0 {
		t.Fatalf("platform admin banner list leaked: %+v", page)
	}
	// 平台行为不变：平台管理员发的公告平台用户照常看到。
	if _, err := f.svc.CreateAnnouncement(f.platformAdmin, CreateAnnouncementRequest{Title: "平台公告", Level: model.AnnouncementLevelInfo}); err != nil {
		t.Fatal(err)
	}
	if feed, _ := f.svc.UserAnnouncements(f.platformUser); len(feed.Announcements) != 1 {
		t.Fatalf("platform users keep seeing platform announcements: %+v", feed)
	}
	if feed, _ := f.svc.UserAnnouncements(f.agencyUser); len(feed.Announcements) != 1 || feed.Announcements[0].ID != created.ID {
		t.Fatalf("agency users only see agency announcements: %+v", feed)
	}
}

func TestTenantScopedTopupProductsAndPaymentOrders(t *testing.T) {
	f := newTenantFixture(t)
	product, err := f.svc.CreateTopupProduct(f.agencyAdmin, TopupProductRequest{Name: "代理商充值", AmountFen: 1000, CreditsMicrocredits: CreditScale, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if product.TenantID != "agency-a" {
		t.Fatalf("product tenant = %q", product.TenantID)
	}
	if err := f.db.Create(&model.TopupProduct{ID: "platform-pack", Name: "平台充值", AmountFen: 1000, CreditsMicrocredits: CreditScale, Enabled: true}).Error; err != nil {
		t.Fatal(err)
	}
	ids := func(products []model.TopupProduct) []string {
		out := []string{}
		for _, item := range products {
			out = append(out, item.ID)
		}
		return out
	}
	if products, _ := f.svc.TopupProducts(f.platformCtx, nil); len(products) != 1 || products[0].ID != "platform-pack" {
		t.Fatalf("platform storefront = %v", ids(products))
	}
	if products, _ := f.svc.TopupProducts(f.agencyCtx, nil); len(products) != 1 || products[0].ID != product.ID {
		t.Fatalf("agency storefront = %v", ids(products))
	}
	if products, _ := f.svc.TopupProducts(context.Background(), f.agencyUser); len(products) != 1 || products[0].ID != product.ID {
		t.Fatalf("signed-in agency user sees agency products: %v", ids(products))
	}
	if products, _ := f.svc.AdminTopupProducts(f.platformAdmin); len(products) != 1 {
		t.Fatalf("platform admin products = %v", ids(products))
	}
	if _, err := f.svc.UpdateTopupProduct(f.platformAdmin, product.ID, TopupProductRequest{Name: "改", AmountFen: 1, CreditsMicrocredits: CreditScale}); err == nil {
		t.Fatal("platform admin must not edit agency products")
	}
	if _, err := f.svc.CreatePaymentOrder(context.Background(), f.platformUser, CreatePaymentOrderRequest{IdempotencyKey: "k1", ProductID: product.ID, ProviderID: "stripe-checkout"}); err == nil {
		t.Fatal("platform users must not buy agency products")
	}

	for _, order := range []model.PaymentOrder{
		{ID: "po-agency", UserID: f.agencyUser.ID, IdempotencyKey: "a", MerchantOrderNo: "m-a", Status: model.PaymentOrderCredited},
		{ID: "po-platform", UserID: f.platformUser.ID, IdempotencyKey: "p", MerchantOrderNo: "m-p", Status: model.PaymentOrderCredited},
	} {
		if err := f.db.Create(&order).Error; err != nil {
			t.Fatal(err)
		}
	}
	var stamped model.PaymentOrder
	f.db.First(&stamped, "id = ?", "po-agency")
	if stamped.TenantID != "agency-a" {
		t.Fatalf("payment order tenant must follow its user, got %q", stamped.TenantID)
	}
	for admin, want := range map[*model.User]string{f.platformAdmin: "po-platform", f.agencyAdmin: "po-agency"} {
		page, err := f.svc.AdminPaymentOrderPage(admin, PaymentOrderQuery{}, 1, 50)
		if err != nil || page.Total != 1 || page.Orders[0].ID != want {
			t.Fatalf("%s payment orders = %+v %v", admin.ID, page, err)
		}
	}
	if _, err := f.svc.AdminQueryPaymentOrder(context.Background(), f.platformAdmin, "po-agency"); err == nil {
		t.Fatal("platform admin must not query agency orders")
	}
	if _, err := f.svc.AdminClosePaymentOrder(context.Background(), f.agencyAdmin, "po-platform"); err == nil {
		t.Fatal("agency admin must not close platform orders")
	}
	if csv, err := f.svc.AdminPaymentOrdersCSV(context.Background(), f.agencyAdmin, PaymentOrderQuery{}); err != nil || containsBytes(csv, "m-p") {
		t.Fatalf("agency export leaked platform orders: %v", err)
	}
	if _, err := f.svc.AdminPaymentReconciliationPage(f.agencyAdmin, PaymentReconciliationQuery{}, 1, 50); err == nil {
		t.Fatal("reconciliation is platform only")
	}
	if _, err := f.svc.AdminPaymentReconciliationPage(f.platformAdmin, PaymentReconciliationQuery{}, 1, 50); err != nil {
		t.Fatalf("platform reconciliation unchanged: %v", err)
	}
}

func containsBytes(data []byte, needle string) bool {
	return len(needle) > 0 && len(data) >= len(needle) && string(data) != "" && indexOf(string(data), needle) >= 0
}

func indexOf(haystack, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}

func TestTenantScopedRedeemCodes(t *testing.T) {
	f := newTenantFixture(t)
	// 直接写库：AdminCreateRedeemBatch 需要加密密钥文件，Windows 测试环境下 sync 临时目录会失败。
	created := struct {
		Batch model.RedeemBatch
		Codes []string
	}{Batch: model.RedeemBatch{ID: "batch-a", TenantID: "agency-a", AmountMicrocredits: CreditScale, Count: 2, CreatedBy: f.agencyAdmin.ID}, Codes: []string{"0123456789abcdef0123456789abcde1", "0123456789abcdef0123456789abcde2"}}
	codes := []model.RedeemCode{}
	for i, plain := range created.Codes {
		codes = append(codes, model.RedeemCode{ID: "code-" + plain, TenantID: "agency-a", BatchID: "batch-a", CodeHash: hashRedeemCode(plain), CodeSuffix: plain[len(plain)-4:], AmountMicrocredits: CreditScale, Status: model.RedeemCodeUnused, CreatedAt: time.Now().Add(time.Duration(i) * time.Second)})
	}
	if err := f.svc.repo.CreateRedeemBatch(&created.Batch, codes); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.RedeemCredits(f.platformUser, created.Codes[0], "203.0.113.1"); err == nil {
		t.Fatal("platform users must not redeem agency codes")
	}
	if _, err := f.svc.RedeemCredits(f.agencyUser, created.Codes[0], "203.0.113.2"); err != nil {
		t.Fatalf("agency users redeem their codes: %v", err)
	}
	if page, _ := f.svc.AdminRedeemBatchPage(f.platformAdmin, AdminListQuery{}); page.Total != 0 {
		t.Fatalf("platform admin batch list leaked: %+v", page)
	}
	if page, _ := f.svc.AdminRedeemBatchPage(f.agencyAdmin, AdminListQuery{}); page.Total != 1 {
		t.Fatalf("agency admin batch list: %+v", page)
	}
	if _, err := f.svc.AdminDisableRedeemBatch(f.platformAdmin, created.Batch.ID); err == nil {
		t.Fatal("platform admin must not disable agency batches")
	}
}

func TestTenantScopedCommunityFeedbackAndSiteContent(t *testing.T) {
	f := newTenantFixture(t)
	for _, post := range []model.StudioPost{
		{ID: "post-a", UserID: f.agencyUser.ID, TaskID: "task-a", Kind: "image", Status: model.StudioPostPublished, AllowRemix: true, CreatedAt: time.Now()},
		{ID: "post-p", UserID: f.platformUser.ID, TaskID: "task-p", Kind: "image", Status: model.StudioPostPublished, AllowRemix: true, CreatedAt: time.Now()},
	} {
		if err := f.db.Create(&post).Error; err != nil {
			t.Fatal(err)
		}
	}
	for ctx, want := range map[context.Context]string{f.platformCtx: "post-p", f.agencyCtx: "post-a"} {
		page, err := f.svc.StudioCommunity(ctx, "", StudioCommunityQuery{})
		if err != nil || len(page.Posts) != 1 || page.Posts[0].ID != want {
			t.Fatalf("community feed for %s = %+v %v", want, page, err)
		}
	}
	if _, err := f.svc.LikeStudioPost(f.platformUser.ID, "post-a", true); err == nil {
		t.Fatal("platform users must not like agency posts")
	}
	if _, err := f.svc.RemixStudioPost(f.platformUser.ID, "post-a"); err == nil {
		t.Fatal("platform users must not remix agency posts")
	}
	if _, err := f.svc.LikeStudioPost(f.agencyUser.ID, "post-a", true); err != nil {
		t.Fatalf("agency users like agency posts: %v", err)
	}
	if page, _ := f.svc.AdminStudioCommunity(f.platformAdmin, StudioCommunityQuery{}); len(page.Posts) != 1 || page.Posts[0].ID != "post-p" {
		t.Fatalf("platform admin community = %+v", page)
	}
	hidden := true
	if _, err := f.svc.UpdateStudioPostAdmin(f.platformAdmin, "post-a", StudioPostAdminInput{Hidden: &hidden}); err == nil {
		t.Fatal("platform admin must not moderate agency posts")
	}
	if err := f.svc.DeleteStudioPost(f.platformAdmin, "post-a"); err == nil {
		t.Fatal("platform admin must not delete agency posts")
	}

	item, err := f.svc.SubmitStudioFeedback(f.agencyUser.ID, "bug", "坏了", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if list, _ := f.svc.AdminStudioFeedback(f.platformAdmin, ""); len(list) != 0 {
		t.Fatalf("platform admin feedback leaked: %+v", list)
	}
	if list, _ := f.svc.AdminStudioFeedback(f.agencyAdmin, ""); len(list) != 1 {
		t.Fatalf("agency admin feedback: %+v", list)
	}
	if err := f.svc.SetStudioFeedbackStatus(f.platformAdmin, item.ID, "done"); err == nil {
		t.Fatal("platform admin must not update agency feedback")
	}

	if err := f.svc.SaveStudioSiteContent(f.agencyAdmin, "terms", "代理商条款"); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.SaveStudioSiteContent(f.platformAdmin, "terms", "平台条款"); err != nil {
		t.Fatal(err)
	}
	if content, _ := f.svc.StudioSiteContent(f.platformCtx); content["terms"] != "平台条款" {
		t.Fatalf("platform terms = %q", content["terms"])
	}
	if content, _ := f.svc.StudioSiteContent(f.agencyCtx); content["terms"] != "代理商条款" {
		t.Fatalf("agency terms = %q", content["terms"])
	}
}

func TestTenantScopedPartnersLogsAndAdminUsers(t *testing.T) {
	f := newTenantFixture(t)
	now := time.Now()
	if err := f.db.Create(&model.PartnerApplication{ID: "app-a", UserID: f.agencyUser.ID, Kind: model.PartnerKindMerchant, Status: "pending", CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	if page, err := f.svc.AdminPartnerApplications(f.platformAdmin, "", "", 0); err != nil || page.Total != 0 {
		t.Fatalf("platform admin partner applications leaked: %+v %v", page, err)
	}
	if page, _ := f.svc.AdminPartnerApplications(f.agencyAdmin, "", "", 0); page.Total != 1 {
		t.Fatalf("agency admin partner applications: %+v", page)
	}
	if _, err := f.svc.ReviewPartnerApplication(f.platformAdmin, "app-a", PartnerReviewRequest{Action: "approve"}); err == nil {
		t.Fatal("platform admin must not review agency applications")
	}
	if err := f.db.Create(&model.AffiliateAccount{UserID: f.agencyUser.ID, Code: "AGENCY1", Status: model.AffiliateStatusActive, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	if err := f.svc.attachReferral(f.platformUser.ID, "AGENCY1"); err != nil {
		t.Fatal(err)
	}
	if referral, _ := f.svc.repo.AffiliateReferral(f.platformUser.ID); referral != nil {
		t.Fatal("referral codes only work on the affiliate's own site")
	}
	if page, _ := f.svc.AdminAffiliates(f.platformAdmin, "", 0); page.Total != 0 {
		t.Fatalf("platform admin affiliates leaked: %+v", page)
	}

	agencyID := f.agencyUser.ID
	if err := f.db.Create(&model.LoginLog{ID: "log-a", UserID: &agencyID, Username: "auser", Event: "login", Result: "success", CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	if page, _ := f.svc.AdminLoginLogs(f.platformAdmin, LoginLogQuery{}, 1, 50); page.Total != 0 {
		t.Fatalf("platform admin login logs leaked: %+v", page)
	}
	if page, _ := f.svc.AdminLoginLogs(f.agencyAdmin, LoginLogQuery{}, 1, 50); page.Total != 1 {
		t.Fatalf("agency admin login logs: %+v", page)
	}
	if _, err := f.svc.AdminLoginLog(f.platformAdmin, "log-a"); err == nil {
		t.Fatal("platform admin must not open agency login logs")
	}

	task := model.Task{ID: "task-a", UserID: f.agencyUser.ID, Type: "canvas_image", Status: model.TaskStatusSucceeded}
	if err := f.db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	order := model.BillingOrder{ID: "bo-a", UserID: f.agencyUser.ID, IdempotencyKey: "bo-a", Status: model.BillingStatusUncertain}
	if err := f.db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	callLog := model.ApiCallLog{ID: "call-a", UserID: f.agencyUser.ID, Status: model.ApiCallStatusSucceeded, CreatedAt: now}
	if err := f.db.Create(&callLog).Error; err != nil {
		t.Fatal(err)
	}
	if task.TenantID != "agency-a" || order.TenantID != "agency-a" || callLog.TenantID != "agency-a" {
		t.Fatalf("tasks, billing orders and api logs follow their user: %q %q %q", task.TenantID, order.TenantID, callLog.TenantID)
	}
	if page, _ := f.svc.AdminBillingOrderPage(f.platformAdmin, AdminListQuery{}); page.Total != 0 {
		t.Fatalf("platform admin billing orders leaked: %+v", page)
	}
	if _, err := f.svc.ResolveBillingOrder(f.platformAdmin, "bo-a", ResolveBillingRequest{Action: "refund", Note: "x"}); err == nil {
		t.Fatal("platform admin must not resolve agency billing orders")
	}
	if _, err := f.svc.AdminAPICallLog(f.platformAdmin, "call-a"); err == nil {
		t.Fatal("platform admin must not open agency api logs")
	}

	if err := f.svc.appendAdminAudit(f.agencyAdmin, "test", "user", f.agencyUser.ID, "测试", nil); err != nil {
		t.Fatal(err)
	}
	var audit model.AdminAuditEvent
	f.db.First(&audit, "actor_user_id = ?", f.agencyAdmin.ID)
	if audit.TenantID != "agency-a" {
		t.Fatalf("audit events follow the actor's tenant, got %q", audit.TenantID)
	}

	users, err := f.svc.AdminUsers(f.platformAdmin, AdminListQuery{})
	if err != nil || users.Total != 2 {
		t.Fatalf("platform admin users = %+v %v", users, err)
	}
	for _, user := range users.Users {
		if user.TenantID != model.PlatformTenantID {
			t.Fatalf("platform admin listed a foreign user: %+v", user.User)
		}
	}
	if _, err := f.svc.AdminUserDetail(f.platformAdmin, f.agencyUser.ID); err == nil {
		t.Fatal("platform admin must not open agency users")
	}
	if _, err := f.svc.AdminUserDetail(f.agencyAdmin, f.agencyUser.ID); err != nil {
		t.Fatalf("agency admin opens agency users: %v", err)
	}
	overview, err := f.svc.AdminAnalytics(f.platformAdmin, AnalyticsQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if len(overview.Users) != 0 {
		t.Fatalf("platform analytics must not rank agency users: %+v", overview.Users)
	}
}
