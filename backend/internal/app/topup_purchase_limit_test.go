package app

import (
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestTopupProductsHideStarterPackAfterPurchase(t *testing.T) {
	svc, db := newStudioTestService(t)
	starter := model.TopupProduct{ID: "starter", Name: "新手礼包", AmountFen: 9900, CreditsMicrocredits: 11_000_000_000, Enabled: true, Currency: "MYR",
		SaleStrategy: model.TopupSaleStrategyPeriodic, PeriodDays: 3650, PeriodPurchaseLimit: 1, CreditValidMonths: 12}
	regular := model.TopupProduct{ID: "regular", Name: "30,500 积分", AmountFen: 29900, CreditsMicrocredits: 30_500_000_000, Enabled: true, Currency: "MYR",
		SaleStrategy: model.TopupSaleStrategyUnlimited, CreditValidMonths: 12}
	for _, product := range []model.TopupProduct{starter, regular} {
		if err := db.Create(&product).Error; err != nil {
			t.Fatal(err)
		}
	}
	buyer := &model.User{ID: "buyer", Username: "buyer", Role: model.UserRoleUser, Status: model.UserStatusActive}
	fresh := &model.User{ID: "fresh", Username: "fresh", Role: model.UserRoleUser, Status: model.UserStatusActive}
	db.Create(buyer)
	db.Create(fresh)
	if err := db.Create(&model.PaymentOrder{ID: "o1", UserID: "buyer", IdempotencyKey: "o1", MerchantOrderNo: "m-o1", ProductID: "starter", ProviderID: "stripe-checkout",
		AmountFen: 9900, Currency: "MYR", CreditsMicrocredits: 11_000_000_000, Status: model.PaymentOrderCredited, CreatedAt: time.Now().Add(-time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	status := func(user *model.User) map[string]string {
		products, err := svc.TopupProducts(user)
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]string{}
		for _, product := range products {
			out[product.ID] = product.SaleStatus
			if (product.SaleStatus == "on_sale") != product.CanPurchase {
				t.Fatalf("canPurchase must follow sale status: %+v", product)
			}
		}
		return out
	}
	if got := status(buyer); got["starter"] != "purchase_limit" || got["regular"] != "on_sale" {
		t.Fatalf("buyer must no longer see the starter pack as purchasable, got %v", got)
	}
	if got := status(fresh); got["starter"] != "on_sale" {
		t.Fatalf("a new user can still buy the starter pack, got %v", got)
	}
	if got := status(nil); got["starter"] != "on_sale" || got["regular"] != "on_sale" {
		t.Fatalf("guests can see the packs on the pricing page, got %v", got)
	}
}
