package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Cloudwise 透传 xAI 视频接口：Base URL 带 /api，结果视频在 video.url。
func TestRunVideoTaskXAIVideoThroughCloudwiseReadsNestedVideoURL(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	var server *httptest.Server
	var paths []string
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.Path)
		switch r.Method + " " + r.URL.Path {
		case "POST /api/v1/videos/generations":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"request_id":"video_task_abc123"}`))
		case "GET /api/v1/videos/video_task_abc123":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"done","video":{"url":"` + server.URL + `/files/grok.mp4","duration":6,"respect_moderation":true},"model":"grok-imagine-video","progress":100}`))
		case "GET /files/grok.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	result, err := runVideoTaskForTest(context.Background(), canvasGenerationInput{
		Prompt: "a slow orbit around a glass observatory",
		Config: providerConfig{
			BaseURL:       server.URL + "/api",
			APIKey:        "test-key",
			Model:         "grok-imagine-video",
			InterfaceType: "xai-video",
			VideoSeconds:  "6",
			Size:          "16:9",
			VQuality:      "720p",
		},
	})
	if err != nil {
		t.Fatalf("runVideoTask() error = %v (paths %v)", err, paths)
	}
	video, ok := result["video"].(map[string]interface{})
	if !ok || video["dataUrl"] != "data:video/mp4;base64,dmlkZW8=" {
		t.Fatalf("video = %#v", result["video"])
	}
	want := "POST /api/v1/videos/generations,GET /api/v1/videos/video_task_abc123,GET /files/grok.mp4"
	if got := strings.Join(paths, ","); got != want {
		t.Fatalf("paths = %q, want %q", got, want)
	}
}
