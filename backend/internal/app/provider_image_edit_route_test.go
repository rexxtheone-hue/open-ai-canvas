package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAIImageReferencesBypassDeclarativeJSONAdapter(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	registry := loadOfficialFallbackRegistry()
	if _, ok := registry.Resolve("openai-image"); !ok {
		t.Skip("official registry has no openai-image adapter")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/edits" || !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
			t.Errorf("request = %s %s, want multipart /v1/images/edits", r.Header.Get("Content-Type"), r.URL.Path)
		}
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		if files := r.MultipartForm.File["image"]; len(files) != 2 {
			t.Fatalf("image files = %d, want 2", len(files))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"aGVsbG8="}]}`))
	}))
	defer server.Close()

	ctx := withProtocolRegistry(context.Background(), registry)
	_, err := runImageTask(ctx, canvasGenerationInput{
		Mode:            "image",
		Prompt:          "storyboard sheet",
		Config:          providerConfig{BaseURL: server.URL, APIKey: "key", Model: "gpt-image-2.5", InterfaceType: "openai-image", Size: "1024x1024"},
		ImageCapability: DefaultImageCapabilityConfig("openai-image", "gpt-image-2.5"),
		ReferenceImages: []providerMedia{
			{Name: "a.png", Type: "image/png", DataURL: testReferenceImageDataURL},
			{Name: "b.png", Type: "image/png", DataURL: testReferenceImageDataURL},
		},
	})
	if err != nil {
		t.Fatalf("runImageTask() error = %v", err)
	}
}
