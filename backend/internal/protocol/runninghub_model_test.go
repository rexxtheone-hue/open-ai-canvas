package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadRunningHubModelAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "runninghub-model.yingce-plugin"))
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
		if adapter.Metadata().ID == "runninghub-model" {
			return adapter
		}
	}
	t.Fatal("runninghub-model provider adapter not found")
	return nil
}

func TestRunningHubModelBuildsRef2VARequest(t *testing.T) {
	adapter := loadRunningHubModelAdapter(t)
	if adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("RunningHub accepts Base64 data URIs and must not require public media URLs")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://www.runninghub.cn", Request: GenerationRequest{
		Model: "rhart-video/minimax-h3-rh-enhanced/ref2va", Prompt: "a dancing idol", Duration: 10, AspectRatio: "9:16", Resolution: "1080P",
		Images: []MediaReference{{DataURL: "data:image/png;base64,AAA"}, {URL: "https://cdn.example/ref2.png"}},
		Videos: []MediaReference{{DataURL: "data:video/mp4;base64,BBB"}},
		Audios: []MediaReference{{DataURL: "data:audio/mpeg;base64,CCC"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/openapi/v2/rhart-video/minimax-h3-rh-enhanced/ref2va" || create.ContentType != "application/json" {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	if body["prompt"] != "a dancing idol" || body["aspectRatio"] != "9:16" || body["resolution"] != "1080p" || body["duration"] != float64(10) || body["audioMode"] != "native" {
		t.Fatalf("create body = %#v", body)
	}
	if body["refImage1"] != "data:image/png;base64,AAA" || body["refImage2"] != "https://cdn.example/ref2.png" || body["refVideo1"] != "data:video/mp4;base64,BBB" || body["refAudio1"] != "data:audio/mpeg;base64,CCC" {
		t.Fatalf("media mapping = %#v", body)
	}
	for _, key := range []string{"refImage3", "refImage9", "refVideo2", "refAudio2", "driveAudio", "refVideoAudio1"} {
		if _, exists := body[key]; exists {
			t.Fatalf("empty field %s must be omitted: %#v", key, body)
		}
	}
}

func TestRunningHubModelLockSourceUsesFirstAudioAsDrive(t *testing.T) {
	adapter := loadRunningHubModelAdapter(t)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://www.runninghub.cn", Request: GenerationRequest{
		Model: "rhart-video/minimax-h3-rh-enhanced/ref2va", Prompt: "mv", Duration: 6,
		Audios:          []MediaReference{{DataURL: "data:audio/mpeg;base64,SONG"}, {DataURL: "data:audio/mpeg;base64,VOICE"}},
		ProviderOptions: map[string]map[string]any{"runninghub-model": {"audioMode": "lock_source"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := create.Body.(map[string]any)
	if body["audioMode"] != "lock_source" || body["driveAudio"] != "data:audio/mpeg;base64,SONG" || body["refAudio1"] != "data:audio/mpeg;base64,VOICE" || body["resolution"] != "768p" {
		t.Fatalf("lock_source body = %#v", body)
	}
	if _, exists := body["refAudio2"]; exists {
		t.Fatalf("refAudio2 must be omitted: %#v", body)
	}
}

func TestRunningHubModelParsesTaskLifecycle(t *testing.T) {
	adapter := loadRunningHubModelAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"taskId":"2013508786110730241","status":"RUNNING","errorCode":"","errorMessage":"","results":null,"clientId":"x","promptTips":""}`))
	if err != nil || created.TaskID != "2013508786110730241" || created.Status != StatusProcessing {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{BaseURL: "https://www.runninghub.cn", Model: "rhart-video/minimax-h3-rh-enhanced/ref2va", TaskID: created.TaskID})
	if err != nil || poll.Method != "POST" || poll.Path != "/openapi/v2/query" {
		t.Fatalf("poll spec = %#v, err = %v", poll, err)
	}
	if body, ok := poll.Body.(map[string]any); !ok || body["taskId"] != "2013508786110730241" {
		t.Fatalf("poll body = %#v", poll.Body)
	}
	queued, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"taskId":"2013508786110730241","status":"QUEUED","errorCode":"","errorMessage":"","results":null}`))
	if err != nil || queued.Status != StatusPending {
		t.Fatalf("queued = %#v, err = %v", queued, err)
	}
	completed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"taskId":"2013508786110730241","status":"SUCCESS","errorCode":"","errorMessage":"","failedReason":{},"usage":{"taskCostTime":"0"},"results":[{"url":"https://rh-images.example/output/a.mp4","nodeId":"2","outputType":"mp4","text":null}]}`))
	if err != nil || completed.Status != StatusSucceeded || completed.Result == nil || len(completed.Result.Videos) != 1 {
		t.Fatalf("completed = %#v, err = %v", completed, err)
	}
	if video := completed.Result.Videos[0]; video.URL != "https://rh-images.example/output/a.mp4" || !video.Ephemeral {
		t.Fatalf("video = %#v", video)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"taskId":"2013508786110730241","status":"FAILED","errorCode":"1000","errorMessage":"unknown error","results":null}`))
	if err != nil || failed.Status != StatusFailed || failed.Message == "" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
	silentFailure, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"taskId":"2013508786110730241","status":"","errorCode":"805","errorMessage":"insufficient balance","results":null}`))
	if err != nil || silentFailure.Status != StatusFailed {
		t.Fatalf("empty status with errorCode must fail: %#v, err = %v", silentFailure, err)
	}
}
