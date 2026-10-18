package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestChannelModelCostSourceConvertsToCreditsAndFollowsRateChanges(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel", Scope: model.ChannelScopeSystem, Name: "fal", Enabled: true, ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateBillingCurrencySetting(admin, BillingCurrencySetting{CreditValue: 0.01, Rates: map[string]float64{"usd": 4.4, "CNY": 0.62}}); err != nil {
		t.Fatal(err)
	}
	req := ChannelModelRequest{
		ModelKey: "model-a", DisplayName: "模型", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "model-a"),
		PriceTiers: []ChannelModelPriceTierRequest{{
			BillingMode: "fixed_request", UnitPriceMicrocredits: 30_000_000, PriceConfigured: true,
			// $0.05 / 次，客户端提交的积分值必须被忽略。
			CostPricing: model.CreditCostPricing{Configured: true, UnitPriceMicrocredits: 1},
			CostSource:  model.CostSourcePricing{Currency: "usd", UnitPrice: 50_000},
		}},
	}
	saved, err := svc.SaveAdminChannelModel(admin, channel.ID, "", req)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := svc.AdminChannelModels(admin, channel.ID)
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows = %#v, err = %v", rows, err)
	}
	tier := rows[0].PriceTiers[0]
	// 0.05 USD × 4.4 = RM0.22 = 22 积分。
	if tier.CostSource.Currency != "USD" || tier.CostSource.UnitPrice != 50_000 || tier.CostPricing.UnitPriceMicrocredits != 22_000_000 || !tier.CostPricing.Configured {
		t.Fatalf("tier cost = %#v / %#v", tier.CostPricing, tier.CostSource)
	}

	setting, err := svc.UpdateBillingCurrencySetting(admin, BillingCurrencySetting{CreditValue: 0.01, Rates: map[string]float64{"USD": 4.0, "CNY": 0.62}})
	if err != nil || setting.Recomputed != 1 {
		t.Fatalf("setting = %#v, err = %v", setting, err)
	}
	rows, _ = svc.AdminChannelModels(admin, channel.ID)
	tier = rows[0].PriceTiers[0]
	if tier.CostPricing.UnitPriceMicrocredits != 20_000_000 || tier.UnitPriceMicrocredits != 30_000_000 || tier.PriceVersion != saved.PriceTiers[0].PriceVersion {
		t.Fatalf("after rate change = %#v", tier)
	}

	req.PriceTiers[0].CostSource = model.CostSourcePricing{}
	req.PriceTiers[0].CostPricing = model.CreditCostPricing{Configured: true, UnitPriceMicrocredits: 7_000_000}
	if _, err := svc.SaveAdminChannelModel(admin, channel.ID, saved.ID, req); err != nil {
		t.Fatal(err)
	}
	rows, _ = svc.AdminChannelModels(admin, channel.ID)
	if tier = rows[0].PriceTiers[0]; tier.CostSource.Currency != "" || tier.CostPricing.UnitPriceMicrocredits != 7_000_000 {
		t.Fatalf("credit cost = %#v / %#v", tier.CostPricing, tier.CostSource)
	}
}

func TestBillingCurrencySettingValidation(t *testing.T) {
	cases := []BillingCurrencySetting{
		{CreditValue: 0, Rates: map[string]float64{"USD": 4, "CNY": 0.6}},
		{CreditValue: 0.01, Rates: map[string]float64{"USD": 4}},
		{CreditValue: 0.01, Rates: map[string]float64{"USD": 4, "CNY": 0.6, "EUR": 5}},
		{CreditValue: 0.01, Rates: map[string]float64{"USD": -1, "CNY": 0.6}},
	}
	for _, value := range cases {
		if err := validateBillingCurrencySetting(normalizeBillingCurrencySetting(value)); err == nil {
			t.Fatalf("accepted %#v", value)
		}
	}
	if _, err := normalizeCostSource(model.CostSourcePricing{Currency: "EUR", UnitPrice: 1}); err == nil {
		t.Fatal("accepted EUR cost source")
	}
	var cost model.CreditCostPricing
	// ¥1 / 百万 Token × 0.62 ÷ 0.01 = 62 积分 / 百万 Token；RM 成本按 1:1。
	if err := defaultBillingCurrencySetting().applyCostSource(&cost, model.CostSourcePricing{Currency: "MYR", InputTokenPrice: 1_000_000}); err != nil || cost.InputTokenPriceMicrocredits != 100_000_000 {
		t.Fatalf("MYR cost = %#v, err = %v", cost, err)
	}
}
