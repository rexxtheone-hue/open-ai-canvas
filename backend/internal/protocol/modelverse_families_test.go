package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func loadModelVersePackageAdapter(t *testing.T, packageID, providerID string) Adapter {
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
	t.Fatalf("%s provider adapter not found", providerID)
	return nil
}

type modelVerseBodyCase struct {
	name    string
	request GenerationRequest
	want    string
}

func assertModelVerseBodies(t *testing.T, packageID, providerID string, cases []modelVerseBodyCase) {
	t.Helper()
	adapter := loadModelVersePackageAdapter(t, packageID, providerID)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			create, err := adapter.BuildCreate(context.Background(), RequestContext{BaseURL: "https://api.modelverse.cn/v1", Request: tc.request})
			if err != nil {
				t.Fatal(err)
			}
			if create.Method != "POST" || create.Path != "/v1/tasks/submit" || !create.OriginPath {
				t.Fatalf("create spec = %#v", create)
			}
			got, _ := json.Marshal(create.Body)
			var gotValue, wantValue any
			_ = json.Unmarshal(got, &gotValue)
			if err := json.Unmarshal([]byte(tc.want), &wantValue); err != nil {
				t.Fatal(err)
			}
			gotJSON, _ := json.Marshal(gotValue)
			wantJSON, _ := json.Marshal(wantValue)
			if string(gotJSON) != string(wantJSON) {
				t.Fatalf("body\n got %s\nwant %s", gotJSON, wantJSON)
			}
		})
	}
	poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "t1"})
	if err != nil || poll.Path != "/v1/tasks/status" || !poll.OriginPath || poll.Query["task_id"][0] != "t1" {
		t.Fatalf("poll = %#v, err = %v", poll, err)
	}
	done, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "t1"}, []byte(`{"output":{"task_id":"t1","task_status":"SUCCEEDED","urls":["https://x/v.mp4"]}}`))
	if err != nil || done.Status != StatusSucceeded || done.Result == nil || len(done.Result.Videos) != 1 {
		t.Fatalf("done = %#v, err = %v", done, err)
	}
	failed, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "t1"}, []byte(`{"output":{"task_id":"t1","task_status":"FAILED","code":"InvalidParameter","message":"bad"}}`))
	if err != nil || failed.Status != StatusFailed || failed.Message != "bad" {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}
}

func image(url, role string) MediaReference { return MediaReference{URL: url, Role: role} }

func TestModelVerseKlingBodies(t *testing.T) {
	assertModelVerseBodies(t, "ucloud-modelverse-kling", "modelverse-kling-video", []modelVerseBodyCase{
		{"v3 text", GenerationRequest{Model: "kling-v3", Prompt: "日落", AspectRatio: "16:9", Resolution: "1080p", Duration: 5, GenerateAudio: true},
			`{"model":"kling-v3","input":{"prompt":"日落"},"parameters":{"kling_v3_type":"t2v","mode":"pro","aspect_ratio":"16:9","duration":5,"sound":"on"}}`},
		{"v3 frames", GenerationRequest{Model: "kling-v3", Prompt: "花园", Resolution: "720p", Duration: 5, Images: []MediaReference{image("https://x/a.jpg", ""), image("https://x/b.jpg", "")}},
			`{"model":"kling-v3","input":{"prompt":"花园"},"parameters":{"kling_v3_type":"i2v","mode":"std","duration":5,"sound":"off","image":"https://x/a.jpg","image_tail":"https://x/b.jpg"}}`},
		{"v3 motion", GenerationRequest{Model: "kling-v3", Prompt: "跳舞", AspectRatio: "16:9", Duration: 5, Images: []MediaReference{image("https://x/c.jpg", "reference_image")}, Videos: []MediaReference{{URL: "https://x/m.mp4"}}},
			`{"model":"kling-v3","input":{"prompt":"跳舞","img_url":"https://x/c.jpg","video_url":"https://x/m.mp4"},"parameters":{"kling_v3_type":"motion_control","mode":"pro","aspect_ratio":"16:9","duration":5,"character_orientation":"image"}}`},
		{"omni frames and refs", GenerationRequest{Model: "kling-v3-omni", Prompt: "走路", AspectRatio: "16:9", Duration: 5, Images: []MediaReference{image("https://x/f.jpg", "first_frame"), image("https://x/l.jpg", "last_frame"), image("https://x/r.jpg", "reference_image")}},
			`{"model":"kling-v3-omni","input":{"prompt":"走路"},"parameters":{"mode":"pro","aspect_ratio":"16:9","duration":5,"sound":"off","image_list":[{"image_url":"https://x/f.jpg","type":"first_frame"},{"image_url":"https://x/l.jpg","type":"end_frame"},{"image_url":"https://x/r.jpg"}]}}`},
		{"o1 video edit", GenerationRequest{Model: "kling-video-o1", Prompt: "换背景", Resolution: "720p", Videos: []MediaReference{{URL: "https://x/base.mp4", Role: "base"}}},
			`{"model":"kling-video-o1","input":{"prompt":"换背景"},"parameters":{"mode":"pro","video_list":[{"video_url":"https://x/base.mp4","refer_type":"base","keep_original_sound":"yes"}]}}`},
		{"v2.6 i2v", GenerationRequest{Model: "kling-v2-6", Prompt: "动起来", AspectRatio: "9:16", Duration: 10, Images: []MediaReference{image("https://x/a.jpg", "first_frame")}},
			`{"model":"kling-v2-6","input":{"prompt":"动起来"},"parameters":{"mode":"pro","aspect_ratio":"9:16","duration":10,"image":"https://x/a.jpg"}}`},
	})
}

func TestModelVerseWanBodies(t *testing.T) {
	assertModelVerseBodies(t, "ucloud-modelverse-wan", "modelverse-wan-video", []modelVerseBodyCase{
		{"wan3 i2v", GenerationRequest{Model: "wan3.0-video", Prompt: "猫咪奔跑", Resolution: "720p", AspectRatio: "9:16", Duration: 8, GenerateAudio: true, Images: []MediaReference{image("https://x/cat.jpg", "")}},
			`{"model":"wan3.0-video","input":{"prompt":"猫咪奔跑","media":[{"type":"first_frame","url":"https://x/cat.jpg"}]},"parameters":{"resolution":"720P","ratio":"9:16","duration":8,"watermark":false,"audio":true}}`},
		{"wan3 text", GenerationRequest{Model: "wan3.0-video-prime", Prompt: "橘猫", Resolution: "1080p", AspectRatio: "16:9", Duration: 10},
			`{"model":"wan3.0-video-prime","input":{"prompt":"橘猫"},"parameters":{"resolution":"1080P","ratio":"16:9","duration":10,"watermark":false,"audio":false}}`},
		{"wan2.7 i2v audio", GenerationRequest{Model: "wan2.7-i2v", Prompt: "唱歌", Resolution: "720p", Duration: 10, Images: []MediaReference{image("https://x/boy.png", "")}, Audios: []MediaReference{{URL: "https://x/a.mp3"}}},
			`{"model":"wan2.7-i2v","input":{"prompt":"唱歌","media":[{"type":"first_frame","url":"https://x/boy.png"},{"type":"driving_audio","url":"https://x/a.mp3"}]},"parameters":{"resolution":"720P","duration":10,"watermark":false}}`},
		{"wan2.7 r2v", GenerationRequest{Model: "wan2.7-r2v", Prompt: "Image 1 的猫", Resolution: "1080p", AspectRatio: "16:9", Duration: 5, Images: []MediaReference{image("https://x/f.png", "first_frame"), image("https://x/cat.jpg", "")}, Videos: []MediaReference{{URL: "https://x/boy.mp4"}}},
			`{"model":"wan2.7-r2v","input":{"prompt":"Image 1 的猫","media":[{"type":"first_frame","url":"https://x/f.png"},{"type":"reference_image","url":"https://x/cat.jpg"},{"type":"reference_video","url":"https://x/boy.mp4"}]},"parameters":{"resolution":"1080P","ratio":"16:9","duration":5,"watermark":false}}`},
		{"wan2.7 videoedit", GenerationRequest{Model: "wan2.7-videoedit", Prompt: "换衣服", Resolution: "720p", Videos: []MediaReference{{URL: "https://x/v.mp4"}}, Images: []MediaReference{image("https://x/c.png", "")}},
			`{"model":"wan2.7-videoedit","input":{"prompt":"换衣服","media":[{"type":"video","url":"https://x/v.mp4"},{"type":"reference_image","url":"https://x/c.png"}]},"parameters":{"resolution":"720P","watermark":false}}`},
		{"wan2.7 t2v", GenerationRequest{Model: "wan2.7-t2v", Prompt: "月光", Resolution: "720p", AspectRatio: "16:9", Duration: 5},
			`{"model":"wan2.7-t2v","input":{"prompt":"月光"},"parameters":{"resolution":"720P","ratio":"16:9","duration":5,"watermark":false}}`},
		{"wan2.6 r2v flash", GenerationRequest{Model: "wan2.6-r2v-flash", Prompt: "角色", Resolution: "1080p", AspectRatio: "16:9", Duration: 5, GenerateAudio: true, Images: []MediaReference{image("https://x/o.png", "")}, Videos: []MediaReference{{URL: "https://x/r.mp4"}}},
			`{"model":"wan2.6-r2v-flash","input":{"prompt":"角色","reference_urls":["https://x/o.png","https://x/r.mp4"]},"parameters":{"size":"1920x1080","duration":5,"watermark":false,"audio":true}}`},
		{"wan2.6 t2v size", GenerationRequest{Model: "Wan-AI/Wan2.6-T2V", Prompt: "跳舞", Resolution: "720p", AspectRatio: "9:16", Duration: 5},
			`{"model":"Wan-AI/Wan2.6-T2V","input":{"prompt":"跳舞"},"parameters":{"size":"720x1280","duration":5}}`},
		{"wan2.6 i2v", GenerationRequest{Model: "Wan-AI/Wan2.6-I2V", Prompt: "游泳", Resolution: "1080p", Duration: 5, Images: []MediaReference{image("https://x/m.jpg", "")}},
			`{"model":"Wan-AI/Wan2.6-I2V","input":{"prompt":"游泳","img_url":"https://x/m.jpg"},"parameters":{"resolution":"1080P","duration":5}}`},
		{"wan2.5 i2v lowercase", GenerationRequest{Model: "Wan-AI/Wan2.5-I2V", Prompt: "游泳", Resolution: "720p", Duration: 5, Images: []MediaReference{image("https://x/m.jpg", "")}, Audios: []MediaReference{{URL: "https://x/s.mp3"}}},
			`{"model":"Wan-AI/Wan2.5-I2V","input":{"prompt":"游泳","first_frame_url":"https://x/m.jpg","audio_url":"https://x/s.mp3"},"parameters":{"resolution":"720p","duration":5}}`},
		{"wan2.2 i2v frames", GenerationRequest{Model: "Wan-AI/Wan2.2-I2V", Prompt: "素描", Resolution: "720p", Images: []MediaReference{image("https://x/a.jpg", ""), image("https://x/b.jpg", "")}},
			`{"model":"Wan-AI/Wan2.2-I2V","input":{"prompt":"素描","first_frame_url":"https://x/a.jpg","last_frame_url":"https://x/b.jpg"},"parameters":{"resolution":"720P"}}`},
	})
}

func TestModelVerseMiniMaxBodies(t *testing.T) {
	assertModelVerseBodies(t, "ucloud-modelverse-minimax", "modelverse-minimax-video", []modelVerseBodyCase{
		{"h3 text", GenerationRequest{Model: "MiniMax-H3", Prompt: "太空", Resolution: "1080p", AspectRatio: "16:9", Duration: 5},
			`{"model":"MiniMax-H3","input":{"content":[{"type":"text","text":"太空"}]},"parameters":{"resolution":"2K","duration":5,"ratio":"16:9","aigc_watermark":false}}`},
		{"h3 frames", GenerationRequest{Model: "MiniMax-H3", Prompt: "水墨", Resolution: "720p", Duration: 10, Images: []MediaReference{image("https://x/s.png", "first_frame"), image("https://x/e.png", "last_frame")}},
			`{"model":"MiniMax-H3","input":{"content":[{"type":"text","text":"水墨"},{"type":"image_url","image_url":{"url":"https://x/s.png"},"role":"first_frame"},{"type":"image_url","image_url":{"url":"https://x/e.png"},"role":"last_frame"}]},"parameters":{"resolution":"768P","duration":10,"ratio":"adaptive","aigc_watermark":false}}`},
		{"h3 refs", GenerationRequest{Model: "minimax-h3-lite", Prompt: "说话", Resolution: "2k", AspectRatio: "16:9", Duration: 10, Videos: []MediaReference{{URL: "https://x/v.mp4"}}, Audios: []MediaReference{{URL: "https://x/a.mp3"}}},
			`{"model":"minimax-h3-lite","input":{"content":[{"type":"text","text":"说话"},{"type":"video_url","video_url":{"url":"https://x/v.mp4"},"role":"reference_video"},{"type":"audio_url","audio_url":{"url":"https://x/a.mp3"},"role":"reference_audio"}]},"parameters":{"resolution":"2K","duration":10,"ratio":"16:9","aigc_watermark":false}}`},
		{"h3 max", GenerationRequest{Model: "MiniMax-H3-Max", Prompt: "拉面", Resolution: "1080p", Images: []MediaReference{image("https://x/r.png", "")}, Videos: []MediaReference{{URL: "https://x/v.mp4"}}},
			`{"model":"MiniMax-H3-Max","input":{"content":[{"type":"text","text":"拉面"},{"type":"image_url","image_url":{"url":"https://x/r.png"}}]},"parameters":{"resolution":"768P","duration":5,"ratio":"adaptive","aigc_watermark":false}}`},
		{"hailuo 02 frames", GenerationRequest{Model: "MiniMax-Hailuo-02", Prompt: "推进", Resolution: "768p", Duration: 10, Images: []MediaReference{image("https://x/f.jpg", ""), image("https://x/l.png", "")}},
			`{"model":"MiniMax-Hailuo-02","input":{"prompt":"推进","first_frame_image":"https://x/f.jpg","last_frame_image":"https://x/l.png"},"parameters":{"resolution":"768P","duration":10,"aigc_watermark":false}}`},
		{"hailuo 2.3 t2v", GenerationRequest{Model: "MiniMax-Hailuo-2.3", Prompt: "日落", Resolution: "1080p", Duration: 6, ProviderOptions: map[string]map[string]any{"modelverse-minimax-video": {"parameters": map[string]any{"prompt_optimizer": false}}}},
			`{"model":"MiniMax-Hailuo-2.3","input":{"prompt":"日落"},"parameters":{"resolution":"1080P","duration":6,"aigc_watermark":false,"prompt_optimizer":false}}`},
	})
}

func TestModelVerseVeoBodies(t *testing.T) {
	adapter := loadModelVersePackageAdapter(t, "ucloud-modelverse-veo", "modelverse-veo-video")
	if adapter.Metadata().RequiresPublicMediaURLs {
		t.Fatal("Veo on ModelVerse takes inline base64 images")
	}
	assertModelVerseBodies(t, "ucloud-modelverse-veo", "modelverse-veo-video", []modelVerseBodyCase{
		{"frames", GenerationRequest{Model: "veo-3.1-generate-001", Prompt: "make it run", Resolution: "1080p", AspectRatio: "16:9", Duration: 6, GenerateAudio: true, Images: []MediaReference{{DataURL: "data:image/jpeg;base64,QUJD"}, {DataURL: "data:image/png;base64,REVG"}}},
			`{"model":"veo-3.1-generate-001","input":{"prompt":"make it run","image":{"bytesBase64Encoded":"QUJD","mimeType":"image/jpeg"},"last_frame":{"bytesBase64Encoded":"REVG","mimeType":"image/png"}},"parameters":{"resolution":"1080p","duration":6,"aspect_ratio":"16:9","generate_audio":true}}`},
		{"text fast", GenerationRequest{Model: "veo-3.1-fast-generate-001", Prompt: "waves", Resolution: "4k", AspectRatio: "1:1", Duration: 8, ProviderOptions: map[string]map[string]any{"modelverse-veo-video": {"negative_prompt": "blurry", "person_generation": "dont_allow"}}},
			`{"model":"veo-3.1-fast-generate-001","input":{"prompt":"waves","negative_prompt":"blurry"},"parameters":{"duration":8,"generate_audio":false,"person_generation":"dont_allow"}}`},
	})
}
