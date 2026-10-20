package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestStudioPortraitVerificationAndSeedanceSubstitution(t *testing.T) {
	allowLoopbackProviderTest(t)
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.StudioPortrait{}, &model.StudioPortraitPhoto{}, &model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	user := &model.User{ID: "u1", Role: model.UserRoleUser}

	list, err := svc.StudioPortraits(context.Background(), user)
	if err != nil || list.Available {
		t.Fatalf("no channel yet: %#v, %v", list, err)
	}
	if _, err := svc.CreateStudioPortrait(context.Background(), user, StudioPortraitCreateRequest{Name: "本人"}, "https://studio.example"); err == nil {
		t.Fatal("created without a Cloudwise channel")
	}

	verified := false
	var sessionBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer ak-test" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/assets/visual-validate/session":
			_ = json.NewDecoder(r.Body).Decode(&sessionBody)
			_, _ = w.Write([]byte(`{"ResponseMetadata":{"Action":"CreateVisualValidateSession"},"Result":{"BytedToken":"tok-1","H5Link":"https://h5.example/verify?t=tok-1","CallbackURL":"x"}}`))
		case "/api/v1/assets/visual-validate/result":
			if !verified {
				_, _ = w.Write([]byte(`{"ResponseMetadata":{"Error":{"Code":"NotFinished","Message":"validation not finished"}}}`))
				return
			}
			_, _ = w.Write([]byte(`{"ResponseMetadata":{"Action":"GetVisualValidateResult"},"Result":{"GroupId":"group-abc"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	cloudwiseAssetBaseURLOverride = server.URL
	t.Cleanup(func() { cloudwiseAssetBaseURLOverride = "" })

	channel := model.ModelChannel{ID: "cw", Scope: model.ChannelScopeSystem, Name: "Cloudwise", Enabled: true, BaseURL: "https://api.cloudwise.ai/api", APIKey: "ak-test", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ChannelModel{ID: "cm", ChannelID: "cw", ModelKey: "dreamina-seedance-2-0-260128", Capability: "video", Protocol: cloudwiseSeedanceProtocol, Enabled: true}).Error; err != nil {
		t.Fatal(err)
	}

	portrait, err := svc.CreateStudioPortrait(context.Background(), user, StudioPortraitCreateRequest{Name: "本人"}, "https://studio.example/")
	if err != nil {
		t.Fatal(err)
	}
	if portrait.Status != model.StudioPortraitPending || portrait.H5Link == "" || portrait.ChannelID != "cw" || sessionBody["callbackURL"] != "https://studio.example/portrait-verified" {
		t.Fatalf("portrait = %#v body = %#v", portrait, sessionBody)
	}
	pending, err := svc.CheckStudioPortrait(context.Background(), user, portrait.ID)
	if err != nil || pending.Status != model.StudioPortraitPending || !strings.Contains(pending.Error, "not finished") {
		t.Fatalf("pending = %#v, %v", pending, err)
	}
	verified = true
	done, err := svc.CheckStudioPortrait(context.Background(), user, portrait.ID)
	if err != nil || done.Status != model.StudioPortraitVerified || done.GroupID != "group-abc" {
		t.Fatalf("done = %#v, %v", done, err)
	}
	if _, err := svc.CheckStudioPortrait(context.Background(), &model.User{ID: "other"}, portrait.ID); err == nil {
		t.Fatal("another user read the portrait")
	}

	if err := db.Create(&model.StudioPortraitPhoto{ID: "ph1", PortraitID: portrait.ID, UserID: "u1", ResourceID: "res-1", AssetID: "asset-xyz", Status: model.StudioPortraitPhotoActive}).Error; err != nil {
		t.Fatal(err)
	}
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{InterfaceType: cloudwiseSeedanceProtocol, ChannelID: "cw"}, ReferenceImages: []providerMedia{
		{StorageKey: "resource:res-1", URL: "https://signed.example/res-1.png"},
		{StorageKey: "resource:res-2", URL: "https://signed.example/res-2.png"},
	}}
	if err := svc.prepareCloudwisePortraitReferences("u1", &input); err != nil {
		t.Fatal(err)
	}
	if input.ReferenceImages[0].URL != "asset://asset-xyz" || input.ReferenceImages[1].URL != "https://signed.example/res-2.png" {
		t.Fatalf("references = %#v", input.ReferenceImages)
	}
	other := canvasGenerationInput{Mode: "video", Config: providerConfig{InterfaceType: cloudwiseSeedanceProtocol, ChannelID: "another"}, ReferenceImages: []providerMedia{{StorageKey: "resource:res-1", URL: "https://signed.example/res-1.png"}}}
	_ = svc.prepareCloudwisePortraitReferences("u1", &other)
	if other.ReferenceImages[0].URL != "https://signed.example/res-1.png" {
		t.Fatal("asset from another Cloudwise account substituted")
	}
}
