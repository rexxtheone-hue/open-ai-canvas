package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadTencentKlingVideoAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "tencent-kling-video.yingce-plugin"))
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
		if adapter.Metadata().ID == "tencent-kling-video" {
			return adapter
		}
	}
	t.Fatal("tencent-kling-video provider adapter not found")
	return nil
}

func TestTencentKlingVideoTextToVideo(t *testing.T) {
	adapter := loadTencentKlingVideoAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://tokenhub-intl.tencentcloudmaas.com", Request: GenerationRequest{
		Model: "kling-video-v4", Prompt: " a cat ", Duration: 12, AspectRatio: "21:9", Resolution: "1080",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/v1/wand/kling/text-to-video" || !create.OriginPath {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	settings, _ := body["settings"].(map[string]any)
	if body["model"] != "kling-video-v4" || body["prompt"] != "a cat" || settings["duration"] != 12 || settings["aspect_ratio"] != "21:9" || settings["resolution"] != "1080p" {
		t.Fatalf("body = %#v", body)
	}
	if _, exists := body["contents"]; exists {
		t.Fatalf("text-to-video must not send contents: %#v", body)
	}

	create, err = adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "kling-video-v4-flash", Prompt: "p", AspectRatio: "auto"}})
	if err != nil {
		t.Fatal(err)
	}
	if settings, _ := create.Body.(map[string]any)["settings"].(map[string]any); len(settings) != 0 {
		t.Fatalf("optional settings must be omitted: %#v", settings)
	}
}

func TestTencentKlingVideoOmniContents(t *testing.T) {
	adapter := loadTencentKlingVideoAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "kling-video-v4", Prompt: "dance", Duration: 5, Resolution: "720p",
		Images: []MediaReference{{URL: "https://cdn.example/ref.jpg", Role: "reference_image"}, {URL: "https://cdn.example/end.jpg", Role: "last_frame"}, {URL: "https://cdn.example/start.jpg", Role: "first_frame"}},
		Videos: []MediaReference{{URL: "https://cdn.example/m.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/v1/wand/kling/omni-video" {
		t.Fatalf("path = %s", create.Path)
	}
	body := create.Body.(map[string]any)
	if _, exists := body["prompt"]; exists {
		t.Fatalf("omni must not send top-level prompt: %#v", body)
	}
	contents, _ := body["contents"].([]any)
	want := []struct{ typ, url string }{
		{"prompt", ""},
		{"first_frame", "https://cdn.example/start.jpg"},
		{"last_frame", "https://cdn.example/end.jpg"},
		{"refer_image", "https://cdn.example/ref.jpg"},
		{"feature_video", "https://cdn.example/m.mp4"},
	}
	if len(contents) != len(want) {
		t.Fatalf("contents = %#v", contents)
	}
	for index, item := range want {
		element := contents[index].(map[string]any)
		if element["type"] != item.typ || (item.url != "" && element["url"] != item.url) {
			t.Fatalf("contents[%d] = %#v", index, element)
		}
	}
	if contents[0].(map[string]any)["text"] != "dance" {
		t.Fatalf("prompt element = %#v", contents[0])
	}
	if settings := body["settings"].(map[string]any); settings["resolution"] != "720p" || settings["duration"] != 5 {
		t.Fatalf("settings = %#v", settings)
	}
}

func TestTencentKlingVideoVoices(t *testing.T) {
	adapter := loadTencentKlingVideoAdapter(t)
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "kling-video-v4", Prompt: "p", Audios: []MediaReference{{URL: "https://cdn.example/a.mp3"}},
	}}); err == nil {
		t.Fatal("unregistered audio must be rejected")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "kling-video-v4", Prompt: "@1 says hi", Audios: []MediaReference{{URL: "kling-voice://111"}, {URL: "kling-voice://222"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/v1/wand/kling/omni-video" {
		t.Fatalf("voices need omni-video, path = %s", create.Path)
	}
	contents, _ := create.Body.(map[string]any)["contents"].([]any)
	if len(contents) != 3 {
		t.Fatalf("contents = %#v", contents)
	}
	for index, want := range []struct{ id, voice string }{{"1", "111"}, {"2", "222"}} {
		element := contents[index+1].(map[string]any)
		if element["type"] != "voice" || element["voice_id"] != want.voice || element["id"] != want.id {
			t.Fatalf("voice element = %#v", element)
		}
	}
}

func TestTencentKlingVideoParsesTaskLifecycle(t *testing.T) {
	adapter := loadTencentKlingVideoAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"code":0,"message":"SUCCEED","data":{"id":"task-1","status":"submitted"}}`))
	if err != nil || created.TaskID != "task-1" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	running, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "task-1"}, []byte(`{"code":0,"data":[{"id":"task-1","status":"processing","outputs":[]}]}`))
	if err != nil || running.Status != StatusProcessing {
		t.Fatalf("running = %#v, err = %v", running, err)
	}
	done, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "task-1"}, []byte(`{"code":0,"data":[{"id":"task-1","status":"succeeded","message":"","outputs":[{"type":"video","id":"v1","url":"https://cos.example/out.mp4?sig=1","duration":"10.04"}]}],"tokenhub_usage":{"total_tokens":600000}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://cos.example/out.mp4?sig=1" || !done.Result.Videos[0].Ephemeral {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "task-1"}, []byte(`{"code":0,"data":[{"id":"task-1","status":"failed","message":"content risk"}]}`))
	if err != nil || failed.Status != StatusFailed || failed.Message != "content risk" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}

func TestTencentKlingVideoV3Routing(t *testing.T) {
	adapter := loadTencentKlingVideoAdapter(t)
	build := func(request GenerationRequest) (string, map[string]any) {
		t.Helper()
		create, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
		if err != nil {
			t.Fatal(err)
		}
		return create.Path, create.Body.(map[string]any)
	}

	path, body := build(GenerationRequest{Model: "kling-video-v3", Prompt: "p", Resolution: "2160p", AspectRatio: "9:16", GenerateAudio: true})
	settings := body["settings"].(map[string]any)
	if path != "/v1/wand/kling/text-to-video" || settings["resolution"] != "4k" || settings["audio"] != "native" || settings["aspect_ratio"] != "9:16" {
		t.Fatalf("v3 text: %s %#v", path, body)
	}

	path, body = build(GenerationRequest{Model: "kling-video-v3", Prompt: "p", Images: []MediaReference{{URL: "https://cdn.example/a.jpg"}, {URL: "https://cdn.example/b.jpg"}}})
	contents := body["contents"].([]any)
	settings = body["settings"].(map[string]any)
	if path != "/v1/wand/kling/image-to-video" || len(contents) != 3 || contents[1].(map[string]any)["type"] != "first_frame" || contents[2].(map[string]any)["type"] != "last_frame" || settings["audio"] != "off" {
		t.Fatalf("v3 i2v: %s %#v", path, body)
	}
	if _, exists := settings["aspect_ratio"]; exists {
		t.Fatalf("image-to-video must not send aspect_ratio: %#v", settings)
	}

	path, body = build(GenerationRequest{Model: "kling-video-v3-turbo", Prompt: "p", GenerateAudio: true})
	if _, exists := body["settings"].(map[string]any)["audio"]; path != "/v1/wand/kling/text-to-video" || exists {
		t.Fatalf("turbo must not send audio: %s %#v", path, body)
	}
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "kling-video-v3-turbo", Prompt: "p", Images: []MediaReference{{URL: "https://cdn.example/a.jpg"}, {URL: "https://cdn.example/b.jpg"}}}}); err == nil {
		t.Fatal("turbo must reject a last frame")
	}
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "kling-video-v3", Prompt: "p", Videos: []MediaReference{{URL: "https://cdn.example/m.mp4"}}}}); err == nil {
		t.Fatal("v3 must reject reference videos")
	}

	path, body = build(GenerationRequest{Model: "kling-video-v3-omni", Prompt: "p"})
	settings = body["settings"].(map[string]any)
	if path != "/v1/wand/kling/omni-video" || settings["aspect_ratio"] != "16:9" || settings["audio"] != "off" {
		t.Fatalf("omni text: %s %#v", path, body)
	}

	path, body = build(GenerationRequest{Model: "kling-video-v3-omni", Prompt: "p", GenerateAudio: true, Videos: []MediaReference{{URL: "https://cdn.example/m.mp4"}}})
	settings = body["settings"].(map[string]any)
	if _, exists := settings["aspect_ratio"]; settings["audio"] != "off" || exists {
		t.Fatalf("omni with video must force audio off: %#v", settings)
	}

	_, body = build(GenerationRequest{Model: "kling-video-v3-omni", Prompt: "@1 hi", GenerateAudio: true, Audios: []MediaReference{{URL: "kling-voice://111"}}})
	if body["settings"].(map[string]any)["audio"] != "native" {
		t.Fatalf("omni with voice must send native: %#v", body)
	}
	for _, request := range []GenerationRequest{
		{Model: "kling-video-v3-omni", Prompt: "p", Audios: []MediaReference{{URL: "kling-voice://1"}}},
		{Model: "kling-video-v3-omni", Prompt: "p", GenerateAudio: true, Audios: []MediaReference{{URL: "kling-voice://1"}, {URL: "kling-voice://2"}, {URL: "kling-voice://3"}}},
		{Model: "kling-video-v3-omni", Prompt: "p", GenerateAudio: true, Audios: []MediaReference{{URL: "kling-voice://1"}}, Videos: []MediaReference{{URL: "https://cdn.example/m.mp4"}}},
	} {
		if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
			t.Fatalf("v3 omni must reject %#v", request)
		}
	}
}
