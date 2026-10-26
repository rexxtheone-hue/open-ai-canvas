package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadAPI88MidjourneyAdapter(t *testing.T) Adapter {
	t.Helper()
	return loadAPI88ImageAdapter(t, "api88-midjourney")
}

func TestAPI88GrokImageRequests(t *testing.T) {
	adapter := loadAPI88ImageAdapter(t, "api88-grok-image")
	build := func(request GenerationRequest) (RequestSpec, error) {
		request.Model = "grok-imagine-image-2.0"
		return adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: request})
	}
	text, err := build(GenerationRequest{Prompt: " poster ", AspectRatio: "16:9", Resolution: "2K", ImageCount: 4})
	if err != nil {
		t.Fatal(err)
	}
	body := text.Body.(map[string]any)
	if text.Path != "/v1/images/generations" || !text.OriginPath || body["prompt"] != "poster" || body["aspect_ratio"] != "16:9" || body["resolution"] != "2k" || body["n"] != float64(1) && body["n"] != 1 {
		t.Fatalf("text-to-image = %#v %#v", text, body)
	}
	if _, exists := body["size"]; exists {
		t.Fatalf("grok must use aspect_ratio, not size: %#v", body)
	}
	if _, exists := body["images"]; exists {
		t.Fatalf("text-to-image must not send images: %#v", body)
	}
	edit, err := build(GenerationRequest{Prompt: "swap the background", AspectRatio: "auto", Images: []MediaReference{{URL: "https://cdn.example/a.jpg"}, {URL: "https://cdn.example/b.jpg"}}})
	if err != nil {
		t.Fatal(err)
	}
	editBody := edit.Body.(map[string]any)
	images, _ := editBody["images"].([]any)
	if edit.Path != "/v1/images/edits" || len(images) != 2 || images[0] != "https://cdn.example/a.jpg" {
		t.Fatalf("edit = %#v %#v", edit, editBody)
	}
	if _, exists := editBody["aspect_ratio"]; exists {
		t.Fatalf("auto ratio must be omitted so edits follow the first image: %#v", editBody)
	}
	four := []MediaReference{{URL: "https://a/1.jpg"}, {URL: "https://a/2.jpg"}, {URL: "https://a/3.jpg"}, {URL: "https://a/4.jpg"}}
	for name, request := range map[string]GenerationRequest{"4 images": {Prompt: "x", Images: four}, "4k": {Prompt: "x", Resolution: "4k"}, "empty prompt": {Prompt: " "}} {
		if _, err := build(request); err == nil {
			t.Fatalf("%s must be rejected", name)
		}
	}
	parsed, err := adapter.ParseCreate(context.Background(), []byte(`{"created":1,"data":[{"b64_json":"QUJD","mime_type":"image/jpeg"}]}`))
	if err != nil || parsed.Result == nil || len(parsed.Result.Images) != 1 || parsed.Result.Images[0].DataURL != "data:image/jpeg;base64,QUJD" {
		t.Fatalf("parsed = %#v, err = %v", parsed, err)
	}
}

func loadAPI88ImageAdapter(t *testing.T, providerID string) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "api88-image.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, adapter := range adapters {
		if adapter.Metadata().ID == providerID {
			return adapter
		}
	}
	t.Fatalf("%s provider adapter not found", providerID)
	return nil
}

func TestAPI88MidjourneyAppendsAspectRatioToPrompt(t *testing.T) {
	adapter := loadAPI88MidjourneyAdapter(t)
	build := func(request GenerationRequest) (map[string]any, error) {
		request.Model = "midjourney-v8.2"
		create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: request})
		if err != nil {
			return nil, err
		}
		if create.Method != "POST" || create.Path != "/v1/images/generations" || !create.OriginPath {
			t.Fatalf("create spec = %#v", create)
		}
		return create.Body.(map[string]any), nil
	}
	body, err := build(GenerationRequest{Prompt: "  misty city  ", AspectRatio: "16:9"})
	if err != nil {
		t.Fatal(err)
	}
	if body["model"] != "midjourney-v8.2" || body["prompt"] != "misty city --ar 16:9" {
		t.Fatalf("body = %#v", body)
	}
	// 88API 要求比例写在 --ar，不能带 OpenAI 图片字段。
	for _, key := range []string{"size", "n", "quality", "output_format", "images"} {
		if _, exists := body[key]; exists {
			t.Fatalf("%s must not be sent: %#v", key, body)
		}
	}
	if typed, _ := build(GenerationRequest{Prompt: "poster --AR 3:4 --s 250", AspectRatio: "16:9"}); typed["prompt"] != "poster --AR 3:4 --s 250" {
		t.Fatalf("an existing --ar must not be duplicated: %#v", typed)
	}
	if auto, _ := build(GenerationRequest{Prompt: "cat", AspectRatio: "auto"}); auto["prompt"] != "cat" {
		t.Fatalf("auto ratio must not append --ar: %#v", auto)
	}
	if _, err := build(GenerationRequest{Prompt: "cat", Images: []MediaReference{{URL: "https://cdn.example/a.jpg"}}}); err == nil {
		t.Fatal("reference images must be rejected before calling 88API")
	}
	if _, err := build(GenerationRequest{Prompt: "   "}); err == nil {
		t.Fatal("empty prompt must be rejected")
	}
}

func TestAPI88MidjourneyParsesFourImages(t *testing.T) {
	adapter := loadAPI88MidjourneyAdapter(t)
	result, err := adapter.ParseCreate(context.Background(), []byte(`{"created":1760000000,"data":[{"url":"https://a/1.png"},{"url":"https://a/2.png"},{"url":"https://a/3.png"},{"url":"https://a/4.png"}],"model":"midjourney-v8.2"}`))
	if err != nil || result.Status != StatusSucceeded || result.Result == nil || len(result.Result.Images) != 4 || result.Result.Images[3].URL != "https://a/4.png" {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
}
