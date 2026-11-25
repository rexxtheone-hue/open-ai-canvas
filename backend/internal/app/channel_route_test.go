package app

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestNormalizeRouteResolution(t *testing.T) {
	for in, want := range map[string]string{"720": "720p", "720P": "720p", " 1080p ": "1080p", "4k": "2160p", "2160": "2160p", "480p": "480p", "": ""} {
		if got := normalizeRouteResolution(in); got != want {
			t.Fatalf("%q -> %q, want %q", in, got, want)
		}
	}
}

func channelRouteFixture(t *testing.T) (*Service, model.ChannelModel, model.ChannelModel, model.ModelChannel) {
	t.Helper()
	profile := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceMiniMaxVideo), "MiniMax-H3")
	svc, db, channel, source := createSystemChannelSelectionFixture(t, "video", model.ChannelInterfaceMiniMaxVideo, profile, []model.ChannelModelPriceTier{
		newSelectionPriceTier("source-768p", `{"vquality":"768p"}`, "source-provider", "per_second"),
		newSelectionPriceTier("source-1440p", `{"vquality":"1440p"}`, "source-provider", "per_second"),
	})
	targetChannel := model.ModelChannel{ID: newID(), Scope: model.ChannelScopeSystem, Enabled: true, Name: "Backup Channel", APIFormat: "legacy"}
	if err := db.Create(&targetChannel).Error; err != nil {
		t.Fatal(err)
	}
	target := model.ChannelModel{ID: newID(), ChannelID: targetChannel.ID, ModelKey: "target-model", ProviderModelKey: "target-provider", Capability: "video", Protocol: model.ChannelInterfaceMiniMaxVideo, Enabled: true, RouteOnly: true, CapabilityConfigJSON: source.CapabilityConfigJSON}
	if err := db.Create(&target).Error; err != nil {
		t.Fatal(err)
	}
	tier := newSelectionPriceTier("target-768p", `{"vquality":"768p"}`, "target-provider", "per_second")
	tier.ChannelModelID = target.ID
	if err := db.Create(&tier).Error; err != nil {
		t.Fatal(err)
	}
	source.RouteRules = []model.ChannelModelRouteRule{{Resolutions: []string{"768p"}, Targets: []string{target.ID, channelRouteSelf}}}
	if err := db.Model(&model.ChannelModel{}).Where("id = ?", source.ID).Update("route_rules", `[{"resolutions":["768p"],"targets":["`+target.ID+`","self"]}]`).Error; err != nil {
		t.Fatal(err)
	}
	return svc, source, target, channel
}

func TestChannelRouteSelectionExecutionAndFallback(t *testing.T) {
	svc, source, target, channel := channelRouteFixture(t)

	// 1. 下单：768p 命中路由，执行顺序是备用渠道模型、再到自己；客户端伪造的路由字段会被丢掉。
	resolved, err := svc.resolveSystemChannelModelSelection(map[string]any{
		"mode": "video",
		"config": map[string]any{"channelId": channel.ID, "model": source.ModelKey, "vquality": "768", "videoSeconds": "6",
			"routeTargets": []any{"forged"}, "routeIndex": "3"},
	}, "canvas_video", "text_to_video")
	if err != nil {
		t.Fatalf("selection error = %v", err)
	}
	config := resolved["config"].(map[string]any)
	targets, index := channelRouteState(config)
	if len(targets) != 2 || targets[0] != target.ID || targets[1] != source.ID || index != 0 {
		t.Fatalf("route state = %v %d", targets, index)
	}
	if config["priceTierId"] != "source-768p" || config["channelId"] != channel.ID {
		t.Fatalf("billing must stay on the selected model: %#v", config)
	}

	// 1440p 没有路由规则，照常由自己执行。
	plain, err := svc.resolveSystemChannelModelSelection(map[string]any{
		"mode": "video", "config": map[string]any{"channelId": channel.ID, "model": source.ModelKey, "vquality": "1440", "videoSeconds": "6"},
	}, "canvas_video", "text_to_video")
	if err != nil {
		t.Fatalf("1440p selection error = %v", err)
	}
	if plain["config"].(map[string]any)["routeTargets"] != nil {
		t.Fatal("resolutions without a rule must not be routed")
	}

	// 只作后台线路的模型不能被直接选。
	if _, err := svc.resolveSystemChannelModelSelection(map[string]any{
		"mode": "video", "config": map[string]any{"channelId": target.ChannelID, "model": target.ModelKey, "vquality": "768", "videoSeconds": "6"},
	}, "canvas_video", "text_to_video"); err == nil {
		t.Fatal("route-only models must not be selectable")
	}

	// 2. 执行：换成主用执行模型，删掉售价档。
	raw, _ := json.Marshal(resolved)
	executed, err := svc.applyChannelRouteExecution(string(raw))
	if err != nil {
		t.Fatalf("execution route error = %v", err)
	}
	var executedInput map[string]any
	_ = json.Unmarshal([]byte(executed), &executedInput)
	executedConfig := executedInput["config"].(map[string]any)
	if executedConfig["channelId"] != target.ChannelID || executedConfig["model"] != target.ModelKey || executedConfig["providerModelKey"] != "target-provider" || executedConfig["priceTierId"] != nil {
		t.Fatalf("execution config = %#v", executedConfig)
	}

	// 3. 失败切换：普通失败切到下一条线路；内容审核失败不切换；最后一条线路失败不再切换。
	leaseUntil := time.Now().Add(time.Minute)
	// 直连任务的轮次从 0 起，执行过一次后 attempts=2：切线路后不能被当成缺少提交记录的旧任务。
	task := model.Task{ID: newID(), UserID: "u1", Type: "canvas_video", Status: model.TaskStatusRunning, LeaseOwner: "worker-1", LeaseExpiresAt: &leaseUntil, InputJSON: string(raw), ProviderRequestID: "upstream-1", RouteRun: 0, Attempts: 2}
	if err := svc.repo.Create(&task); err != nil {
		t.Fatal(err)
	}
	if switched, _ := svc.tryChannelRouteFallback(&task, errors.New("The request failed because the output video may contain sensitive information")); switched {
		t.Fatal("content moderation failures must not switch routes")
	}
	switched, err := svc.tryChannelRouteFallback(&task, errors.New("upstream internal error 500"))
	if !switched || err != nil {
		t.Fatalf("fallback switched=%v err=%v", switched, err)
	}
	stored, err := svc.repo.Task(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Stage != "作品创作中" || stored.Error != "" {
		t.Fatalf("customers must not see the switch: stage=%q error=%q", stored.Stage, stored.Error)
	}
	// worker 领取时 attempts 加一；createDirectTaskAttempt 只拦 attempts > 1 的旧任务。
	if stored.Attempts != 0 {
		t.Fatalf("attempts = %d, want 0 so the backup run can submit", stored.Attempts)
	}
	if stored.RouteRun != 1 || stored.ProviderRequestID != "" || stored.LeaseOwner != "" || stored.Status != model.TaskStatusRunning || stored.ChannelModelID != source.ID {
		t.Fatalf("switched task = run %d provider %q lease %q status %s channelModel %s", stored.RouteRun, stored.ProviderRequestID, stored.LeaseOwner, stored.Status, stored.ChannelModelID)
	}
	var storedInput map[string]any
	_ = json.Unmarshal([]byte(stored.InputJSON), &storedInput)
	if _, nextIndex := channelRouteState(storedInput["config"].(map[string]any)); nextIndex != 1 {
		t.Fatalf("route index = %d, want 1", nextIndex)
	}
	backup, err := svc.applyChannelRouteExecution(stored.InputJSON)
	if err != nil || backup != stored.InputJSON {
		t.Fatalf("the backup is the selected model itself, so the execution input must stay unchanged (err=%v)", err)
	}
	stored.LeaseOwner = ""
	if switched, _ := svc.tryChannelRouteFallback(stored, errors.New("upstream internal error 500")); switched {
		t.Fatal("the last route must fail normally")
	}

	// 4. 用户重试从主用重新开始。
	if _, resetIndex := channelRouteState(func() map[string]any {
		var input map[string]any
		_ = json.Unmarshal([]byte(resetChannelRouteIndex(stored.InputJSON)), &input)
		return input["config"].(map[string]any)
	}()); resetIndex != 0 {
		t.Fatalf("retry index = %d, want 0", resetIndex)
	}
}
