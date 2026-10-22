package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadPackageProvider(t *testing.T, packageID, providerID string) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", packageID+".yingce-plugin"))
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
	t.Fatalf("%s provider adapter not found in %s", providerID, packageID)
	return nil
}

func TestRunningHubUpscaleMapsStudioOptions(t *testing.T) {
	adapter := loadPackageProvider(t, "runninghub-model", "runninghub-upscale")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://www.runninghub.cn", Request: GenerationRequest{
		Model: "rhart-video/rh-upscale/enhance-frame", Prompt: "把视频提升到 2K",
		Videos: []MediaReference{{URL: "https://cdn.example/in.mp4"}},
		Extra:  map[string]any{"specialtyOptions": map[string]any{"resolution": "1440", "fps": "60", "mode": "pro"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/openapi/v2/rhart-video/rh-upscale/enhance-frame" || !create.OriginPath {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, create.Body, `{"fileUrl":"https://cdn.example/in.mp4","model":"max","resolution":"2k","outputFps":"60"}`)

	defaults, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "rhart-video/rh-upscale/enhance-frame", Videos: []MediaReference{{URL: "https://cdn.example/in.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, defaults.Body, `{"fileUrl":"https://cdn.example/in.mp4","model":"max","resolution":"1080p","outputFps":"1x"}`)

	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "rhart-video/rh-upscale/enhance-frame"}}); err == nil {
		t.Fatal("upscale without a video must be rejected")
	}
	done, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "t1"}, []byte(`{"taskId":"t1","status":"SUCCESS","results":[{"url":"https://rh.example/out.mp4","outputType":"mp4"}]}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://rh.example/out.mp4" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}

func TestFalMireloSfxSendsOneSampleAndParsesVideoList(t *testing.T) {
	adapter := loadPackageProvider(t, "fal-queue-video", "fal-mirelo-sfx")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://queue.fal.run", Request: GenerationRequest{
		Model: "mirelo-ai/sfx2.0/video-to-video", Prompt: "footsteps, distant thunder",
		Videos: []MediaReference{{URL: "https://cdn.example/in.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/mirelo-ai/sfx2.0/video-to-video" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, create.Body, `{"video_url":"https://cdn.example/in.mp4","text_prompt":"footsteps, distant thunder","negative_prompt":"music","preserve_speech":true,"num_samples":1}`)

	muted, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "mirelo-ai/sfx2.0/video-to-video", Videos: []MediaReference{{URL: "https://cdn.example/in.mp4"}},
		Extra: map[string]any{"specialtyOptions": map[string]any{"keep": "off"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if body := muted.Body.(map[string]any); body["preserve_speech"] != false {
		t.Fatalf("keep=off should drop speech: %#v", body)
	}

	pc := PollContext{Model: "mirelo-ai/sfx2.0/video-to-video", TaskID: "req-1"}
	if poll, err := adapter.BuildPoll(context.Background(), pc); err != nil || poll.Path != "/mirelo-ai/sfx2.0/requests/req-1/status" {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	done, err := adapter.ParsePoll(context.Background(), pc, []byte(`{"model":"sfx-2.0","video":[{"url":"https://v3.fal.media/files/out.mp4","content_type":"video/mp4"}]}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://v3.fal.media/files/out.mp4" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}
