package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadTencentWandVideoAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "tencent-wand-video.yingce-plugin"))
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
		if adapter.Metadata().ID == "tencent-wand-video" {
			return adapter
		}
	}
	t.Fatal("tencent-wand-video provider adapter not found")
	return nil
}

func TestTencentWandVideoBuildsContentArray(t *testing.T) {
	adapter := loadTencentWandVideoAdapter(t)
	if !adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("WAND only accepts public media URLs")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://tokenhub-intl.tencentcloudmaas.com", Request: GenerationRequest{
		Model: "wand-vega-video-1.5-pro", Prompt: " a cat ", Duration: 8, AspectRatio: "9:16", Resolution: "1080p",
		Images: []MediaReference{{URL: "https://cdn.example/start.jpg", Role: "first_frame"}, {URL: "https://cdn.example/ref.jpg", Role: "reference_image"}, {URL: "https://cdn.example/end.jpg", Role: "last_frame"}},
		Videos: []MediaReference{{URL: "https://cdn.example/m.mp4"}},
		Audios: []MediaReference{{URL: "https://cdn.example/v.mp3"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/v1/wand/vega-videos/tasks" || !create.OriginPath {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	if body["model"] != "wand-vega-video-1.5-pro" || body["duration"] != 8 || body["ratio"] != "9:16" || body["resolution"] != "1080P" {
		t.Fatalf("body = %#v", body)
	}
	content, _ := body["content"].([]any)
	if len(content) != 6 {
		t.Fatalf("content = %#v", content)
	}
	want := []struct{ typ, role, url string }{
		{"text", "", ""},
		{"image_url", "first_frame", "https://cdn.example/start.jpg"},
		{"image_url", "last_frame", "https://cdn.example/end.jpg"},
		{"image_url", "reference_image", "https://cdn.example/ref.jpg"},
		{"video_url", "reference_video", "https://cdn.example/m.mp4"},
		{"audio_url", "reference_audio", "https://cdn.example/v.mp3"},
	}
	for index, item := range want {
		element := content[index].(map[string]any)
		if element["type"] != item.typ {
			t.Fatalf("content[%d] = %#v", index, element)
		}
		if item.typ == "text" {
			if element["text"] != "a cat" {
				t.Fatalf("text element = %#v", element)
			}
			if _, exists := element["role"]; exists {
				t.Fatalf("text element must not carry role: %#v", element)
			}
			continue
		}
		media, _ := element[item.typ].(map[string]any)
		if element["role"] != item.role || media["url"] != item.url {
			t.Fatalf("content[%d] = %#v", index, element)
		}
	}
}

func TestTencentWandVideoTextOnlyOmitsOptionalFields(t *testing.T) {
	adapter := loadTencentWandVideoAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://tokenhub-intl.tencentcloudmaas.com", Request: GenerationRequest{
		Model: "wand-vega-video-1.0-lite", Prompt: "sunset", AspectRatio: "auto",
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := create.Body.(map[string]any)
	for _, key := range []string{"duration", "ratio", "resolution"} {
		if _, exists := body[key]; exists {
			t.Fatalf("%s must be omitted: %#v", key, body)
		}
	}
	if content, _ := body["content"].([]any); len(content) != 1 {
		t.Fatalf("content = %#v", body["content"])
	}
	for input, want := range map[string]string{"720": "720P", "2k": "2K", "4K": "4K", "2160p": "4K"} {
		create, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "m", Prompt: "p", Resolution: input}})
		if err != nil {
			t.Fatal(err)
		}
		if got := create.Body.(map[string]any)["resolution"]; got != want {
			t.Fatalf("resolution %q -> %v, want %s", input, got, want)
		}
	}
}

func TestTencentWandVideoParsesTaskLifecycle(t *testing.T) {
	adapter := loadTencentWandVideoAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"id":"task-1","model":"wand-vega-video-1.5-pro","status":"queued"}`))
	if err != nil || created.TaskID != "task-1" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{BaseURL: "https://tokenhub-intl.tencentcloudmaas.com", TaskID: "task-1"})
	if err != nil || poll.Method != "GET" || poll.Path != "/v1/wand/vega-videos/tasks/task-1" || !poll.OriginPath {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	running, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "task-1"}, []byte(`{"id":"task-1","status":"running"}`))
	if err != nil || running.Status != StatusProcessing {
		t.Fatalf("running = %#v, err = %v", running, err)
	}
	done, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "task-1"}, []byte(`{"id":"task-1","status":"succeeded","content":{"video_url":"https://tokenhub.example/out.mp4"}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://tokenhub.example/out.mp4" || !done.Result.Videos[0].Ephemeral {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "task-1"}, []byte(`{"id":"task-1","status":"failed","error":{"code":"TaskTimeout","message":"task timed out in queue"}}`))
	if err != nil || failed.Status != StatusFailed || failed.Message == "" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}

func TestTencentWandVideoRejectsEditAndEmptyPrompt(t *testing.T) {
	adapter := loadTencentWandVideoAdapter(t)
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "m", Prompt: "p", Operation: "extend"}}); err == nil {
		t.Fatal("extend must be rejected")
	}
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "m", Prompt: "  "}}); err == nil {
		t.Fatal("empty prompt must be rejected")
	}
}
