package app

import (
	"testing"
	"time"

	"yingce/backend/internal/model"
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
