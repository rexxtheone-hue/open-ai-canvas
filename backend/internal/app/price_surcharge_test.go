package app

import (
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestVideoPriceSurchargeAndReferenceVideoTier(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}); err != nil {
		t.Fatal(err)
	}
	item := model.ChannelModel{ID: "cm", ChannelID: "ch", ModelKey: "MiniMax-H3", Capability: "video", Enabled: true, PriceConfigured: true}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	tiers := []model.ChannelModelPriceTier{
		{ID: "base", ChannelModelID: "cm", SelectorKey: `{}`, SelectorJSON: `{}`, Resolution: "*", BillingMode: "per_second", UnitPriceMicrocredits: 10_000_000, Enabled: true, PriceConfigured: true,
			Surcharge:   model.PriceSurcharge{FreeImages: 5, ImagePriceMicrocredits: 4_000_000, VideoSecondPriceMicrocredits: 13_000_000},
			CostPricing: model.CreditCostPricing{Configured: true, UnitPriceMicrocredits: 8_000_000, ExtraImagePriceMicrocredits: 3_000_000, ExtraVideoSecondPriceMicrocredits: 11_000_000}},
		{ID: "omni-video", ChannelModelID: "cm", SelectorKey: `{"operation":"reference_to_video","videoInput":"true"}`, SelectorJSON: `{"operation":"reference_to_video","videoInput":"true"}`, Resolution: "*", BillingMode: "per_second", UnitPriceMicrocredits: 30_000_000, Enabled: true, PriceConfigured: true},
		{ID: "omni", ChannelModelID: "cm", SelectorKey: `{"operation":"reference_to_video","videoInput":"false"}`, SelectorJSON: `{"operation":"reference_to_video","videoInput":"false"}`, Resolution: "*", BillingMode: "per_second", UnitPriceMicrocredits: 20_000_000, Enabled: true, PriceConfigured: true},
	}
	if err := db.Create(&tiers).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	order := func(operation string, images int, videos []any) *model.BillingOrder {
		t.Helper()
		input := map[string]any{"mode": "video", "referenceImages": make([]any, images), "referenceVideos": videos, "config": map[string]any{"channelId": "ch", "model": "MiniMax-H3", "videoSeconds": 5}}
		intent := ModelRequestIntentFromTaskInput(input, "canvas_video", operation)
		result, err := svc.newBillingOrderWithPriceTier("u1", "t1", "k", "ch", "MiniMax-H3", "video", "test", 5, estimateTaskBillingTokens(input, "video"), "", intent)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}

	plain := order("", 7, nil)
	// 5 秒 × 10 + (7-5) 张 × 4 = 58 积分
	if plain.PriceTierID != "base" || plain.SurchargeImages != 2 || plain.AmountMicrocredits != 58_000_000 {
		t.Fatalf("plain = tier %s images %d amount %d", plain.PriceTierID, plain.SurchargeImages, plain.AmountMicrocredits)
	}
	withVideo := order("", 3, []any{map[string]any{"durationMs": 3500}, map[string]any{}})
	// 参考视频 3.5 秒 + 未知按 15 秒 = 19 秒；5 × 10 + 19 × 13 = 297 积分，3 张图未超出免费额度
	if withVideo.SurchargeImages != 0 || withVideo.SurchargeVideoSeconds != 19 || withVideo.AmountMicrocredits != 297_000_000 {
		t.Fatalf("withVideo = %+v", withVideo)
	}
	withVideo.Status = model.BillingStatusSettled
	cost, err := billingCreditCost(*withVideo)
	if err != nil || cost == nil || *cost != 5*8_000_000+19*11_000_000 {
		t.Fatalf("cost = %v, %v", cost, err)
	}
	if got := order("reference_to_video", 1, []any{map[string]any{"durationMs": 4000}}); got.PriceTierID != "omni-video" {
		t.Fatalf("omni with video tier = %s", got.PriceTierID)
	}
	if got := order("reference_to_video", 2, nil); got.PriceTierID != "omni" {
		t.Fatalf("omni without video tier = %s", got.PriceTierID)
	}
}
