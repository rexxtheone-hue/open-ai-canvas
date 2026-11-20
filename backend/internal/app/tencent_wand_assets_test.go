package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestTencentWandReferencesRegisterAsAssets(t *testing.T) {
	allowLoopbackProviderTest(t)
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.ArkPrivateAssetBinding{}, &model.Resource{}); err != nil {
		t.Fatal(err)
	}
	creates, gets := 0, 0
	var bodies []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tk-test" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/wand/vega-video-assets":
			creates++
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			bodies = append(bodies, body)
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"asset-2026-` + body["asset_type"].(string) + `","group_id":"group-1"}`))
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v1/wand/vega-video-assets/"):
			gets++
			if gets == 1 {
				_, _ = w.Write([]byte(`{"id":"x","status":"WAIT"}`))
				return
			}
			_, _ = w.Write([]byte(`{"id":"x","status":"DONE","url":"https://tos.example/x"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	tencentWandAssetBaseURLOverride = server.URL
	tencentWandAssetPollInterval = time.Millisecond
	svc.dataDir = t.TempDir()
	if err := os.WriteFile(filepath.Join(svc.dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://studio.example")
	t.Cleanup(func() { tencentWandAssetBaseURLOverride = ""; tencentWandAssetPollInterval = 3 * time.Second })

	for _, resource := range []model.Resource{
		{ID: "img-1", UserID: "u1", Kind: "image", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "u1/img-1.png", MimeType: "image/png"},
		{ID: "aud-1", UserID: "u1", Kind: "audio", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "u1/aud-1.mp3", MimeType: "audio/mpeg"},
	} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	config := providerConfig{InterfaceType: tencentWandVideoProtocol, ChannelID: "th", BaseURL: "https://tokenhub-intl.tencentcloudmaas.com", APIKey: "tk-test"}
	for round := 0; round < 2; round++ {
		input := canvasGenerationInput{Mode: "video", Config: config,
			ReferenceImages: []providerMedia{{StorageKey: "resource:img-1", URL: "https://signed.example/img-1.png"}},
			ReferenceAudios: []providerMedia{{StorageKey: "resource:aud-1", URL: "https://signed.example/aud-1.mp3"}},
			ReferenceVideos: []providerMedia{{StorageKey: "resource:vid-1", URL: "https://signed.example/vid-1.mp4"}},
		}
		if err := svc.prepareTencentWandAssetReferences(context.Background(), "u1", &input); err != nil {
			t.Fatal(err)
		}
		if input.ReferenceImages[0].URL != "asset://asset-2026-Image" || input.ReferenceAudios[0].URL != "asset://asset-2026-Audio" {
			t.Fatalf("references = %#v %#v", input.ReferenceImages, input.ReferenceAudios)
		}
		if input.ReferenceVideos[0].URL != "https://signed.example/vid-1.mp4" {
			t.Fatalf("reference videos must stay public URLs: %#v", input.ReferenceVideos)
		}
	}
	if creates != 2 {
		t.Fatalf("each resource must be registered once, creates=%d", creates)
	}
	for _, body := range bodies {
		if body["action"] != "create" || body["is_real_person"] != false || body["url"] == "" {
			t.Fatalf("create body = %#v", body)
		}
	}

	other := canvasGenerationInput{Mode: "video", Config: providerConfig{InterfaceType: cloudwiseSeedanceProtocol, ChannelID: "cw"}, ReferenceImages: []providerMedia{{StorageKey: "resource:img-1", URL: "https://signed.example/img-1.png"}}}
	if err := svc.prepareTencentWandAssetReferences(context.Background(), "u1", &other); err != nil || other.ReferenceImages[0].URL != "https://signed.example/img-1.png" {
		t.Fatalf("other protocols are untouched: %#v %v", other.ReferenceImages, err)
	}
}
