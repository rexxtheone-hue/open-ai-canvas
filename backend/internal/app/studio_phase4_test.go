package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestTopupProductCurrencyAndPlanValidation(t *testing.T) {
	product, err := topupProductFromRequest("p1", "admin", TopupProductRequest{Name: "月度会员", AmountFen: 2990, CreditsMicrocredits: 1_000_000, Currency: " myr ", PlanID: " plan-1 "})
	if err != nil {
		t.Fatal(err)
	}
	if product.Currency != "MYR" || product.PlanID != "plan-1" {
		t.Fatalf("unexpected product %+v", product)
	}
	legacy, err := topupProductFromRequest("p2", "admin", TopupProductRequest{Name: "旧商品", AmountFen: 100, CreditsMicrocredits: 1})
	if err != nil || legacy.Currency != "CNY" {
		t.Fatalf("empty currency must default to CNY: %+v %v", legacy, err)
	}
	if _, err := topupProductFromRequest("p3", "admin", TopupProductRequest{Name: "日元", AmountFen: 100, CreditsMicrocredits: 1, Currency: "JPY"}); err == nil {
		t.Fatal("zero-decimal currency must be rejected")
	}
	if paymentProviderCurrency(map[string]string{}) != "CNY" || paymentProviderCurrency(map[string]string{"currency": "myr"}) != "MYR" {
		t.Fatal("provider currency must default to CNY and be upper-cased")
	}
}

func TestPaymentCreditExtendsMembershipOnce(t *testing.T) {
	svc, db := newStudioTestService(t)
	repo := repository.New(db)
	plan := model.StudioPlan{ID: "plan-pro", Name: "Pro", DurationDays: 30, ActiveTaskLimit: 20, Enabled: true}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatal(err)
	}
	makeOrder := func(id string) model.PaymentOrder {
		order := model.PaymentOrder{ID: id, UserID: "user-a", IdempotencyKey: id, MerchantOrderNo: "m-" + id, ProductID: "prod", ProductName: "Pro 月度", ProviderID: "stripe-checkout",
			AmountFen: 2990, Currency: "MYR", CreditsMicrocredits: 5_000_000, Status: model.PaymentOrderPending, PlanID: plan.ID, PlanDurationDays: 30}
		if err := db.Create(&order).Error; err != nil {
			t.Fatal(err)
		}
		return order
	}
	first := makeOrder("o1")
	evidence := repository.PaymentEvidence{ProviderTradeNo: "cs_1", AmountFen: 2990, Currency: "MYR", PaidAt: time.Now()}
	if _, _, err := repo.CompletePaymentOrder(first.ProviderID, first.MerchantOrderNo, evidence); err != nil {
		t.Fatal(err)
	}
	// 重复通知不能再延长一次会员。
	if _, _, err := repo.CompletePaymentOrder(first.ProviderID, first.MerchantOrderNo, evidence); err != nil {
		t.Fatal(err)
	}
	membership, err := repo.UserMembership("user-a")
	if err != nil || membership == nil {
		t.Fatalf("membership missing: %v", err)
	}
	days := membership.ExpiresAt.Sub(time.Now()).Hours() / 24
	if days < 29.9 || days > 30.1 {
		t.Fatalf("expected about 30 days, got %.2f", days)
	}
	second := makeOrder("o2")
	if _, _, err := repo.CompletePaymentOrder(second.ProviderID, second.MerchantOrderNo, repository.PaymentEvidence{ProviderTradeNo: "cs_2", AmountFen: 2990, Currency: "MYR"}); err != nil {
		t.Fatal(err)
	}
	membership, _ = repo.UserMembership("user-a")
	days = membership.ExpiresAt.Sub(time.Now()).Hours() / 24
	if days < 59.9 || days > 60.1 {
		t.Fatalf("renewal must stack to about 60 days, got %.2f", days)
	}
	// 会员提高并发上限；套餐停用后回到默认上限。
	view, err := svc.StudioMembership("user-a")
	if err != nil || !view.Active || view.ActiveTaskLimit != 20 {
		t.Fatalf("unexpected membership view %+v %v", view, err)
	}
	if svc.activeTaskLimitForUser("user-a", 5) != 20 || svc.activeTaskLimitForUser("user-b", 5) != 5 {
		t.Fatal("member task limit must apply only to members")
	}
	if svc.activeTaskLimitForUser("user-a", 50) != 50 {
		t.Fatal("membership must never lower the global limit")
	}
	db.Model(&model.StudioPlan{}).Where("id = ?", plan.ID).Update("enabled", false)
	if svc.activeTaskLimitForUser("user-a", 5) != 5 {
		t.Fatal("disabled plan must stop granting entitlements")
	}
}

func TestStudioCommunityPublishLikeRemixAndPrivacy(t *testing.T) {
	_, db := newStudioTestService(t)
	// 预置签名密钥：Windows 临时目录不允许硬链接发布密钥文件，Linux 服务器走正常路径。
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), dataDir)
	if err := db.Create(&model.User{ID: "author", Username: "author", DisplayName: "小雅"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "res-1", UserID: "author", Kind: "image", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/author/image/a.png", MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	createStudioTestTask(t, db, model.Task{ID: "done", UserID: "author", WorkbenchKind: model.StudioKindImage,
		Prompt:     "一杯咖啡\n\n品牌：暖杯",
		InputJSON:  `{"mode":"image","prompt":"一杯咖啡\n\n品牌：暖杯","config":{"model":"m","size":"1:1","apiKey":"secret"},"metadata":{"source":"studio","studioTool":"create-image","studioPrompt":"一杯咖啡","brandKitId":"kit"}}`,
		ResultJSON: `{"images":[{"storageKey":"resource:res-1","mimeType":"image/png"},{"url":"https://provider.example/tmp.png"}]}`})
	createStudioTestTask(t, db, model.Task{ID: "running", UserID: "author", WorkbenchKind: model.StudioKindImage, Status: model.TaskStatusRunning, InputJSON: `{}`})
	createStudioTestTask(t, db, model.Task{ID: "temp-only", UserID: "author", WorkbenchKind: model.StudioKindImage, InputJSON: `{}`, ResultJSON: `{"images":[{"url":"https://provider.example/tmp.png"}]}`})

	if _, err := svc.PublishStudioWork("author", "running", StudioPublishInput{Title: "x"}); err == nil {
		t.Fatal("unfinished work must not be published")
	}
	if _, err := svc.PublishStudioWork("author", "temp-only", StudioPublishInput{Title: "x"}); err == nil {
		t.Fatal("work without saved resources must not be published")
	}
	if _, err := svc.PublishStudioWork("other", "done", StudioPublishInput{Title: "x"}); err == nil {
		t.Fatal("other users must not publish someone else's work")
	}
	if _, err := svc.PublishStudioWork("author", "done", StudioPublishInput{Title: " "}); err == nil {
		t.Fatal("title is required")
	}
	post, err := svc.PublishStudioWork("author", "done", StudioPublishInput{Title: "咖啡海报", AllowRemix: false})
	if err != nil {
		t.Fatal(err)
	}
	if post.Prompt != "一杯咖啡" || post.Settings["brandKitId"] != nil || post.Settings["apiKey"] != nil || len(post.Media) != 1 || !strings.Contains(post.Media[0].URL, "/api/public/resources/res-1/file") {
		t.Fatalf("unexpected post %+v", post)
	}

	page, err := svc.StudioCommunity("viewer", StudioCommunityQuery{})
	if err != nil || len(page.Posts) != 1 {
		t.Fatalf("community list: %+v %v", page, err)
	}
	if page.Posts[0].Prompt != "" || page.Posts[0].Settings != nil || page.Posts[0].Author != "小雅" {
		t.Fatalf("prompt must be hidden when remix is closed: %+v", page.Posts[0])
	}
	if _, err := svc.RemixStudioPost("viewer", post.ID); err == nil {
		t.Fatal("remix must be refused when the author closed it")
	}
	if _, err := svc.PublishStudioWork("author", "done", StudioPublishInput{Title: "咖啡海报", AllowRemix: true}); err != nil {
		t.Fatal(err)
	}
	remix, err := svc.RemixStudioPost("viewer", post.ID)
	if err != nil || remix.Prompt != "一杯咖啡" || remix.Tool != "create-image" || remix.Settings["size"] != "1:1" || remix.Settings["userPrompt"] != "一杯咖啡" {
		t.Fatalf("unexpected remix %+v %v", remix, err)
	}

	for range 2 {
		if count, err := svc.LikeStudioPost("viewer", post.ID, true); err != nil || count != 1 {
			t.Fatalf("like must be counted once: %d %v", count, err)
		}
	}
	if count, _ := svc.LikeStudioPost("viewer", post.ID, false); count != 0 {
		t.Fatalf("unlike must decrement, got %d", count)
	}
	if count, _ := svc.LikeStudioPost("viewer", post.ID, false); count != 0 {
		t.Fatalf("double unlike must not go negative, got %d", count)
	}

	admin := &model.User{ID: "admin", Role: "admin"}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	hidden := true
	template := true
	if _, err := svc.UpdateStudioPostAdmin(admin, post.ID, StudioPostAdminInput{Hidden: &hidden, IsTemplate: &template}); err != nil {
		t.Fatal(err)
	}
	if page, _ := svc.StudioCommunity("viewer", StudioCommunityQuery{}); len(page.Posts) != 0 {
		t.Fatal("hidden post must disappear from the community")
	}
	if _, err := svc.LikeStudioPost("viewer", post.ID, true); err == nil {
		t.Fatal("hidden post cannot be liked")
	}
	if err := svc.DeleteStudioPost(&model.User{ID: "viewer"}, post.ID); err == nil {
		t.Fatal("only author or admin can delete")
	}
	if err := svc.DeleteStudioPost(&model.User{ID: "author"}, post.ID); err != nil {
		t.Fatal(err)
	}
}

func TestStudioToolCoverAdminOnlyAndOwnedImage(t *testing.T) {
	svc, db := newStudioTestService(t)
	admin := &model.User{ID: "admin", Role: "admin"}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "cover", UserID: "admin", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "other", UserID: "user", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.SetStudioToolCover(&model.User{ID: "user"}, "lip-sync", "cover"); err == nil {
		t.Fatal("non-admin must not set covers")
	}
	if err := svc.SetStudioToolCover(admin, "../x", "cover"); err == nil {
		t.Fatal("invalid tool id must be rejected")
	}
	if err := svc.SetStudioToolCover(admin, "lip-sync", "other"); err == nil {
		t.Fatal("cover must be the admin's own resource")
	}
	if err := svc.SetStudioToolCover(admin, "lip-sync", "cover"); err != nil {
		t.Fatal(err)
	}
	covers, err := svc.repo.StudioToolCovers()
	if err != nil || len(covers) != 1 || covers[0].ResourceID != "cover" {
		t.Fatalf("unexpected covers %+v %v", covers, err)
	}
	if err := svc.SetStudioToolCover(admin, "lip-sync", ""); err != nil {
		t.Fatal(err)
	}
	if covers, _ := svc.repo.StudioToolCovers(); len(covers) != 0 {
		t.Fatal("empty resource id must clear the cover")
	}
}
