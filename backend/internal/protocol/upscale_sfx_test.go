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

func TestFalMireloTextSfxSendsDurationAndParsesAudioList(t *testing.T) {
	adapter := loadPackageProvider(t, "fal-queue-video", "fal-mirelo-sfx-text")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://queue.fal.run", Request: GenerationRequest{
		Model: "mirelo-ai/sfx2.0/text-to-audio", Prompt: "汽水罐打开后冒泡的嘶嘶声",
		Extra: map[string]any{"specialtyOptions": map[string]any{"duration": "3"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/mirelo-ai/sfx2.0/text-to-audio" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, create.Body, `{"prompt":"汽水罐打开后冒泡的嘶嘶声","duration":3,"negative_prompt":"music, voices","num_samples":1,"upload_audio_format":"wav"}`)

	defaults, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "mirelo-ai/sfx2.0/text-to-audio", Prompt: "雷声"}})
	if err != nil {
		t.Fatal(err)
	}
	if body := defaults.Body.(map[string]any); body["duration"] != float64(5) {
		t.Fatalf("default duration = %#v", body["duration"])
	}

	pc := PollContext{Model: "mirelo-ai/sfx2.0/text-to-audio", TaskID: "req-2"}
	done, err := adapter.ParsePoll(context.Background(), pc, []byte(`{"model":"sfx-2.0","seeds":[7],"audio":[{"url":"https://v3.fal.media/files/out.wav","content_type":"audio/wav"}]}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Audios) != 1 || done.Result.Audios[0].URL != "https://v3.fal.media/files/out.wav" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}

func TestFalIndexTTS2SendsVoiceSampleAndParsesSpeech(t *testing.T) {
	adapter := loadPackageProvider(t, "fal-queue-video", "fal-index-tts2")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://queue.fal.run", Request: GenerationRequest{
		Model: "fal-ai/index-tts-2/text-to-speech", Prompt: "大家好，欢迎来到马六甲。",
		Audios: []MediaReference{{URL: "https://cdn.example/voice.wav"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/fal-ai/index-tts-2/text-to-speech" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, create.Body, `{"prompt":"大家好，欢迎来到马六甲。","audio_url":"https://cdn.example/voice.wav"}`)
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "fal-ai/index-tts-2/text-to-speech", Prompt: "你好"}}); err == nil {
		t.Fatal("voice clone without a sample must be rejected")
	}
	pc := PollContext{Model: "fal-ai/index-tts-2/text-to-speech", TaskID: "req-4"}
	done, err := adapter.ParsePoll(context.Background(), pc, []byte(`{"audio":{"url":"https://v3.fal.media/files/tts_out.mp3","content_type":"audio/mpeg"}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Audios) != 1 || done.Result.Audios[0].URL != "https://v3.fal.media/files/tts_out.mp3" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}

func TestReplicateMotionProvidersSendImageAndDrivingVideo(t *testing.T) {
	request := GenerationRequest{
		Model: "bytedance/dreamactor-m2.0", Prompt: "跳舞", Resolution: "720p",
		Images: []MediaReference{{URL: "https://cdn.example/hero.png"}},
		Videos: []MediaReference{{URL: "https://cdn.example/dance.mp4"}},
	}
	dream := loadPackageProvider(t, "replicate-prediction-video", "replicate-dreamactor")
	create, err := dream.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.replicate.com", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/v1/models/bytedance/dreamactor-m2.0/predictions" {
		t.Fatalf("path = %s", create.Path)
	}
	assertJSONEqual(t, create.Body, `{"input":{"image":"https://cdn.example/hero.png","video":"https://cdn.example/dance.mp4","cut_first_second":true}}`)
	if _, err := dream.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: request.Model, Images: request.Images}}); err == nil {
		t.Fatal("motion sync without a driving video must be rejected")
	}

	kling := loadPackageProvider(t, "replicate-prediction-video", "replicate-kling-motion")
	request.Model = "kwaivgi/kling-v3-motion-control"
	std, err := kling.BuildCreate(context.Background(), RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, std.Body, `{"input":{"image":"https://cdn.example/hero.png","video":"https://cdn.example/dance.mp4","prompt":"跳舞","mode":"std","character_orientation":"video","keep_original_sound":true}}`)
	request.Resolution, request.Prompt = "1080p", ""
	pro, err := kling.BuildCreate(context.Background(), RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	if body := pro.Body.(map[string]any)["input"].(map[string]any); body["mode"] != "pro" || body["prompt"] != nil {
		t.Fatalf("pro body = %#v", body)
	}
	done, err := kling.ParsePoll(context.Background(), PollContext{TaskID: "p1"}, []byte(`{"id":"p1","status":"succeeded","output":"https://replicate.delivery/out.mp4"}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 || done.Result.Videos[0].URL != "https://replicate.delivery/out.mp4" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}

func TestReplicateLTXMapsFramesAndRejectsLongHighResolution(t *testing.T) {
	ltx := loadPackageProvider(t, "replicate-prediction-video", "replicate-ltx")
	request := GenerationRequest{Model: "lightricks/ltx-2.5-fast", Prompt: "海边日落", Duration: 8, AspectRatio: "9:16", Resolution: "1080p", GenerateAudio: true,
		Images: []MediaReference{{URL: "https://cdn.example/first.png"}, {URL: "https://cdn.example/last.png"}}}
	create, err := ltx.BuildCreate(context.Background(), RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/v1/models/lightricks/ltx-2.5-fast/predictions" {
		t.Fatalf("path = %s", create.Path)
	}
	assertJSONEqual(t, create.Body, `{"input":{"prompt":"海边日落","image":"https://cdn.example/first.png","last_frame_image":"https://cdn.example/last.png","duration":8,"aspect_ratio":"9:16","resolution":"1080p","fps":25,"generate_audio":true}}`)
	textOnly, err := ltx.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: request.Model, Prompt: "城市夜景", Duration: 6, Resolution: "720p"}})
	if err != nil {
		t.Fatal(err)
	}
	if input := textOnly.Body.(map[string]any)["input"].(map[string]any); input["image"] != nil || input["last_frame_image"] != nil {
		t.Fatalf("text-only input = %#v", input)
	}
	request.Resolution, request.Duration = "4k", 12
	if _, err := ltx.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("4K longer than 10 seconds must be rejected")
	}
}

func TestCloudwiseSeedAudioMatchesDoubaoContract(t *testing.T) {
	adapter := loadPackageProvider(t, "cloudwise-maas", "cloudwise-seedaudio")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.cloudwise.ai/api", Request: GenerationRequest{
		Capability: CapabilityAudio, Model: "seed-audio-1.0", Prompt: "@Audio1 大家好",
		Audios: []MediaReference{{URL: "https://cdn.example/voice.wav", Kind: "audio"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/api/v3/tts/create" || !create.OriginPath {
		t.Fatalf("create = %#v", create)
	}
	body := create.Body.(map[string]any)
	references, _ := body["references"].([]any)
	first, _ := references[0].(map[string]any)
	if body["model"] != "seed-audio-1.0" || body["text_prompt"] != "@Audio1 大家好" || len(references) != 1 || first["audio_url"] != "https://cdn.example/voice.wav" {
		t.Fatalf("body = %#v", body)
	}
	done, err := adapter.ParseCreate(context.Background(), []byte(`{"code":0,"message":"ok","url":"https://cdn.cloudwise.ai/out.wav","original_duration":3.2}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Audios) != 1 || done.Result.Audios[0].URL != "https://cdn.cloudwise.ai/out.wav" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
	// 实测同时返回 Base64 和字节 CDN 链接，CDN 在部分网络下连不上，优先用 Base64。
	both, err := adapter.ParseCreate(context.Background(), []byte(`{"audio":"SUQz","url":"https://lf3-speech-sign.bytednsdoc.com/out.mp3","duration":5.08,"original_duration":5.08}`))
	if err != nil || both.Result == nil || len(both.Result.Audios) != 1 || both.Result.Audios[0].URL == "https://lf3-speech-sign.bytednsdoc.com/out.mp3" {
		t.Fatalf("both = %#v, err = %v", both, err)
	}
}

func TestFalLyria3SendsFirstImageAndParsesSong(t *testing.T) {
	adapter := loadPackageProvider(t, "fal-queue-video", "fal-lyria3")
	create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://queue.fal.run", Request: GenerationRequest{
		Model: "fal-ai/lyria3/pro", Prompt: "温暖的 Lo-fi，纯音乐",
		Images: []MediaReference{{URL: "https://cdn.example/a.png"}, {URL: "https://cdn.example/b.png"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if create.Path != "/fal-ai/lyria3/pro" {
		t.Fatalf("create = %#v", create)
	}
	assertJSONEqual(t, create.Body, `{"prompt":"温暖的 Lo-fi，纯音乐","image_url":"https://cdn.example/a.png"}`)

	text, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "fal-ai/lyria3/pro", Prompt: "流行"}})
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, text.Body, `{"prompt":"流行"}`)

	pc := PollContext{Model: "fal-ai/lyria3/pro", TaskID: "req-3"}
	if poll, err := adapter.BuildPoll(context.Background(), pc); err != nil || poll.Path != "/fal-ai/lyria3/requests/req-3/status" {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	done, err := adapter.ParsePoll(context.Background(), pc, []byte(`{"lyrics":"","audio":{"url":"https://v3.fal.media/files/song.mp3","content_type":"audio/mpeg"}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Audios) != 1 || done.Result.Audios[0].URL != "https://v3.fal.media/files/song.mp3" {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
}
