package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestFalQueueRuntimeFetchesJSONResultWithKeyAuth(t *testing.T) {
	allowLoopbackProviderTest(t)
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var polls int32
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/media.mp4" && r.Header.Get("Authorization") != "Key fal-secret" {
			http.Error(w, "bad auth "+r.Header.Get("Authorization"), http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/fal-ai/kling-video/v2.1/pro/image-to-video":
			_, _ = w.Write([]byte(`{"request_id":"req-9","status":"IN_QUEUE"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/fal-ai/kling-video/requests/req-9/status":
			if atomic.AddInt32(&polls, 1) == 1 {
				_, _ = w.Write([]byte(`{"status":"IN_PROGRESS"}`))
				return
			}
			_, _ = w.Write([]byte(`{"status":"COMPLETED"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/fal-ai/kling-video/requests/req-9":
			_, _ = w.Write([]byte(`{"video":{"url":"` + server.URL + `/media.mp4"}}`))
		case r.URL.Path == "/media.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video"))
		default:
			http.Error(w, r.Method+" "+r.URL.Path, http.StatusNotFound)
		}
	}))
	defer server.Close()

	config := providerConfig{BaseURL: server.URL, APIKey: "fal-secret", Model: "fal-ai/kling-video/v2.1/pro/image-to-video", InterfaceType: "fal-queue-video"}
	ctx := withProtocolRegistry(context.Background(), center.registrySnapshot())
	adapter, ok := declarativeProtocolAdapterForContext(ctx, config.InterfaceType)
	if !ok {
		t.Fatal("fal-queue-video adapter is unavailable")
	}
	result, err := runProtocolAdapterTaskWithPolicy(ctx, canvasGenerationInput{Mode: "video", Prompt: "a clip", Config: config}, adapter, fastVideoPollPolicy())
	if err != nil {
		t.Fatal(err)
	}
	video, _ := result["video"].(map[string]interface{})
	if result["mode"] != "video" || !strings.HasPrefix(video["dataUrl"].(string), "data:video/mp4") {
		t.Fatalf("result = %#v", result)
	}
}
