package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type tokenResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	ExpiresIn        int    `json:"expires_in"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func randomString(bytes int) string {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}

func postForm(httpClient *http.Client, endpoint string, form url.Values) (*tokenResponse, error) {
	resp, err := httpClient.PostForm(endpoint, form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var tokens tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokens); err != nil {
		return nil, fmt.Errorf("unexpected token response (HTTP %d)", resp.StatusCode)
	}
	if tokens.Error != "" {
		return nil, fmt.Errorf("%s: %s", tokens.Error, tokens.ErrorDescription)
	}
	if tokens.AccessToken == "" {
		return nil, errors.New("no access token returned")
	}
	return &tokens, nil
}

func refreshTokens(httpClient *http.Client, host, clientID, refreshToken string) (*tokenResponse, error) {
	return postForm(httpClient, host+"/api/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {clientID}, "refresh_token": {refreshToken}})
}

func openBrowser(target string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", target).Start()
	case "darwin":
		return exec.Command("open", target).Start()
	default:
		return exec.Command("xdg-open", target).Start()
	}
}

const loginPage = `<!doctype html><meta charset="utf-8"><title>OmniMuse CLI</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#090a0a;color:#f4f4f5;font-family:system-ui,sans-serif">
<div style="text-align:center;max-width:420px;padding:24px"><h1 style="font-size:22px">%s</h1><p style="color:#a1a1aa">%s</p></div></body>`

// browserLogin 用本机回环地址完成 OAuth（PKCE）：注册客户端 → 打开授权页 → 接收回调 → 换取令牌。
func browserLogin(cfg *config) error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	redirectURI := fmt.Sprintf("http://127.0.0.1:%d/callback", listener.Addr().(*net.TCPAddr).Port)
	httpClient := &http.Client{Timeout: 30 * time.Second}

	hostname, _ := os.Hostname()
	registration, _ := json.Marshal(map[string]any{"client_name": "OmniMuse CLI (" + hostname + ")", "redirect_uris": []string{redirectURI}, "token_endpoint_auth_method": "none", "grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"}})
	resp, err := httpClient.Post(cfg.Host+"/api/oauth/register", "application/json", strings.NewReader(string(registration)))
	if err != nil {
		return fmt.Errorf("cannot reach %s: %w", cfg.Host, err)
	}
	var client struct {
		ClientID         string `json:"client_id"`
		ErrorDescription string `json:"error_description"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&client)
	resp.Body.Close()
	if client.ClientID == "" {
		return fmt.Errorf("client registration failed: %s", client.ErrorDescription)
	}

	verifier := randomString(48)
	sum := sha256.Sum256([]byte(verifier))
	state := hex.EncodeToString(sum[:4]) + randomString(12)
	authorizeURL := cfg.Host + "/oauth/authorize?" + url.Values{
		"response_type": {"code"}, "client_id": {client.ClientID}, "redirect_uri": {redirectURI},
		"code_challenge": {base64.RawURLEncoding.EncodeToString(sum[:])}, "code_challenge_method": {"S256"},
		"state": {state}, "scope": {"omnimuse"}, "resource": {cfg.Host + "/mcp"},
	}.Encode()

	type result struct {
		code string
		err  error
	}
	done := make(chan result, 1)
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" {
			http.NotFound(w, r)
			return
		}
		query := r.URL.Query()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		switch {
		case query.Get("state") != state:
			fmt.Fprintf(w, loginPage, "Login failed", "The login response did not match. Run omnimuse login again.")
			done <- result{err: errors.New("state mismatch")}
		case query.Get("error") != "":
			fmt.Fprintf(w, loginPage, "Login cancelled", html.EscapeString(query.Get("error_description")))
			done <- result{err: errors.New("authorization was cancelled")}
		default:
			fmt.Fprintf(w, loginPage, "You're logged in", "You can close this tab and go back to the terminal.")
			done <- result{code: query.Get("code")}
		}
	})}
	go func() { _ = server.Serve(listener) }()
	defer server.Shutdown(context.Background())

	fmt.Println("Opening your browser to log in to", cfg.Host)
	fmt.Println("If it does not open, visit this URL:")
	fmt.Println("  " + authorizeURL)
	_ = openBrowser(authorizeURL)

	var got result
	select {
	case got = <-done:
	case <-time.After(10 * time.Minute):
		return errors.New("timed out waiting for the browser login")
	}
	if got.err != nil {
		return got.err
	}
	tokens, err := postForm(httpClient, cfg.Host+"/api/oauth/token", url.Values{"grant_type": {"authorization_code"}, "client_id": {client.ClientID}, "code": {got.code}, "redirect_uri": {redirectURI}, "code_verifier": {verifier}})
	if err != nil {
		return err
	}
	cfg.APIKey, cfg.ClientID = "", client.ClientID
	cfg.AccessToken, cfg.RefreshToken = tokens.AccessToken, tokens.RefreshToken
	cfg.ExpiresAt = time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)
	return saveConfig(cfg)
}

func keyLogin(cfg *config, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		fmt.Printf("Create an API key at %s/studio/developers and paste it here.\nAPI key: ", cfg.Host)
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && line == "" {
			return err
		}
		key = strings.TrimSpace(line)
	}
	if !strings.HasPrefix(key, "om_") {
		return errors.New("that does not look like an OmniMuse API key (it should start with om_)")
	}
	cfg.APIKey, cfg.ClientID, cfg.AccessToken, cfg.RefreshToken, cfg.ExpiresAt = key, "", "", "", time.Time{}
	var me account
	if err := newClient(cfg).getJSON("/v1/me", &me); err != nil {
		return err
	}
	return saveConfig(cfg)
}
