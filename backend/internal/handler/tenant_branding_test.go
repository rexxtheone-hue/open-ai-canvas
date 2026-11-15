package handler

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// 漏出检查：代理商网址上的公开外观与 PWA 清单里不能出现平台品牌；平台网址保持原样。
func TestAgencyPublicAppearanceHasNoPlatformBrand(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, record := range []any{
		&model.Tenant{ID: "agency-a", Slug: "acme", Name: "Acme Studio", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "d1", TenantID: "agency-a", Host: "studio.acme.com", IsPrimary: true, SSLStatus: "active"},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	router.Use(TenantMiddleware(svc))
	RegisterAppearanceRoutes(router.Group("/api"), svc)
	get := func(host, path string) string {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		r.Host = host
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("%s%s status = %d body=%s", host, path, w.Code, w.Body.String())
		}
		return w.Body.String()
	}
	leak := regexp.MustCompile(`(?i)omnimuse`)
	for _, path := range []string{"/api/public/appearance", "/api/public/manifest.webmanifest"} {
		body := get("studio.acme.com", path)
		if n := len(leak.FindAllString(body, -1)); n != 0 {
			t.Fatalf("%s leaks the platform brand %d times: %s", path, n, body)
		}
		if !strings.Contains(body, "Acme Studio") {
			t.Fatalf("%s does not carry the agency brand: %s", path, body)
		}
	}
	if body := get("studio.acme.com", "/api/public/appearance"); !strings.Contains(body, `"isPlatform":false`) {
		t.Fatalf("agency appearance must say isPlatform=false: %s", body)
	}
	if body := get("omnimuse.io", "/api/public/appearance"); !strings.Contains(body, `"isPlatform":true`) || !strings.Contains(body, `"brandName":"OmniMuse"`) {
		t.Fatalf("platform appearance changed: %s", body)
	}
}
