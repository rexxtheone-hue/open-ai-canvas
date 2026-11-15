package cfsaas

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientCreateGetDelete(t *testing.T) {
	var created map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token" {
			t.Errorf("authorization header = %q", r.Header.Get("Authorization"))
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/zones/zone/custom_hostnames":
			_ = json.NewDecoder(r.Body).Decode(&created)
			_, _ = w.Write([]byte(`{"success":true,"result":{"id":"h1","hostname":"studio.acme.com","status":"pending","ssl":{"status":"pending_validation","validation_errors":[{"message":"cname missing"}]}}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/zones/zone/custom_hostnames/h1":
			_, _ = w.Write([]byte(`{"success":true,"result":{"id":"h1","hostname":"studio.acme.com","status":"active","ssl":{"status":"active"}}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/zones/zone/custom_hostnames/gone":
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":1436,"message":"not found"}]}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/zones/zone/custom_hostnames/h1":
			_, _ = w.Write([]byte(`{"success":true,"result":{"id":"h1"}}`))
		default:
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":1000,"message":"bad"}]}`))
		}
	}))
	defer server.Close()
	client := New(Config{ZoneID: "zone", APIToken: "token", FallbackOrigin: "connect.example.net", BaseURL: server.URL})
	ctx := context.Background()

	hostname, err := client.Create(ctx, "studio.acme.com")
	if err != nil || hostname.ID != "h1" || hostname.SSLStatus != "pending_validation" || len(hostname.VerificationErrors) != 1 {
		t.Fatalf("create = %+v, %v", hostname, err)
	}
	ssl, _ := created["ssl"].(map[string]any)
	if created["hostname"] != "studio.acme.com" || ssl["method"] != "http" || ssl["type"] != "dv" {
		t.Fatalf("create body = %v", created)
	}
	if got, err := client.Get(ctx, "h1"); err != nil || got.SSLStatus != "active" {
		t.Fatalf("get = %+v, %v", got, err)
	}
	if _, err := client.Get(ctx, "gone"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing hostname error = %v", err)
	}
	if err := client.Delete(ctx, "h1"); err != nil {
		t.Fatal(err)
	}
	if err := client.Delete(ctx, "other"); err == nil {
		t.Fatal("api errors must be returned")
	}
	if client.FallbackOrigin() != "connect.example.net" {
		t.Fatal("fallback origin")
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("CF_SAAS_ZONE_ID", "")
	t.Setenv("CF_SAAS_API_TOKEN", "x")
	if _, ok := ConfigFromEnv(); ok {
		t.Fatal("zone id is required")
	}
	t.Setenv("CF_SAAS_ZONE_ID", "z")
	t.Setenv("CF_SAAS_FALLBACK_ORIGIN", "connect.example.net")
	if cfg, ok := ConfigFromEnv(); !ok || cfg.FallbackOrigin != "connect.example.net" {
		t.Fatalf("config = %+v %v", cfg, ok)
	}
}
