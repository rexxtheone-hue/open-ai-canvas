package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestStudioProfilesFollowAndFeed(t *testing.T) {
	_, db := newStudioTestService(t)
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), dataDir)
	for _, user := range []model.User{
		{ID: "author", Username: "Mia.Studio", DisplayName: "小雅", Status: model.UserStatusActive},
		{ID: "fan", Username: "fan@example.com", Status: model.UserStatusActive},
		{ID: "phone", Username: "+60123456789", Status: model.UserStatusActive},
		{ID: "gone", Username: "gone_user", Status: model.UserStatusDisabled},
	} {
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
	}

	mine, err := svc.StudioMyProfile("author")
	if err != nil || mine.Handle != "mia.studio" || mine.Name != "小雅" || !mine.Mine {
		t.Fatalf("author profile %+v %v", mine, err)
	}
	// 邮箱、手机号做用户名时不能出现在主页地址里。
	fan, _ := svc.StudioMyProfile("fan")
	phone, _ := svc.StudioMyProfile("phone")
	if !strings.HasPrefix(fan.Handle, "creator") || strings.Contains(fan.Handle, "example") || !strings.HasPrefix(phone.Handle, "creator") || fan.Name != fan.Handle {
		t.Fatalf("private usernames leaked: %q %q name=%q", fan.Handle, phone.Handle, fan.Name)
	}

	if err := db.Create(&model.Resource{ID: "avatar", UserID: "author", Kind: "image", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/author/image/a.png", MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "fan-img", UserID: "fan", Kind: "image", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/fan/image/a.png", MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	updated, err := svc.UpdateStudioProfile("author", StudioProfileInput{
		Handle: "@Mia_Creates", Name: " Mia ", Bio: "产品视频", Location: "Malacca",
		Specialties: []string{"广告视频", "广告视频", " 人像 "}, Links: map[string]string{"instagram": "instagram.com/mia", "unknown": "https://x.example"},
		AvatarResourceID: "avatar",
	})
	if err != nil || updated.Handle != "mia_creates" || updated.Name != "Mia" || len(updated.Specialties) != 2 || updated.Links["instagram"] != "https://instagram.com/mia" || len(updated.Links) != 1 || updated.AvatarURL == "" {
		t.Fatalf("update %+v %v", updated, err)
	}
	for name, input := range map[string]StudioProfileInput{
		"taken":         {Handle: fan.Handle},
		"reserved":      {Handle: "admin"},
		"short":         {Handle: "ab"},
		"bad chars":     {Handle: "mia creates"},
		"foreign image": {Handle: "mia_creates", AvatarResourceID: "fan-img"},
		"bad link":      {Handle: "mia_creates", Links: map[string]string{"website": "javascript:alert(1)"}},
	} {
		if _, err := svc.UpdateStudioProfile("author", input); err == nil {
			t.Fatalf("%s should be rejected", name)
		}
	}

	// 公开访问：未登录也能看，旧地址失效，停用的账号看不到。
	public, err := svc.StudioProfileByHandle("", "MIA_CREATES")
	if err != nil || public.Mine || public.AvatarResourceID != "" || public.Name != "Mia" {
		t.Fatalf("public profile %+v %v", public, err)
	}
	if _, err := svc.StudioProfileByHandle("", "mia.studio"); err == nil {
		t.Fatal("old handle should no longer resolve")
	}
	if _, err := svc.StudioMyProfile("gone"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.StudioProfileByHandle("", "gone_user"); err == nil {
		t.Fatal("disabled users must not have a public profile")
	}

	if _, err := svc.FollowStudioProfile("author", "mia_creates", true); err == nil {
		t.Fatal("users cannot follow themselves")
	}
	followed, err := svc.FollowStudioProfile("fan", "mia_creates", true)
	if err != nil || !followed.Following || followed.Stats.Followers != 1 {
		t.Fatalf("follow %+v %v", followed, err)
	}
	if _, err := svc.FollowStudioProfile("fan", "mia_creates", true); err != nil {
		t.Fatal("following twice must be idempotent")
	}

	createStudioTestTask(t, db, model.Task{ID: "done", UserID: "author", WorkbenchKind: model.StudioKindImage, Prompt: "咖啡",
		InputJSON:  `{"mode":"image","prompt":"咖啡","metadata":{"source":"studio","studioTool":"create-image"}}`,
		ResultJSON: `{"images":[{"storageKey":"resource:avatar","mimeType":"image/png"}]}`})
	post, err := svc.PublishStudioWork("author", "done", StudioPublishInput{Title: "咖啡海报"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.LikeStudioPost("fan", post.ID, true); err != nil {
		t.Fatal(err)
	}
	feed, err := svc.StudioCommunity("fan", StudioCommunityQuery{Following: true})
	if err != nil || len(feed.Posts) != 1 || feed.Posts[0].AuthorHandle != "mia_creates" || feed.Posts[0].Author != "Mia" || feed.Posts[0].AuthorAvatar == "" {
		t.Fatalf("following feed %+v %v", feed.Posts, err)
	}
	if empty, _ := svc.StudioCommunity("phone", StudioCommunityQuery{Following: true}); len(empty.Posts) != 0 {
		t.Fatalf("users who follow nobody get an empty feed, got %d", len(empty.Posts))
	}
	works, err := svc.StudioProfilePosts("", "mia_creates", "works", 0, 0)
	if err != nil || len(works.Posts) != 1 || works.Posts[0].Liked {
		t.Fatalf("profile works %+v %v", works.Posts, err)
	}
	liked, err := svc.StudioProfilePosts("", fan.Handle, "liked", 0, 0)
	if err != nil || len(liked.Posts) != 1 || liked.Posts[0].ID != post.ID {
		t.Fatalf("liked tab %+v %v", liked.Posts, err)
	}
	stats, _ := svc.StudioProfileByHandle("fan", "mia_creates")
	if stats.Stats.Works != 1 || stats.Stats.Likes != 1 || !stats.Following {
		t.Fatalf("stats %+v", stats)
	}
	if unfollowed, err := svc.FollowStudioProfile("fan", "mia_creates", false); err != nil || unfollowed.Following || unfollowed.Stats.Followers != 0 {
		t.Fatalf("unfollow %+v %v", unfollowed, err)
	}

	// 创作者列表只列有公开作品的人，可以按领域、所在地、关键词筛选。
	creators, err := svc.StudioCreators("fan", StudioCreatorQuery{})
	if err != nil || len(creators.Creators) != 1 || creators.Creators[0].Handle != "mia_creates" || creators.Creators[0].Stats.Works != 1 || creators.Creators[0].Stats.Likes != 1 || len(creators.Creators[0].Previews) != 1 {
		t.Fatalf("creators %+v %v", creators.Creators, err)
	}
	for name, query := range map[string]StudioCreatorQuery{"specialty": {Specialty: "人像"}, "location": {Location: "malacca"}, "search": {Search: "MIA"}, "sorted": {Sort: "followers"}} {
		if page, err := svc.StudioCreators("", query); err != nil || len(page.Creators) != 1 {
			t.Fatalf("%s filter %+v %v", name, page.Creators, err)
		}
	}
	for name, query := range map[string]StudioCreatorQuery{"specialty": {Specialty: "配音"}, "location": {Location: "Penang"}, "search": {Search: "nobody"}} {
		if page, err := svc.StudioCreators("", query); err != nil || len(page.Creators) != 0 {
			t.Fatalf("%s filter should be empty: %+v %v", name, page.Creators, err)
		}
	}
	preview, err := svc.StudioProfilePreviewByHandle("mia_creates")
	if err != nil || preview.Title != "Mia (@mia_creates)" || preview.Description != "产品视频" || preview.ImagePath == "" {
		t.Fatalf("preview %+v %v", preview, err)
	}
}
