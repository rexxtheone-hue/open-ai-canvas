package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func loadModelVerseSeedanceAdapter(t *testing.T) Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "ucloud-modelverse-seedance.yingce-plugin"))
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
		if adapter.Metadata().ID == "modelverse-seedance-video" {
			return adapter
		}
	}
	t.Fatal("modelverse-seedance-video provider adapter not found")
	return nil
}

func TestModelVerseSeedanceWrapsArkContentInInput(t *testing.T) {
	adapter := loadModelVerseSeedanceAdapter(t)
	if !adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("ModelVerse fetches media by URL")
	}
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.modelverse.cn/v1", Request: GenerationRequest{
		Model: "doubao-seedance-2-0-260128", Prompt: "让他跑起来。", Duration: 5, AspectRatio: "16:9", Resolution: "720p", GenerateAudio: true,
		Images: []MediaReference{{URL: "https://cdn.example/start.jpg", Role: "first_frame"}},
		Videos: []MediaReference{{URL: "https://cdn.example/camera.mp4"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Method != "POST" || create.Path != "/v1/tasks/submit" || !create.OriginPath || create.ContentType != "application/json" {
		t.Fatalf("create spec = %#v", create)
	}
	body := create.Body.(map[string]any)
	if body["model"] != "doubao-seedance-2-0-260128" {
		t.Fatalf("model = %#v", body["model"])
	}
	input, _ := body["input"].(map[string]any)
	content, _ := input["content"].([]any)
	if len(content) != 3 {
		t.Fatalf("content = %#v", content)
	}
	text, _ := content[0].(map[string]any)
	image, _ := content[1].(map[string]any)
	video, _ := content[2].(map[string]any)
	imageURL, _ := image["image_url"].(map[string]any)
	videoURL, _ := video["video_url"].(map[string]any)
	if text["type"] != "text" || text["text"] != "让他跑起来。" || image["role"] != "first_frame" || imageURL["url"] != "https://cdn.example/start.jpg" || video["role"] != "reference_video" || videoURL["url"] != "https://cdn.example/camera.mp4" {
		t.Fatalf("content = %#v", content)
	}
	parameters, _ := body["parameters"].(map[string]any)
	if parameters["ratio"] != "16:9" || parameters["resolution"] != "720p" || parameters["duration"] != 5 || parameters["generate_audio"] != true {
		t.Fatalf("parameters = %#v", parameters)
	}
	if _, exists := body["content"]; exists {
		t.Fatalf("content must be nested in input: %#v", body)
	}
}

func TestModelVerseSeedanceParsesTaskLifecycle(t *testing.T) {
	adapter := loadModelVerseSeedanceAdapter(t)
	created, err := adapter.ParseCreate(context.Background(), []byte(`{"output":{"task_id":"task_mv_1"},"request_id":"req_1"}`))
	if err != nil || created.TaskID != "task_mv_1" || created.Status != StatusPending {
		t.Fatalf("created = %#v, err = %v", created, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{BaseURL: "https://api.modelverse.cn", Model: "doubao-seedance-2-0-260128", TaskID: created.TaskID})
	if err != nil || poll.Method != "GET" || poll.Path != "/v1/tasks/status" || !poll.OriginPath || len(poll.Query["task_id"]) != 1 || poll.Query["task_id"][0] != "task_mv_1" {
		t.Fatalf("poll spec = %#v, err = %v", poll, err)
	}
	for raw, want := range map[string]Status{
		`{"output":{"task_id":"task_mv_1","task_status":"Pending"}}`: StatusPending,
		`{"output":{"task_id":"task_mv_1","task_status":"Running"}}`: StatusProcessing,
	} {
		result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(raw))
		if err != nil || result.Status != want {
			t.Fatalf("%s => %#v, err = %v", raw, result, err)
		}
	}
	completed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"output":{"task_id":"task_mv_1","task_status":"Success","urls":["https://cdn.modelverse.example/v.mp4"],"submit_time":1768460826,"finish_time":1768460932},"usage":{"duration":5},"request_id":""}`))
	if err != nil || completed.Status != StatusSucceeded || completed.Result == nil || len(completed.Result.Videos) != 1 || completed.Result.Videos[0].URL != "https://cdn.modelverse.example/v.mp4" || !completed.Result.Videos[0].Ephemeral {
		t.Fatalf("completed = %#v, err = %v", completed, err)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: created.TaskID}, []byte(`{"output":{"task_id":"task_mv_1","task_status":"Failure","error_message":"content moderation"}}`))
	if err != nil || failed.Status != StatusFailed || failed.Message == "" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}
