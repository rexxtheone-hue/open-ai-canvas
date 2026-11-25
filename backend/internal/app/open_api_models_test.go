package app

import "testing"

func TestOpenAPIModelListFixes(t *testing.T) {
	channel := PublicChannelCatalog{ID: "CHANNEL_000010"}
	kling := PublicChannelModel{ID: "MODEL_000319", ModelKey: "kling-video-v3-omni", DisplayName: "Kling", ChannelLabel: "Kling v3 Omni", Capability: "video", PriceLabel: "按渠道规格计费", PriceTiers: []PublicChannelModelPriceTier{
		{Selector: map[string]string{"vquality": "720p", "videoGenerateAudio": "true", "videoInput": "false"}, BillingMode: "per_second", UnitPriceMicrocredits: 94_000_000},
		{Selector: map[string]string{"vquality": "720p", "videoGenerateAudio": "false", "videoInput": "false"}, BillingMode: "per_second", UnitPriceMicrocredits: 71_000_000},
	}}
	got := openAPIModelFromCatalog(channel, kling)
	if got.Name != "Kling v3 Omni" {
		t.Fatalf("name = %q, want full model name", got.Name)
	}
	if got.Price != "" || len(got.Prices) != 2 {
		t.Fatalf("price = %q, prices = %+v", got.Price, got.Prices)
	}
	if p := got.Prices[0]; p.Tier != "720p, with audio, no reference video" || p.Credits != 94 || p.Unit != "credits per output second" {
		t.Fatalf("first tier = %+v", p)
	}
	if p := got.Prices[1]; p.Tier != "720p, silent, no reference video" || p.Credits != 71 {
		t.Fatalf("second tier = %+v", p)
	}

	seedance := PublicChannelModel{DisplayName: "Seedance 2.5", ChannelLabel: "Seedance 2.5 Flash", PriceTiers: []PublicChannelModelPriceTier{{Selector: map[string]string{"videoInput": "false"}, BillingMode: "token"}}}
	if p := openAPIModelFromCatalog(channel, seedance).Prices[0]; p.Credits != 0 || p.Unit != "billed by tokens; call estimate_cost for the exact price" {
		t.Fatalf("token tier = %+v", p)
	}
	image := PublicChannelModel{DisplayName: "Nano Banana 2.1", Capability: "image", PriceTiers: []PublicChannelModelPriceTier{{Selector: map[string]string{"imageResolution": "2k"}, BillingMode: "fixed_request", UnitPriceMicrocredits: 40_000_000}}}
	if m := openAPIModelFromCatalog(channel, image); m.Name != "Nano Banana 2.1" || m.Prices[0].Tier != "2k" || m.Prices[0].Credits != 40 || m.Prices[0].Unit != "credits per generation" {
		t.Fatalf("image model = %+v", m)
	}

	upscale := PublicChannelModel{PriceTiers: []PublicChannelModelPriceTier{{Selector: map[string]string{"operation": "video_upscale"}}}}
	motion := PublicChannelModel{PriceTiers: []PublicChannelModelPriceTier{{Selector: map[string]string{"operation": "motion_transfer", "vquality": "1080p"}}}}
	if !openAPIProcessingOnly(upscale) || !openAPIProcessingOnly(motion) {
		t.Fatal("upscale and motion transfer must be hidden from generation models")
	}
	if openAPIProcessingOnly(kling) || openAPIProcessingOnly(PublicChannelModel{}) {
		t.Fatal("normal generation models must stay listed")
	}
}
