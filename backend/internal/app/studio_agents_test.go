package app

import (
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestStudioCharacterLifecycle(t *testing.T) {
	svc, db := newStudioTestService(t)
	for _, resource := range []model.Resource{
		{ID: "face-1", UserID: "user-a", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"},
		{ID: "face-other", UserID: "user-b", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"},
		{ID: "clip-1", UserID: "user-a", Kind: "video", Status: model.ResourceStatusReady, MimeType: "video/mp4"},
	} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	created, err := svc.SaveStudioCharacter("user-a", "", StudioCharacterInput{Name: " 小美 ", Description: "长发", ImageResourceIDs: []string{"face-1", "face-1", " "}})
	if err != nil {
		t.Fatal(err)
	}
	if created.Name != "小美" || created.Kind != "character" || len(created.ImageResourceIDs) != 1 {
		t.Fatalf("unexpected character %+v", created)
	}
	style, err := svc.SaveStudioCharacter("user-a", "", StudioCharacterInput{Name: "胶片感", Kind: "style", ImageResourceIDs: []string{"face-1"}})
	if err != nil || style.Kind != "style" {
		t.Fatalf("style asset not saved %+v %v", style, err)
	}
	if err := svc.DeleteStudioCharacter("user-a", style.ID); err != nil {
		t.Fatal(err)
	}
	for _, input := range []StudioCharacterInput{
		{Name: ""},
		{Name: "x", ImageResourceIDs: []string{"face-other"}},
		{Name: "x", ImageResourceIDs: []string{"clip-1"}},
		{Name: strings.Repeat("长", 41)},
		{Name: "x", Kind: "spaceship"},
	} {
		if _, err := svc.SaveStudioCharacter("user-a", "", input); err == nil {
			t.Fatalf("expected validation error for %+v", input)
		}
	}
	if _, err := svc.SaveStudioCharacter("user-b", created.ID, StudioCharacterInput{Name: "偷改"}); err == nil {
		t.Fatal("other user must not update the character")
	}
	if err := svc.DeleteStudioCharacter("user-b", created.ID); err == nil {
		t.Fatal("other user must not delete the character")
	}
	updated, err := svc.SaveStudioCharacter("user-a", created.ID, StudioCharacterInput{Name: "小美2"})
	if err != nil || updated.ID != created.ID || len(updated.ImageResourceIDs) != 0 {
		t.Fatalf("update failed %+v %v", updated, err)
	}
	if err := svc.DeleteStudioCharacter("user-a", created.ID); err != nil {
		t.Fatal(err)
	}
	if items, _ := svc.StudioCharacters("user-a"); len(items) != 0 {
		t.Fatalf("expected no characters, got %d", len(items))
	}
}

func TestStudioChatLifecycle(t *testing.T) {
	svc, db := newStudioTestService(t)
	if err := db.Create(&model.Task{ID: "task-a", UserID: "user-a", Type: "image", WorkbenchKind: "studio-image", Status: model.TaskStatusQueued}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Task{ID: "task-b", UserID: "user-b", Type: "image", WorkbenchKind: "studio-image", Status: model.TaskStatusQueued}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateStudioChatSession("user-a", StudioChatModeDirector, ""); err == nil {
		t.Fatal("director sessions are created with stories only")
	}
	session, err := svc.CreateStudioChatSession("user-a", StudioChatModeChat, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AppendStudioChatMessage("user-a", session.ID, StudioChatMessageInput{Role: "user", Content: "做一张咖啡海报\n暖色"}); err != nil {
		t.Fatal(err)
	}
	reply, err := svc.AppendStudioChatMessage("user-a", session.ID, StudioChatMessageInput{Role: "assistant", Content: "好的", Actions: json.RawMessage(`[{"type":"generate","kind":"image","prompt":"coffee"}]`)})
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []StudioChatMessageInput{
		{Role: "system", Content: "x"},
		{Role: "user"},
		{Role: "assistant", Content: "x", Actions: json.RawMessage(`{"type":"generate"}`)},
		{Role: "assistant", Content: "x", TaskID: "task-b"},
	} {
		if _, err := svc.AppendStudioChatMessage("user-a", session.ID, input); err == nil {
			t.Fatalf("expected validation error for %+v", input)
		}
	}
	if _, err := svc.AppendStudioChatMessage("user-b", session.ID, StudioChatMessageInput{Role: "user", Content: "x"}); err == nil {
		t.Fatal("other user must not write into the session")
	}
	if _, err := svc.UpdateStudioChatActions("user-a", session.ID, reply.ID, json.RawMessage(`[{"type":"generate","status":"submitted","taskId":"task-a"}]`)); err != nil {
		t.Fatal(err)
	}
	view, err := svc.StudioChat("user-a", session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if view.Session.Title != "做一张咖啡海报 暖色" || len(view.Messages) != 2 || view.Messages[0].Role != "user" || !strings.Contains(string(view.Messages[1].Actions), "submitted") {
		t.Fatalf("unexpected chat %+v", view)
	}
	if _, err := svc.StudioChat("user-b", session.ID); err == nil {
		t.Fatal("other user must not read the session")
	}
	if err := svc.DeleteStudioChat("user-a", session.ID); err != nil {
		t.Fatal(err)
	}
	var left int64
	db.Model(&model.StudioChatMessage{}).Count(&left)
	if left != 0 {
		t.Fatalf("messages must be deleted with the session, %d left", left)
	}
}

func TestStudioStoryLifecycle(t *testing.T) {
	svc, db := newStudioTestService(t)
	for _, task := range []model.Task{
		{ID: "img-1", UserID: "user-a", Type: "image", WorkbenchKind: "studio-image", Status: model.TaskStatusSucceeded},
		{ID: "vid-1", UserID: "user-a", Type: "video", WorkbenchKind: "studio-video", Status: model.TaskStatusQueued},
		{ID: "canvas-1", UserID: "user-a", Type: "image", WorkbenchKind: "canvas", Status: model.TaskStatusSucceeded},
		{ID: "render-1", UserID: "user-a", Type: model.TaskTypeTimelineRender, Status: model.TaskStatusSucceeded, ResultJSON: `{"resourceId":"out-1","durationMs":8000}`},
		{ID: "img-b", UserID: "user-b", Type: "image", WorkbenchKind: "studio-image", Status: model.TaskStatusSucceeded},
	} {
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.CreateStudioStory("user-a", StudioStoryInput{Ratio: "3:2", DurationSeconds: 30}); err == nil {
		t.Fatal("invalid ratio must be rejected")
	}
	if _, err := svc.CreateStudioStory("user-a", StudioStoryInput{DurationSeconds: 2}); err == nil {
		t.Fatal("too short duration must be rejected")
	}
	story, err := svc.CreateStudioStory("user-a", StudioStoryInput{Title: "咖啡广告", DurationSeconds: 30, Brief: json.RawMessage(`{"product":"咖啡"}`)})
	if err != nil {
		t.Fatal(err)
	}
	if story.Ratio != "9:16" || story.SessionID == "" || len(story.Shots) != 0 {
		t.Fatalf("unexpected new story %+v", story)
	}
	plan := []StudioScenePlan{{Title: "开场", Shots: []StudioShotPlan{
		{DurationSeconds: 4, Fields: json.RawMessage(`{"visual":"杯子特写"}`)},
		{DurationSeconds: 4, Fields: json.RawMessage(`{"visual":"倒咖啡"}`)},
	}}}
	story, err = svc.ReplaceStudioStoryPlan("user-a", story.ID, plan)
	if err != nil {
		t.Fatal(err)
	}
	if len(story.Scenes) != 1 || len(story.Shots) != 2 {
		t.Fatalf("plan not stored %+v", story)
	}
	first, second := story.Shots[0], story.Shots[1]
	if _, err := svc.AddStudioShotVersion("user-a", story.ID, first.ID, "image", "canvas-1"); err == nil {
		t.Fatal("canvas tasks must not become studio versions")
	}
	if _, err := svc.AddStudioShotVersion("user-a", story.ID, first.ID, "video", "img-1"); err == nil {
		t.Fatal("kind must match the task")
	}
	if _, err := svc.AddStudioShotVersion("user-a", story.ID, first.ID, "image", "img-b"); err == nil {
		t.Fatal("other user's task must be rejected")
	}
	story, err = svc.AddStudioShotVersion("user-a", story.ID, first.ID, "image", "img-1")
	if err != nil {
		t.Fatal(err)
	}
	if story, err = svc.AddStudioShotVersion("user-a", story.ID, second.ID, "video", "vid-1"); err != nil {
		t.Fatal(err)
	}
	if len(story.Versions) != 2 || story.Versions[0].Work == nil || story.Shots[0].ActiveImageVersionID != story.Versions[0].ID {
		t.Fatalf("versions not attached %+v", story.Versions)
	}
	if _, err := svc.PatchStudioShot("user-a", story.ID, first.ID, StudioShotPatch{ActiveVideoVersionID: &story.Versions[1].ID}); err == nil {
		t.Fatal("version from another shot must be rejected")
	}
	duration := 6
	if story, err = svc.PatchStudioShot("user-a", story.ID, first.ID, StudioShotPatch{DurationSeconds: &duration, Fields: json.RawMessage(`{"visual":"新的"}`)}); err != nil {
		t.Fatal(err)
	}
	if story.Shots[0].DurationSeconds != 6 || !strings.Contains(string(story.Shots[0].Fields), "新的") {
		t.Fatalf("patch not applied %+v", story.Shots[0])
	}

	// 重写分镜：保留第二个镜头（及其版本），删除第一个。
	story, err = svc.ReplaceStudioStoryPlan("user-a", story.ID, []StudioScenePlan{{ID: story.Scenes[0].ID, Title: "唯一场景", Shots: []StudioShotPlan{{ID: second.ID, DurationSeconds: 5}}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(story.Shots) != 1 || story.Shots[0].ID != second.ID || len(story.Versions) != 1 || story.Versions[0].TaskID != "vid-1" {
		t.Fatalf("replan must keep surviving shots and drop removed ones %+v", story)
	}
	if _, err := svc.ReplaceStudioStoryPlan("user-a", story.ID, []StudioScenePlan{{Shots: []StudioShotPlan{{DurationSeconds: 0}}}}); err == nil {
		t.Fatal("zero length shots must be rejected")
	}

	if _, err := svc.SetStudioStoryRender("user-a", story.ID, "img-1"); err == nil {
		t.Fatal("only timeline renders may be set as the final cut")
	}
	story, err = svc.SetStudioStoryRender("user-a", story.ID, "render-1")
	if err != nil {
		t.Fatal(err)
	}
	if story.Render == nil || story.Render.ResourceID != "out-1" || story.Render.DurationMs != 8000 || story.Status != "done" {
		t.Fatalf("render not attached %+v", story.Render)
	}
	if _, err := svc.StudioStory("user-b", story.ID); err == nil {
		t.Fatal("other user must not read the story")
	}
	if err := svc.DeleteStudioStory("user-a", story.ID); err != nil {
		t.Fatal(err)
	}
	for _, table := range []any{&model.StudioShot{}, &model.StudioScene{}, &model.StudioShotVersion{}, &model.StudioChatSession{}} {
		var count int64
		db.Model(table).Count(&count)
		if count != 0 {
			t.Fatalf("story delete must cascade, %T has %d rows", table, count)
		}
	}
}

func TestStudioWorksByIDsOnlyReturnsOwnStudioTasks(t *testing.T) {
	svc, db := newStudioTestService(t)
	for _, task := range []model.Task{
		{ID: "s1", UserID: "user-a", Type: "image", WorkbenchKind: "studio-image", Status: model.TaskStatusSucceeded},
		{ID: "c1", UserID: "user-a", Type: "image", WorkbenchKind: "canvas", Status: model.TaskStatusSucceeded},
		{ID: "o1", UserID: "user-b", Type: "image", WorkbenchKind: "studio-image", Status: model.TaskStatusSucceeded},
	} {
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	works, err := svc.StudioWorksByIDs("user-a", []string{"s1", "c1", "o1", "s1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(works) != 1 || works[0].ID != "s1" || works[0].Kind != "image" {
		t.Fatalf("unexpected works %+v", works)
	}
}

func TestActiveTaskLimitErrorCarriesMachineReadableDetail(t *testing.T) {
	err := activeTaskLimitError(5)
	if err.Status != 400 || err.Details["activeTaskLimit"] != 5 || !strings.Contains(err.Message, "5") {
		t.Fatalf("unexpected limit error %+v", err)
	}
}

func TestStudioUploadsRegistry(t *testing.T) {
	svc, db := newStudioTestService(t)
	for _, resource := range []model.Resource{
		{ID: "img", UserID: "user-a", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"},
		{ID: "vid", UserID: "user-a", Kind: "video", Status: model.ResourceStatusReady, MimeType: "video/mp4", DurationMs: 3000},
		{ID: "doc", UserID: "user-a", Kind: "file", Status: model.ResourceStatusReady, MimeType: "application/pdf"},
		{ID: "other", UserID: "user-b", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"},
	} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	first, err := svc.RegisterStudioUpload("user-a", "img", "a.png")
	if err != nil {
		t.Fatal(err)
	}
	again, err := svc.RegisterStudioUpload("user-a", "img", "a.png")
	if err != nil || again.ID != first.ID {
		t.Fatalf("re-registering the same resource must return the existing row: %+v %v", again, err)
	}
	if _, err := svc.RegisterStudioUpload("user-a", "vid", "b.mp4"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RegisterStudioUpload("user-a", "doc", "c.pdf"); err == nil {
		t.Fatal("documents are not studio media")
	}
	if _, err := svc.RegisterStudioUpload("user-a", "other", "x.png"); err == nil {
		t.Fatal("other users' resources must be rejected")
	}
	videos, err := svc.StudioUploads("user-a", "video")
	if err != nil || len(videos) != 1 || videos[0].DurationMs != 3000 {
		t.Fatalf("unexpected video uploads %+v %v", videos, err)
	}
	all, _ := svc.StudioUploads("user-a", "")
	if len(all) != 2 || all[0].Kind != "video" {
		t.Fatalf("newest upload must come first: %+v", all)
	}
	db.Delete(&model.Resource{}, "id = ?", "img")
	all, _ = svc.StudioUploads("user-a", "")
	if len(all) != 1 {
		t.Fatalf("uploads whose resource was deleted must be hidden: %+v", all)
	}
	if err := svc.DeleteStudioUpload("user-b", videos[0].ID); err == nil {
		t.Fatal("other users must not delete the upload")
	}
	if err := svc.DeleteStudioUpload("user-a", videos[0].ID); err != nil {
		t.Fatal(err)
	}
}

func TestStudioVoices(t *testing.T) {
	svc, db := newStudioTestService(t)
	for _, resource := range []model.Resource{
		{ID: "rec", UserID: "user-a", Kind: "audio", Status: model.ResourceStatusReady, MimeType: "audio/webm", DurationMs: 8000},
		{ID: "img", UserID: "user-a", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"},
		{ID: "other", UserID: "user-b", Kind: "audio", Status: model.ResourceStatusReady, MimeType: "audio/mpeg"},
	} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	voice, err := svc.CreateStudioVoice("user-a", " 我的声音 ", "record", "rec", "")
	if err != nil || voice.Name != "我的声音" || voice.DurationMs != 8000 {
		t.Fatalf("unexpected voice %+v %v", voice, err)
	}
	if _, err := svc.CreateStudioVoice("user-a", "x", "record", "img", ""); err == nil {
		t.Fatal("images are not voice samples")
	}
	if _, err := svc.CreateStudioVoice("user-a", "x", "record", "other", ""); err == nil {
		t.Fatal("other users' audio must be rejected")
	}
	if _, err := svc.CreateStudioVoice("user-a", "x", "design", "rec", ""); err == nil {
		t.Fatal("design voices are not supported yet")
	}
	if _, err := svc.CreateStudioVoice("user-a", "  ", "upload", "rec", ""); err == nil {
		t.Fatal("name is required")
	}
	if err := svc.RenameStudioVoice("user-b", voice.ID, "偷改"); err == nil {
		t.Fatal("other users must not rename the voice")
	}
	if err := svc.RenameStudioVoice("user-a", voice.ID, "旁白"); err != nil {
		t.Fatal(err)
	}
	if err := svc.TouchStudioVoice("user-a", voice.ID); err != nil {
		t.Fatal(err)
	}
	items, _ := svc.StudioVoices("user-a")
	if len(items) != 1 || items[0].Name != "旁白" || items[0].LastUsedAt == nil {
		t.Fatalf("unexpected voices %+v", items)
	}
	db.Delete(&model.Resource{}, "id = ?", "rec")
	if items, _ = svc.StudioVoices("user-a"); len(items) != 0 {
		t.Fatalf("voices whose sample was deleted must be hidden: %+v", items)
	}
	if err := svc.DeleteStudioVoice("user-a", voice.ID); err != nil {
		t.Fatal(err)
	}
}
