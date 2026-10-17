package app

import (
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestStudioAndCanvasShareOneLibrary(t *testing.T) {
	svc, db := newStudioTestService(t)
	now := time.Now().UTC()
	at := func(minutes int) time.Time { return now.Add(-time.Duration(minutes) * time.Minute) }
	createStudioTestTask(t, db, model.Task{ID: "studio-img", UserID: "u1", WorkbenchKind: model.StudioKindImage, Type: "canvas_image", Prompt: "studio", InputJSON: `{"mode":"image","metadata":{"source":"studio","studioTool":"create-image"}}`, ResultJSON: `{"images":[{"storageKey":"resource:r1"}]}`, CreatedAt: at(1), UpdatedAt: at(1)})
	createStudioTestTask(t, db, model.Task{ID: "canvas-img", UserID: "u1", Type: "canvas_image", Prompt: "canvas image", InputJSON: `{"mode":"image"}`, ResultJSON: `{"images":[{"storageKey":"resource:r2"}]}`, CreatedAt: at(2), UpdatedAt: at(2)})
	createStudioTestTask(t, db, model.Task{ID: "canvas-vid", UserID: "u1", Type: "canvas_video", WorkbenchKind: "video", Prompt: "canvas video", InputJSON: `{"mode":"video"}`, ResultJSON: `{"video":{"storageKey":"resource:r3"}}`, CreatedAt: at(3), UpdatedAt: at(3)})
	createStudioTestTask(t, db, model.Task{ID: "canvas-upscale", UserID: "u1", Type: "video_upscale", Prompt: "upscale", InputJSON: `{}`, ResultJSON: `{"video":{"storageKey":"resource:r4"}}`, CreatedAt: at(4), UpdatedAt: at(4)})
	createStudioTestTask(t, db, model.Task{ID: "canvas-text", UserID: "u1", Type: "canvas_text", Prompt: "text", InputJSON: `{"mode":"text"}`, CreatedAt: at(5), UpdatedAt: at(5)})
	createStudioTestTask(t, db, model.Task{ID: "other-user", UserID: "u2", Type: "canvas_image", Prompt: "x", InputJSON: `{}`, CreatedAt: at(1), UpdatedAt: at(1)})

	page, err := svc.StudioWorks("u1", StudioWorkQuery{})
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, work := range page.Works {
		got = append(got, work.ID+":"+work.Kind+":"+work.Source)
	}
	if strings.Join(got, ",") != "studio-img:image:studio,canvas-img:image:canvas,canvas-vid:video:canvas,canvas-upscale:video:canvas" {
		t.Fatalf("shared library = %v", got)
	}
	for source, want := range map[string]int{"studio": 1, "canvas": 3} {
		if filtered, err := svc.StudioWorks("u1", StudioWorkQuery{Source: source}); err != nil || len(filtered.Works) != want {
			t.Fatalf("source %s: %d works, %v", source, len(filtered.Works), err)
		}
	}
	if videos, _ := svc.StudioWorks("u1", StudioWorkQuery{Kind: "video", Source: "canvas"}); len(videos.Works) != 2 {
		t.Fatalf("canvas videos = %d", len(videos.Works))
	}
	if _, err := svc.StudioWorks("u1", StudioWorkQuery{Source: "elsewhere"}); err == nil {
		t.Fatal("unknown sources must be rejected")
	}

	// Canvas 作品也能收藏、整理；在 Studio 删除后 Canvas 创作历史也不再显示，但画布的项目和进行中列表照常读到。
	if err := svc.SetStudioFavorite("u1", "canvas-img", true); err != nil {
		t.Fatalf("canvas works can be favorited: %v", err)
	}
	if hidden, err := svc.HideStudioWorks("u1", []string{"canvas-img", "canvas-text", "other-user"}); err != nil || hidden != 1 {
		t.Fatalf("hide = %d %v", hidden, err)
	}
	history, err := svc.TasksWithOptions("u1", TaskListOptions{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, task := range history {
		if task.ID == "canvas-img" {
			t.Fatal("works deleted in Studio must leave the creation history too")
		}
	}
	if len(history) != 4 {
		t.Fatalf("creation history = %d tasks", len(history))
	}

	// 上传素材：Studio 上传会登记成 Canvas 资产；Canvas 资产也出现在 Studio 的上传里。
	for _, resource := range []model.Resource{
		{ID: "up", UserID: "u1", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png", CreatedAt: at(10)},
		{ID: "asset-res", UserID: "u1", Kind: "video", Status: model.ResourceStatusReady, MimeType: "video/mp4"},
		{ID: "gen-res", UserID: "u1", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"},
	} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	upload, err := svc.RegisterStudioUpload("u1", "up", "logo.png")
	if err != nil {
		t.Fatal(err)
	}
	mirror, err := svc.repo.AssetForUser("u1", studioUploadAssetID(upload.ID))
	if err != nil || mirror.Kind != "image" || mirror.Title != "logo.png" || !strings.Contains(mirror.PayloadJSON, `"storageKey":"resource:up"`) {
		t.Fatalf("studio upload must become a canvas asset: %+v %v", mirror, err)
	}
	for _, asset := range []model.Asset{
		{ID: "canvas-asset", UserID: "u1", Kind: "video", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "片头", PayloadJSON: `{"data":{"storageKey":"resource:asset-res"}}`, CreatedAt: now, UpdatedAt: now},
		{ID: "gen-asset", UserID: "u1", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "生成图片", PayloadJSON: `{"data":{"storageKey":"resource:gen-res"},"metadata":{"source":"generation-task"}}`, CreatedAt: now, UpdatedAt: now},
	} {
		if err := db.Create(&asset).Error; err != nil {
			t.Fatal(err)
		}
	}
	uploads, err := svc.StudioUploads("u1", "")
	if err != nil {
		t.Fatal(err)
	}
	sources := []string{}
	for _, item := range uploads {
		sources = append(sources, item.ID+":"+item.Source)
	}
	if strings.Join(sources, ",") != upload.ID+":studio,asset:canvas-asset:canvas" {
		t.Fatalf("shared uploads = %v", sources)
	}
	if err := svc.DeleteStudioUpload("u1", "asset:canvas-asset"); err == nil {
		t.Fatal("canvas assets are deleted from Canvas, not Studio")
	}
	if err := svc.DeleteStudioUpload("u1", upload.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.repo.AssetForUser("u1", studioUploadAssetID(upload.ID)); err == nil {
		t.Fatal("deleting a studio upload must remove its canvas asset")
	}

	// 共用素材库上线前的 Studio 上传，打开 Canvas 资产时补登记。
	if err := db.Create(&model.StudioUpload{ID: "legacy", UserID: "u1", ResourceID: "up", Kind: "image", Name: "old.png", CreatedAt: at(30)}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UserAssetsPage("u1", 1, 50, UserAssetPageFilter{}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.repo.AssetForUser("u1", studioUploadAssetID("legacy")); err != nil {
		t.Fatalf("legacy studio uploads must be backfilled into canvas assets: %v", err)
	}
}
