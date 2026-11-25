package handler

import "testing"

func TestURLRefsAcceptAssetIDs(t *testing.T) {
	refs := urlRefs("image", []string{"https://example.com/a.png", "  ", "abc123", "resource:def456"}, "first_frame")
	if len(refs) != 3 {
		t.Fatalf("refs = %+v", refs)
	}
	if refs[0].URL != "https://example.com/a.png" || refs[0].ResourceID != "" {
		t.Fatalf("url ref = %+v", refs[0])
	}
	if refs[1].ResourceID != "abc123" || refs[1].URL != "" || refs[1].Role != "first_frame" || refs[1].Kind != "image" {
		t.Fatalf("asset ref = %+v", refs[1])
	}
	if refs[2].ResourceID != "def456" {
		t.Fatalf("prefixed asset ref = %+v", refs[2])
	}
}
