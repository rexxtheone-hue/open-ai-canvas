package app

import (
	"fmt"
	"testing"
	"time"

	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

func newStudioTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db := newSQLiteTestDB(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), t.TempDir()), db
}

func createStudioTestTask(t *testing.T, repo *gorm.DB, task model.Task) model.Task {
	t.Helper()
	if task.Status == "" {
		task.Status = model.TaskStatusSucceeded
	}
	if task.Type == "" {
		task.Type = "canvas_image"
	}
	if err := repo.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	return task
}

func TestStudioKindTagsOnlyMatchingModes(t *testing.T) {
	studio := func(mode string) map[string]any {
		return map[string]any{"mode": mode, "metadata": map[string]any{"source": "studio"}}
	}
	cases := []struct {
		input    map[string]any
		taskType string
		want     string
	}{
		{studio("image"), "canvas_image", model.StudioKindImage},
		{studio("video"), "canvas_video", model.StudioKindVideo},
		{studio("video"), "video_extend", model.StudioKindVideo},
		{studio("audio"), "canvas_audio", model.StudioKindAudio},
		{studio("image"), "canvas_video", ""},
		{studio("text"), "canvas_text", ""},
		{map[string]any{"mode": "image", "metadata": map[string]any{"source": "create-page"}}, "canvas_image", ""},
	}
	for _, item := range cases {
		if got := workbenchKindFromTaskInput(item.input, item.taskType); got != item.want {
			t.Fatalf("mode=%v type=%s got %q want %q", item.input["mode"], item.taskType, got, item.want)
		}
	}
}

func TestStudioWorksPaginatesWithoutGapsOrDuplicates(t *testing.T) {
	svc, repo := newStudioTestService(t)
	base := time.Date(2026, 10, 15, 8, 0, 0, 0, time.UTC)
	want := map[string]bool{}
	for index := 0; index < 7; index++ {
		// 两个任务共用同一时间戳，验证同一时刻的记录也能稳定翻页。
		created := base.Add(time.Duration(index/2) * time.Minute)
		task := createStudioTestTask(t, repo, model.Task{ID: fmt.Sprintf("task-%02d", index), UserID: "u1", WorkbenchKind: model.StudioKindImage, Prompt: "p", CreatedAt: created, UpdatedAt: created})
		want[task.ID] = true
	}
	createStudioTestTask(t, repo, model.Task{ID: "other-user", UserID: "u2", WorkbenchKind: model.StudioKindImage, Prompt: "p", CreatedAt: base, UpdatedAt: base})
	createStudioTestTask(t, repo, model.Task{ID: "canvas-task", UserID: "u1", Prompt: "p", CreatedAt: base, UpdatedAt: base})

	seen := map[string]bool{}
	cursor := ""
	var previous time.Time
	for pageCount := 0; pageCount < 10; pageCount++ {
		page, err := svc.StudioWorks("u1", StudioWorkQuery{Limit: 3, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		for _, work := range page.Works {
			if seen[work.ID] {
				t.Fatalf("duplicate %s", work.ID)
			}
			if !previous.IsZero() && work.CreatedAt.After(previous) {
				t.Fatalf("not newest first: %s", work.ID)
			}
			previous = work.CreatedAt
			seen[work.ID] = true
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	if len(seen) != len(want) {
		t.Fatalf("saw %d works, want %d: %v", len(seen), len(want), seen)
	}
	for id := range want {
		if !seen[id] {
			t.Fatalf("missing %s", id)
		}
	}
}

func TestStudioWorksFiltersSearchFavoritesAndHide(t *testing.T) {
	svc, repo := newStudioTestService(t)
	now := time.Now().UTC()
	createStudioTestTask(t, repo, model.Task{ID: "img", UserID: "u1", WorkbenchKind: model.StudioKindImage, Prompt: "Red sports car", CreatedAt: now, UpdatedAt: now,
		ResultJSON: `{"images":[{"dataUrl":"https://cdn.example/a.png","storageKey":"resource:abc","width":1024,"height":768}]}`,
		InputJSON:  `{"mode":"image","config":{"model":"nano-banana-2","size":"16:9","apiKey":"secret"},"metadata":{"source":"studio","studioTool":"create-image"}}`})
	createStudioTestTask(t, repo, model.Task{ID: "vid", UserID: "u1", Type: "canvas_video", WorkbenchKind: model.StudioKindVideo, Prompt: "Ocean 100% blue", CreatedAt: now.Add(-time.Minute), UpdatedAt: now,
		ResultJSON: `{"video":{"dataUrl":"https://cdn.example/v.mp4","durationMs":5000}}`})
	createStudioTestTask(t, repo, model.Task{ID: "aud", UserID: "u1", Type: "canvas_audio", WorkbenchKind: model.StudioKindAudio, Prompt: "voice", Status: model.TaskStatusFailed, Error: "上游失败", CreatedAt: now.Add(-2 * time.Minute), UpdatedAt: now,
		ResultJSON: `{"audio":{"dataUrl":"data:audio/mp3;base64,AAA","storageKey":"resource:aud"},"audios":[{"dataUrl":"data:audio/mp3;base64,AAA","storageKey":"resource:aud"}]}`})

	videos, err := svc.StudioWorks("u1", StudioWorkQuery{Kind: "video"})
	if err != nil || len(videos.Works) != 1 || videos.Works[0].ID != "vid" || videos.Works[0].Kind != "video" || videos.Works[0].Media[0].DurationMs != 5000 {
		t.Fatalf("video filter = %#v, err %v", videos, err)
	}
	if _, err := svc.StudioWorks("u1", StudioWorkQuery{Kind: "text"}); err == nil {
		t.Fatal("unknown kind must be rejected")
	}
	search, _ := svc.StudioWorks("u1", StudioWorkQuery{Search: "100%"})
	if len(search.Works) != 1 || search.Works[0].ID != "vid" {
		t.Fatalf("search must treat %% literally: %#v", search.Works)
	}
	search, _ = svc.StudioWorks("u1", StudioWorkQuery{Search: "red SPORTS"})
	if len(search.Works) != 1 || search.Works[0].ID != "img" {
		t.Fatalf("search must be case insensitive: %#v", search.Works)
	}

	all, _ := svc.StudioWorks("u1", StudioWorkQuery{})
	image := all.Works[0]
	if image.ID != "img" || image.Tool != "create-image" || image.Settings["model"] != "nano-banana-2" || image.Settings["size"] != "16:9" || image.Settings["apiKey"] != nil {
		t.Fatalf("image work = %#v", image)
	}
	if len(image.Media) != 1 || image.Media[0].StorageKey != "resource:abc" || image.Media[0].Width != 1024 {
		t.Fatalf("image media = %#v", image.Media)
	}
	audio := all.Works[2]
	if audio.Error != "上游失败" || len(audio.Media) != 1 || audio.Media[0].URL != "" || audio.Media[0].StorageKey != "resource:aud" {
		t.Fatalf("audio work must drop inline data and duplicates: %#v", audio)
	}

	if err := svc.SetStudioFavorite("u1", "vid", true); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetStudioFavorite("u1", "vid", true); err != nil {
		t.Fatal("favorite must be idempotent")
	}
	if err := svc.SetStudioFavorite("u2", "vid", true); err == nil {
		t.Fatal("other users must not favorite my work")
	}
	favorites, _ := svc.StudioWorks("u1", StudioWorkQuery{FavoritesOnly: true})
	if len(favorites.Works) != 1 || !favorites.Works[0].Favorite {
		t.Fatalf("favorites = %#v", favorites.Works)
	}

	removed, err := svc.HideStudioWorks("u2", []string{"vid"})
	if err != nil || removed != 0 {
		t.Fatalf("other users must not delete my work: %d %v", removed, err)
	}
	removed, err = svc.HideStudioWorks("u1", []string{"vid", "missing"})
	if err != nil || removed != 1 {
		t.Fatalf("hide removed=%d err=%v", removed, err)
	}
	after, _ := svc.StudioWorks("u1", StudioWorkQuery{})
	if len(after.Works) != 2 {
		t.Fatalf("hidden work still listed: %#v", after.Works)
	}
	favorites, _ = svc.StudioWorks("u1", StudioWorkQuery{FavoritesOnly: true})
	if len(favorites.Works) != 0 {
		t.Fatal("hidden work must leave favorites")
	}
	var count int64
	repo.Model(&model.Task{}).Where("id = ?", "vid").Count(&count)
	if count != 1 {
		t.Fatal("hiding must keep the task and its billing history")
	}
}

func TestStudioPreferenceRoundTrip(t *testing.T) {
	svc, _ := newStudioTestService(t)
	view, err := svc.StudioPreference("u1")
	if err != nil || view.Surface != "" {
		t.Fatalf("default preference = %#v %v", view, err)
	}
	if _, err := svc.SaveStudioPreference("u1", "studio"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SaveStudioPreference("u1", "canvas"); err != nil {
		t.Fatal(err)
	}
	view, _ = svc.StudioPreference("u1")
	if view.Surface != "canvas" {
		t.Fatalf("preference = %#v", view)
	}
	if _, err := svc.SaveStudioPreference("u1", "admin"); err == nil {
		t.Fatal("unknown surface must be rejected")
	}
}

func TestStudioCursorRejectsGarbage(t *testing.T) {
	svc, _ := newStudioTestService(t)
	for _, cursor := range []string{"!!!", "bm8tc2VwYXJhdG9y", "bm90LWEtdGltZXxpZA"} {
		if _, err := svc.StudioWorks("u1", StudioWorkQuery{Cursor: cursor}); err == nil {
			t.Fatalf("cursor %q must be rejected", cursor)
		}
	}
}

func TestStudioWorkShowsUserPromptWithoutBrandSuffix(t *testing.T) {
	task := model.Task{ID: "brand", WorkbenchKind: model.StudioKindImage, InputJSON: `{"mode":"image","prompt":"一杯咖啡\n\n品牌：暖杯","config":{"model":"m"},"metadata":{"source":"studio","studioTool":"create-image","studioPrompt":"一杯咖啡","brandKitId":"kit-1"}}`}
	work := studioWorkFromTask(task, TaskSummary{ID: "brand", Prompt: "一杯咖啡\n\n品牌：暖杯"}, false)
	if work.Prompt != "一杯咖啡" || work.Settings["brandKitId"] != "kit-1" || work.Settings["studioPrompt"] != nil {
		t.Fatalf("unexpected work %+v", work)
	}
}

func TestStudioSpecialtyWorkKeepsEmptyUserPrompt(t *testing.T) {
	task := model.Task{ID: "lip", WorkbenchKind: model.StudioKindVideo, InputJSON: `{"mode":"video","prompt":"让人物按照参考音频说话","config":{"model":"m"},"metadata":{"source":"studio","studioTool":"lip-sync","studioPrompt":"","videoEditOperation":"lip_sync"}}`}
	work := studioWorkFromTask(task, TaskSummary{ID: "lip", Prompt: "让人物按照参考音频说话"}, false)
	if work.Prompt != "让人物按照参考音频说话" || work.Settings["userPrompt"] != "" || work.Tool != "lip-sync" {
		t.Fatalf("unexpected work %+v", work)
	}
}
