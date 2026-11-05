package app

import (
	"strings"
	"testing"
)

func TestReferenceMediaFormat(t *testing.T) {
	cases := map[string]providerMedia{
		"m4a": {Type: "audio/x-m4a", Name: "voice.m4a"},
		"mp3": {MimeType: "audio/mpeg"},
		"wav": {Type: "audio/wave"},
		"jpg": {Name: "photo.JPEG"},
		"mov": {Type: "video/quicktime"},
		"png": {URL: "https://cdn.example.com/a/b.png?x=1"},
		"":    {Type: "application/octet-stream"},
	}
	for want, media := range cases {
		if got := referenceMediaFormat(media); got != want {
			t.Errorf("referenceMediaFormat(%+v) = %q, want %q", media, got, want)
		}
	}
}

func TestVideoReferenceMediaError(t *testing.T) {
	refs := VideoReferenceConfig{
		AudioFormats: []string{"wav", "mp3"}, MinAudioDuration: 2, MinVideoDuration: 2,
		MinImageSide: 300, MaxImageLongSide: 6000, MaxImageAspectRatio: 2.5,
	}
	cases := []struct {
		name   string
		images []providerMedia
		videos []providerMedia
		audios []providerMedia
		want   string
	}{
		{name: "m4a audio rejected", audios: []providerMedia{{Name: "a.m4a", Type: "audio/mp4", DurationMs: 15000}}, want: "M4A 格式"},
		{name: "mp3 audio ok", audios: []providerMedia{{Name: "a.mp3", Type: "audio/mpeg", DurationMs: 15000}}},
		{name: "unknown format skipped", audios: []providerMedia{{DurationMs: 5000}}},
		{name: "short audio", audios: []providerMedia{{Name: "a.mp3", DurationMs: 1200}}, want: "至少 2 秒"},
		{name: "short video", videos: []providerMedia{{Name: "v.mp4", DurationMs: 1000}}, want: "至少 2 秒"},
		{name: "small image", images: []providerMedia{{Name: "i.png", Width: 200, Height: 400}}, want: "太小"},
		{name: "large image", images: []providerMedia{{Name: "i.png", Width: 3024, Height: 8064}}, want: "长边最多"},
		{name: "extreme aspect", images: []providerMedia{{Name: "i.png", Width: 3000, Height: 1000}}, want: "长宽比"},
		{name: "image ok", images: []providerMedia{{Name: "i.png", Width: 768, Height: 1376}}},
		{name: "image without dimensions skipped", images: []providerMedia{{Name: "i.png"}}},
	}
	for _, tc := range cases {
		got := videoReferenceMediaError(refs, tc.images, tc.videos, tc.audios)
		if tc.want == "" && got != "" || tc.want != "" && !strings.Contains(got, tc.want) {
			t.Errorf("%s: got %q, want contains %q", tc.name, got, tc.want)
		}
	}
	if got := videoReferenceMediaError(VideoReferenceConfig{}, []providerMedia{{Width: 10, Height: 5000}}, nil, []providerMedia{{Type: "audio/aac", DurationMs: 100}}); got != "" {
		t.Errorf("empty config should not limit, got %q", got)
	}
}

func TestImageReferenceMediaError(t *testing.T) {
	refs := ImageReferenceConfig{MaxTotalImageBytes: 20 * 1024 * 1024, ImageFormats: []string{"png", "jpg", "webp", "heic", "heif"}}
	if got := imageReferenceMediaError(refs, []providerMedia{{Bytes: 12 << 20}, {Bytes: 12 << 20}}); !strings.Contains(got, "合计") {
		t.Errorf("total bytes: got %q", got)
	}
	if got := imageReferenceMediaError(refs, []providerMedia{{Name: "a.gif", Type: "image/gif", Bytes: 1 << 20}}); !strings.Contains(got, "GIF 格式") {
		t.Errorf("format: got %q", got)
	}
	if got := imageReferenceMediaError(refs, []providerMedia{{Name: "a.jpeg", Type: "image/jpeg", Bytes: 1 << 20}}); got != "" {
		t.Errorf("jpeg should pass, got %q", got)
	}
}
