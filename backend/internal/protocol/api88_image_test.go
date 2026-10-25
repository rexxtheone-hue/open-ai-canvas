package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadAPI88MidjourneyAdapter(t *testing.T) Adapter {
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
		if adapter.Metadata().ID == "api88-midjourney" {
			return adapter
		}
	}
	t.Fatal("api88-midjourney provider adapter not found")
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
