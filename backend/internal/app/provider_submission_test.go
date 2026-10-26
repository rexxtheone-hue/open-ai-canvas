package app

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestDirectTaskAttemptAllowsExplicitRetryRun(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.RouteAttempt{}); err != nil {
		t.Fatal(err)
	}
	// 用户点「重试」后进入新的 RouteRun：本轮还没有提交过，不能被当成「提交记录丢失」冻结积分。
	retried := &model.Task{ID: "retried", Attempts: 2, RouteRun: 2}
	attempt, err := svc.createDirectTaskAttempt(retried)
	if err != nil || attempt == nil || attempt.DispatchState != "not_sent" || attempt.RouteRun != 2 {
		t.Fatalf("retry run attempt = %#v, err = %v", attempt, err)
	}
	// 没有重试轮次、却已经领取过多次的旧任务仍然保守地停止自动重发。
	legacy := &model.Task{ID: "legacy", Attempts: 2, RouteRun: 1}
	if _, err := svc.createDirectTaskAttempt(legacy); !isRouteDispatchUncertain(err) {
		t.Fatalf("legacy reclaimed task err = %v", err)
	}
}
