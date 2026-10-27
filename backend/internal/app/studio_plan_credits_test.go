package app

import (
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/payment"
	"yingce/backend/internal/repository"
)

func TestMonthlyPlanCreditsExpireAndRoll(t *testing.T) {
	_, db := newStudioTestService(t)
	repo := repository.New(db)
	plan := model.StudioPlan{ID: "plan-starter", Name: "Starter", DurationDays: 30, MonthlyCreditsMicrocredits: 2_500_000_000, Enabled: true}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatal(err)
	}
	// 用户原本有 1,000 充值积分，会员积分月底清零时不能被扣掉。
	if err := db.Create(&model.CreditAccount{UserID: "user-a", AvailableMicrocredits: 1_000_000_000}).Error; err != nil {
		t.Fatal(err)
	}
	order := model.PaymentOrder{ID: "o1", UserID: "user-a", IdempotencyKey: "o1", MerchantOrderNo: "m-o1", ProductID: "prod", ProductName: "Starter 年付", ProviderID: "stripe-checkout",
		AmountFen: 59900, Currency: "MYR", CreditsMicrocredits: plan.MonthlyCreditsMicrocredits, Status: model.PaymentOrderPending, PlanID: plan.ID, PlanMonths: 12}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := repo.CompletePaymentOrder(order.ProviderID, order.MerchantOrderNo, repository.PaymentEvidence{ProviderTradeNo: "cs_1", AmountFen: 59900, Currency: "MYR"}); err != nil {
		t.Fatal(err)
	}
	membership, _ := repo.UserMembership("user-a")
	if membership.GrantsRemaining != 11 || membership.PeriodCreditsMicrocredits != plan.MonthlyCreditsMicrocredits || membership.PeriodEndsAt == nil {
		t.Fatalf("unexpected membership after purchase %+v", membership)
	}
	months := membership.ExpiresAt.Sub(time.Now()).Hours() / 24 / 30
	if months < 11.9 || months > 12.3 {
		t.Fatalf("annual plan must last about 12 months, got %.2f", months)
	}
	// 本月消费 2,000（全部来自会员积分），剩余 500 会员积分 + 1,000 充值积分。
	spendAt := membership.PeriodStartedAt.Add(time.Minute)
	if err := db.Create(&model.CreditLedgerEntry{ID: "spend", UserID: "user-a", Type: model.CreditLedgerReserve, AvailableDeltaMicrocredits: -2_000_000_000, CreatedAt: spendAt}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditAccount{}).Where("user_id = ?", "user-a").Update("available_microcredits", 1_500_000_000).Error; err != nil {
		t.Fatal(err)
	}
	due := membership.PeriodEndsAt.Add(time.Second)
	if ids, err := repo.DuePlanCreditPeriods(due, 10); err != nil || len(ids) != 1 {
		t.Fatalf("expected one due period, got %v %v", ids, err)
	}
	if err := repo.RollPlanCreditPeriod("user-a", due); err != nil {
		t.Fatal(err)
	}
	var account model.CreditAccount
	db.First(&account, "user_id = ?", "user-a")
	// 1,500 − 500（清零）+ 2,500（下个月）= 3,500
	if account.AvailableMicrocredits != 3_500_000_000 {
		t.Fatalf("expected 3,500 credits after roll, got %d", account.AvailableMicrocredits)
	}
	membership, _ = repo.UserMembership("user-a")
	if membership.GrantsRemaining != 10 || membership.PeriodCreditsMicrocredits != plan.MonthlyCreditsMicrocredits {
		t.Fatalf("unexpected membership after roll %+v", membership)
	}
	// 重复执行不会重复发放。
	if err := repo.RollPlanCreditPeriod("user-a", due); err != nil {
		t.Fatal(err)
	}
	db.First(&account, "user_id = ?", "user-a")
	if account.AvailableMicrocredits != 3_500_000_000 {
		t.Fatalf("second roll must be a no-op, got %d", account.AvailableMicrocredits)
	}
	// 最后一个月结束：会员积分清零，充值积分保留，不再发放。
	if err := db.Model(&model.UserMembership{}).Where("user_id = ?", "user-a").Update("grants_remaining", 0).Error; err != nil {
		t.Fatal(err)
	}
	membership, _ = repo.UserMembership("user-a")
	final := membership.PeriodEndsAt.Add(time.Second)
	if err := repo.RollPlanCreditPeriod("user-a", final); err != nil {
		t.Fatal(err)
	}
	db.First(&account, "user_id = ?", "user-a")
	if account.AvailableMicrocredits != 1_000_000_000 {
		t.Fatalf("only top-up credits should remain, got %d", account.AvailableMicrocredits)
	}
	membership, _ = repo.UserMembership("user-a")
	if membership.PeriodEndsAt != nil {
		t.Fatalf("period must close after last month %+v", membership)
	}
}

func TestMembersOnlyAndPlanMonthsProductValidation(t *testing.T) {
	product, err := topupProductFromRequest("p1", "admin", TopupProductRequest{Name: "Pro 年付", AmountFen: 199900, Currency: "MYR", PlanID: "plan-pro", PlanMonths: 12})
	if err != nil || product.PlanMonths != 12 || product.CreditsMicrocredits != 0 {
		t.Fatalf("plan-months product must not need credits: %+v %v", product, err)
	}
	if _, err := topupProductFromRequest("p2", "admin", TopupProductRequest{Name: "无套餐", AmountFen: 100, PlanMonths: 1}); err == nil {
		t.Fatal("plan months without plan must be rejected")
	}
	pack, err := topupProductFromRequest("p3", "admin", TopupProductRequest{Name: "加购", AmountFen: 5000, CreditsMicrocredits: 3_300_000_000, Currency: "MYR", MembersOnly: true})
	if err != nil || !pack.MembersOnly {
		t.Fatalf("members-only pack %+v %v", pack, err)
	}
}

func TestSubscriptionRenewalGrantsNextPeriodOnce(t *testing.T) {
	svc, db := newStudioTestService(t)
	repo := repository.New(db)
	plan := model.StudioPlan{ID: "plan-pro", Name: "Pro", DurationDays: 30, MonthlyCreditsMicrocredits: 14_000_000_000, Enabled: true}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatal(err)
	}
	order := model.PaymentOrder{ID: "o1", UserID: "user-a", IdempotencyKey: "o1", MerchantOrderNo: "m-o1", ProductID: "prod", ProductName: "Pro 月付", ProviderID: "stripe-checkout",
		AmountFen: 19900, Currency: "MYR", CreditsMicrocredits: plan.MonthlyCreditsMicrocredits, Status: model.PaymentOrderPending, PlanID: plan.ID, PlanMonths: 1}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	first := payment.Result{MerchantOrderNo: "m-o1", ProviderTradeNo: "in_1", AmountFen: 19900, Currency: "MYR", Paid: true, SubscriptionID: "sub_1"}
	if _, err := svc.applyPaymentResult("stripe-checkout", first); err != nil {
		t.Fatal(err)
	}
	membership, _ := repo.UserMembership("user-a")
	if membership.SubscriptionID != "sub_1" || membership.SubscriptionOrderID != "o1" || membership.SubscriptionStatus != "active" {
		t.Fatalf("subscription not recorded %+v", membership)
	}
	// 有自动续费时多给 3 天宽限期。
	if days := membership.ExpiresAt.Sub(*membership.PeriodEndsAt).Hours() / 24; days < 2.9 || days > 3.1 {
		t.Fatalf("expected 3-day grace, got %.2f", days)
	}
	// 用掉 4,000 后续费：剩下 10,000 清零，发放新的 14,000。
	if err := db.Create(&model.CreditLedgerEntry{ID: "spend", UserID: "user-a", Type: model.CreditLedgerReserve, AvailableDeltaMicrocredits: -4_000_000_000, CreatedAt: membership.PeriodStartedAt.Add(time.Minute)}).Error; err != nil {
		t.Fatal(err)
	}
	db.Model(&model.CreditAccount{}).Where("user_id = ?", "user-a").Update("available_microcredits", 10_000_000_000)
	renewal := payment.Result{MerchantOrderNo: "m-o1", ProviderTradeNo: "in_2", AmountFen: 19900, Currency: "MYR", Paid: true, Renewal: true, SubscriptionID: "sub_1"}
	for range 2 {
		if _, err := svc.applyPaymentResult("stripe-checkout", renewal); err != nil {
			t.Fatal(err)
		}
	}
	var account model.CreditAccount
	db.First(&account, "user_id = ?", "user-a")
	if account.AvailableMicrocredits != 14_000_000_000 {
		t.Fatalf("renewal must reset to 14,000 credits, got %d", account.AvailableMicrocredits)
	}
	var renewals int64
	db.Model(&model.PaymentOrder{}).Where("renewal_of = ?", "o1").Count(&renewals)
	if renewals != 1 {
		t.Fatalf("expected one renewal order, got %d", renewals)
	}
	// 取消自动续费后去掉宽限期，本期照常用到期。
	before, _ := repo.UserMembership("user-a")
	if err := repo.SetSubscriptionStatus("sub_1", "canceling", time.Now()); err != nil {
		t.Fatal(err)
	}
	after, _ := repo.UserMembership("user-a")
	if after.SubscriptionStatus != "canceling" || before.ExpiresAt.Sub(after.ExpiresAt) != 72*time.Hour {
		t.Fatalf("cancel must drop grace: before %v after %+v", before.ExpiresAt, after)
	}
	view, err := svc.StudioMembership("user-a")
	if err != nil || view.AutoRenew != "canceling" {
		t.Fatalf("unexpected view %+v %v", view, err)
	}
}

func TestCreditLotsUsePlanFirstAndExpire(t *testing.T) {
	svc, db := newStudioTestService(t)
	repo := repository.New(db)
	plan := model.StudioPlan{ID: "plan-starter", Name: "Starter", DurationDays: 30, MonthlyCreditsMicrocredits: 2_500_000_000, Enabled: true}
	db.Create(&plan)
	start := time.Now().Add(-time.Hour)
	end := start.AddDate(0, 1, 0)
	db.Create(&model.UserMembership{UserID: "user-a", PlanID: plan.ID, StartedAt: start, ExpiresAt: end, PeriodCreditsMicrocredits: 2_500_000_000, MonthlyCreditsMicrocredits: 2_500_000_000, PeriodStartedAt: &start, PeriodEndsAt: &end})
	db.Create(&model.CreditAccount{UserID: "user-a", AvailableMicrocredits: 2_500_000_000})
	pack := model.PaymentOrder{ID: "pack", UserID: "user-a", IdempotencyKey: "pack", MerchantOrderNo: "m-pack", ProductID: "p", ProductName: "3,300 积分", ProviderID: "stripe-checkout",
		AmountFen: 5000, Currency: "MYR", CreditsMicrocredits: 3_300_000_000, Status: model.PaymentOrderPending, CreditValidMonths: 12}
	db.Create(&pack)
	if _, err := svc.applyPaymentResult("stripe-checkout", payment.Result{MerchantOrderNo: "m-pack", ProviderTradeNo: "pi_1", AmountFen: 5000, Currency: "MYR", Paid: true}); err != nil {
		t.Fatal(err)
	}
	// 消费 3,000：先用掉 2,500 会员积分，再用 500 加购积分。
	db.Create(&model.CreditLedgerEntry{ID: "spend", UserID: "user-a", Type: model.CreditLedgerReserve, AvailableDeltaMicrocredits: -3_000_000_000, CreatedAt: time.Now()})
	db.Model(&model.CreditAccount{}).Where("user_id = ?", "user-a").Update("available_microcredits", 2_800_000_000)
	lots, err := repo.ActiveCreditLots("user-a", time.Now())
	if err != nil || len(lots) != 1 || lots[0].RemainingMicrocredits != 2_800_000_000 {
		t.Fatalf("expected 2,800 remaining on the pack, got %+v %v", lots, err)
	}
	months := lots[0].ExpiresAt.Sub(time.Now()).Hours() / 24 / 30
	if months < 11.9 || months > 12.3 {
		t.Fatalf("pack must expire in about 12 months, got %.2f", months)
	}
	// 一年后到期：剩下的 2,800 清零。
	later := lots[0].ExpiresAt.Add(time.Minute)
	if users, _ := repo.DueCreditLotUsers(later, 10); len(users) != 1 {
		t.Fatalf("expected due lot user, got %v", users)
	}
	if err := repo.ExpireCreditLots("user-a", later); err != nil {
		t.Fatal(err)
	}
	var account model.CreditAccount
	db.First(&account, "user_id = ?", "user-a")
	if account.AvailableMicrocredits != 0 {
		t.Fatalf("expired pack must be removed, got %d", account.AvailableMicrocredits)
	}
}
