package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadFalQueueAdapter(t *testing.T, id string) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", id+".yingce-plugin"))
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
		if adapter.Metadata().ID == id {
			return adapter
		}
	}
	t.Fatalf("%s provider adapter not found", id)
	return nil
}

func TestFalQueueImageSendsFlatInputWithKeyAuth(t *testing.T) {
	adapter := loadFalQueueAdapter(t, "fal-queue-image")
	if !adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("fal fetches media by URL")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://queue.fal.run", Request: GenerationRequest{
		Model: "fal-ai/nano-banana/edit", Prompt: "换成夜景", AspectRatio: "16:9", ImageCount: 2,
		Images:          []MediaReference{{URL: "https://cdn.example/a.png"}, {URL: "https://cdn.example/b.png"}},
		ProviderOptions: map[string]map[string]any{"fal-queue-image": {"input": map[string]any{"output_format": "png", "num_images": 1}}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/fal-ai/nano-banana/edit" || !create.OriginPath {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	urls, _ := body["image_urls"].([]any)
	if body["prompt"] != "换成夜景" || body["image_url"] != "https://cdn.example/a.png" || len(urls) != 2 || body["aspect_ratio"] != "16:9" || body["output_format"] != "png" || body["num_images"] != float64(1) {
		t.Fatalf("body = %#v", body)
	}
	for _, key := range []string{"input", "model", "resolution", "seed"} {
		if _, exists := body[key]; exists {
			t.Fatalf("unexpected %s in body %#v", key, body)
		}
	}
}

func TestFalQueueImageLifecycleUsesAppPathAndJSONResult(t *testing.T) {
	adapter := loadFalQueueAdapter(t, "fal-queue-image")
	if capability, ok := adapter.(ResultJSONCapability); !ok || !capability.ResultIsJSON() {
		t.Fatal("fal result endpoint returns JSON")
	}
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"request_id":"req-1","status":"IN_QUEUE","queue_position":0}`))
	if err != nil || created.TaskID != "req-1" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	pc := PollContext{BaseURL: "https://queue.fal.run", Model: "fal-ai/flux/dev", TaskID: "req-1"}
	poll, err := adapter.BuildPoll(context.Background(), pc)
	if err != nil || poll.Method != "GET" || poll.Path != "/fal-ai/flux/requests/req-1/status" || !poll.OriginPath {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	result, err := adapter.(ResultAdapter).BuildResult(context.Background(), pc)
	if err != nil || result.Method != "GET" || result.Path != "/fal-ai/flux/requests/req-1" || !result.OriginPath {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
	cancel, err := adapter.BuildCancel(context.Background(), pc)
	if err != nil || cancel.Method != "PUT" || cancel.Path != "/fal-ai/flux/requests/req-1/cancel" {
		t.Fatalf("cancel = %#v, err = %v", cancel, err)
	}
	for raw, want := range map[string]Status{
		`{"status":"IN_QUEUE","queue_position":2}`:                       StatusPending,
		`{"status":"IN_PROGRESS"}`:                                       StatusProcessing,
		`{"status":"COMPLETED"}`:                                         StatusSucceeded,
		`{"status":"COMPLETED","error":"NSFW content","error_type":"x"}`: StatusFailed,
	} {
		state, err := adapter.ParsePoll(context.Background(), pc, []byte(raw))
		if err != nil || state.Status != want {
			t.Fatalf("%s => %#v, err = %v", raw, state, err)
		}
	}
	done, err := adapter.ParsePoll(context.Background(), pc, []byte(`{"images":[{"url":"https://v3.fal.media/files/a.png","content_type":"image/png"}],"seed":1}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Images) != 1 || done.Result.Images[0].URL != "https://v3.fal.media/files/a.png" || !done.Result.Images[0].Ephemeral {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}

func TestFalQueueVideoMapsFramesAndVideoResult(t *testing.T) {
	adapter := loadFalQueueAdapter(t, "fal-queue-video")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://queue.fal.run", Request: GenerationRequest{
		Model: "fal-ai/kling-video/v2.1/pro/image-to-video", Prompt: "镜头推进", Duration: 5, AspectRatio: "9:16", GenerateAudio: true,
		Images: []MediaReference{{URL: "https://cdn.example/end.png", Order: 2}, {URL: "https://cdn.example/start.png", Order: 1}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := create.Body.(map[string]any)
	if create.Path != "/fal-ai/kling-video/v2.1/pro/image-to-video" || body["image_url"] != "https://cdn.example/start.png" || body["end_image_url"] != "https://cdn.example/end.png" || body["tail_image_url"] != "https://cdn.example/end.png" || body["duration"] != "5" || body["aspect_ratio"] != "9:16" || body["generate_audio"] != true {
		t.Fatalf("create = %#v body = %#v", create, body)
	}
	single, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "fal-ai/veo3", Prompt: "海边"}})
	if err != nil {
		t.Fatal(err)
	}
	singleBody := single.Body.(map[string]any)
	for _, key := range []string{"image_url", "end_image_url", "video_url", "audio_url", "duration"} {
		if _, exists := singleBody[key]; exists {
			t.Fatalf("unexpected %s in body %#v", key, singleBody)
		}
	}
	pc := PollContext{Model: "fal-ai/kling-video/v2.1/pro/image-to-video", TaskID: "req-2"}
	poll, err := adapter.BuildPoll(context.Background(), pc)
	if err != nil || poll.Path != "/fal-ai/kling-video/requests/req-2/status" {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	done, err := adapter.ParsePoll(context.Background(), pc, []byte(`{"video":{"url":"https://v3.fal.media/files/v.mp4","content_type":"video/mp4"}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://v3.fal.media/files/v.mp4" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}
