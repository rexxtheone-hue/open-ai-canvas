package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func developerAPIFixture(t *testing.T) (*gin.Engine, *gorm.DB, string) {
	t.Helper()
	_, db, cookie := profileHandlerFixture(t)
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	router := gin.New()
	api := router.Group("/api")
	RegisterAuthRoutes(api, svc)
	RegisterDeveloperAPIRoutes(api, svc)
	return router, db, cookie
}

func bearerRequest(router http.Handler, method, path, body, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func createFixtureAPIToken(t *testing.T, router http.Handler, cookie string) (string, string) {
	t.Helper()
	rec := profileRequest(router, "POST", "/api/api-tokens", `{"name":"CLI"}`, cookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("create token status=%d body=%s", rec.Code, rec.Body.String())
	}
	var envelope struct {
		Data struct {
			Token struct {
				ID     string `json:"id"`
				Token  string `json:"token"`
				Prefix string `json:"prefix"`
			} `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	token := envelope.Data.Token
	if !strings.HasPrefix(token.Token, "om_") || !strings.HasPrefix(token.Token, token.Prefix) || len(token.Token) < 40 {
		t.Fatalf("unexpected token %+v", token)
	}
	return token.ID, token.Token
}

func TestDeveloperAPIAcceptsOnlyBearerTokens(t *testing.T) {
	router, db, cookie := developerAPIFixture(t)
	id, token := createFixtureAPIToken(t, router, cookie)

	if rec := bearerRequest(router, "GET", "/api/v1/me", "", token); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"username":"profile-user"`) {
		t.Fatalf("bearer /v1/me status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := profileRequest(router, "GET", "/api/v1/me", "", cookie); rec.Code != http.StatusUnauthorized {
		t.Fatalf("cookie must not authenticate /v1, status=%d", rec.Code)
	}
	if rec := bearerRequest(router, "GET", "/api/v1/me", "", "om_not-a-real-token"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unknown token status=%d", rec.Code)
	}
	// 密钥只能用在开放接口上，不能拿去管理密钥或改账号。
	if rec := bearerRequest(router, "GET", "/api/api-tokens", "", token); rec.Code != http.StatusUnauthorized {
		t.Fatalf("bearer must not authenticate session routes, status=%d", rec.Code)
	}
	if rec := bearerRequest(router, "GET", "/api/auth/profile", "", token); rec.Code != http.StatusUnauthorized {
		t.Fatalf("bearer must not authenticate profile, status=%d", rec.Code)
	}
	var stored model.APIToken
	if err := db.First(&stored, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.TokenHash != auth.HashToken(token) || strings.Contains(stored.TokenHash, token) {
		t.Fatal("token must be stored hashed")
	}

	if rec := profileRequest(router, "DELETE", "/api/api-tokens/"+id, "", cookie); rec.Code != http.StatusOK {
		t.Fatalf("revoke status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := bearerRequest(router, "GET", "/api/v1/me", "", token); rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoked token status=%d", rec.Code)
	}
}

func TestDeveloperAPIRejectsDisabledAccountAndForeignTenant(t *testing.T) {
	router, db, cookie := developerAPIFixture(t)
	_, token := createFixtureAPIToken(t, router, cookie)
	if err := db.Model(&model.User{}).Where("id = ?", "profile-user").Update("status", model.UserStatusDisabled).Error; err != nil {
		t.Fatal(err)
	}
	if rec := bearerRequest(router, "GET", "/api/v1/me", "", token); rec.Code != http.StatusForbidden {
		t.Fatalf("disabled account status=%d", rec.Code)
	}
	if err := db.Model(&model.User{}).Where("id = ?", "profile-user").Updates(map[string]any{"status": model.UserStatusActive, "tenant_id": "agency-a"}).Error; err != nil {
		t.Fatal(err)
	}
	if rec := bearerRequest(router, "GET", "/api/v1/me", "", token); rec.Code != http.StatusUnauthorized {
		t.Fatalf("token used on another tenant's site status=%d", rec.Code)
	}
}

func TestDeveloperAPIGenerationValidation(t *testing.T) {
	router, _, cookie := developerAPIFixture(t)
	_, token := createFixtureAPIToken(t, router, cookie)
	if rec := bearerRequest(router, "POST", "/api/v1/generations", `{"model":"missing-model","prompt":"a fox"}`, token); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown model status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := bearerRequest(router, "POST", "/api/v1/generations", `{"model":"","prompt":"a fox"}`, token); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing model status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := bearerRequest(router, "GET", "/api/v1/models?kind=text", "", token); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid kind status=%d", rec.Code)
	}
}
