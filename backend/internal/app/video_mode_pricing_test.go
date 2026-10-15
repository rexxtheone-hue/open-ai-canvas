package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func videoPricingTier(id string, selectorJSON string, price int64) model.ChannelModelPriceTier {
	return model.ChannelModelPriceTier{ID: id, SelectorJSON: selectorJSON, UnitPriceMicrocredits: price, PriceConfigured: true, Enabled: true}
}

func TestVideoModePricingPrefersExclusiveTiers(t *testing.T) {
	channelModel := model.ChannelModel{Capability: "video", PriceTiers: []model.ChannelModelPriceTier{
		videoPricingTier("any-720", `{"vquality":"720p"}`, 4_000_000),
		videoPricingTier("v2v-720", `{"operation":"video_to_video","vquality":"720p"}`, 40_000_000),
		videoPricingTier("ref-720", `{"operation":"reference_to_video","vquality":"720p"}`, 6_000_000),
		videoPricingTier("extend-720", `{"operation":"extend","vquality":"720p"}`, 45_000_000),
		videoPricingTier("edit-720", `{"operation":"video_edit","vquality":"720p"}`, 50_000_000),
	}}
	intent := func(operation string, images, videos int) ModelRequestIntent {
		return ModelRequestIntent{Capability: "video", Operation: operation, Inputs: map[string]int{"image": images, "video": videos}, Options: map[string]any{"vquality": "720p"}}
	}
	cases := []struct {
		name   string
		intent ModelRequestIntent
		want   string
	}{
		{"全能参考有专属价格", intent("reference_to_video", 2, 1), "ref-720"},
		{"续写有专属价格", intent("extend", 0, 1), "extend-720"},
		{"局部修改归入视频编辑", intent("inpaint", 0, 1), "edit-720"},
		{"风格迁移也归入视频编辑", intent("style_transfer", 0, 1), "edit-720"},
		{"普通文生视频走通配", intent("text_to_video", 0, 0), "any-720"},
		{"图生视频走通配", intent("image_to_video", 1, 0), "any-720"},
	}
	for _, item := range cases {
		tier := channelModelPriceTierForIntent(channelModel, item.intent)
		if tier == nil || tier.ID != item.want {
			t.Fatalf("%s: got %#v, want %s", item.name, tier, item.want)
		}
	}
}

func TestVideoModePricingFallsBackWithoutExclusiveTiers(t *testing.T) {
	// 没有配置专属价格的旧模型：续写、全能参考仍按素材归类，行为与改动前一致。
	channelModel := model.ChannelModel{Capability: "video", PriceTiers: []model.ChannelModelPriceTier{
		videoPricingTier("any-720", `{"vquality":"720p"}`, 4_000_000),
		videoPricingTier("v2v-720", `{"operation":"video_to_video","vquality":"720p"}`, 40_000_000),
	}}
	for _, operation := range []string{"extend", "reference_to_video", "inpaint"} {
		tier := channelModelPriceTierForIntent(channelModel, ModelRequestIntent{Capability: "video", Operation: operation, Inputs: map[string]int{"video": 1}, Options: map[string]any{"vquality": "720p"}})
		if tier == nil || tier.ID != "v2v-720" {
			t.Fatalf("%s must fall back to video_to_video: %#v", operation, tier)
		}
	}
	imagesOnly := channelModelPriceTierForIntent(channelModel, ModelRequestIntent{Capability: "video", Operation: "reference_to_video", Inputs: map[string]int{"image": 3}, Options: map[string]any{"vquality": "720p"}})
	if imagesOnly == nil || imagesOnly.ID != "any-720" {
		t.Fatalf("image-only reference must fall back to wildcard: %#v", imagesOnly)
	}
	if !channelModelHasCompatiblePriceTier(channelModel, ModelRequestIntent{Capability: "video", Operation: "extend", Inputs: map[string]int{"video": 1}, Options: map[string]any{"vquality": "720p"}}) {
		t.Fatal("legacy-priced model must stay discoverable for extend")
	}
}

func TestVideoModePricingExclusiveOnlyModelIsDiscoverable(t *testing.T) {
	channelModel := model.ChannelModel{Capability: "video", PriceTiers: []model.ChannelModelPriceTier{
		videoPricingTier("extend-1080", `{"operation":"extend","vquality":"1080p"}`, 50_000_000),
	}}
	extend := ModelRequestIntent{Capability: "video", Operation: "extend", Inputs: map[string]int{"video": 1}, Options: map[string]any{"vquality": "1080p"}}
	if !channelModelHasCompatiblePriceTier(channelModel, extend) {
		t.Fatal("model priced only for extend must be discoverable for extend")
	}
	if tier := channelModelPriceTierForIntent(channelModel, extend); tier == nil || tier.ID != "extend-1080" {
		t.Fatalf("extend tier = %#v", tier)
	}
	if channelModelHasCompatiblePriceTier(channelModel, ModelRequestIntent{Capability: "video", Operation: "text_to_video", Options: map[string]any{"vquality": "1080p"}}) {
		t.Fatal("extend-only price must not make text-to-video billable")
	}
}

func TestSpecialtyVideoOperationsUseOwnPriceOrFallBack(t *testing.T) {
	channelModel := model.ChannelModel{Capability: "video", PriceTiers: []model.ChannelModelPriceTier{
		videoPricingTier("any-720", `{"vquality":"720p"}`, 4_000_000),
		videoPricingTier("v2v-720", `{"operation":"video_to_video","vquality":"720p"}`, 40_000_000),
		videoPricingTier("lip-720", `{"operation":"lip_sync","vquality":"720p"}`, 8_000_000),
	}}
	lipSync := ModelRequestIntent{Capability: "video", Operation: "lip_sync", Inputs: map[string]int{"image": 1, "audio": 1}, Options: map[string]any{"vquality": "720p"}}
	if tier := channelModelPriceTierForIntent(channelModel, lipSync); tier == nil || tier.ID != "lip-720" {
		t.Fatalf("lip_sync must use its own tier: %#v", tier)
	}
	// 没有专属价格的专项操作按素材归类，保证已上线模型的计价不变。
	upscale := ModelRequestIntent{Capability: "video", Operation: "video_upscale", Inputs: map[string]int{"video": 1}, Options: map[string]any{"vquality": "720p"}}
	if tier := channelModelPriceTierForIntent(channelModel, upscale); tier == nil || tier.ID != "v2v-720" {
		t.Fatalf("video_upscale without own tier must fall back: %#v", tier)
	}
	motion := ModelRequestIntent{Capability: "video", Operation: "motion_transfer", Inputs: map[string]int{"image": 1, "video": 1}, Options: map[string]any{"vquality": "720p"}}
	if tier := channelModelPriceTierForIntent(channelModel, motion); tier == nil || tier.ID != "v2v-720" {
		t.Fatalf("motion_transfer without own tier must fall back: %#v", tier)
	}
}
