package app

import (
	"context"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestAutoResolveBillingOrders(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	old := time.Now().Add(-time.Hour)
	expired := time.Now().Add(-25 * time.Hour)
	cases := []struct {
		name       string
		taskType   string
		taskStatus model.TaskStatus
		providerID string
		updatedAt  time.Time
		createdAt  time.Time
		want       model.BillingStatus
	}{
		{name: "no_provider_id", taskType: "canvas_video", taskStatus: model.TaskStatusFailed, updatedAt: old, createdAt: old, want: model.BillingStatusRefunded},
		{name: "recent", taskType: "canvas_video", taskStatus: model.TaskStatusFailed, updatedAt: time.Now(), createdAt: old, want: model.BillingStatusUncertain},
		{name: "still_running", taskType: "canvas_video", taskStatus: model.TaskStatusRunning, updatedAt: old, createdAt: old, want: model.BillingStatusUncertain},
		{name: "succeeded", taskType: "canvas_video", taskStatus: model.TaskStatusSucceeded, updatedAt: old, createdAt: old, want: model.BillingStatusSettled},
		{name: "video_waiting_upstream", taskType: "canvas_video", taskStatus: model.TaskStatusFailed, providerID: "req-1", updatedAt: old, createdAt: old, want: model.BillingStatusUncertain},
		{name: "video_gave_up", taskType: "canvas_video", taskStatus: model.TaskStatusFailed, providerID: "req-2", updatedAt: expired, createdAt: expired, want: model.BillingStatusRefunded},
		{name: "image_failed_with_id", taskType: "canvas_image", taskStatus: model.TaskStatusFailed, providerID: "req-3", updatedAt: old, createdAt: old, want: model.BillingStatusRefunded},
	}
	orderIDs := map[string]string{}
	for _, tc := range cases {
		user := "user-" + tc.name
		task := &model.Task{ID: newID(), UserID: user, Type: tc.taskType, Status: tc.taskStatus, InputJSON: "{}", RouteRun: 1}
		order := &model.BillingOrder{ID: newID(), UserID: user, TaskID: task.ID, IdempotencyKey: newID(), Status: model.BillingStatusUncertain, AmountMicrocredits: 100, ReservedAmountMicrocredits: 100, ProviderRequestID: tc.providerID}
		task.BillingOrderID = order.ID
		for _, value := range []any{task, order, &model.CreditAccount{UserID: user, AvailableMicrocredits: 900, ReservedMicrocredits: 100}} {
			if err := db.Create(value).Error; err != nil {
				t.Fatal(err)
			}
		}
		if err := db.Model(order).UpdateColumns(map[string]any{"updated_at": tc.updatedAt, "created_at": tc.createdAt}).Error; err != nil {
			t.Fatal(err)
		}
		orderIDs[tc.name] = order.ID
	}
	if _, err := s.AutoResolveBillingOrders(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		got, err := s.repo.BillingOrder(orderIDs[tc.name])
		if err != nil {
			t.Fatal(err)
		}
		if got.Status != tc.want {
			t.Errorf("%s: status=%s want %s", tc.name, got.Status, tc.want)
		}
		var account model.CreditAccount
		if err := db.First(&account, "user_id = ?", "user-"+tc.name).Error; err != nil {
			t.Fatal(err)
		}
		if tc.want == model.BillingStatusRefunded && (account.AvailableMicrocredits != 1000 || account.ReservedMicrocredits != 0 || got.ResolvedBy != billingAutoResolveActorID) {
			t.Errorf("%s: account=%+v resolvedBy=%q", tc.name, account, got.ResolvedBy)
		}
	}
}
