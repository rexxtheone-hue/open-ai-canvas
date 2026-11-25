package handler

import (
	"net/http"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestSitePreviewGivesCrawlersRealTitleAndImage(t *testing.T) {
	_, db, _ := profileHandlerFixture(t)
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	router := gin.New()
	RegisterStudioCommunityRoutes(router.Group("/api"), svc)
	rec := profileRequest(router, "GET", "/api/public/site-preview", "", "")
	body := rec.Body.String()
	if rec.Code != http.StatusOK || !strings.Contains(body, `<meta property="og:title" content="OmniMuse · AI video and image studio">`) || !strings.Contains(body, "/brand/og-image.jpg?v=3") {
		t.Fatalf("status=%d body=%s", rec.Code, body)
	}
	if strings.Contains(body, "正在加载") {
		t.Fatal("crawler page must not show the loading placeholder")
	}
}
