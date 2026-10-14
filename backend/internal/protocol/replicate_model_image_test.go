package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadReplicateModelImageAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "replicate-model-image.yingce-plugin"))
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
		if adapter.Metadata().ID == "replicate-model-image" {
			return adapter
		}
	}
	t.Fatal("replicate-model-image provider adapter not found")
	return nil
}

func TestReplicateModelImageBuildsOfficialModelRequest(t *testing.T) {
	adapter := loadReplicateModelImageAdapter(t)
	if adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("Replicate accepts data URIs and must not require public media URLs")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.replicate.com", Request: GenerationRequest{
		Model: "openai/gpt-image-2.5-sunburst", Prompt: "a golden retriever puppy", AspectRatio: "16:9", Quality: "High", ImageCount: 2,
		Images: []MediaReference{{DataURL: "data:image/png;base64,AAA"}, {URL: "https://cdn.example/ref.png"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/v1/models/openai/gpt-image-2.5-sunburst/predictions" || !create.OriginPath || create.ContentType != "application/json" {
		t.Fatalf("create spec = %#v", create)
	}
	input := create.Body.(map[string]any)["input"].(map[string]any)
	images, _ := input["input_images"].([]any)
	if input["prompt"] != "a golden retriever puppy" || input["aspect_ratio"] != "16:9" || input["quality"] != "high" || input["number_of_images"] != 2 || input["output_format"] != "png" || len(images) != 2 || images[0] != "data:image/png;base64,AAA" || images[1] != "https://cdn.example/ref.png" {
		t.Fatalf("input = %#v", input)
	}
	for _, key := range []string{"background", "moderation", "openai_api_key", "output_compression", "user_id"} {
		if _, exists := input[key]; exists {
			t.Fatalf("empty optional %s must be omitted: %#v", key, input)
		}
	}
}

func TestReplicateModelImageDefaultsForTextOnlyRequest(t *testing.T) {
	adapter := loadReplicateModelImageAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.replicate.com", Request: GenerationRequest{
		Model: "openai/gpt-image-2.5-sunburst", Prompt: "a bird",
		ProviderOptions: map[string]map[string]any{"replicate-model-image": {"background": "transparent", "output_format": "webp"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	input := create.Body.(map[string]any)["input"].(map[string]any)
	if input["aspect_ratio"] != "auto" || input["number_of_images"] != 1 || input["background"] != "transparent" || input["output_format"] != "webp" {
		t.Fatalf("input = %#v", input)
	}
	for _, key := range []string{"input_images", "quality"} {
		if _, exists := input[key]; exists {
			t.Fatalf("%s must be omitted for text-only request: %#v", key, input)
		}
	}
}

func TestReplicateModelImageParsesPredictionLifecycle(t *testing.T) {
	adapter := loadReplicateModelImageAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"id":"9kzw0k550nrmw0d0ga8avxr2zg","model":"openai/gpt-image-2.5-sunburst","status":"starting","output":null,"error":null,"urls":{"get":"https://api.replicate.com/v1/predictions/9kzw0k550nrmw0d0ga8avxr2zg"}}`))
	if err != nil || created.TaskID != "9kzw0k550nrmw0d0ga8avxr2zg" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{BaseURL: "https://api.replicate.com", Model: "openai/gpt-image-2.5-sunburst", TaskID: created.TaskID})
	if err != nil || poll.Method != "GET" || poll.Path != "/v1/predictions/9kzw0k550nrmw0d0ga8avxr2zg" || !poll.OriginPath {
		t.Fatalf("poll spec = %#v, err = %v", poll, err)
	}
	processing, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"id":"9kzw0k550nrmw0d0ga8avxr2zg","status":"processing","output":null,"error":null}`))
	if err != nil || processing.Status != StatusProcessing {
		t.Fatalf("processing = %#v, err = %v", processing, err)
	}
	succeeded, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"id":"9kzw0k550nrmw0d0ga8avxr2zg","status":"succeeded","output":["https://replicate.delivery/a.png","https://replicate.delivery/b.png"],"error":null,"metrics":{"predict_time":12.3}}`))
	if err != nil || succeeded.Status != StatusSucceeded || succeeded.Result == nil || len(succeeded.Result.Images) != 2 {
		t.Fatalf("succeeded = %#v, err = %v", succeeded, err)
	}
	if image := succeeded.Result.Images[0]; image.URL != "https://replicate.delivery/a.png" || !image.Ephemeral {
		t.Fatalf("image = %#v", image)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"id":"9kzw0k550nrmw0d0ga8avxr2zg","status":"failed","output":null,"error":"Your request was rejected by the safety system."}`))
	if err != nil || failed.Status != StatusFailed || failed.Message == "" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}
