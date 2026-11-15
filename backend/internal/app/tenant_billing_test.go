package app

import (
	"errors"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

const (
	testAgencyID     = "agency-a"
	testAgencyUser   = "agency-user"
	testPlatformUser = "platform-user"
)

type tenantBillingFixture struct {
	svc *Service
	db  *gorm.DB
}

// newTenantBillingFixture 建一个按次计费 1 积分的图片模型、一家代理商、一个代理商客户和一个平台用户（各 10 积分）。
func newTenantBillingFixture(t *testing.T, discount int) tenantBillingFixture {
	t.Helper()
	svc, db := newStudioTestService(t)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(db.Create(&model.ModelChannel{ID: "ch", Scope: model.ChannelScopeSystem, Enabled: true, Name: "System", APIFormat: "legacy"}).Error)
	must(db.Create(&model.ChannelModel{ID: "cm", ChannelID: "ch", ModelKey: "img", Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, Enabled: true, PriceConfigured: true, AgencyDiscountPercent: discount}).Error)
	must(db.Model(&model.ChannelModel{}).Where("id = ?", "cm").Update("agency_discount_percent", discount).Error)
	must(db.Create(&model.ChannelModelPriceTier{ID: "tier", ChannelModelID: "cm", SelectorKey: "{}", SelectorJSON: "{}", Resolution: "*", BillingMode: "fixed_request", UnitPriceMicrocredits: 1_000_000, Enabled: true, PriceConfigured: true}).Error)
	must(db.Create(&model.Tenant{ID: testAgencyID, Slug: testAgencyID, Name: "Agency A", Status: model.TenantStatusActive, CreatedAt: time.Now().AddDate(-1, 0, 0)}).Error)
	must(db.Create(&model.User{ID: testAgencyUser, TenantID: testAgencyID, Username: "agency-user", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error)
	must(db.Create(&model.User{ID: testPlatformUser, TenantID: model.PlatformTenantID, Username: "platform-user", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error)
	for _, userID := range []string{testAgencyUser, testPlatformUser} {
		must(db.Create(&model.CreditAccount{UserID: userID, AvailableMicrocredits: 10_000_000}).Error)
	}
	return tenantBillingFixture{svc: svc, db: db}
}

func (f tenantBillingFixture) fundPool(t *testing.T, amount int64) {
	t.Helper()
	if _, err := f.svc.repo.AdjustTenantPool(testAgencyID, amount, "test", "admin", time.Now()); err != nil {
		t.Fatal(err)
	}
}

func (f tenantBillingFixture) pool(t *testing.T) model.TenantCreditAccount {
	t.Helper()
	account, err := f.svc.repo.TenantCreditAccount(testAgencyID)
	if err != nil {
		t.Fatal(err)
	}
	return account
}

func (f tenantBillingFixture) user(t *testing.T, userID string) model.CreditAccount {
	t.Helper()
	var account model.CreditAccount
	if err := f.db.First(&account, "user_id = ?", userID).Error; err != nil {
		t.Fatal(err)
	}
	return account
}

func (f tenantBillingFixture) reserve(userID string, key string) (*model.BillingOrder, error) {
	return f.svc.ReserveProxyBillingWithBody(userID, "ch", "img", "image", "test", key, 1, nil)
}

func (f tenantBillingFixture) lotRemaining(t *testing.T) int64 {
	t.Helper()
	lots, err := f.svc.repo.TenantCreditLots(testAgencyID, false)
	if err != nil {
		t.Fatal(err)
	}
	var total int64
	for _, lot := range lots {
		total += lot.RemainingMicrocredits
	}
	return total
}

func TestTenantWholesaleMaths(t *testing.T) {
	topup, err := repository.TopupMicrocredits(500_000)
	if err != nil || topup != 646_830_530_401 {
		t.Fatalf("RM 5,000 = %d microcredits, err=%v", topup, err)
	}
	if topup, _ := repository.TopupMicrocredits(773); topup != 1_000_000_000 {
		t.Fatalf("RM 7.73 must buy exactly 1,000 credits, got %d", topup)
	}
	for discount, want := range map[int]int64{15: 1_000_000, 25: 882_353, 30: 823_530, 40: 705_883} {
		got, err := repository.WholesaleMicrocredits(1_000_000, discount)
		if err != nil || got != want {
			t.Fatalf("discount %d: pool deduction %d, want %d", discount, got, want)
		}
	}
	usageFor := func(sen int64) int64 {
		value, err := repository.FeeMicrocredits(sen)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	for _, item := range []struct{ usageSen, feeSen int64 }{{0, 150_000}, {200_000, 90_000}, {400_000, 30_000}, {500_000, 0}, {900_000, 0}} {
		if got := repository.MonthlyFeeSen(usageFor(item.usageSen)); got != item.feeSen {
			t.Fatalf("usage RM %d: fee %d sen, want %d", item.usageSen/100, got, item.feeSen)
		}
	}
}

func TestAgencyDiscountSeedingByLabel(t *testing.T) {
	for _, item := range []struct {
		label, capability string
		want              int
	}{
		{"Grok Imagine Video", "video", 40},
		{"Nano Banana Pro", "image", 30}, {"gpt-image-1", "image", 30}, {"Midjourney v7", "image", 30}, {"LTX-2", "video", 30},
		{"DreamActor M1", "video", 30}, {"OmniMuse Upscale", "video", 30}, {"Video Sound Effects", "video", 30}, {"ElevenLabs TTS", "audio", 30},
		{"Veo 3.1", "video", 25}, {"veo-3.1-fast", "video", 25}, {"Kling 2.5", "video", 25}, {"Vidu Q2", "video", 25}, {"MiniMax H3 Max", "video", 25},
		{"Wan 3.0 Prime", "video", 25}, {"Omni Flash 1.2", "video", 25}, {"claude-sonnet", "text", 25},
		{"Seedance 1.5 Pro", "video", 15}, {"Seedream 5.0", "image", 15}, {"Some Other Model", "image", 15},
	} {
		if got := database.AgencyDiscountForModel(item.label, item.capability); got != item.want {
			t.Errorf("%s: %d, want %d", item.label, got, item.want)
		}
	}
}

func TestTenantDualReservationSettleAndRefund(t *testing.T) {
	f := newTenantBillingFixture(t, 25)
	f.fundPool(t, 5_000_000)
	order, err := f.reserve(testAgencyUser, "one")
	if err != nil {
		t.Fatal(err)
	}
	if order.PoolTenantID != testAgencyID || order.AmountMicrocredits != 1_000_000 || order.TenantChargeMicrocredits != 882_353 {
		t.Fatalf("order snapshot: %#v", order.BillingTenantSnapshot)
	}
	if pool := f.pool(t); pool.AvailableMicrocredits != 5_000_000-882_353 || pool.ReservedMicrocredits != 882_353 {
		t.Fatalf("pool after reserve: %#v", pool)
	}
	for i := 0; i < 2; i++ {
		if err := f.svc.SettleBilling(order.ID, "req"); err != nil {
			t.Fatal(err)
		}
	}
	if pool := f.pool(t); pool.AvailableMicrocredits != 5_000_000-882_353 || pool.ReservedMicrocredits != 0 {
		t.Fatalf("pool after settle: %#v", pool)
	}
	if f.lotRemaining(t) != 5_000_000-882_353 {
		t.Fatalf("lots must be consumed by the settled amount, remaining %d", f.lotRemaining(t))
	}
	if user := f.user(t, testAgencyUser); user.AvailableMicrocredits != 9_000_000 || user.ReservedMicrocredits != 0 {
		t.Fatalf("user after settle: %#v", user)
	}

	refunded, err := f.reserve(testAgencyUser, "two")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := f.svc.RefundBilling(refunded.ID, "upstream failed"); err != nil {
			t.Fatal(err)
		}
	}
	if pool := f.pool(t); pool.AvailableMicrocredits != 5_000_000-882_353 || pool.ReservedMicrocredits != 0 {
		t.Fatalf("pool after refund: %#v", pool)
	}
	if user := f.user(t, testAgencyUser); user.AvailableMicrocredits != 9_000_000 {
		t.Fatalf("user after refund: %#v", user)
	}
	var count int64
	f.db.Model(&model.TenantLedgerEntry{}).Where("billing_order_id IN ?", []string{order.ID, refunded.ID}).Count(&count)
	if count != 4 {
		t.Fatalf("expected reserve+settle+reserve+refund ledger rows, got %d", count)
	}
}

func TestTenantPoolInsufficientRejectsWithServiceMessage(t *testing.T) {
	f := newTenantBillingFixture(t, 15)
	f.fundPool(t, 500_000)
	_, err := f.reserve(testAgencyUser, "short")
	if err == nil || err.Error() != "服务暂时不可用，请联系客服" {
		t.Fatalf("pool shortage must show the service message, got %v", err)
	}
	if user := f.user(t, testAgencyUser); user.AvailableMicrocredits != 10_000_000 || user.ReservedMicrocredits != 0 {
		t.Fatalf("user credits must roll back: %#v", user)
	}
	var orders int64
	f.db.Model(&model.BillingOrder{}).Count(&orders)
	if orders != 0 || f.pool(t).AvailableMicrocredits != 500_000 {
		t.Fatalf("nothing may be reserved: orders=%d pool=%#v", orders, f.pool(t))
	}
}

func TestTenantUserInsufficientCreditsLeavesPoolUntouched(t *testing.T) {
	f := newTenantBillingFixture(t, 15)
	f.fundPool(t, 5_000_000)
	f.db.Model(&model.CreditAccount{}).Where("user_id = ?", testAgencyUser).Update("available_microcredits", 100)
	_, err := f.reserve(testAgencyUser, "poor")
	if err == nil || !strings.Contains(err.Error(), "积分不足") {
		t.Fatalf("expected insufficient credits, got %v", err)
	}
	if pool := f.pool(t); pool.AvailableMicrocredits != 5_000_000 || pool.ReservedMicrocredits != 0 {
		t.Fatalf("pool must not change: %#v", pool)
	}
}

func TestTenantReservationIdempotentRetry(t *testing.T) {
	f := newTenantBillingFixture(t, 15)
	f.fundPool(t, 5_000_000)
	order, err := f.reserve(testAgencyUser, "same-key")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.reserve(testAgencyUser, "same-key"); err == nil {
		t.Fatal("a duplicate idempotency key must not reserve twice")
	}
	if pool := f.pool(t); pool.ReservedMicrocredits != 1_000_000 {
		t.Fatalf("retry reserved the pool twice: %#v", pool)
	}
	if err := f.svc.SettleBilling(order.ID, ""); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.RefundBilling(order.ID, "late failure"); err == nil {
		t.Fatal("a settled order must not be refunded automatically")
	}
	if pool := f.pool(t); pool.AvailableMicrocredits != 4_000_000 || pool.ReservedMicrocredits != 0 {
		t.Fatalf("pool after settle: %#v", pool)
	}
}

func TestTenantRetailMultiplierFixedPriceAndHiddenModel(t *testing.T) {
	f := newTenantBillingFixture(t, 25)
	f.fundPool(t, 5_000_000)
	cm, tier := "cm", "tier"
	if err := f.svc.repo.SaveTenantModelPrice(&model.TenantModelPrice{TenantID: testAgencyID, ChannelModelID: &cm, MultiplierBasisPoints: 15_000, Enabled: true}); err != nil {
		t.Fatal(err)
	}
	order, err := f.reserve(testAgencyUser, "multiplier")
	if err != nil {
		t.Fatal(err)
	}
	if order.AmountMicrocredits != 1_500_000 || order.TenantChargeMicrocredits != 882_353 {
		t.Fatalf("multiplier: user %d pool %d", order.AmountMicrocredits, order.TenantChargeMicrocredits)
	}
	fixed := int64(300_000)
	if err := f.svc.repo.SaveTenantModelPrice(&model.TenantModelPrice{TenantID: testAgencyID, ChannelModelID: &cm, PriceTierID: &tier, MultiplierBasisPoints: 10_000, FixedUnitPriceMicrocredits: &fixed, Enabled: true}); err != nil {
		t.Fatal(err)
	}
	order, err = f.reserve(testAgencyUser, "fixed")
	if err != nil {
		t.Fatal(err)
	}
	if order.AmountMicrocredits != 300_000 || order.TenantChargeMicrocredits != 882_353 {
		t.Fatalf("fixed price below wholesale is allowed: user %d pool %d", order.AmountMicrocredits, order.TenantChargeMicrocredits)
	}
	quote, err := f.svc.newBillingOrder("", "", "quote", "ch", "img", "image", "model_quote", 1, tokenBillingEstimate{})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.svc.tenantQuoteOrder(testAgencyID, quote); err != nil || quote.AmountMicrocredits != 300_000 {
		t.Fatalf("agency quote must show the retail price: %d %v", quote.AmountMicrocredits, err)
	}
	if err := f.svc.repo.SaveTenantModelPrice(&model.TenantModelPrice{TenantID: testAgencyID, ChannelModelID: &cm, MultiplierBasisPoints: 15_000, Enabled: false}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.reserve(testAgencyUser, "hidden"); err == nil || !strings.Contains(err.Error(), "暂时不可用") {
		t.Fatalf("hidden model must be rejected, got %v", err)
	}
	catalog, err := f.svc.ModelCatalogForTenant(testAgencyID, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, channel := range catalog.Channels {
		for _, item := range channel.Models {
			if item.ID == cm {
				t.Fatal("hidden model must not be listed on the agency site")
			}
		}
	}
	// 平台用户不受代理商规则影响。
	platform, err := f.reserve(testPlatformUser, "platform")
	if err != nil || platform.AmountMicrocredits != 1_000_000 || platform.PoolTenantID != "" {
		t.Fatalf("platform order changed: %#v %v", platform, err)
	}
}

func TestPlatformBillingUnchangedByTenantBilling(t *testing.T) {
	f := newTenantBillingFixture(t, 40)
	order, err := f.reserve(testPlatformUser, "platform")
	if err != nil {
		t.Fatal(err)
	}
	if order.BillingTenantSnapshot != (model.BillingTenantSnapshot{}) || order.AmountMicrocredits != 1_000_000 {
		t.Fatalf("platform order must carry no tenant data: %#v", order)
	}
	if err := f.svc.SettleBilling(order.ID, ""); err != nil {
		t.Fatal(err)
	}
	if user := f.user(t, testPlatformUser); user.AvailableMicrocredits != 9_000_000 || user.ReservedMicrocredits != 0 {
		t.Fatalf("platform balance: %#v", user)
	}
	var tenantRows, accounts int64
	f.db.Model(&model.TenantLedgerEntry{}).Count(&tenantRows)
	f.db.Model(&model.TenantCreditAccount{}).Count(&accounts)
	if tenantRows != 0 || accounts != 0 {
		t.Fatalf("platform billing touched a pool: ledger=%d accounts=%d", tenantRows, accounts)
	}
}

func TestAgencyGrantsNeverTouchPool(t *testing.T) {
	f := newTenantBillingFixture(t, 15)
	f.fundPool(t, 1_000_000)
	if _, err := f.svc.repo.AdjustCredits(testAgencyUser, "tenant-admin", 50_000_000, "gift"); err != nil {
		t.Fatal(err)
	}
	if pool := f.pool(t); pool.AvailableMicrocredits != 1_000_000 {
		t.Fatalf("granting customer credits must not touch the pool: %#v", pool)
	}
}

func TestTenantVideoTokenReservationReleasesBothSides(t *testing.T) {
	svc, db, channel, channelModel, _ := newVideoTokenQuoteFixture(t)
	if err := db.AutoMigrate(&model.ApiCallLog{}, &model.User{}, &model.Tenant{}, &model.TenantCreditAccount{}, &model.TenantCreditLot{}, &model.TenantLedgerEntry{}, &model.TenantModelPrice{}); err != nil {
		t.Fatal(err)
	}
	db.Create(&model.Tenant{ID: testAgencyID, Slug: testAgencyID, Name: "Agency A", Status: model.TenantStatusActive})
	db.Create(&model.User{ID: "quote-user", TenantID: testAgencyID, Username: "quote-user", Role: model.UserRoleUser, Status: model.UserStatusActive})
	db.Model(&model.ChannelModel{}).Where("id = ?", channelModel.ID).Update("agency_discount_percent", 40)
	if _, err := svc.repo.AdjustTenantPool(testAgencyID, 10_000_000, "test", "admin", time.Now()); err != nil {
		t.Fatal(err)
	}
	intent := ModelRequestIntent{Capability: "video", Options: map[string]any{"vquality": "720p", "size": "16:9", "videoSeconds": 5}}
	input := quoteInput(intent, channelModel.ModelKey)
	input["config"].(map[string]any)["channelId"] = channel.ID
	input, err := svc.resolveSystemChannelModelSelection(input, "canvas_video", "")
	if err != nil {
		t.Fatal(err)
	}
	order, err := svc.taskBillingOrder("quote-user", &model.Task{ID: "video-task", Type: "canvas_video"}, input)
	if err != nil {
		t.Fatal(err)
	}
	// 预留含 5% 余量：平台 1,814,400；40% 折扣池扣 ceil(1,814,400 × 60 / 85)。
	if order.AmountMicrocredits != 1_814_400 || order.TenantChargeMicrocredits != 1_280_753 {
		t.Fatalf("video reservation: user %d pool %d", order.AmountMicrocredits, order.TenantChargeMicrocredits)
	}
	if err := svc.repo.ReserveBillingOrder(order); err != nil {
		t.Fatal(err)
	}
	if err := svc.SettleBilling(order.ID, "completed-video"); err != nil {
		t.Fatal(err)
	}
	settled, _ := svc.repo.BillingOrder(order.ID)
	if settled.ActualAmountMicrocredits != 1_728_000 || settled.TenantChargeMicrocredits != 1_219_765 {
		t.Fatalf("video settlement: user %d pool %d", settled.ActualAmountMicrocredits, settled.TenantChargeMicrocredits)
	}
	pool, _ := svc.repo.TenantCreditAccount(testAgencyID)
	if pool.AvailableMicrocredits != 10_000_000-1_219_765 || pool.ReservedMicrocredits != 0 {
		t.Fatalf("pool margin not released: %#v", pool)
	}
	var account model.CreditAccount
	db.First(&account, "user_id = ?", "quote-user")
	if account.AvailableMicrocredits != 10_000_000-1_728_000 || account.ReservedMicrocredits != 250_000 {
		t.Fatalf("user margin not released: %#v", account)
	}
}

func seedTenantUsage(t *testing.T, db *gorm.DB, tenantID string, usage int64, at time.Time) {
	t.Helper()
	if usage <= 0 {
		return
	}
	if err := db.Create(&model.TenantLedgerEntry{ID: newID(), TenantID: tenantID, Type: model.TenantLedgerConsume, AmountMicrocredits: -usage, CreatedAt: at}).Error; err != nil {
		t.Fatal(err)
	}
	// 被退款的订单只有预留和退款记录，不应计入用量。
	if err := db.Create(&model.TenantLedgerEntry{ID: newID(), TenantID: tenantID, Type: model.TenantLedgerRefund, AmountMicrocredits: 99_000_000, CreatedAt: at}).Error; err != nil {
		t.Fatal(err)
	}
}

func TestTenantMonthlyMinimumFeeAndDebt(t *testing.T) {
	svc, db := newStudioTestService(t)
	october := time.Date(2026, 10, 15, 12, 0, 0, 0, tenantBillingZone)
	runAt := time.Date(2026, 11, 1, 0, 31, 0, 0, tenantBillingZone)
	old := time.Date(2026, 10, 1, 0, 0, 0, 0, tenantBillingZone)
	feeFreeUntil := time.Date(2026, 12, 1, 0, 0, 0, 0, tenantBillingZone)
	usage := func(sen int64) int64 {
		value, _ := repository.FeeMicrocredits(sen)
		return value
	}
	cases := []struct {
		id       string
		usage    int64
		wantFee  int64
		feeFree  bool
		poolFund int64
	}{
		{"t0", 0, 150_000, false, 10_000_000_000_000},
		{"t2000", usage(200_000), 90_000, false, 10_000_000_000_000},
		{"t4000", usage(400_000), 30_000, false, 10_000_000_000_000},
		{"t5000", usage(500_000), 0, false, 10_000_000_000_000},
		{"tfree", 0, 0, true, 10_000_000_000_000},
		{"tdebt", 0, 150_000, false, 1_000_000},
	}
	for _, item := range cases {
		tenant := model.Tenant{ID: item.id, Slug: item.id, Name: item.id, Status: model.TenantStatusActive, CreatedAt: old}
		if item.feeFree {
			tenant.FeeFreeUntil = &feeFreeUntil
		}
		if err := db.Create(&tenant).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := svc.repo.AdjustTenantPool(item.id, item.poolFund, "fund", "admin", old); err != nil {
			t.Fatal(err)
		}
		seedTenantUsage(t, db, item.id, item.usage, october)
	}
	// 1 日 00:30 之前不结算上个月。
	if err := svc.SettleTenantMonthlyFees(time.Date(2026, 11, 1, 0, 10, 0, 0, tenantBillingZone)); err != nil {
		t.Fatal(err)
	}
	if rows, _ := svc.repo.TenantMonthlyUsages("", "2026-10", 10); len(rows) != 0 {
		t.Fatalf("settled too early: %#v", rows)
	}
	for i := 0; i < 2; i++ {
		if err := svc.SettleTenantMonthlyFees(runAt); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range cases {
		rows, err := svc.repo.TenantMonthlyUsages(item.id, "2026-10", 10)
		if err != nil || len(rows) != 1 {
			t.Fatalf("%s: rows=%#v err=%v", item.id, rows, err)
		}
		if rows[0].FeeSen != item.wantFee || rows[0].FeeFree != item.feeFree || rows[0].UsageMicrocredits != item.usage {
			t.Fatalf("%s: settlement %#v, want fee %d", item.id, rows[0], item.wantFee)
		}
		var fees int64
		db.Model(&model.TenantLedgerEntry{}).Where("tenant_id = ? AND type = ?", item.id, model.TenantLedgerMonthlyFee).Count(&fees)
		if (item.wantFee > 0) != (fees == 1) || fees > 1 {
			t.Fatalf("%s: monthly fee ledger rows %d", item.id, fees)
		}
	}
	feeMicro, _ := repository.FeeMicrocredits(150_000)
	if pool, _ := svc.repo.TenantCreditAccount("t0"); pool.AvailableMicrocredits != 10_000_000_000_000-feeMicro {
		t.Fatalf("fee not deducted from pool: %#v", pool)
	}
	debts, _ := svc.repo.TenantDebts("tdebt", true)
	if len(debts) != 1 || debts[0].RemainingMicrocredits != feeMicro-1_000_000 {
		t.Fatalf("uncovered fee must become a debt: %#v", debts)
	}
	if pool, _ := svc.repo.TenantCreditAccount("tdebt"); pool.AvailableMicrocredits != 0 {
		t.Fatalf("debt tenant pool must be emptied: %#v", pool)
	}

	admin := &model.User{ID: "platform-admin", TenantID: model.PlatformTenantID, Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	view, err := svc.AdminTenantTopup(admin, "tdebt", TenantTopupRequest{AmountSen: 400_000, PaymentReference: "BANK-1"})
	if err != nil {
		t.Fatal(err)
	}
	gross, _ := repository.TopupMicrocredits(400_000)
	if view.DebtSettledMicrocredits != feeMicro-1_000_000 || view.Lot.AmountMicrocredits != gross-view.DebtSettledMicrocredits {
		t.Fatalf("top-up must settle the debt first: %#v", view.TenantTopupResult)
	}
	// tdebt 之前只有调账批次，这是首次转账充值，低于 RM 5,000 只提示。
	if !view.BelowFirstTopupMinimum || view.Warning == "" {
		t.Fatalf("first top-up below RM 5,000 must warn: %#v", view)
	}
	if pool, _ := svc.repo.TenantCreditAccount("tdebt"); pool.AvailableMicrocredits != view.Lot.AmountMicrocredits {
		t.Fatalf("pool after top-up: %#v", pool)
	}
	if debts, _ := svc.repo.TenantDebts("tdebt", true); len(debts) != 0 {
		t.Fatalf("debt must be settled: %#v", debts)
	}
	if _, err := svc.AdminTenantTopup(admin, "tdebt", TenantTopupRequest{AmountSen: 400_000, PaymentReference: "bank-1"}); err == nil {
		t.Fatal("the same payment reference must not be credited twice")
	}
	second, err := svc.AdminTenantTopup(admin, "tdebt", TenantTopupRequest{AmountSen: 100_000, PaymentReference: "BANK-2"})
	if err != nil || second.BelowFirstTopupMinimum {
		t.Fatalf("only the first top-up warns: %#v %v", second, err)
	}
}

func TestTenantPoolAlertsOncePerThreshold(t *testing.T) {
	f := newTenantBillingFixture(t, 15)
	f.db.Create(&model.User{ID: "ta", TenantID: testAgencyID, Username: "ta", Email: "owner@agency.test", Role: model.UserRoleTenantAdmin, Status: model.UserStatusActive})
	var sent []string
	f.svc.tenantNoticeEmailHook = func(recipient string, content auth.EmailContent) error {
		sent = append(sent, recipient+"|"+content.Heading)
		return nil
	}
	admin := &model.User{ID: "platform-admin", TenantID: model.PlatformTenantID, Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	f.db.Create(admin)
	view, err := f.svc.AdminTenantTopup(admin, testAgencyID, TenantTopupRequest{AmountSen: 773, PaymentReference: "REF"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err := f.svc.SendTenantPoolAlerts(now); err != nil || len(sent) != 0 {
		t.Fatalf("full pool must not alert: %v %v", sent, err)
	}
	if _, err := f.svc.repo.AdjustTenantPool(testAgencyID, -(view.Lot.AmountMicrocredits * 9 / 10), "use", "admin", now); err != nil {
		t.Fatal(err)
	}
	f.svc.SendTenantPoolAlerts(now)
	f.svc.SendTenantPoolAlerts(now)
	if len(sent) != 1 || !strings.Contains(sent[0], "running low") {
		t.Fatalf("low balance alert once: %v", sent)
	}
	pool := f.pool(t)
	if _, err := f.svc.repo.AdjustTenantPool(testAgencyID, -pool.AvailableMicrocredits, "use", "admin", now); err != nil {
		t.Fatal(err)
	}
	f.svc.SendTenantPoolAlerts(now)
	f.svc.SendTenantPoolAlerts(now)
	if len(sent) != 2 || !strings.Contains(sent[1], "empty") {
		t.Fatalf("zero balance alert once: %v", sent)
	}
	f.fundPool(t, 1_000_000)
	later := now.AddDate(0, 12, -20)
	f.svc.SendTenantPoolAlerts(later)
	f.svc.SendTenantPoolAlerts(later.AddDate(0, 0, 14))
	f.svc.SendTenantPoolAlerts(later.AddDate(0, 0, 14))
	expiry := 0
	for _, item := range sent {
		if strings.Contains(item, "expiring") {
			expiry++
		}
	}
	if expiry != 2 {
		t.Fatalf("30-day and 7-day expiry reminders once each, got %v", sent)
	}
}

func TestTenantAdminOnlyReachesOwnTenant(t *testing.T) {
	f := newTenantBillingFixture(t, 15)
	f.db.Create(&model.Tenant{ID: "agency-b", Slug: "agency-b", Name: "B", Status: model.TenantStatusActive})
	admin := &model.User{ID: "ta", TenantID: testAgencyID, Role: model.UserRoleTenantAdmin}
	own, _ := f.svc.repo.Tenant(testAgencyID)
	other, _ := f.svc.repo.Tenant("agency-b")
	if _, err := f.svc.TenantPoolOverview(admin, *own); err != nil {
		t.Fatal(err)
	}
	var appErr *AuthError
	if _, err := f.svc.TenantPoolOverview(admin, *other); !errors.As(err, &appErr) {
		t.Fatalf("tenant admin must not read another tenant: %v", err)
	}
	if _, err := f.svc.AdminTenantPools(admin); err == nil {
		t.Fatal("tenant admin must not use platform APIs")
	}
	customer := &model.User{ID: testAgencyUser, TenantID: testAgencyID, Role: model.UserRoleUser}
	if _, err := f.svc.TenantRetailPrices(customer, *own); err == nil {
		t.Fatal("customers must not manage prices")
	}
}
