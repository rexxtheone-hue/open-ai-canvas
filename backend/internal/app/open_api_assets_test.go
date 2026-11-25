package app

import "testing"

func TestOpenAPIUsedReferences(t *testing.T) {
	s := &Service{}
	input := `{"prompt":"x","referenceImages":[{"storageKey":"resource:img1","name":"KF4.png"},{"url":"https://example.com/web.png"},{"storageKey":"resource:img2","role":"first_frame"}],"referenceAudios":[{"storageKey":"resource:aud1","name":"adam young.mp3"}]}`
	refs := s.openAPIUsedReferences(input)
	if len(refs) != 3 {
		t.Fatalf("refs = %+v", refs)
	}
	if refs[0].ID != "img1" || refs[0].Kind != "image" || refs[0].Name != "KF4.png" {
		t.Fatalf("first = %+v", refs[0])
	}
	if refs[1].ID != "img2" || refs[1].Role != "first_frame" {
		t.Fatalf("second = %+v", refs[1])
	}
	if refs[2].ID != "aud1" || refs[2].Kind != "audio" {
		t.Fatalf("audio = %+v", refs[2])
	}
	if got := s.openAPIUsedReferences(""); len(got) != 0 {
		t.Fatalf("empty input = %+v", got)
	}
}
