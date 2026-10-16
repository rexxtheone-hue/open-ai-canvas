package app

import (
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestStudioFoldersAndLabels(t *testing.T) {
	svc, repo := newStudioTestService(t)
	now := time.Now().UTC()
	for index, id := range []string{"w1", "w2", "w3"} {
		created := now.Add(-time.Duration(index) * time.Minute)
		createStudioTestTask(t, repo, model.Task{ID: id, UserID: "u1", WorkbenchKind: model.StudioKindImage, Prompt: id, CreatedAt: created, UpdatedAt: created})
	}
	createStudioTestTask(t, repo, model.Task{ID: "other", UserID: "u2", WorkbenchKind: model.StudioKindImage, Prompt: "x", CreatedAt: now, UpdatedAt: now})

	folder, err := svc.CreateStudioFolder("u1", " 产品图 ")
	if err != nil || folder.Name != "产品图" {
		t.Fatalf("create folder %+v %v", folder, err)
	}
	if _, err := svc.CreateStudioFolder("u1", "  "); err == nil {
		t.Fatal("empty folder names must be rejected")
	}
	if moved, err := svc.MoveStudioWorks("u1", []string{"w1", "w2", "other"}, folder.ID); err != nil || moved != 2 {
		t.Fatalf("move = %d %v", moved, err)
	}
	if _, err := svc.MoveStudioWorks("u2", []string{"other"}, folder.ID); err == nil {
		t.Fatal("other users must not use the folder")
	}
	inFolder, _ := svc.StudioWorks("u1", StudioWorkQuery{Folder: folder.ID})
	if len(inFolder.Works) != 2 || inFolder.Works[0].FolderID != folder.ID {
		t.Fatalf("folder filter = %+v", inFolder.Works)
	}
	unsorted, _ := svc.StudioWorks("u1", StudioWorkQuery{Folder: "unsorted"})
	if len(unsorted.Works) != 1 || unsorted.Works[0].ID != "w3" {
		t.Fatalf("unsorted filter = %+v", unsorted.Works)
	}

	label, err := svc.CreateStudioLabel("u1", "已用", "green")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateStudioLabel("u1", "x", "neon"); err == nil {
		t.Fatal("unknown colors must be rejected")
	}
	if _, err := svc.LabelStudioWorks("u1", []string{"w1", "w3"}, label.ID, true); err != nil {
		t.Fatal(err)
	}
	labeled, _ := svc.StudioWorks("u1", StudioWorkQuery{Label: label.ID})
	if len(labeled.Works) != 2 || len(labeled.Works[0].LabelIDs) != 1 {
		t.Fatalf("label filter = %+v", labeled.Works)
	}
	if _, err := svc.LabelStudioWorks("u1", []string{"w1"}, label.ID, false); err != nil {
		t.Fatal(err)
	}
	if labeled, _ = svc.StudioWorks("u1", StudioWorkQuery{Label: label.ID}); len(labeled.Works) != 1 {
		t.Fatalf("label removal failed: %+v", labeled.Works)
	}

	data, err := svc.StudioOrganizeData("u1")
	if err != nil || len(data.Folders) != 1 || data.Folders[0].Count != 2 || len(data.Labels) != 1 {
		t.Fatalf("organize data %+v %v", data, err)
	}
	if err := svc.DeleteStudioFolder("u1", folder.ID); err != nil {
		t.Fatal(err)
	}
	if unsorted, _ = svc.StudioWorks("u1", StudioWorkQuery{Folder: "unsorted"}); len(unsorted.Works) != 3 {
		t.Fatalf("deleting a folder must return its works to unsorted: %+v", unsorted.Works)
	}
	if err := svc.DeleteStudioLabel("u1", label.ID); err != nil {
		t.Fatal(err)
	}
	if all, _ := svc.StudioWorks("u1", StudioWorkQuery{}); len(all.Works[0].LabelIDs) != 0 && len(all.Works[2].LabelIDs) != 0 {
		t.Fatalf("deleting a label must remove it from works: %+v", all.Works)
	}
}
