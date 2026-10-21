package app

import (
	"encoding/json"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestGeminiImageUsageSplitsImageAndThinkingTokens(t *testing.T) {
	var payload map[string]any
	_ = json.Unmarshal([]byte(`{"usageMetadata":{"promptTokenCount":14,"candidatesTokenCount":1393,"thoughtsTokenCount":951,"candidatesTokensDetails":[{"modality":"IMAGE","tokenCount":1120}]}}`), &payload)
	log := model.ApiCallLog{Capability: "image", Status: model.ApiCallStatusSucceeded}
	(&Service{}).enrichAPICallLogPayload(&log, payload)
	if !log.UsageAvailable || log.InputTokens != 14 || log.ImageTokens != 1120 || log.OutputTokens != 273+951 {
		t.Fatalf("usage = in %d out %d image %d available %v", log.InputTokens, log.OutputTokens, log.ImageTokens, log.UsageAvailable)
	}
}

func TestImageTokenTierReservesByResolution(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}); err != nil {
		t.Fatal(err)
	}
	item := model.ChannelModel{ID: "cm", ChannelID: "ch", ModelKey: "gemini-nano-banana-2.1", Capability: "image", Enabled: true, PriceConfigured: true}
	tier := model.ChannelModelPriceTier{ID: "t", ChannelModelID: "cm", SelectorKey: `{}`, SelectorJSON: `{}`, Resolution: "*", BillingMode: "token",
		InputTokenPriceMicrocredits: 1_000_000_000, OutputTokenPriceMicrocredits: 2_000_000_000, ImageTokenPriceMicrocredits: 10_000_000_000, Enabled: true, PriceConfigured: true}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&tier).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	for _, tc := range []struct {
		resolution string
		images     int64
	}{{"1k", 1120}, {"2k", 1680}, {"4k", 3780}} {
		input := map[string]any{"mode": "image", "prompt": "mug", "referenceImages": []any{map[string]any{}}, "config": map[string]any{"channelId": "ch", "model": "gemini-nano-banana-2.1", "quality": tc.resolution}}
		estimate := estimateTaskBillingTokens(input, "image")
		order, err := svc.newBillingOrderWithPriceTier("u", "t", "k", "ch", "gemini-nano-banana-2.1", "image", "test", 1, estimate, "")
		if err != nil {
			t.Fatal(err)
		}
		// 输入 1 + 1120 Token × 1000 积分/百万，输出 2000 × 2000，图片 N × 10000（单位：积分/百万 Token）。
		want := (estimate.InputTokens*1_000_000_000 + 2000*2_000_000_000 + tc.images*10_000_000_000 + 999_999) / 1_000_000
		if estimate.ImageTokens != tc.images || order.ImageTokenPriceMicrocredits != 10_000_000_000 || order.AmountMicrocredits < want-2 || order.AmountMicrocredits > want+2 {
			t.Fatalf("%s: estimate %+v amount %d want ~%d", tc.resolution, estimate, order.AmountMicrocredits, want)
		}
	}
}
