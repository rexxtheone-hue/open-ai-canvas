package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTenantMiddlewareScopesSessionsToTheirSite(t *testing.T) {
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
		&model.Tenant{ID: "agency-a", Slug: "agency-a", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "d1", TenantID: "agency-a", Host: "studio.agency-a.com"},
		&model.Tenant{ID: "agency-off", Slug: "agency-off", Status: model.TenantStatusSuspended},
		&model.TenantDomain{ID: "d2", TenantID: "agency-off", Host: "studio.off.com"},
		&model.User{ID: "platform-user", Username: "platform-user", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.User{ID: "agency-user", TenantID: "agency-a", Username: "agency-user", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "s-platform", UserID: "platform-user", TokenHash: auth.HashToken("t"), ExpiresAt: time.Now().Add(time.Hour)},
		&model.AuthSession{ID: "s-agency", UserID: "agency-user", TokenHash: auth.HashToken("t"), ExpiresAt: time.Now().Add(time.Hour)},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	router.Use(TenantMiddleware(svc))
	router.GET("/whoami", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.String(http.StatusOK, requestTenant(c).ID+"/"+user.ID)
	})
	call := func(host, session string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/whoami", nil)
		r.Host = host
		r.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session + ".t"})
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	if w := call("omnimuse.io", "s-platform"); w.Code != http.StatusOK || w.Body.String() != "omnimuse/platform-user" {
		t.Fatalf("platform user on platform site: %d %s", w.Code, w.Body.String())
	}
	if w := call("studio.agency-a.com", "s-agency"); w.Code != http.StatusOK || w.Body.String() != "agency-a/agency-user" {
		t.Fatalf("agency user on agency site: %d %s", w.Code, w.Body.String())
	}
	if w := call("studio.agency-a.com", "s-platform"); w.Code != http.StatusUnauthorized {
		t.Fatalf("a platform session must not work on an agency site: %d %s", w.Code, w.Body.String())
	}
	if w := call("omnimuse.io", "s-agency"); w.Code != http.StatusUnauthorized {
		t.Fatalf("an agency session must not work on the platform site: %d %s", w.Code, w.Body.String())
	}
	if w := call("studio.off.com", "s-agency"); w.Code != http.StatusForbidden {
		t.Fatalf("a suspended agency site is closed: %d %s", w.Code, w.Body.String())
	}
}

func TestLoginOnlyFindsAccountsOfTheRequestSite(t *testing.T) {
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
	platformHash, _ := auth.HashPassword("platform-password")
	agencyHash, _ := auth.HashPassword("agency-password")
	for _, record := range []any{
		&model.Tenant{ID: "agency-a", Slug: "agency-a", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "d1", TenantID: "agency-a", Host: "studio.agency-a.com"},
		&model.User{ID: "platform-same", Username: "same", Email: "same@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive, PasswordHash: platformHash},
		&model.User{ID: "agency-same", TenantID: "agency-a", Username: "same", Email: "same@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive, PasswordHash: agencyHash},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	previous := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { runtimeService = previous })
	router := gin.New()
	router.Use(TenantMiddleware(svc))
	RegisterAuthRoutes(router.Group("/api"), svc)
	login := func(host, password string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"same@example.com","password":"`+password+`"}`))
		r.Host = host
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	if w := login("studio.agency-a.com", "agency-password"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"id":"agency-same"`) {
		t.Fatalf("agency login on agency site: %d %s", w.Code, w.Body.String())
	}
	if w := login("omnimuse.io", "platform-password"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"id":"platform-same"`) {
		t.Fatalf("platform login on platform site: %d %s", w.Code, w.Body.String())
	}
	if w := login("omnimuse.io", "agency-password"); w.Code != http.StatusUnauthorized {
		t.Fatalf("agency credentials must fail on the platform site: %d %s", w.Code, w.Body.String())
	}
	if w := login("studio.agency-a.com", "platform-password"); w.Code != http.StatusUnauthorized {
		t.Fatalf("platform credentials must fail on an agency site: %d %s", w.Code, w.Body.String())
	}
}
