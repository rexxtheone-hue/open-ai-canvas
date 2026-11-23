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

func TestTencentKlingAudiosRegisterAsVoices(t *testing.T) {
	allowLoopbackProviderTest(t)
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.ArkPrivateAssetBinding{}, &model.Resource{}); err != nil {
		t.Fatal(err)
	}
	creates, gets := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tk-test" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/wand/kling/custom-voices":
			creates++
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if name, _ := body["voice_name"].(string); body["voice_url"] == "" || name == "" || len([]rune(name)) > 20 {
				t.Errorf("create body = %#v", body)
			}
			_, _ = w.Write([]byte(`{"code":0,"message":"SUCCEED","data":{"task_id":"vt-1","task_status":"submitted"}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/wand/kling/custom-voices/vt-1":
			gets++
			if gets == 1 {
				_, _ = w.Write([]byte(`{"code":0,"data":{"task_id":"vt-1","task_status":"processing"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":0,"data":{"task_id":"vt-1","task_status":"succeed","task_result":{"voices":[{"voice_id":"9171","status":"succeed"}]}}}`))
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
	if err := db.Create(&model.Resource{ID: "aud-1", UserID: "u1", Kind: "audio", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "u1/aud-1.mp3", MimeType: "audio/mpeg"}).Error; err != nil {
		t.Fatal(err)
	}
	config := providerConfig{InterfaceType: tencentKlingVideoProtocol, ChannelID: "th", BaseURL: "https://tokenhub-intl.tencentcloudmaas.com", APIKey: "tk-test"}
	for round := 0; round < 2; round++ {
		input := canvasGenerationInput{Mode: "video", Config: config, Prompt: "她说：你好",
			ReferenceImages: []providerMedia{{StorageKey: "resource:img-1", URL: "https://signed.example/img-1.png"}},
			ReferenceAudios: []providerMedia{{StorageKey: "resource:aud-1", URL: "https://signed.example/aud-1.mp3"}},
		}
		if err := svc.prepareTencentKlingVoiceReferences(context.Background(), "u1", &input); err != nil {
			t.Fatal(err)
		}
		if input.ReferenceAudios[0].URL != "kling-voice://9171" || input.ReferenceImages[0].URL != "https://signed.example/img-1.png" {
			t.Fatalf("references = %#v %#v", input.ReferenceImages, input.ReferenceAudios)
		}
		if !strings.Contains(input.Prompt, "@1") {
			t.Fatalf("prompt must mention the voice: %q", input.Prompt)
		}
	}
	if creates != 1 {
		t.Fatalf("the audio must be registered once, creates=%d", creates)
	}

	tooMany := canvasGenerationInput{Mode: "video", Config: config, ReferenceAudios: make([]providerMedia, 4)}
	if err := svc.prepareTencentKlingVoiceReferences(context.Background(), "u1", &tooMany); err == nil {
		t.Fatal("more than 3 voices must be rejected")
	}
}

func TestWithKlingVoiceMentions(t *testing.T) {
	if got := withKlingVoiceMentions("@1 说你好", 1); got != "@1 说你好" {
		t.Fatalf("existing mention kept: %q", got)
	}
	if got := withKlingVoiceMentions("她说你好 @音频1，他回答 @Audio2", 2); got != "她说你好 @1，他回答 @2" {
		t.Fatalf("studio audio labels converted: %q", got)
	}
	if got := withKlingVoiceMentions("1080p 画面 @image_1", 2); !strings.HasSuffix(got, "人物说话使用音色 @1、@2。") {
		t.Fatalf("mentions appended: %q", got)
	}
}
