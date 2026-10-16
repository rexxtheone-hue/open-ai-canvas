package app

import (
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestStudioBrandKitLifecycle(t *testing.T) {
	svc, db := newStudioTestService(t)
	if err := db.Create(&model.Resource{ID: "logo-1", UserID: "user-a", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "logo-other", UserID: "user-b", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "audio-1", UserID: "user-a", Kind: "audio", Status: model.ResourceStatusReady, MimeType: "audio/mpeg"}).Error; err != nil {
		t.Fatal(err)
	}

	first, err := svc.CreateStudioBrandKit("user-a", StudioBrandKitInput{Name: " 暖杯 ", Colors: []string{"#c9a84c", "#C9A84C", "#0a0a0a"}, LogoResourceID: "logo-1"})
	if err != nil {
		t.Fatal(err)
	}
	if !first.IsDefault || first.Name != "暖杯" || strings.Join(first.Colors, ",") != "#C9A84C,#0A0A0A" || first.LogoURL == "" {
		t.Fatalf("unexpected first kit %+v", first)
	}
	withAssets, err := svc.UpdateStudioBrandKit("user-a", first.ID, StudioBrandKitInput{Name: "暖杯", LogoResourceID: "logo-1", Typography: " 标题：思源黑体 ", Assets: []string{"logo-1", "logo-1"}, Styles: []string{"logo-1"}})
	if err != nil || withAssets.Typography != "标题：思源黑体" || len(withAssets.Assets) != 1 || len(withAssets.Styles) != 1 {
		t.Fatalf("brand assets not saved %+v %v", withAssets, err)
	}
	for _, input := range []StudioBrandKitInput{
		{Name: "x", Assets: []string{"audio-1"}},
		{Name: "x", Styles: []string{"logo-other"}},
	} {
		if _, err := svc.UpdateStudioBrandKit("user-a", first.ID, input); err == nil {
			t.Fatalf("expected brand image validation error for %+v", input)
		}
	}
	second, err := svc.CreateStudioBrandKit("user-a", StudioBrandKitInput{Name: "第二品牌"})
	if err != nil {
		t.Fatal(err)
	}
	if second.IsDefault {
		t.Fatal("second kit must not steal default automatically")
	}
	if _, err := svc.UpdateStudioBrandKit("user-a", second.ID, StudioBrandKitInput{Name: "第二品牌", IsDefault: true}); err != nil {
		t.Fatal(err)
	}
	kits, err := svc.StudioBrandKits("user-a")
	if err != nil {
		t.Fatal(err)
	}
	defaults := 0
	for _, kit := range kits {
		if kit.IsDefault {
			defaults++
			if kit.ID != second.ID {
				t.Fatalf("default should move to second kit, got %s", kit.ID)
			}
		}
	}
	if defaults != 1 || kits[0].ID != second.ID {
		t.Fatalf("expected exactly one default listed first, got %+v", kits)
	}

	for _, input := range []StudioBrandKitInput{
		{Name: ""},
		{Name: "x", Colors: []string{"red"}},
		{Name: "x", Colors: []string{"#000001", "#000002", "#000003", "#000004", "#000005", "#000006", "#000007"}},
		{Name: "x", LogoResourceID: "logo-other"},
		{Name: "x", LogoResourceID: "audio-1"},
		{Name: strings.Repeat("长", 41)},
	} {
		if _, err := svc.CreateStudioBrandKit("user-a", input); err == nil {
			t.Fatalf("expected validation error for %+v", input)
		}
	}

	if _, err := svc.UpdateStudioBrandKit("user-b", first.ID, StudioBrandKitInput{Name: "偷改"}); err == nil {
		t.Fatal("other user must not update the kit")
	}
	if err := svc.DeleteStudioBrandKit("user-b", first.ID); err == nil {
		t.Fatal("other user must not delete the kit")
	}
	if err := svc.DeleteStudioBrandKit("user-a", first.ID); err != nil {
		t.Fatal(err)
	}
	kits, _ = svc.StudioBrandKits("user-a")
	if len(kits) != 1 {
		t.Fatalf("expected one kit left, got %d", len(kits))
	}
}

func TestStudioBrandKitLimit(t *testing.T) {
	svc, _ := newStudioTestService(t)
	for index := 0; index < studioBrandKitLimit; index++ {
		if _, err := svc.CreateStudioBrandKit("user-a", StudioBrandKitInput{Name: "品牌"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.CreateStudioBrandKit("user-a", StudioBrandKitInput{Name: "超出"}); err == nil {
		t.Fatal("expected limit error")
	}
}
