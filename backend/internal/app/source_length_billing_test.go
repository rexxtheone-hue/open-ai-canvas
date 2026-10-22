package app

import (
	"bytes"
	"encoding/binary"
	"io"
	"testing"
)

func mp4Box(name string, payload ...[]byte) []byte {
	body := bytes.Join(payload, nil)
	box := make([]byte, 8, 8+len(body))
	binary.BigEndian.PutUint32(box[:4], uint32(8+len(body)))
	copy(box[4:8], name)
	return append(box, body...)
}

func testMP4(timescale, duration uint32) []byte {
	mvhd := make([]byte, 20)
	binary.BigEndian.PutUint32(mvhd[12:16], timescale)
	binary.BigEndian.PutUint32(mvhd[16:20], duration)
	return bytes.Join([][]byte{mp4Box("ftyp", []byte("isom0000")), mp4Box("mdat", make([]byte, 64)), mp4Box("moov", mp4Box("mvhd", mvhd))}, nil)
}

func TestProbeVideoDurationReadsMoovAtEndAndRestoresPosition(t *testing.T) {
	file := bytes.NewReader(testMP4(1000, 37_200))
	if _, err := file.Seek(5, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	if got := probeVideoDurationMs(file); got != 37_200 {
		t.Fatalf("duration = %d, want 37200", got)
	}
	if position, _ := file.Seek(0, io.SeekCurrent); position != 5 {
		t.Fatalf("position = %d, want 5", position)
	}
	if got := probeVideoDurationMs(bytes.NewReader([]byte("not a video at all"))); got != 0 {
		t.Fatalf("garbage duration = %d", got)
	}
}

func TestStoredVideoUsesMeasuredDurationOverClientValue(t *testing.T) {
	svc := newResourceTestService(t)
	data := testMP4(600, 600*42)
	resource, _, err := svc.storeResource("user-1", "video", "clip.mp4", "video/mp4", int64(len(data)), 0, 0, 1_000, bytes.NewReader(data), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if resource.DurationMs != 42_000 {
		t.Fatalf("duration = %d, want 42000", resource.DurationMs)
	}
}

func TestSourceLengthOperationsBillServerDuration(t *testing.T) {
	svc := newResourceTestService(t)
	data := testMP4(1000, 37_200)
	resource, _, err := svc.storeResource("user-1", "video", "clip.mp4", "video/mp4", int64(len(data)), 0, 0, 1_000, bytes.NewReader(data), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	input := func(operation string) map[string]any {
		return map[string]any{
			"mode":            "video",
			"config":          map[string]any{"videoSeconds": "1"},
			"metadata":        map[string]any{"videoEditOperation": operation},
			"referenceVideos": []any{map[string]any{"storageKey": "resource:" + resource.ID, "durationMs": 1_000}},
		}
	}
	for _, operation := range []string{"video_upscale", "video_sfx", "dubbing"} {
		task := input(operation)
		if err := svc.applySourceLengthVideoSeconds("user-1", task, ""); err != nil {
			t.Fatal(err)
		}
		if got := task["config"].(map[string]any)["videoSeconds"]; got != "38" {
			t.Fatalf("%s videoSeconds = %v, want 38", operation, got)
		}
	}
	other := input("lip_sync")
	if err := svc.applySourceLengthVideoSeconds("user-1", other, ""); err != nil {
		t.Fatal(err)
	}
	if got := other["config"].(map[string]any)["videoSeconds"]; got != "1" {
		t.Fatalf("lip_sync videoSeconds = %v, want untouched", got)
	}
	external := map[string]any{"mode": "video", "config": map[string]any{"videoSeconds": "2"}, "referenceVideos": []any{map[string]any{"url": "https://cdn.example/a.mp4"}}}
	if err := svc.applySourceLengthVideoSeconds("user-1", external, "video_sfx"); err != nil {
		t.Fatal(err)
	}
	if got := external["config"].(map[string]any)["videoSeconds"]; got != "15" {
		t.Fatalf("unknown duration videoSeconds = %v, want 15", got)
	}
}
