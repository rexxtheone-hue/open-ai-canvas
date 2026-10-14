package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadBoyesirVideoAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "boyesir-video.yingce-plugin"))
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
		if adapter.Metadata().ID == "boyesir-video" {
			return adapter
		}
	}
	t.Fatal("boyesir-video provider adapter not found")
	return nil
}

func TestBoyesirVideoBuildsReferenceRequest(t *testing.T) {
	adapter := loadBoyesirVideoAdapter(t)
	if !adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("Boyesir only accepts public media URLs")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://boyesir.com", Request: GenerationRequest{
		Model: "bh-sd2-5-720p", Prompt: "@图片1 walks in", Duration: 10, AspectRatio: "9:16", Resolution: "720P",
		Images: []MediaReference{{URL: "https://cdn.example/a.jpg", Role: "reference_image"}, {URL: "https://cdn.example/b.jpg", Role: "reference_image"}},
		Videos: []MediaReference{{URL: "https://cdn.example/m.mp4"}},
		Audios: []MediaReference{{URL: "https://cdn.example/v.mp3"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/v1/videos/generations" || !create.OriginPath || create.ContentType != "application/json" {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	images, _ := body["images"].([]any)
	videos, _ := body["videos"].([]any)
	audios, _ := body["audios"].([]any)
	if body["model"] != "bh-sd2-5-720p" || body["prompt"] != "@图片1 walks in" || body["duration"] != 10 || body["ratio"] != "9:16" || body["resolution"] != "720p" || len(images) != 2 || len(videos) != 1 || len(audios) != 1 {
		t.Fatalf("body = %#v", body)
	}
	for _, key := range []string{"first_frame_url", "last_frame_url"} {
		if _, exists := body[key]; exists {
			t.Fatalf("%s must be omitted for reference request: %#v", key, body)
		}
	}
}

func TestBoyesirVideoFramesAndFixedDurationDefaults(t *testing.T) {
	adapter := loadBoyesirVideoAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://boyesir.com", Request: GenerationRequest{
		Model: "seedance2.0-900-3", Prompt: "transition", AspectRatio: "auto",
		Images: []MediaReference{{URL: "https://cdn.example/start.jpg", Role: "first_frame"}, {URL: "https://cdn.example/end.jpg", Role: "last_frame"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := create.Body.(map[string]any)
	if body["ratio"] != "16:9" || body["first_frame_url"] != "https://cdn.example/start.jpg" || body["last_frame_url"] != "https://cdn.example/end.jpg" {
		t.Fatalf("body = %#v", body)
	}
	// 固定时长型号要求不传或传对应值，未指定时长时不能补默认值。
	for _, key := range []string{"duration", "images", "videos", "audios", "resolution"} {
		if _, exists := body[key]; exists {
			t.Fatalf("%s must be omitted: %#v", key, body)
		}
	}
}

func TestBoyesirVideoParsesTaskLifecycle(t *testing.T) {
	adapter := loadBoyesirVideoAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"task_id":"canvas_vid_abc","status":"queued"}`))
	if err != nil || created.TaskID != "canvas_vid_abc" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{BaseURL: "https://boyesir.com", Model: "bh-sd2-5-720p", TaskID: created.TaskID})
	if err != nil || poll.Method != "GET" || poll.Path != "/v1/tasks/canvas_vid_abc" || !poll.OriginPath {
		t.Fatalf("poll spec = %#v, err = %v", poll, err)
	}
	processing, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"status":"processing"}`))
	if err != nil || processing.Status != StatusProcessing {
		t.Fatalf("processing = %#v, err = %v", processing, err)
	}
	completed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"status":"succeeded","result":{"videos":["https://gf.boyesir.com/assets/output/x.mp4"]}}`))
	if err != nil || completed.Status != StatusSucceeded || completed.Result == nil || len(completed.Result.Videos) != 1 || completed.Result.Videos[0].URL != "https://gf.boyesir.com/assets/output/x.mp4" || !completed.Result.Videos[0].Ephemeral {
		t.Fatalf("completed = %#v, err = %v", completed, err)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"status":"failed","error":"参考图包含真实人物，平台不支持"}`))
	if err != nil || failed.Status != StatusFailed || failed.Message == "" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}
