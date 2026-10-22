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

func testWAV(byteRate uint32, dataBytes int) []byte {
	chunk := func(name string, body []byte) []byte {
		out := make([]byte, 8, 8+len(body))
		copy(out, name)
		binary.LittleEndian.PutUint32(out[4:8], uint32(len(body)))
		return append(out, body...)
	}
	format := make([]byte, 16)
	binary.LittleEndian.PutUint16(format[0:2], 1)
	binary.LittleEndian.PutUint16(format[2:4], 2)
	binary.LittleEndian.PutUint32(format[4:8], byteRate/4)
	binary.LittleEndian.PutUint32(format[8:12], byteRate)
	body := bytes.Join([][]byte{[]byte("WAVE"), chunk("fmt ", format), chunk("LIST", []byte("abc")), {0}, chunk("data", make([]byte, dataBytes))}, nil)
	return append(chunk("RIFF", nil)[:4], append(binary.LittleEndian.AppendUint32(nil, uint32(len(body))), body...)...)
}

func TestProbeWAVDurationSkipsOddChunks(t *testing.T) {
	if got := probeWAVDurationMs(bytes.NewReader(testWAV(1000, 2_500))); got != 2_500 {
		t.Fatalf("duration = %d, want 2500", got)
	}
	if got := probeWAVDurationMs(bytes.NewReader(testMP4(1000, 1000))); got != 0 {
		t.Fatalf("mp4 as wav = %d", got)
	}
}

func testMP3(frames int) []byte {
	// ID3v2 标签 + MPEG1 Layer III 128kbps 44.1kHz 帧，每帧 417 字节、1152 个采样。
	data := append([]byte("ID3\x04\x00\x00\x00\x00\x00\x05"), []byte("TAG01")...)
	for range frames {
		frame := make([]byte, 417)
		copy(frame, []byte{0xFF, 0xFB, 0x90, 0x00})
		data = append(data, frame...)
	}
	return data
}

func TestProbeMP3DurationSumsFrames(t *testing.T) {
	// 100 帧 × 1152 / 44100 ≈ 2612.2 毫秒。
	if got := probeMP3DurationMs(bytes.NewReader(testMP3(100))); got < 2612 || got > 2613 {
		t.Fatalf("duration = %d, want about 2612", got)
	}
	if got := probeAudioDurationMs(bytes.NewReader(testMP3(100))); got < 2612 || got > 2613 {
		t.Fatalf("audio duration = %d", got)
	}
	if got := probeMP3DurationMs(bytes.NewReader(testWAV(1000, 2_000))); got != 0 {
		t.Fatalf("wav as mp3 = %d", got)
	}
}

func TestStoredWAVGetsMeasuredDuration(t *testing.T) {
	svc := newResourceTestService(t)
	data := testWAV(1000, 3_000)
	resource, _, err := svc.storeResource("user-1", "audio", "sfx.wav", "audio/wav", int64(len(data)), 0, 0, 0, bytes.NewReader(data), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if resource.DurationMs != 3_000 {
		t.Fatalf("duration = %d, want 3000", resource.DurationMs)
	}
}

func TestRequestedAudioSecondsComesFromSpecialtyDuration(t *testing.T) {
	input := map[string]any{"mode": "audio", "config": map[string]any{}, "metadata": map[string]any{"specialtyOptions": map[string]any{"duration": "2.5"}}}
	applyRequestedAudioSeconds(input)
	if got := input["config"].(map[string]any)["audioSeconds"]; got != "3" {
		t.Fatalf("audioSeconds = %v, want 3", got)
	}
	tts := map[string]any{"mode": "audio", "config": map[string]any{}, "metadata": map[string]any{}}
	applyRequestedAudioSeconds(tts)
	if _, ok := tts["config"].(map[string]any)["audioSeconds"]; ok {
		t.Fatal("TTS without a duration option must keep the default reservation")
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
	motion := input("motion_transfer")
	motion["config"].(map[string]any)["interfaceType"] = "replicate-kling-motion"
	if err := svc.applySourceLengthVideoSeconds("user-1", motion, ""); err != nil {
		t.Fatal(err)
	}
	if got := motion["config"].(map[string]any)["videoSeconds"]; got != "38" {
		t.Fatalf("replicate motion videoSeconds = %v, want 38", got)
	}
	seedanceMotion := input("motion_transfer")
	if err := svc.applySourceLengthVideoSeconds("user-1", seedanceMotion, ""); err != nil {
		t.Fatal(err)
	}
	if got := seedanceMotion["config"].(map[string]any)["videoSeconds"]; got != "1" {
		t.Fatalf("other motion videoSeconds = %v, want untouched", got)
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
