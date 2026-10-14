package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadAPI88VideoAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "api88-video.yingce-plugin"))
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
		if adapter.Metadata().ID == "api88-video" {
			return adapter
		}
	}
	t.Fatal("api88-video provider adapter not found")
	return nil
}

func TestAPI88VideoBuildsSD25ReferenceRequest(t *testing.T) {
	adapter := loadAPI88VideoAdapter(t)
	if !adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("88API only accepts media URLs")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: GenerationRequest{
		Model: "SD2.5", Prompt: "a hero shot", Duration: 10, AspectRatio: "9:16", Resolution: "1080P", GenerateAudio: true,
		Images: []MediaReference{{URL: "https://cdn.example/character.jpg", Role: "reference_image"}},
		Videos: []MediaReference{{URL: "https://cdn.example/camera.mp4", Role: "reference_video"}},
		Audios: []MediaReference{{URL: "https://cdn.example/voice.mp3"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/v1/videos" || !create.OriginPath || create.ContentType != "application/json" {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	if body["model"] != "SD2.5" || body["prompt"] != "a hero shot" || body["duration"] != 10 || body["ratio"] != "9:16" || body["resolution"] != "1080p" || body["generate_audio"] != true {
		t.Fatalf("body = %#v", body)
	}
	images, _ := body["images"].([]any)
	metadata, _ := body["metadata"].(map[string]any)
	if len(images) != 1 || images[0] != "https://cdn.example/character.jpg" || metadata == nil {
		t.Fatalf("images/metadata = %#v", body)
	}
	videos, _ := metadata["referenceVideos"].([]any)
	audios, _ := metadata["referenceAudios"].([]any)
	if len(videos) != 1 || videos[0] != "https://cdn.example/camera.mp4" || len(audios) != 1 || audios[0] != "https://cdn.example/voice.mp3" {
		t.Fatalf("metadata = %#v", metadata)
	}
	if _, exists := metadata["firstFrame"]; exists {
		t.Fatalf("reference request must not send firstFrame: %#v", metadata)
	}
	if _, exists := body["callback_url"]; exists {
		t.Fatalf("SD models only support polling: %#v", body)
	}
}

func TestAPI88VideoSplitsFramesAndDefaults(t *testing.T) {
	adapter := loadAPI88VideoAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: GenerationRequest{
		Model: "SD2.0", Prompt: "transition", AspectRatio: "adaptive",
		Images: []MediaReference{{URL: "https://cdn.example/start.jpg", Role: "first_frame"}, {URL: "https://cdn.example/end.jpg", Role: "last_frame"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := create.Body.(map[string]any)
	if body["ratio"] != "16:9" || body["duration"] != 5 {
		t.Fatalf("defaults = %#v", body)
	}
	for _, key := range []string{"images", "generate_audio", "resolution", "seed", "negative_prompt"} {
		if _, exists := body[key]; exists {
			t.Fatalf("%s must be omitted: %#v", key, body)
		}
	}
	metadata := body["metadata"].(map[string]any)
	if metadata["firstFrame"] != "https://cdn.example/start.jpg" || metadata["lastFrame"] != "https://cdn.example/end.jpg" {
		t.Fatalf("frames = %#v", metadata)
	}
	if _, exists := metadata["referenceVideos"]; exists {
		t.Fatalf("empty referenceVideos must be omitted: %#v", metadata)
	}

	textOnly, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: GenerationRequest{Model: "SD2.5", Prompt: "a cat", Duration: 6}})
	if err != nil {
		t.Fatal(err)
	}
	textBody := textOnly.Body.(map[string]any)
	if textBody["ratio"] != "16:9" || textBody["duration"] != 6 {
		t.Fatalf("text-only body = %#v", textBody)
	}
	if _, exists := textBody["metadata"]; exists {
		t.Fatalf("empty metadata must be omitted: %#v", textBody)
	}
}

func TestAPI88VideoParsesTaskLifecycle(t *testing.T) {
	adapter := loadAPI88VideoAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"id":"task_abc123","object":"video","model":"SD2.5","status":"queued","progress":0,"created_at":1788249600}`))
	if err != nil || created.TaskID != "task_abc123" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{BaseURL: "https://api.88api.ai", Model: "SD2.5", TaskID: created.TaskID})
	if err != nil || poll.Method != "GET" || poll.Path != "/v1/videos/task_abc123" || !poll.OriginPath {
		t.Fatalf("poll spec = %#v, err = %v", poll, err)
	}
	for raw, want := range map[string]Status{
		`{"id":"task_abc123","status":"in_progress","progress":40}`: StatusProcessing,
		`{"id":"task_abc123","status":"unknown"}`:                    StatusPending,
	} {
		result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(raw))
		if err != nil || result.Status != want {
			t.Fatalf("%s => %#v, err = %v", raw, result, err)
		}
	}
	completed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"id":"task_abc123","status":"completed","progress":100,"url":"https://cdn.88api.example/v.mp4","video_url":"https://cdn.88api.example/v.mp4"}`))
	if err != nil || completed.Status != StatusSucceeded || completed.Result == nil || len(completed.Result.Videos) != 1 || completed.Result.Videos[0].URL != "https://cdn.88api.example/v.mp4" || !completed.Result.Videos[0].Ephemeral {
		t.Fatalf("completed = %#v, err = %v", completed, err)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"id":"task_abc123","status":"failed","error":{"code":"invalid_ratio","message":"ratio is required"}}`))
	if err != nil || failed.Status != StatusFailed || failed.Message == "" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}

func TestAPI88VideoGeminiOmniUsesTopLevelVideos(t *testing.T) {
	adapter := loadAPI88VideoAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: GenerationRequest{
		Model: "gemini-omni-flash-1.1", Prompt: "edit the scene", Duration: 6, AspectRatio: "9:16", Resolution: "1080P",
		Images: []MediaReference{{URL: "https://cdn.example/ref.jpg", Role: "reference_image"}},
		Videos: []MediaReference{{URL: "https://cdn.example/a.mp4"}, {URL: "https://cdn.example/b.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := create.Body.(map[string]any)
	videos, _ := body["videos"].([]any)
	if len(videos) != 2 || videos[0] != "https://cdn.example/a.mp4" || body["ratio"] != "9:16" || body["resolution"] != "1080p" {
		t.Fatalf("gemini body = %#v", body)
	}
	// 同类素材只能用一个字段：顶层 videos 已发送时 metadata.referenceVideos 必须缺省。
	if metadata, ok := body["metadata"].(map[string]any); ok {
		if _, exists := metadata["referenceVideos"]; exists {
			t.Fatalf("gemini must not duplicate videos into metadata: %#v", metadata)
		}
	}

	sd, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.88api.ai", Request: GenerationRequest{
		Model: "SD2.5", Prompt: "x", Videos: []MediaReference{{URL: "https://cdn.example/a.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	sdBody := sd.Body.(map[string]any)
	if _, exists := sdBody["videos"]; exists {
		t.Fatalf("SD models must not send top-level videos: %#v", sdBody)
	}
	if refs, _ := sdBody["metadata"].(map[string]any)["referenceVideos"].([]any); len(refs) != 1 {
		t.Fatalf("SD referenceVideos = %#v", sdBody)
	}
}
