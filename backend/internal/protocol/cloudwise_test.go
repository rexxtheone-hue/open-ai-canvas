package protocol

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func cloudwiseBody(t *testing.T, providerID string, request GenerationRequest) (RequestSpec, map[string]any) {
	t.Helper()
	adapter := loadModelVersePackageAdapter(t, "cloudwise-maas", providerID)
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.cloudwise.ai/api", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(create.Body)
	var body map[string]any
	_ = json.Unmarshal(encoded, &body)
	return create, body
}

func assertJSONEqual(t *testing.T, got any, want string) {
	t.Helper()
	gotJSON, _ := json.Marshal(got)
	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatal(err)
	}
	wantJSON, _ := json.Marshal(wantValue)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("\n got %s\nwant %s", gotJSON, wantJSON)
	}
}

func assertCloudwiseLifecycle(t *testing.T, providerID, createPath, pollPath, created, running, done, failed string, kind string) {
	t.Helper()
	adapter := loadModelVersePackageAdapter(t, "cloudwise-maas", providerID)
	parsed, err := adapter.ParseCreate(context.Background(), []byte(created))
	if err != nil || parsed.TaskID != "t1" || parsed.Status == StatusFailed {
		t.Fatalf("create = %#v, err = %v", parsed, err)
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "t1"})
	if err != nil || poll.Path != pollPath || !poll.OriginPath {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	if state, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "t1"}, []byte(running)); err != nil || (state.Status != StatusPending && state.Status != StatusProcessing) {
		t.Fatalf("running = %#v, err = %v", state, err)
	}
	state, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "t1"}, []byte(done))
	if err != nil || state.Status != StatusSucceeded || state.Result == nil {
		t.Fatalf("done = %#v, err = %v", state, err)
	}
	media := state.Result.Videos
	if kind == "image" {
		media = state.Result.Images
	}
	if len(media) == 0 || media[0].URL == "" || !media[0].Ephemeral {
		t.Fatalf("media = %#v", state.Result)
	}
	if bad, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "t1"}, []byte(failed)); err != nil || bad.Status != StatusFailed || bad.Message == "" {
		t.Fatalf("failed = %#v, err = %v", bad, err)
	}
	_ = createPath
}

func TestCloudwiseSeedanceUsesArkBodyOnCloudwisePaths(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-seedance", GenerationRequest{Model: "dreamina-seedance-2-0-260128", Prompt: "茶饮广告", AspectRatio: "16:9", Resolution: "720p", Duration: 11, GenerateAudio: true,
		Images: []MediaReference{{URL: "https://x/a.jpg"}}, Audios: []MediaReference{{URL: "https://x/a.mp3"}}})
	if create.Path != "/api/v1/aiproducts/video/seedance" || !create.OriginPath {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"dreamina-seedance-2-0-260128","content":[{"type":"text","text":"茶饮广告"},{"type":"image_url","image_url":{"url":"https://x/a.jpg"},"role":"reference_image"},{"type":"audio_url","audio_url":{"url":"https://x/a.mp3"},"role":"reference_audio"}],"ratio":"16:9","resolution":"720p","duration":11,"generate_audio":true,"watermark":false}`)
	assertCloudwiseLifecycle(t, "cloudwise-seedance", "", "/api/v1/aiproducts/video/seedance/tasks/t1",
		`{"id":"t1"}`, `{"id":"t1","status":"running"}`,
		`{"id":"t1","status":"succeeded","content":{"video_url":"https://download.cloudwise.ai/arts/1"}}`,
		`{"id":"t1","status":"failed","error":{"message":"blocked"}}`, "video")
	_, firstFrame := cloudwiseBody(t, "cloudwise-seedance", GenerationRequest{Model: "dreamina-seedance-2-5-260628", Prompt: "推门", AspectRatio: "9:16", Resolution: "720p", Duration: 4,
		Images: []MediaReference{{URL: "https://x/f.jpg", Role: "first_frame"}}})
	if firstFrame["ratio"] != "adaptive" {
		t.Fatalf("first frame ratio = %v", firstFrame["ratio"])
	}
}

func TestCloudwiseKlingOmniVideoAndImage(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-kling-video", GenerationRequest{Model: "kling-v3-omni", Prompt: "花园", AspectRatio: "16:9", Resolution: "1080p", Duration: 5, GenerateAudio: true,
		Images: []MediaReference{{URL: "https://x/f.jpg", Role: "first_frame"}, {URL: "https://x/l.jpg", Role: "last_frame"}, {URL: "https://x/r.jpg", Role: "reference_image"}}})
	if create.Path != "/api/v1/videos/omni-video" || !create.OriginPath {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model_name":"kling-v3-omni","prompt":"花园","mode":"pro","aspect_ratio":"16:9","duration":"5","sound":"on","image_list":[{"image_url":"https://x/f.jpg","type":"first_frame"},{"image_url":"https://x/l.jpg","type":"end_frame"},{"image_url":"https://x/r.jpg"}]}`)
	_, edit := cloudwiseBody(t, "cloudwise-kling-video", GenerationRequest{Model: "kling-video-o1", Prompt: "换背景", Resolution: "720p", GenerateAudio: true, Videos: []MediaReference{{URL: "https://x/v.mp4", Role: "base"}}})
	assertJSONEqual(t, edit, `{"model_name":"kling-video-o1","prompt":"换背景","mode":"std","sound":"off","video_list":[{"video_url":"https://x/v.mp4","refer_type":"base","keep_original_sound":"yes"}]}`)
	assertCloudwiseLifecycle(t, "cloudwise-kling-video", "", "/api/v1/videos/omni-video/t1",
		`{"code":0,"message":"success","data":{"task_id":"t1","task_status":"submitted"}}`,
		`{"code":0,"data":{"task_id":"t1","task_status":"processing"}}`,
		`{"code":0,"data":{"task_id":"t1","task_status":"succeed","task_result":{"videos":[{"id":"v","url":"https://download.example.com/video.mp4","duration":"5"}]}}}`,
		`{"code":0,"data":{"task_id":"t1","task_status":"failed","task_status_msg":"内容不合规"}}`, "video")

	create, body = cloudwiseBody(t, "cloudwise-kling-image", GenerationRequest{Model: "kling-image-o1", Prompt: "合影", AspectRatio: "3:2", Resolution: "2K", ImageCount: 2, Images: []MediaReference{{URL: "https://x/1.png"}}})
	if create.Path != "/api/v1/images/omni-image" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model_name":"kling-image-o1","prompt":"合影","resolution":"2k","aspect_ratio":"3:2","image_list":[{"image":"https://x/1.png"}],"n":2}`)
	assertCloudwiseLifecycle(t, "cloudwise-kling-image", "", "/api/v1/images/omni-image/t1",
		`{"code":0,"data":{"task_id":"t1","task_status":"submitted"}}`,
		`{"code":0,"data":{"task_id":"t1","task_status":"processing"}}`,
		`{"code":0,"data":{"task_id":"t1","task_status":"succeed","task_result":{"result_type":"single","images":[{"index":0,"url":"https://download.example.com/image.png"}],"series_images":[]}}}`,
		`{"code":0,"data":{"task_id":"t1","task_status":"failed","task_status_msg":"失败"}}`, "image")
}

func TestCloudwiseMiniMaxH3(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-minimax-video", GenerationRequest{Model: "MiniMax-H3", Prompt: "猫", Resolution: "1080p", AspectRatio: "16:9", Duration: 6, Videos: []MediaReference{{URL: "https://x/v.mp4"}}})
	if create.Path != "/api/v2/video_generation" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"MiniMax-H3","content":[{"type":"text","text":"猫"},{"type":"video_url","video_url":{"url":"https://x/v.mp4"},"role":"reference_video"}],"resolution":"2K","duration":6,"ratio":"16:9"}`)
	_, maxBody := cloudwiseBody(t, "cloudwise-minimax-video", GenerationRequest{Model: "MiniMax-H3-Max", Prompt: "猫", Images: []MediaReference{{URL: "https://x/f.png"}}})
	assertJSONEqual(t, maxBody, `{"model":"MiniMax-H3-Max","content":[{"type":"text","text":"猫"},{"type":"image_url","image_url":{"url":"https://x/f.png"}}],"resolution":"768P","duration":5,"ratio":"adaptive"}`)
	assertCloudwiseLifecycle(t, "cloudwise-minimax-video", "", "/api/v2/query/video_generation/t1",
		`{"task_id":"t1"}`, `{"task":{"id":"t1","status":"processing"}}`,
		`{"task":{"id":"t1","status":"succeeded","content":{"url":"https://video-product.cdn.minimax.io/output.mp4"}}}`,
		`{"task":{"id":"t1","status":"failed","error":{"code":"1026","message":"content blocked by moderation"}}}`, "video")
}

func TestCloudwiseUnifiedVideoAndImage(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-unified-video", GenerationRequest{Model: "wan2.6-t2v", Prompt: "日落", Resolution: "1080p", AspectRatio: "9:16", Duration: 10})
	if create.Path != "/api/v1/video-generation/submit" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"wan2.6-t2v","content":{"prompt":"日落"},"duration":10,"resolution":"1080*1920"}`)
	_, sora := cloudwiseBody(t, "cloudwise-unified-video", GenerationRequest{Model: "sora-2", Prompt: "海", AspectRatio: "9:16", Duration: 8})
	assertJSONEqual(t, sora, `{"model":"sora-2","content":{"prompt":"海"},"duration":8,"resolution":"720x1280"}`)
	_, seedance := cloudwiseBody(t, "cloudwise-unified-video", GenerationRequest{Model: "seedance-1.5-pro", Prompt: "跑", Resolution: "720p", Duration: 5, GenerateAudio: true, Images: []MediaReference{{URL: "https://x/a.jpg"}, {URL: "https://x/b.jpg"}}})
	assertJSONEqual(t, seedance, `{"model":"seedance-1.5-pro","content":{"prompt":"跑","image_url":"https://x/a.jpg","image_url_last":"https://x/b.jpg"},"duration":5,"resolution":"720p","generate_audio":true}`)
	assertCloudwiseLifecycle(t, "cloudwise-unified-video", "", "/api/v1/video-generation/video-content/t1",
		`{"success":true,"id":"t1"}`, `{"success":true,"task_id":"t1","taskStatus":"RUNNING"}`,
		`{"video_url":"https://download.cloudwise.ai/arts/v","success":true,"task_id":"t1","taskStatus":"COMPLETED"}`,
		`{"success":true,"task_id":"t1","taskStatus":"FAILED","message":"失败"}`, "video")

	create, body = cloudwiseBody(t, "cloudwise-unified-image", GenerationRequest{Model: "seedream-4.5", Prompt: "海报", Resolution: "2k", Images: []MediaReference{{URL: "https://x/1.png"}, {URL: "https://x/2.png"}}})
	if create.Path != "/api/v1/image-generation" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"seedream-4.5","prompt":"海报","image":["https://x/1.png","https://x/2.png"],"size":"2K"}`)
	_, gemini := cloudwiseBody(t, "cloudwise-unified-image", GenerationRequest{Model: "gemini-3-pro-image-preview", Prompt: "换成苹果", Resolution: "2k", Images: []MediaReference{{URL: "https://x/1.png"}}})
	assertJSONEqual(t, gemini, `{"model":"gemini-3-pro-image-preview","prompt":"换成苹果","image":"https://x/1.png"}`)
	adapter := loadModelVersePackageAdapter(t, "cloudwise-maas", "cloudwise-unified-image")
	done, err := adapter.ParseCreate(context.Background(), []byte(`{"image_url":"https://download.cloudwise.ai/arts/img","usage":{"costs":0.05,"unit":"usd"},"task_id":"t9","model":"seedream-4.5"}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Images) != 1 {
		t.Fatalf("image = %#v, err = %v", done, err)
	}
}

func TestCloudwiseWan3UsesDashScopeBodyAndWrappedPollResult(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-wan", GenerationRequest{Model: "wan3.0-video", Prompt: "图中女人在菜市场选菜", AspectRatio: "16:9", Resolution: "1080p", Duration: 5,
		Images: []MediaReference{{URL: "https://x/a.jpg"}}})
	if parameters, _ := body["parameters"].(map[string]any); parameters["resolution"] != "1080P" {
		t.Fatalf("parameters = %#v", body["parameters"])
	}
	if create.Path != "/api/v1/services/aigc/video-generation/video-synthesis" || !create.OriginPath || create.Headers["X-DashScope-Async"] != "enable" {
		t.Fatalf("create = %#v", create)
	}
	input, _ := body["input"].(map[string]any)
	media, _ := input["media"].([]any)
	if body["model"] != "wan3.0-video" || input["prompt"] != "图中女人在菜市场选菜" || len(media) != 1 {
		t.Fatalf("body = %#v", body)
	}
	assertJSONEqual(t, media[0], `{"type":"reference_image","url":"https://x/a.jpg"}`)
	assertCloudwiseLifecycle(t, "cloudwise-wan", "", "/api/v1/tasks/t1",
		`{"output":{"task_id":"t1","task_status":"PENDING"},"request_id":"r1"}`,
		`{"code":"10000","data":{"output":{"task_id":"t1","task_status":"RUNNING"}},"success":true}`,
		`{"code":"10000","data":{"output":{"task_id":"t1","task_status":"SUCCEEDED","video_url":"https://download.cloudwise.ai/arts/1"}},"success":true,"taskStatus":"COMPLETED"}`,
		`{"code":"10000","data":{"output":{"task_id":"t1","task_status":"FAILED","code":"DataInspectionFailed","message":"blocked"}},"success":true}`, "video")
	adapter := loadModelVersePackageAdapter(t, "cloudwise-maas", "cloudwise-wan")
	if rejected, err := adapter.ParseCreate(context.Background(), []byte(`{"code":"InvalidParameter","message":"bad ratio"}`)); err == nil && rejected.Status != StatusFailed {
		t.Fatalf("rejected = %#v", rejected)
	}
}

func TestCloudwiseUnifiedVideoRejectsWan3WithProtocolHint(t *testing.T) {
	adapter := loadModelVersePackageAdapter(t, "cloudwise-maas", "cloudwise-unified-video")
	_, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.cloudwise.ai/api", Request: GenerationRequest{Model: "wan3.0-video", Prompt: "x"}})
	if err == nil || !strings.Contains(err.Error(), "Cloudwise 万相 3.0") {
		t.Fatalf("err = %v", err)
	}
}

func TestCloudwiseViduRoutesFirstFrameAndReferenceRequests(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-vidu", GenerationRequest{Model: "viduq4", Prompt: "让画面动起来", AspectRatio: "16:9", Resolution: "720p", Duration: 5, GenerateAudio: true,
		Images: []MediaReference{{URL: "https://x/first.png", Role: "first_frame"}}})
	if create.Path != "/api/ent/v2/img2video" || !create.OriginPath {
		t.Fatalf("first frame create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"viduq4","prompt":"让画面动起来","images":["https://x/first.png"],"duration":5,"aspect_ratio":"16:9","resolution":"720p","audio":true}`)

	create, body = cloudwiseBody(t, "cloudwise-vidu", GenerationRequest{Model: "viduq4", Prompt: "图1在图2的场景里说话", AspectRatio: "3:4", Resolution: "2k", Duration: 8,
		Images: []MediaReference{{URL: "https://x/a.png"}, {URL: "https://x/b.png"}}, Audios: []MediaReference{{URL: "https://x/v.mp3"}}})
	if create.Path != "/api/ent/v2/reference2video" {
		t.Fatalf("reference create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"viduq4","prompt":"图1在图2的场景里说话","images":["https://x/a.png","https://x/b.png"],"sounds":["https://x/v.mp3"],"duration":8,"aspect_ratio":"3:4","resolution":"2K","audio":false}`)

	assertCloudwiseLifecycle(t, "cloudwise-vidu", "", "/api/ent/v2/tasks/t1/creations",
		`{"task_id":"t1","state":"created","model":"viduq4"}`,
		`{"code":"10000","data":{"id":"t1","state":"processing","progress":40},"success":true}`,
		`{"code":"10000","data":{"id":"t1","state":"success","creations":[{"id":"c1","url":"https://download.cloudwise.ai/arts/1"}]},"success":true,"taskStatus":"COMPLETED"}`,
		`{"code":"10000","data":{"id":"t1","state":"failed","err_msg":"content blocked"},"success":true}`, "video")
}

func TestCloudwiseSeedream5ProMapsRatioToPixelsAndParsesSyncResult(t *testing.T) {
	create, body := cloudwiseBody(t, "cloudwise-seedream-image", GenerationRequest{Model: "doubao-seedream-5-0-pro-260628", Prompt: "咖啡馆", AspectRatio: "16:9", Resolution: "2k"})
	if create.Path != "/api/v1/aiproducts/image/seedream" || !create.OriginPath {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, body, `{"model":"doubao-seedream-5-0-pro-260628","prompt":"咖啡馆","size":"2848x1600","response_format":"url","watermark":false,"output_format":"png"}`)
	_, one := cloudwiseBody(t, "cloudwise-seedream-image", GenerationRequest{Model: "m", Prompt: "p", AspectRatio: "9:16", Resolution: "1K", Images: []MediaReference{{URL: "https://x/1.png"}}})
	assertJSONEqual(t, one, `{"model":"m","prompt":"p","image":"https://x/1.png","size":"736x1312","response_format":"url","watermark":false,"output_format":"png"}`)
	_, many := cloudwiseBody(t, "cloudwise-seedream-image", GenerationRequest{Model: "m", Prompt: "p", AspectRatio: "1600x900", Images: []MediaReference{{URL: "https://x/1.png"}, {URL: "https://x/2.png"}}})
	assertJSONEqual(t, many, `{"model":"m","prompt":"p","image":["https://x/1.png","https://x/2.png"],"size":"1600x900","response_format":"url","watermark":false,"output_format":"png"}`)
	_, auto := cloudwiseBody(t, "cloudwise-seedream-image", GenerationRequest{Model: "m", Prompt: "p", AspectRatio: "auto", Resolution: "1k"})
	if auto["size"] != "1K" {
		t.Fatalf("auto size = %#v", auto["size"])
	}
	adapter := loadModelVersePackageAdapter(t, "cloudwise-maas", "cloudwise-seedream-image")
	done, err := adapter.ParseCreate(context.Background(), []byte(`{"model":"m","data":[{"url":"https://ark.example/a.jpeg","size":"2848x1600"}],"usage":{"generated_images":1,"output_tokens":17800}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Images) != 1 || done.Result.Images[0].URL == "" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
	bad, err := adapter.ParseCreate(context.Background(), []byte(`{"model":"m","data":[{"error":{"code":"OutputImageSensitiveContentDetected","message":"blocked"}}],"usage":{"generated_images":0}}`))
	if err != nil || bad.Status != StatusFailed || bad.Message != "blocked" {
		t.Fatalf("bad = %#v, err = %v", bad, err)
	}
}

func TestCloudwiseSeedanceVideoEditOmitsRatioAndDuration(t *testing.T) {
	_, body := cloudwiseBody(t, "cloudwise-seedance", GenerationRequest{Model: "dreamina-seedance-2-5-260628", Prompt: "把面换成番茄汤", Operation: "inpaint", AspectRatio: "16:9", Resolution: "480p", Duration: 5,
		Videos: []MediaReference{{URL: "asset://video-1"}}})
	if _, ok := body["duration"]; ok {
		t.Fatalf("edit request still sends duration: %#v", body)
	}
	if _, ok := body["ratio"]; ok {
		t.Fatalf("edit request still sends ratio: %#v", body)
	}
	if body["resolution"] != "480p" {
		t.Fatalf("resolution = %#v", body["resolution"])
	}
}

func TestCloudwiseWan3RestyleOmitsRatioAndDuration(t *testing.T) {
	_, body := cloudwiseBody(t, "cloudwise-wan", GenerationRequest{Model: "wan3.0-video", Prompt: "转成动漫风格", Operation: "style_transfer", AspectRatio: "16:9", Resolution: "720p", Duration: 5,
		Videos: []MediaReference{{URL: "https://x/v.mp4", Role: "reference_video"}}})
	params, _ := body["parameters"].(map[string]any)
	if _, ok := params["duration"]; ok {
		t.Fatalf("restyle still sends duration: %#v", params)
	}
	if _, ok := params["ratio"]; ok {
		t.Fatalf("restyle still sends ratio: %#v", params)
	}
	if params["resolution"] != "720P" {
		t.Fatalf("resolution = %#v", params["resolution"])
	}
	_, normal := cloudwiseBody(t, "cloudwise-wan", GenerationRequest{Model: "wan3.0-video", Prompt: "日落", AspectRatio: "16:9", Resolution: "720p", Duration: 5})
	if p, _ := normal["parameters"].(map[string]any); p["duration"] == nil || p["ratio"] != "16:9" {
		t.Fatalf("normal generation lost ratio/duration: %#v", p)
	}
}
