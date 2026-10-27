package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 有有效期的积分（CreditLot）按「当月会员积分 → 最早到期的积分 → 永久积分」的顺序消费。
// 消费记录只在账本里，这里在每次需要时增量结算：从 AnchorAt 起的净消费减去会员积分能承担的部分，
// 超出的才扣到 CreditLot 上。会员积分周期开始、结束时重设 AnchorAt，保证一个结算窗口里只对应一个会员周期。

func settleCreditLotsTx(tx *gorm.DB, userID string, now time.Time) error {
	var state model.CreditLotState
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&state, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return tx.Create(&model.CreditLotState{UserID: userID, AnchorAt: now, UpdatedAt: now}).Error
	}
	if err != nil {
		return err
	}
	var lots []model.CreditLot
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND remaining_microcredits > 0", userID).
		Order("expires_at, created_at").Find(&lots).Error; err != nil {
		return err
	}
	if len(lots) == 0 {
		return resetCreditLotAnchorTx(tx, userID, now)
	}
	var membership model.UserMembership
	if err := tx.Where("user_id = ?", userID).Limit(1).Find(&membership).Error; err != nil {
		return err
	}
	spent, err := netSpendSinceTx(tx, userID, state.AnchorAt)
	if err != nil {
		return err
	}
	if membership.PeriodEndsAt != nil && membership.PeriodStartedAt != nil {
		// 会员积分先用：只有超出本期会员积分的消费才算到有效期积分上。
		// 结算起点晚于本期开始时，起点之前已经超出的部分不算在这个窗口里。
		plan := membership.PeriodCreditsMicrocredits
		before := int64(0)
		if membership.PeriodStartedAt.Before(state.AnchorAt) {
			total, err := netSpendSinceTx(tx, userID, *membership.PeriodStartedAt)
			if err != nil {
				return err
			}
			before = total - spent
		}
		spent = max(0, before+spent-plan) - max(0, before-plan)
	}
	if spent <= state.AppliedMicrocredits {
		return nil
	}
	pending := spent - state.AppliedMicrocredits
	for index := range lots {
		if pending <= 0 {
			break
		}
		used := lots[index].RemainingMicrocredits
		if used > pending {
			used = pending
		}
		if err := tx.Model(&model.CreditLot{}).Where("id = ?", lots[index].ID).
			Update("remaining_microcredits", lots[index].RemainingMicrocredits-used).Error; err != nil {
			return err
		}
		pending -= used
	}
	return tx.Model(&model.CreditLotState{}).Where("user_id = ?", userID).
		Updates(map[string]any{"applied_microcredits": spent, "updated_at": now}).Error
}

func netSpendSinceTx(tx *gorm.DB, userID string, since time.Time) (int64, error) {
	var delta int64
	err := tx.Model(&model.CreditLedgerEntry{}).
		Where("user_id = ? AND type IN ? AND created_at >= ?", userID, planSpendLedgerTypes, since).
		Select("COALESCE(SUM(available_delta_microcredits), 0)").Scan(&delta).Error
	return -delta, err
}

func resetCreditLotAnchorTx(tx *gorm.DB, userID string, now time.Time) error {
	state := model.CreditLotState{UserID: userID, AnchorAt: now, UpdatedAt: now}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.Assignments(map[string]any{"anchor_at": now, "applied_microcredits": 0, "updated_at": now}),
	}).Create(&state).Error
}

func createCreditLotTx(tx *gorm.DB, order *model.PaymentOrder, now time.Time) error {
	if err := settleCreditLotsTx(tx, order.UserID, now); err != nil {
		return err
	}
	lot := model.CreditLot{
		ID: newRepositoryID(), UserID: order.UserID, PaymentOrderID: order.ID,
		AmountMicrocredits: order.CreditsMicrocredits, RemainingMicrocredits: order.CreditsMicrocredits,
		ExpiresAt: now.AddDate(0, order.CreditValidMonths, 0), CreatedAt: now,
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&lot).Error
}

// ActiveCreditLots 结算后返回还没用完、也没过期的有效期积分，按到期先后排序。
func (r *Repository) ActiveCreditLots(userID string, now time.Time) ([]model.CreditLot, error) {
	var lots []model.CreditLot
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := settleCreditLotsTx(tx, userID, now); err != nil {
			return err
		}
		return tx.Where("user_id = ? AND remaining_microcredits > 0 AND expires_at > ?", userID, now).Order("expires_at").Find(&lots).Error
	})
	return lots, err
}

func (r *Repository) DueCreditLotUsers(now time.Time, limit int) ([]string, error) {
	var userIDs []string
	err := r.db.Model(&model.CreditLot{}).Where("remaining_microcredits > 0 AND expires_at <= ?", now).
		Distinct("user_id").Limit(limit).Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// ExpireCreditLots 结算后清掉已到期积分的剩余部分。
func (r *Repository) ExpireCreditLots(userID string, now time.Time) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var account model.CreditAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "user_id = ?", userID).Error; err != nil {
			return err
		}
		if err := settleCreditLotsTx(tx, userID, now); err != nil {
			return err
		}
		var lots []model.CreditLot
		if err := tx.Where("user_id = ? AND remaining_microcredits > 0 AND expires_at <= ?", userID, now).Find(&lots).Error; err != nil {
			return err
		}
		for _, lot := range lots {
			amount := lot.RemainingMicrocredits
			if amount > account.AvailableMicrocredits {
				amount = account.AvailableMicrocredits
			}
			if amount > 0 {
				account.AvailableMicrocredits -= amount
				key := "lot-expire:" + lot.ID
				if err := tx.Create(&model.CreditLedgerEntry{
					ID: newRepositoryID(), UserID: userID, Type: model.CreditLedgerLotExpire,
					AmountMicrocredits: -amount, AvailableDeltaMicrocredits: -amount,
					AvailableAfterMicrocredits: account.AvailableMicrocredits, ReservedAfterMicrocredits: account.ReservedMicrocredits,
					PaymentOrderID: lot.PaymentOrderID, ReferenceKey: &key, Note: "加购积分已过期", CreatedAt: now,
				}).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&model.CreditLot{}).Where("id = ?", lot.ID).Update("remaining_microcredits", 0).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
			"available_microcredits": account.AvailableMicrocredits, "version": gorm.Expr("version + 1"), "updated_at": now,
		}).Error
	})
}
