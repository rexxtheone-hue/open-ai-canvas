package handler

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func mcpFixture(t *testing.T) (*gin.Engine, string) {
	t.Helper()
	_, db, cookie := profileHandlerFixture(t)
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	router := gin.New()
	api := router.Group("/api")
	RegisterAuthRoutes(api, svc)
	RegisterDeveloperAPIRoutes(api, svc)
	RegisterMCPRoutes(router, api, svc)
	return router, cookie
}

func formRequest(router http.Handler, path string, form url.Values) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", path, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func mcpCall(router http.Handler, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/mcp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Mcp-Protocol-Version", "2025-06-18")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestMCPRequiresTokenAndAdvertisesOAuthMetadata(t *testing.T) {
	router, _ := mcpFixture(t)
	rec := mcpCall(router, "", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Header().Get("WWW-Authenticate"), "/.well-known/oauth-protected-resource/mcp") {
		t.Fatalf("status=%d www-authenticate=%q", rec.Code, rec.Header().Get("WWW-Authenticate"))
	}
	meta := profileRequest(router, "GET", "/.well-known/oauth-authorization-server", "", "")
	if meta.Code != http.StatusOK || !strings.Contains(meta.Body.String(), `"code_challenge_methods_supported":["S256"]`) || !strings.Contains(meta.Body.String(), "/api/oauth/register") {
		t.Fatalf("metadata status=%d body=%s", meta.Code, meta.Body.String())
	}
}

func TestMCPOAuthFlowListsToolsAndRotatesRefreshTokens(t *testing.T) {
	router, cookie := mcpFixture(t)
	redirect := "https://claude.ai/api/mcp/auth_callback"

	reg := profileRequest(router, "POST", "/api/oauth/register", `{"client_name":"Claude","redirect_uris":["`+redirect+`"],"token_endpoint_auth_method":"none"}`, "")
	if reg.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", reg.Code, reg.Body.String())
	}
	var client struct {
		ClientID string `json:"client_id"`
	}
	_ = json.Unmarshal(reg.Body.Bytes(), &client)
	if bad := profileRequest(router, "POST", "/api/oauth/register", `{"redirect_uris":["javascript:alert(1)"]}`, ""); bad.Code != http.StatusBadRequest {
		t.Fatalf("unsafe redirect must be rejected, status=%d", bad.Code)
	}

	verifier := strings.Repeat("v", 50)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	authorize := func(redirectURI string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]any{"clientId": client.ClientID, "redirectUri": redirectURI, "responseType": "code", "codeChallenge": challenge, "codeChallengeMethod": "S256", "state": "xyz", "approve": true})
		return profileRequest(router, "POST", "/api/oauth/authorize", string(body), cookie)
	}
	if rec := authorize("https://evil.example/callback"); rec.Code == http.StatusOK {
		t.Fatal("unregistered redirect must be rejected")
	}
	if rec := profileRequest(router, "POST", "/api/oauth/authorize", `{}`, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("authorize requires login, status=%d", rec.Code)
	}
	rec := authorize(redirect)
	if rec.Code != http.StatusOK {
		t.Fatalf("authorize status=%d body=%s", rec.Code, rec.Body.String())
	}
	var approved struct {
		Data struct {
			RedirectURL string `json:"redirectUrl"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &approved)
	callback, _ := url.Parse(approved.Data.RedirectURL)
	code := callback.Query().Get("code")
	if code == "" || callback.Query().Get("state") != "xyz" || !strings.HasPrefix(approved.Data.RedirectURL, redirect+"?") {
		t.Fatalf("redirect %q", approved.Data.RedirectURL)
	}

	exchange := url.Values{"grant_type": {"authorization_code"}, "client_id": {client.ClientID}, "code": {code}, "redirect_uri": {redirect}, "code_verifier": {"wrong-" + verifier}}
	if bad := formRequest(router, "/api/oauth/token", exchange); bad.Code != http.StatusBadRequest || !strings.Contains(bad.Body.String(), "invalid_grant") {
		t.Fatalf("wrong verifier status=%d body=%s", bad.Code, bad.Body.String())
	}
	// 授权码只能用一次：上面的失败尝试已经把它消耗掉了。
	rec = authorize(redirect)
	_ = json.Unmarshal(rec.Body.Bytes(), &approved)
	callback, _ = url.Parse(approved.Data.RedirectURL)
	exchange.Set("code", callback.Query().Get("code"))
	exchange.Set("code_verifier", verifier)
	tokenRec := formRequest(router, "/api/oauth/token", exchange)
	if tokenRec.Code != http.StatusOK {
		t.Fatalf("token status=%d body=%s", tokenRec.Code, tokenRec.Body.String())
	}
	var tokens service.OAuthTokenResponse
	_ = json.Unmarshal(tokenRec.Body.Bytes(), &tokens)
	if !strings.HasPrefix(tokens.AccessToken, "omo_") || !strings.HasPrefix(tokens.RefreshToken, "omr_") {
		t.Fatalf("tokens %+v", tokens)
	}
	if replay := formRequest(router, "/api/oauth/token", exchange); replay.Code != http.StatusBadRequest {
		t.Fatalf("code replay status=%d", replay.Code)
	}

	list := mcpCall(router, tokens.AccessToken, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "generate_video") || !strings.Contains(list.Body.String(), "get_generation") {
		t.Fatalf("tools/list status=%d body=%s", list.Code, list.Body.String())
	}
	if body := list.Body.String(); !strings.Contains(body, `"openai/outputTemplate":"`+mcpWidgetURI+`"`) || !strings.Contains(body, `"resourceUri":"`+mcpWidgetURI+`"`) {
		t.Fatalf("generation tools must link the result card: %s", body)
	}
	widget := mcpCall(router, tokens.AccessToken, `{"jsonrpc":"2.0","id":9,"method":"resources/read","params":{"uri":"`+mcpWidgetURI+`"}}`)
	if body := widget.Body.String(); widget.Code != http.StatusOK || !strings.Contains(body, `"mimeType":"text/html;profile=mcp-app"`) || !strings.Contains(body, "resourceDomains") || !strings.Contains(body, "ui/notifications/tool-result") {
		t.Fatalf("resources/read status=%d body=%.400s", widget.Code, body)
	}
	account := mcpCall(router, tokens.AccessToken, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_account","arguments":{}}}`)
	if account.Code != http.StatusOK || !strings.Contains(account.Body.String(), "profile-user") {
		t.Fatalf("get_account status=%d body=%s", account.Code, account.Body.String())
	}
	// OAuth 访问令牌同样能用开放接口，但不能用在登录会话接口上。
	if rec := bearerRequest(router, "GET", "/api/v1/me", "", tokens.AccessToken); rec.Code != http.StatusOK {
		t.Fatalf("oauth token on /v1 status=%d", rec.Code)
	}
	if rec := bearerRequest(router, "GET", "/api/oauth/connections", "", tokens.AccessToken); rec.Code != http.StatusUnauthorized {
		t.Fatalf("oauth token must not manage connections, status=%d", rec.Code)
	}

	refresh := url.Values{"grant_type": {"refresh_token"}, "client_id": {client.ClientID}, "refresh_token": {tokens.RefreshToken}}
	refreshed := formRequest(router, "/api/oauth/token", refresh)
	if refreshed.Code != http.StatusOK {
		t.Fatalf("refresh status=%d body=%s", refreshed.Code, refreshed.Body.String())
	}
	var rotated service.OAuthTokenResponse
	_ = json.Unmarshal(refreshed.Body.Bytes(), &rotated)
	if replay := formRequest(router, "/api/oauth/token", refresh); replay.Code != http.StatusBadRequest {
		t.Fatalf("refresh replay status=%d", replay.Code)
	}
	if rec := mcpCall(router, tokens.AccessToken, `{"jsonrpc":"2.0","id":3,"method":"tools/list"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("access token of rotated refresh must be revoked, status=%d", rec.Code)
	}
	if rec := mcpCall(router, rotated.AccessToken, `{"jsonrpc":"2.0","id":4,"method":"tools/list"}`); rec.Code != http.StatusOK {
		t.Fatalf("rotated access status=%d", rec.Code)
	}

	connections := profileRequest(router, "GET", "/api/oauth/connections", "", cookie)
	if connections.Code != http.StatusOK || !strings.Contains(connections.Body.String(), `"clientName":"Claude"`) {
		t.Fatalf("connections status=%d body=%s", connections.Code, connections.Body.String())
	}
	if rec := profileRequest(router, "DELETE", "/api/oauth/connections/"+client.ClientID, "", cookie); rec.Code != http.StatusOK {
		t.Fatalf("revoke status=%d", rec.Code)
	}
	if rec := mcpCall(router, rotated.AccessToken, `{"jsonrpc":"2.0","id":5,"method":"tools/list"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoked connection status=%d", rec.Code)
	}
}
