package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestStudioFeedbackAndSiteContent(t *testing.T) {
	svc, db := newStudioTestService(t)
	admin := model.User{ID: "admin", Username: "boss", Role: "admin", Status: "active"}
	member := model.User{ID: "user-a", Username: "amy", Role: "user", Status: "active"}
	for _, user := range []model.User{admin, member} {
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.SubmitStudioFeedback("user-a", "nonsense", "x", "", ""); err == nil {
		t.Fatal("unknown categories must be rejected")
	}
	if _, err := svc.SubmitStudioFeedback("user-a", "bug", "   ", "", ""); err == nil {
		t.Fatal("empty feedback must be rejected")
	}
	item, err := svc.SubmitStudioFeedback("user-a", "bug", "生成按钮没反应", "amy@example.com", "/studio/create-video")
	if err != nil || item.Status != "open" {
		t.Fatalf("unexpected feedback %+v %v", item, err)
	}
	if _, err := svc.AdminStudioFeedback(&member, ""); err == nil {
		t.Fatal("members must not read feedback")
	}
	list, err := svc.AdminStudioFeedback(&admin, "open")
	if err != nil || len(list) != 1 || list[0].Username != "amy" {
		t.Fatalf("unexpected feedback list %+v %v", list, err)
	}
	if err := svc.SetStudioFeedbackStatus(&admin, item.ID, "done"); err != nil {
		t.Fatal(err)
	}
	if list, _ = svc.AdminStudioFeedback(&admin, "open"); len(list) != 0 {
		t.Fatalf("done feedback must leave the open list: %+v", list)
	}

	content, err := svc.StudioSiteContent()
	if err != nil || content["terms"] != "" || len(content) != 3 {
		t.Fatalf("unexpected empty content %+v %v", content, err)
	}
	if err := svc.SaveStudioSiteContent(&member, "terms", "x"); err == nil {
		t.Fatal("members must not edit terms")
	}
	if err := svc.SaveStudioSiteContent(&admin, "unknown", "x"); err == nil {
		t.Fatal("unknown keys must be rejected")
	}
	if err := svc.SaveStudioSiteContent(&admin, "terms", " 服务条款 "); err != nil {
		t.Fatal(err)
	}
	if content, _ = svc.StudioSiteContent(); content["terms"] != "服务条款" {
		t.Fatalf("terms not saved: %+v", content)
	}
}
