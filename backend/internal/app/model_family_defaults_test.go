package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestModelFamilyVideoDefaultsApplyToPluginProtocolsOnly(t *testing.T) {
	seedance := DefaultModelCapabilityConfigForModel("cloudwise-seedance", "dreamina-seedance-2-0-260128").Video
	if seedance.References.MaxVideos != 3 || seedance.References.MaxAudios != 3 || !seedance.GenerateAudio.Supported || seedance.Duration.Max != 15 {
		t.Fatalf("seedance 2 defaults = %#v", seedance)
	}
	h3max := DefaultModelCapabilityConfigForModel("cloudwise-minimax-video", "MiniMax-H3-Max").Video
	if h3max.References.MaxImages != 2 || h3max.References.MaxVideos != 0 || h3max.Resolutions[0] != "480P" {
		t.Fatalf("H3-Max defaults = %#v", h3max)
	}
	veo := DefaultModelCapabilityConfigForModel("cloudwise-unified-video", "veo-3.1-generate-preview").Video
	if veo.Duration.Selection != "enum" || len(veo.Duration.Values) != 3 || !veo.GenerateAudio.Supported {
		t.Fatalf("veo defaults = %#v", veo)
	}
	generic := DefaultModelCapabilityConfigForModel("cloudwise-unified-video", "unknown-model").Video
	if generic.References.MaxVideos != 0 || generic.GenerateAudio.Supported {
		t.Fatalf("unknown model changed: %#v", generic)
	}
	ark := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceVolcengineArkVideo), "doubao-seedance-2-0-260128").Video
	if ark.References.MaxVideoBytes != 200*1024*1024 {
		t.Fatalf("protocol-owned defaults overridden: %#v", ark.References)
	}
}
