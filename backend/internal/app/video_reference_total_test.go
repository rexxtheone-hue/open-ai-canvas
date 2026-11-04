package app

import "testing"

func TestVideoReferenceTotalError(t *testing.T) {
	refs := VideoReferenceConfig{MaxTotalVideoDuration: 15, MaxTotalAudioDuration: 15, MaxCombinedVideoDuration: 30}
	two := []providerMedia{{DurationMs: 15000}, {DurationMs: 14910}}
	if videoReferenceTotalError(refs, two, nil, 5) == "" {
		t.Fatal("29.9s of reference video should exceed the 15s total")
	}
	one := []providerMedia{{DurationMs: 15000}}
	if message := videoReferenceTotalError(refs, one, nil, 15); message != "" {
		t.Fatalf("15s reference + 15s output should pass, got %q", message)
	}
	if videoReferenceTotalError(refs, one, nil, 20) == "" {
		t.Fatal("15s reference + 20s output should exceed the 30s combined limit")
	}
	if message := videoReferenceTotalError(refs, nil, nil, 30); message != "" {
		t.Fatalf("text-only video should ignore the combined limit, got %q", message)
	}
	if videoReferenceTotalError(refs, nil, []providerMedia{{DurationMs: 10000}, {DurationMs: 8000}}, 5) == "" {
		t.Fatal("18s of reference audio should exceed the 15s total")
	}
	if message := videoReferenceTotalError(VideoReferenceConfig{}, two, nil, 30); message != "" {
		t.Fatalf("zero limits mean unlimited, got %q", message)
	}
}
