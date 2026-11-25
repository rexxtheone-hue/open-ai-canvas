package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadBatchFileCSVAndJSONL(t *testing.T) {
	dir := t.TempDir()
	csvPath := filepath.Join(dir, "ads.csv")
	csvText := "\xef\xbb\xbfkind,prompt,ratio,duration,audio,ref,op\n" +
		"image,\"Durian cake on a marble table, soft light\",1:1,,,product.png|0123456789abcdef0123456789abcdef,\n" +
		",,,,,,\n" +
		"video,A chef plating the cake,9:16,6s,no,,\n" +
		"video,,,,,voice.mp3,lipsync\n"
	if err := os.WriteFile(csvPath, []byte(csvText), 0o600); err != nil {
		t.Fatal(err)
	}
	rows, err := readBatchFile(csvPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("rows = %d, want 3 (blank rows skipped)", len(rows))
	}
	if rows[0].Kind != "image" || rows[0].Req.AspectRatio != "1:1" || len(rows[0].Req.References) != 2 || rows[0].Line != 2 {
		t.Fatalf("row 1 = %+v", rows[0])
	}
	if rows[1].Kind != "video" || rows[1].Req.Duration != 6 || rows[1].Req.GenerateAudio == nil || *rows[1].Req.GenerateAudio || rows[1].Line != 4 {
		t.Fatalf("row 2 = %+v", rows[1])
	}
	if rows[2].Req.Operation != "lip_sync" || rows[2].Req.Prompt == "" {
		t.Fatalf("lip sync row needs the mapped operation and a default prompt: %+v", rows[2])
	}

	jsonlPath := filepath.Join(dir, "ads.jsonl")
	jsonl := "# comment\n{\"kind\":\"video\",\"prompt\":\"Product spin\",\"first\":\"a.png\",\"refs\":[\"b.png\",\"c.png\"],\"count\":2}\n"
	if err := os.WriteFile(jsonlPath, []byte(jsonl), 0o600); err != nil {
		t.Fatal(err)
	}
	rows, err = readBatchFile(jsonlPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Req.Count != 2 || len(rows[0].Req.References) != 3 || rows[0].Req.References[0].Role != "first_frame" {
		t.Fatalf("jsonl rows = %+v", rows)
	}

	bad := filepath.Join(dir, "bad.csv")
	_ = os.WriteFile(bad, []byte("kind,prompt\naudio,hello\n"), 0o600)
	if _, err := readBatchFile(bad); err == nil {
		t.Fatal("unsupported kind must be rejected")
	}
}

func TestResolveReferenceAcceptsAssetIDs(t *testing.T) {
	c := &client{}
	ref, err := c.resolveReference("asset:0123456789abcdef0123456789abcdef", "video", "")
	if err != nil || ref.ResourceID != "0123456789abcdef0123456789abcdef" || ref.Kind != "video" {
		t.Fatalf("ref=%+v err=%v", ref, err)
	}
	if _, err := c.resolveReference("not-a-file.png", "", ""); err == nil {
		t.Fatal("a missing file must be an error")
	}
}
