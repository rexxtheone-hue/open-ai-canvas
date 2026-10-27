// 支付后台 worker：消费异步通知、关闭过期订单、补查待支付订单。
//
// 通知与补查走同一条 applyPaymentResult 幂等入账路径，重复通知不会重复加积分。

package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"yingce/backend/internal/payment"
)

func (s *Service) startPaymentWorker(ctx context.Context) {
	s.runWorkerLoop(func(ctx context.Context) {
		s.drainPaymentNotifications()
		notificationTicker := time.NewTicker(15 * time.Second)
		defer notificationTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-notificationTicker.C:
				s.drainPaymentNotifications()
			}
		}
	})
	s.runWorkerLoop(func(ctx context.Context) {
		s.reconcileExpiredPaymentOrders(ctx)
		orderTicker := time.NewTicker(15 * time.Second)
		defer orderTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-orderTicker.C:
				s.reconcileExpiredPaymentOrders(ctx)
				s.queryPendingPaymentOrders(ctx)
			}
		}
	})
	s.runWorkerLoop(func(ctx context.Context) {
		s.rollPlanCreditPeriods()
		planTicker := time.NewTicker(5 * time.Minute)
		defer planTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-planTicker.C:
				s.rollPlanCreditPeriods()
			}
		}
	})
	s.runWorkerLoop(func(ctx context.Context) {
		s.maybeRunDailyPaymentReconciliation(ctx)
		reconciliationTicker := time.NewTicker(30 * time.Minute)
		defer reconciliationTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-reconciliationTicker.C:
				s.maybeRunDailyPaymentReconciliation(ctx)
			}
		}
	})
}

func (s *Service) drainPaymentNotifications() {
	items, err := s.repo.PendingPaymentNotifications(32)
	if err != nil {
		log.Printf("payment notification query failed: %v", err)
		return
	}
	for index := range items {
		item := &items[index]
		if err := s.processPaymentNotification(item); err != nil {
			delay := time.Duration(math.Pow(2, math.Min(float64(item.Attempts), 8))) * 5 * time.Second
			_ = s.repo.RetryPaymentNotification(item.ID, safePaymentError(err), time.Now().Add(delay))
		}
	}
}

func (s *Service) reconcileExpiredPaymentOrders(ctx context.Context) {
	orders, err := s.repo.ClaimExpiredPaymentOrders(32)
	if err != nil {
		log.Printf("expired payment order claim failed: %v", err)
		return
	}
	for index := range orders {
		order := &orders[index]
		operationContext, cancel := context.WithTimeout(ctx, 45*time.Second)
		err := s.closePaymentOrder(operationContext, order)
		cancel()
		if err != nil {
			_ = s.repo.RestoreClosingPaymentOrder(order.ID, safePaymentError(err))
		}
	}
}

func (s *Service) queryPendingPaymentOrders(ctx context.Context) {
	orders, err := s.repo.PaymentOrdersNeedingQuery(time.Now().Add(-30*time.Second), 32)
	if err != nil {
		log.Printf("pending payment order query failed: %v", err)
		return
	}
	for index := range orders {
		operationContext, cancel := context.WithTimeout(ctx, 20*time.Second)
		err := s.queryPaymentOrder(operationContext, &orders[index])
		cancel()
		if err != nil {
			log.Printf("payment order compensation query failed: order=%s error_type=%T", orders[index].ID, err)
		}
	}
}

// rollPlanCreditPeriods 清零到期的会员积分，并给还有剩余月份的会员发放下个月积分。
func (s *Service) rollPlanCreditPeriods() {
	now := time.Now()
	lotUsers, err := s.repo.DueCreditLotUsers(now, 100)
	if err != nil {
		log.Printf("credit lot expiry query failed: %v", err)
	}
	for _, userID := range lotUsers {
		if err := s.repo.ExpireCreditLots(userID, now); err != nil {
			log.Printf("credit lot expiry failed: user=%s error=%v", userID, err)
		}
	}
	userIDs, err := s.repo.DuePlanCreditPeriods(now, 100)
	if err != nil {
		log.Printf("plan credit period query failed: %v", err)
		return
	}
	for _, userID := range userIDs {
		if err := s.repo.RollPlanCreditPeriod(userID, now); err != nil {
			log.Printf("plan credit period roll failed: user=%s error=%v", userID, err)
		}
	}
}

func safePaymentError(err error) string {
	if err == nil {
		return ""
	}
	var providerErr *payment.ProviderError
	if errors.As(err, &providerErr) && providerErr.Code != "" {
		return truncateRunes(providerErr.Code, 1000)
	}
	return truncateRunes(fmt.Sprintf("%T", err), 1000)
}
