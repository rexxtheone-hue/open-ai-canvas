package app

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

const (
	billingAutoResolveAfter      = 30 * time.Minute
	billingAutoResolveGiveUp     = 24 * time.Hour
	billingAutoResolveBatch      = 50
	billingAutoResolveInterval   = 10 * time.Minute
	billingAutoResolveActorID    = "system"
	billingAutoResolveNotePrefix = "自动核对："
)

type billingAutoResolveStats struct{ Refunded, Settled, Recovered, Skipped, Failed int }

// AutoResolveBillingOrders 闭合长期未结的任务订单。用户没有拿到作品就退回预授权：
// 没有上游任务 ID 时作品不可能取回；有 ID 的视频任务先查询上游，成功则补发并结算，
// 超过 24 小时仍查不到结果才退回。上游可能已经扣费的成本由平台承担，不转嫁给用户。
func (s *Service) AutoResolveBillingOrders(ctx context.Context) (billingAutoResolveStats, error) {
	stats := billingAutoResolveStats{}
	now := time.Now()
	orders, err := s.repo.StaleOpenTaskBillingOrders(now, billingAutoResolveAfter, billingAutoResolveBatch)
	if err != nil {
		return stats, err
	}
	for i := range orders {
		if ctx.Err() != nil {
			break
		}
		order := &orders[i]
		action, note, err := s.autoResolveBillingOrder(ctx, order, now)
		if err != nil {
			stats.Failed++
			log.Printf("billing auto resolve order=%s task=%s failed: %v", order.ID, order.TaskID, err)
			continue
		}
		switch action {
		case "refund":
			stats.Refunded++
		case "settle":
			stats.Settled++
		case "recovered":
			stats.Recovered++
		default:
			stats.Skipped++
			continue
		}
		if action != "recovered" {
			if err := s.repo.RecordBillingResolution(order.ID, billingAutoResolveActorID, truncateRunes(billingAutoResolveNotePrefix+note, 500)); err != nil {
				log.Printf("billing auto resolve order=%s record resolution failed: %v", order.ID, err)
			}
		}
		log.Printf("billing auto resolve order=%s task=%s user=%s action=%s amount=%d note=%s", order.ID, order.TaskID, order.UserID, action, order.AmountMicrocredits, note)
	}
	return stats, nil
}

func (s *Service) autoResolveBillingOrder(ctx context.Context, order *model.BillingOrder, now time.Time) (string, string, error) {
	task, err := s.repo.Task(order.TaskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		note := "任务已不存在，退回预授权"
		return "refund", note, s.RefundBilling(order.ID, billingAutoResolveNotePrefix+note)
	}
	if err != nil {
		return "", "", err
	}
	switch task.Status {
	case model.TaskStatusSucceeded:
		note := "任务已成功交付，确认结算"
		s.hydrateTaskProviderRequestID(task)
		return "settle", note, s.SettleBilling(order.ID, firstNonEmpty(order.ProviderRequestID, task.ProviderRequestID))
	case model.TaskStatusFailed, model.TaskStatusCancelled:
	default:
		return "", "", nil
	}
	if task.MediaRecoveryJSON != "" {
		// 作品已生成但保存失败，留给任务中心的重试保存流程。
		return "", "", nil
	}
	s.hydrateTaskProviderRequestID(task)
	providerRequestID := strings.TrimSpace(task.ProviderRequestID)
	if providerRequestID == "" {
		note := "上游未确认接收（无上游任务 ID），用户未获得作品，自动退回"
		return "refund", note, s.RefundBilling(order.ID, billingAutoResolveNotePrefix+note)
	}
	isVideo := strings.HasPrefix(task.Type, "canvas_video") || strings.HasPrefix(task.Type, "video_")
	if isVideo && task.Status == model.TaskStatusFailed {
		result, queryErr := s.queryFailedVideoTask(ctx, task, "")
		if queryErr == nil && result != nil && result.Recovered {
			return "recovered", "上游已生成，作品已补发并结算", nil
		}
		if now.Sub(order.CreatedAt) < billingAutoResolveGiveUp {
			return "", "", nil
		}
		note := "超过 24 小时仍未从上游取得作品，自动退回"
		if queryErr != nil {
			note += "（" + truncateRunes(queryErr.Error(), 200) + "）"
		}
		return "refund", note, s.RefundBilling(order.ID, billingAutoResolveNotePrefix+note)
	}
	note := "任务失败，用户未获得作品，自动退回"
	return "refund", note, s.RefundBilling(order.ID, billingAutoResolveNotePrefix+note)
}

func (s *Service) startBillingAutoResolve(ctx context.Context) {
	run := func(ctx context.Context) {
		stats, err := s.AutoResolveBillingOrders(ctx)
		if err != nil {
			log.Printf("billing auto resolve failed: %v", err)
			return
		}
		if stats.Refunded+stats.Settled+stats.Recovered+stats.Failed > 0 {
			log.Printf("billing auto resolve refunded=%d settled=%d recovered=%d skipped=%d failed=%d", stats.Refunded, stats.Settled, stats.Recovered, stats.Skipped, stats.Failed)
		}
	}
	s.runWorkerLoop(func(ctx context.Context) {
		run(ctx)
		ticker := time.NewTicker(billingAutoResolveInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run(ctx)
			}
		}
	})
}
