package app

import (
	"context"
	"log"
	"time"
)

const billingReviewStaleAfter = 15 * time.Minute

// AuditBillingReview 执行只读账单巡检，提醒运维及时进入人工核对链路。
// 资金动作由 AutoResolveBillingOrders 自动闭合；这里只统计仍未闭合的订单。
func (s *Service) AuditBillingReview() error {
	stats, err := s.repo.StaleBillingReviewStats(time.Now(), billingReviewStaleAfter)
	if err != nil {
		return err
	}
	if stats.Total() == 0 {
		return nil
	}
	oldest := ""
	if stats.Oldest != nil {
		oldest = stats.Oldest.UTC().Format(time.RFC3339)
	}
	log.Printf("billing review audit stale_orders=%d reserved=%d running=%d uncertain=%d oldest=%s", stats.Total(), stats.Reserved, stats.Running, stats.Uncertain, oldest)
	return nil
}

func (s *Service) startBillingReviewAudit(ctx context.Context) {
	audit := func() {
		if err := s.AuditBillingReview(); err != nil {
			log.Printf("billing review audit failed: %v", err)
		}
	}
	s.runWorkerLoop(func(ctx context.Context) {
		audit()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				audit()
			}
		}
	})
}
