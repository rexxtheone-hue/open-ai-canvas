package repository

import (
	"errors"
	"fmt"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 会员积分按月发放、当月有效。用户消费时先用会员积分，所以周期结束时
// 剩余会员积分 = 本期发放 − 本期净消费（预扣、结算补扣减去退回），且不超过当前可用余额。
// 充值、兑换等其他来源的积分不受影响。

var planSpendLedgerTypes = []model.CreditLedgerType{model.CreditLedgerReserve, model.CreditLedgerConsume, model.CreditLedgerRefund}

func planPeriodLeftoverTx(tx *gorm.DB, membership *model.UserMembership, available int64) (int64, error) {
	if membership.PeriodStartedAt == nil || membership.PeriodCreditsMicrocredits <= 0 {
		return 0, nil
	}
	var delta int64
	if err := tx.Model(&model.CreditLedgerEntry{}).
		Where("user_id = ? AND type IN ? AND created_at >= ?", membership.UserID, planSpendLedgerTypes, *membership.PeriodStartedAt).
		Select("COALESCE(SUM(available_delta_microcredits), 0)").Scan(&delta).Error; err != nil {
		return 0, err
	}
	leftover := membership.PeriodCreditsMicrocredits + delta
	if leftover > membership.PeriodCreditsMicrocredits {
		leftover = membership.PeriodCreditsMicrocredits
	}
	if leftover > available {
		leftover = available
	}
	if leftover < 0 {
		leftover = 0
	}
	return leftover, nil
}

// planPurchase 是一笔入账的会员订单：本次订单的积分已作为第一个月发放。
type planPurchase struct {
	UserID, PlanID             string
	Months                     int
	OrderCredits, AvailableNow int64
	SubscriptionID, OrderID    string
	Renewal                    bool
}

// subscriptionGrace 是自动续费会员的宽限期：续费扣款通常在到期后几分钟到几小时才到账，期间权益不中断。
const subscriptionGrace = 3 * 24 * time.Hour

// applyPlanPurchaseTx 在支付入账事务里开通按月发放的会员。
// 续同一套餐时累加剩余月份；换套餐时从现在重新计算，旧套餐未发放的月份不保留。
// 手动提前续费时，上一期没用完的会员积分并入新周期；自动续费扣款对应新的一期，上一期剩余照常清零。
func applyPlanPurchaseTx(tx *gorm.DB, purchase planPurchase, now time.Time) error {
	if err := settleCreditLotsTx(tx, purchase.UserID, now); err != nil {
		return err
	}
	var membership model.UserMembership
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&membership, "user_id = ?", purchase.UserID).Error
	isNew := errors.Is(err, gorm.ErrRecordNotFound)
	if err != nil && !isNew {
		return err
	}
	leftover := int64(0)
	if !isNew && membership.PeriodEndsAt != nil && membership.PeriodEndsAt.After(now) {
		if leftover, err = planPeriodLeftoverTx(tx, &membership, purchase.AvailableNow-purchase.OrderCredits); err != nil {
			return err
		}
		if purchase.Renewal && leftover > 0 {
			if err := expirePlanLeftoverTx(tx, purchase.UserID, leftover, fmt.Sprintf("plan-expire:%s:%d", purchase.UserID, membership.PeriodEndsAt.Unix()), now); err != nil {
				return err
			}
			leftover = 0
		}
	}
	remaining := purchase.Months - 1
	active := !isNew && membership.ExpiresAt.After(now)
	if active && membership.PlanID == purchase.PlanID {
		remaining += membership.GrantsRemaining
	}
	if isNew || !active {
		membership = model.UserMembership{UserID: purchase.UserID, StartedAt: now}
	}
	start, end := now, now.AddDate(0, 1, 0)
	membership.PlanID = purchase.PlanID
	membership.MonthlyCreditsMicrocredits = purchase.OrderCredits
	membership.PeriodCreditsMicrocredits = leftover + purchase.OrderCredits
	membership.PeriodStartedAt, membership.PeriodEndsAt = &start, &end
	membership.GrantsRemaining = remaining
	membership.ExpiresAt = end.AddDate(0, remaining, 0)
	if purchase.SubscriptionID != "" {
		membership.SubscriptionID, membership.SubscriptionOrderID = purchase.SubscriptionID, purchase.OrderID
		membership.SubscriptionStatus = "active"
	} else if !purchase.Renewal {
		membership.SubscriptionID, membership.SubscriptionOrderID, membership.SubscriptionStatus = "", "", ""
	}
	if membership.SubscriptionID != "" && membership.SubscriptionStatus == "active" {
		membership.ExpiresAt = membership.ExpiresAt.Add(subscriptionGrace)
	}
	membership.UpdatedAt = now
	if err := tx.Save(&membership).Error; err != nil {
		return err
	}
	return resetCreditLotAnchorTx(tx, purchase.UserID, now)
}

func expirePlanLeftoverTx(tx *gorm.DB, userID string, amount int64, referenceKey string, now time.Time) error {
	var account model.CreditAccount
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "user_id = ?", userID).Error; err != nil {
		return err
	}
	if amount > account.AvailableMicrocredits {
		amount = account.AvailableMicrocredits
	}
	if amount <= 0 {
		return nil
	}
	account.AvailableMicrocredits -= amount
	if err := tx.Create(&model.CreditLedgerEntry{
		ID: newRepositoryID(), UserID: userID, Type: model.CreditLedgerPlanExpire,
		AmountMicrocredits: -amount, AvailableDeltaMicrocredits: -amount,
		AvailableAfterMicrocredits: account.AvailableMicrocredits, ReservedAfterMicrocredits: account.ReservedMicrocredits,
		ReferenceKey: &referenceKey, Note: "本月会员积分到期清零", CreatedAt: now,
	}).Error; err != nil {
		return err
	}
	return tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
		"available_microcredits": account.AvailableMicrocredits, "version": gorm.Expr("version + 1"), "updated_at": now,
	}).Error
}

// SetSubscriptionStatus 记录渠道通知或用户操作后的自动续费状态；订阅已结束时取消宽限期。
func (r *Repository) SetSubscriptionStatus(subscriptionID, status string, now time.Time) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var membership model.UserMembership
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&membership, "subscription_id = ?", subscriptionID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		previous := membership.SubscriptionStatus
		membership.SubscriptionStatus = status
		if previous == "active" && status != "active" && membership.ExpiresAt.After(now) {
			membership.ExpiresAt = membership.ExpiresAt.Add(-subscriptionGrace)
		} else if previous != "active" && status == "active" && membership.ExpiresAt.After(now) {
			membership.ExpiresAt = membership.ExpiresAt.Add(subscriptionGrace)
		}
		membership.UpdatedAt = now
		return tx.Save(&membership).Error
	})
}

// DuePlanCreditPeriods 返回会员积分周期已到期、需要清零或发放下个月积分的用户。
func (r *Repository) DuePlanCreditPeriods(now time.Time, limit int) ([]string, error) {
	var userIDs []string
	err := r.db.Model(&model.UserMembership{}).Where("period_ends_at IS NOT NULL AND period_ends_at <= ?", now).
		Order("period_ends_at").Limit(limit).Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// RollPlanCreditPeriod 结束一个会员积分周期：清掉没用完的会员积分；还有剩余月份时发放下个月积分。
func (r *Repository) RollPlanCreditPeriod(userID string, now time.Time) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var membership model.UserMembership
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&membership, "user_id = ? AND period_ends_at IS NOT NULL AND period_ends_at <= ?", userID, now).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		account := model.CreditAccount{UserID: userID, CreatedAt: now, UpdatedAt: now}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "user_id = ?", userID).Error; err != nil {
			return err
		}
		if err := settleCreditLotsTx(tx, userID, now); err != nil {
			return err
		}
		periodEnd := *membership.PeriodEndsAt
		leftover, err := planPeriodLeftoverTx(tx, &membership, account.AvailableMicrocredits)
		if err != nil {
			return err
		}
		if leftover > 0 {
			account.AvailableMicrocredits -= leftover
			key := fmt.Sprintf("plan-expire:%s:%d", userID, periodEnd.Unix())
			if err := tx.Create(&model.CreditLedgerEntry{
				ID: newRepositoryID(), UserID: userID, Type: model.CreditLedgerPlanExpire,
				AmountMicrocredits: -leftover, AvailableDeltaMicrocredits: -leftover,
				AvailableAfterMicrocredits: account.AvailableMicrocredits, ReservedAfterMicrocredits: account.ReservedMicrocredits,
				ReferenceKey: &key, Note: "本月会员积分到期清零", CreatedAt: now,
			}).Error; err != nil {
				return err
			}
		}
		grant := int64(0)
		if membership.GrantsRemaining > 0 && membership.MonthlyCreditsMicrocredits > 0 {
			grant = membership.MonthlyCreditsMicrocredits
			account.AvailableMicrocredits += grant
			key := fmt.Sprintf("plan-grant:%s:%d", userID, periodEnd.Unix())
			if err := tx.Create(&model.CreditLedgerEntry{
				ID: newRepositoryID(), UserID: userID, Type: model.CreditLedgerPlanGrant,
				AmountMicrocredits: grant, AvailableDeltaMicrocredits: grant,
				AvailableAfterMicrocredits: account.AvailableMicrocredits, ReservedAfterMicrocredits: account.ReservedMicrocredits,
				ReferenceKey: &key, Note: "会员每月积分", CreatedAt: now,
			}).Error; err != nil {
				return err
			}
		}
		if leftover > 0 || grant > 0 {
			if err := tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
				"available_microcredits": account.AvailableMicrocredits, "version": gorm.Expr("version + 1"), "updated_at": now,
			}).Error; err != nil {
				return err
			}
		}
		if grant > 0 {
			end := periodEnd.AddDate(0, 1, 0)
			if !end.After(now) {
				end = now.AddDate(0, 1, 0)
			}
			start := now
			membership.PeriodCreditsMicrocredits = grant
			membership.PeriodStartedAt, membership.PeriodEndsAt = &start, &end
			membership.GrantsRemaining--
		} else {
			membership.PeriodCreditsMicrocredits = 0
			membership.PeriodStartedAt, membership.PeriodEndsAt = nil, nil
			membership.GrantsRemaining = 0
		}
		membership.UpdatedAt = now
		if err := tx.Save(&membership).Error; err != nil {
			return err
		}
		return resetCreditLotAnchorTx(tx, userID, now)
	})
}
