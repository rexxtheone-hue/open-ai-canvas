package helpkb

import (
	"strings"
	"testing"
)

func TestArticlesParsed(t *testing.T) {
	seen := map[string]bool{}
	for _, article := range Articles() {
		if article.ID == "" || article.Title == "" || article.Body == "" {
			t.Fatalf("article missing fields: %+v", article.ID)
		}
		if seen[article.ID] {
			t.Fatalf("duplicate article id %s", article.ID)
		}
		seen[article.ID] = true
		if strings.HasPrefix(article.Body, "---") {
			t.Fatalf("front matter not stripped in %s", article.ID)
		}
	}
	if len(seen) < 10 {
		t.Fatalf("expected at least 10 articles, got %d", len(seen))
	}
}

func TestForPage(t *testing.T) {
	ids := strings.Join(ForPage("/studio/create-video"), ",")
	if ids != "video" {
		t.Fatalf("create-video should map to video, got %s", ids)
	}
	if got := ForPage("/studio/unknown-page"); len(got) != 0 {
		t.Fatalf("unknown page should not match, got %v", got)
	}
}
