package app

import "testing"

func TestAudioReferencePromptAddsMissingMarkers(t *testing.T) {
	if got := audioReferencePrompt("Hello there", 2); got != "@Audio1 @Audio2 Hello there" {
		t.Fatalf("got %q", got)
	}
	if got := audioReferencePrompt("@Audio1 says hello", 1); got != "@Audio1 says hello" {
		t.Fatalf("got %q", got)
	}
}

func TestSkillDescriptionFoldedBlock(t *testing.T) {
	skill := "---\nname: ugc-video\ndescription: >-\n  Produce a finished UGC video.\n  One format.\nworkflow: true\n---\n"
	if got := skillDescription(skill); got != "Produce a finished UGC video. One format." {
		t.Fatalf("got %q", got)
	}
}

func TestWorkflowPresetVoicesAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, voice := range workflowPresetVoices {
		if voice.ID == "" || seen[voice.ID] {
			t.Fatalf("bad or duplicate voice %q", voice.ID)
		}
		seen[voice.ID] = true
	}
	if len(seen) < 50 {
		t.Fatalf("only %d voices", len(seen))
	}
}

func TestDeclaredPresetKeepsWideRatioSpelling(t *testing.T) {
	profile := DefaultModelCapabilityConfigForModel("openai-image", "GPT Image 2.6")
	profile.Image.Size = ImageSizeConfig{Parameter: "aspect_ratio", Values: []string{"16:9", "21:9"}, Default: "16:9",
		Presets: []ImageSizePreset{{Tier: "2k", Ratio: "21:9", Size: "3136x1344", Width: 3136, Height: 1344}}}
	if got := imageSizeValueForDeclaredPreset(profile.Image, "21:9", "2k"); got != "21:9" {
		t.Fatalf("21:9 was sent as %q", got)
	}
}
