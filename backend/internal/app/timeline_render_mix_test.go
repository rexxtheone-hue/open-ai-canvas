package app

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func mixTestProject() renderProject {
	media := func(id string) *struct {
		ID         string `json:"id"`
		Kind       string `json:"kind"`
		StorageKey string `json:"storageKey"`
	} {
		return &struct {
			ID         string `json:"id"`
			Kind       string `json:"kind"`
			StorageKey string `json:"storageKey"`
		}{ID: id, Kind: "video", StorageKey: "resource:" + id}
	}
	return renderProject{
		Version: 2, Width: 1081, Height: 1920, MixAudioTracks: true,
		Tracks: []renderTrack{{ID: "v", Kind: "video"}, {ID: "vo", Kind: "audio"}, {ID: "music", Kind: "audio"}, {ID: "off", Kind: "audio", Muted: true}},
		Clips: []renderClip{
			{ID: "c1", Kind: "video", TrackID: "v", StartMs: 0, DurationMs: 1000, DirectMedia: media("shot1")},
			{ID: "c2", Kind: "video", TrackID: "v", StartMs: 1000, DurationMs: 1000, DirectMedia: media("shot2")},
			{ID: "say", Kind: "audio", TrackID: "vo", StartMs: 500, DurationMs: 1000, Volume: 1, DirectMedia: media("voice")},
			{ID: "bgm", Kind: "audio", TrackID: "music", StartMs: 0, DurationMs: 2000, Volume: 0.2, DirectMedia: media("song")},
			{ID: "mute", Kind: "audio", TrackID: "off", StartMs: 0, DurationMs: 2000, DirectMedia: media("muted")},
		},
	}
}

func TestRenderPlanMixesAudioTracksOnlyWhenRequested(t *testing.T) {
	plan := buildRenderPlan(mixTestProject())
	if plan.Width != 1080 || plan.Height != 1920 {
		t.Fatalf("size must be clamped to even numbers, got %dx%d", plan.Width, plan.Height)
	}
	if len(plan.Overlays) != 2 || plan.Overlays[0].Clip.ID != "bgm" || plan.Overlays[1].Clip.ID != "say" {
		t.Fatalf("muted tracks must be skipped and overlays sorted, got %+v", plan.Overlays)
	}
	legacy := mixTestProject()
	legacy.MixAudioTracks, legacy.Width, legacy.Height = false, 0, 0
	old := buildRenderPlan(legacy)
	if len(old.Overlays) != 0 || old.Width != renderWidth || old.Height != renderHeight {
		t.Fatalf("canvas editor timelines must keep the old behavior: %+v", old)
	}
	for i := range plan.Segments {
		plan.Segments[i].Source = &renderSource{Path: "seg.mp4", HasAudio: true}
	}
	for i := range plan.Overlays {
		plan.Overlays[i].Source = &renderSource{Path: "audio.mp3", HasAudio: true}
	}
	args := strings.Join(buildRenderFFmpegArgs(plan, "out.mp4"), " ")
	for _, want := range []string{"scale=1080:1920", "adelay=500|500", "volume=0.200", "amix=inputs=3:duration=first:dropout_transition=0:normalize=0[amixed]", "-map [amixed]"} {
		if !strings.Contains(args, want) {
			t.Fatalf("ffmpeg args missing %q:\n%s", want, args)
		}
	}
}

// 本机装了 ffmpeg 时，真实跑一遍滤镜图，确认竖屏输出和混音可执行。
func TestRenderMixRunsWithRealFFmpeg(t *testing.T) {
	for _, mix := range []bool{false, true} {
		t.Run(map[bool]string{false: "legacy", true: "mixed"}[mix], func(t *testing.T) { runRealRender(t, mix) })
	}
}

func runRealRender(t *testing.T, mix bool) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	dir := t.TempDir()
	makeFile := func(name string, args ...string) string {
		path := filepath.Join(dir, name)
		cmd := exec.Command(ffmpeg, append(append([]string{"-nostdin", "-y", "-loglevel", "error"}, args...), path)...)
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("make %s: %v %s", name, err, output)
		}
		return path
	}
	video := makeFile("seg.mp4", "-f", "lavfi", "-i", "testsrc=s=640x360:r=30:d=1", "-f", "lavfi", "-i", "sine=f=440:d=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac")
	audio := makeFile("voice.m4a", "-f", "lavfi", "-i", "sine=f=880:d=2", "-c:a", "aac")
	project := mixTestProject()
	if !mix {
		project.MixAudioTracks = false
	}
	plan := buildRenderPlan(project)
	for i := range plan.Segments {
		plan.Segments[i].Source = &renderSource{Path: video, HasAudio: true}
	}
	for i := range plan.Overlays {
		plan.Overlays[i].Source = &renderSource{Path: audio, HasAudio: true}
	}
	target := filepath.Join(dir, "out.mp4")
	cmd := exec.Command(ffmpeg, buildRenderFFmpegArgs(plan, target)...)
	cmd.Dir = dir
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("render failed: %v\nARGS: %s\n%s", err, strings.Join(buildRenderFFmpegArgs(plan, target), " "), lastLines(string(output), 12))
	}
	probe, err := exec.LookPath("ffprobe")
	if err != nil {
		return
	}
	output, err := exec.Command(probe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", target).Output()
	if err != nil || strings.TrimSpace(string(output)) != "1080,1920" {
		t.Fatalf("unexpected output size %q %v", output, err)
	}
}

func lastLines(text string, n int) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r", "\n"), "\n")
	kept := []string{}
	for _, line := range lines {
		if strings.TrimSpace(line) != "" && !strings.HasPrefix(strings.TrimSpace(line), "frame=") {
			kept = append(kept, line)
		}
	}
	if len(kept) > n {
		kept = kept[len(kept)-n:]
	}
	return strings.Join(kept, "\n")
}

// 素材比片段短时定格补齐：两段 1.5 秒的片段用 1 秒的素材，成片画面仍应是 3 秒，与声音对齐。
func TestRenderHoldsLastFrameWhenSourceIsShort(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	probe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("ffprobe not installed")
	}
	dir := t.TempDir()
	video := filepath.Join(dir, "short.mp4")
	if output, err := exec.Command(ffmpeg, "-nostdin", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=1", "-f", "lavfi", "-i", "sine=f=440:d=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", video).CombinedOutput(); err != nil {
		t.Fatalf("make source: %v %s", err, output)
	}
	project := mixTestProject()
	project.MixAudioTracks = false
	project.Clips = project.Clips[:2]
	project.Clips[0].DurationMs, project.Clips[1].StartMs, project.Clips[1].DurationMs = 1500, 1500, 1500
	plan := buildRenderPlan(project)
	for i := range plan.Segments {
		plan.Segments[i].Source = &renderSource{Path: video, HasAudio: true}
	}
	target := filepath.Join(dir, "out.mp4")
	cmd := exec.Command(ffmpeg, buildRenderFFmpegArgs(plan, target)...)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("render failed: %v\n%s", err, lastLines(string(output), 12))
	}
	output, err := exec.Command(probe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", target).Output()
	if err != nil {
		t.Fatal(err)
	}
	var seconds float64
	if _, err := fmt.Sscanf(strings.TrimSpace(string(output)), "%f", &seconds); err != nil || seconds < 2.9 || seconds > 3.1 {
		t.Fatalf("video track should be 3s, got %q", output)
	}
}
