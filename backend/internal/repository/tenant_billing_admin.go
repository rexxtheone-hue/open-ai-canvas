package repository

import (
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrTenantTopupDuplicate = errors.New("这笔转账参考号已经入账过")
	ErrTenantPoolNegative   = errors.New("代理商池可用余额不足，不能执行本次扣减")
)

type TenantTopupInput struct {
	TenantID         string
	AmountSen        int64
	PaymentReference string
	Note             string
	ActorUserID      string
	Now              time.Time
}

type TenantTopupResult struct {
	Lot                     model.TenantCreditLot     `json:"lot"`
	Account                 model.TenantCreditAccount `json:"account"`
	GrossMicrocredits       int64                     `json:"grossMicrocredits"`
	DebtSettledMicrocredits int64                     `json:"debtSettledMicrocredits"`
	FirstTopup              bool                      `json:"firstTopup"`
}

func lockTenantAccountTx(tx *gorm.DB, tenantID string) (model.TenantCreditAccount, error) {
	if err := ensureTenantAccountTx(tx, tenantID); err != nil {
		return model.TenantCreditAccount{}, err
	}
	var account model.TenantCreditAccount
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "tenant_id = ?", tenantID).Error
	return account, err
}

// reconcileTenantLotsTx 让批次剩余之和不超过账户余额：结算超支让可用余额为负时，新入账的批次先补上这部分。
func reconcileTenantLotsTx(tx *gorm.DB, tenantID string) error {
	account, err := tenantAccountTx(tx, tenantID)
	if err != nil {
		return err
	}
	var lots int64
	if err := tx.Model(&model.TenantCreditLot{}).Where("tenant_id = ? AND remaining_microcredits > 0", tenantID).
		Select("COALESCE(SUM(remaining_microcredits), 0)").Scan(&lots).Error; err != nil {
		return err
	}
	excess := lots - max(account.AvailableMicrocredits+account.ReservedMicrocredits, 0)
	if excess <= 0 {
		return nil
	}
	_, err = consumeTenantLotsTx(tx, tenantID, excess)
	return err
}

// TopupTenantPool 记录一笔银行转账：先还清未结清的月费欠款，剩下的成为 12 个月有效的新批次。
func (r *Repository) TopupTenantPool(input TenantTopupInput) (*TenantTopupResult, error) {
	gross, err := TopupMicrocredits(input.AmountSen)
	if err != nil {
		return nil, err
	}
	reference := strings.TrimSpace(input.PaymentReference)
	if reference == "" {
		return nil, errors.New("请填写转账参考号")
	}
	now := input.Now
	if now.IsZero() {
		now = time.Now()
	}
	result := &TenantTopupResult{GrossMicrocredits: gross}
	err = r.db.Transaction(func(tx *gorm.DB) error {
		if _, err := lockTenantAccountTx(tx, input.TenantID); err != nil {
			return err
		}
		key := tenantReferenceKey("topup", input.TenantID+":"+strings.ToLower(reference))
		if exists, err := tenantLedgerExistsTx(tx, *key); err != nil {
			return err
		} else if exists {
			return ErrTenantTopupDuplicate
		}
		var previous int64
		if err := tx.Model(&model.TenantCreditLot{}).Where("tenant_id = ? AND source = ?", input.TenantID, "topup").Count(&previous).Error; err != nil {
			return err
		}
		result.FirstTopup = previous == 0
		lot := model.TenantCreditLot{
			ID: newRepositoryID(), TenantID: input.TenantID, Source: "topup", PaymentAmountSen: input.AmountSen,
			PaymentReference: clipRunes(reference, 120), Note: clipRunes(input.Note, 500), ActorUserID: input.ActorUserID,
			GrossMicrocredits: gross, ExpiresAt: now.AddDate(0, model.AgencyLotValidMonths, 0), CreatedAt: now,
		}
		if err := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", input.TenantID).Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits + ?", gross),
			"version":                gorm.Expr("version + 1"), "updated_at": now,
		}).Error; err != nil {
			return err
		}
		if err := createTenantLedgerTx(tx, model.TenantLedgerEntry{
			TenantID: input.TenantID, Type: model.TenantLedgerTopup, AmountMicrocredits: gross, AvailableDeltaMicrocredits: gross,
			LotID: lot.ID, ActorUserID: input.ActorUserID, Note: clipRunes("转账 "+reference+" "+input.Note, 500), ReferenceKey: key, CreatedAt: now,
		}); err != nil {
			return err
		}
		remaining := gross
		var debts []model.TenantDebt
		if err := tx.Where("tenant_id = ? AND status = ? AND remaining_microcredits > 0", input.TenantID, model.TenantDebtOpen).
			Order("created_at, id").Find(&debts).Error; err != nil {
			return err
		}
		for _, debt := range debts {
			if remaining <= 0 {
				break
			}
			paid := min(debt.RemainingMicrocredits, remaining)
			updates := map[string]any{"remaining_microcredits": debt.RemainingMicrocredits - paid, "updated_at": now}
			if paid == debt.RemainingMicrocredits {
				updates["status"] = model.TenantDebtSettled
				updates["settled_at"] = &now
			}
			if err := tx.Model(&model.TenantDebt{}).Where("id = ?", debt.ID).Updates(updates).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", input.TenantID).Updates(map[string]any{
				"available_microcredits": gorm.Expr("available_microcredits - ?", paid),
				"version":                gorm.Expr("version + 1"), "updated_at": now,
			}).Error; err != nil {
				return err
			}
			if err := createTenantLedgerTx(tx, model.TenantLedgerEntry{
				TenantID: input.TenantID, Type: model.TenantLedgerDebtSettle, AmountMicrocredits: -paid, AvailableDeltaMicrocredits: -paid,
				LotID: lot.ID, ActorUserID: input.ActorUserID, Note: "充值先抵扣 " + debt.Period + " 月最低消费欠款",
				ReferenceKey: tenantReferenceKey("debt-settle", debt.ID+":"+lot.ID), CreatedAt: now,
			}); err != nil {
				return err
			}
			remaining -= paid
			result.DebtSettledMicrocredits += paid
		}
		lot.DebtSettledMicrocredits = result.DebtSettledMicrocredits
		lot.AmountMicrocredits = remaining
		lot.RemainingMicrocredits = remaining
		if err := tx.Create(&lot).Error; err != nil {
			return err
		}
		if err := reconcileTenantLotsTx(tx, input.TenantID); err != nil {
			return err
		}
		if err := tx.First(&result.Lot, "id = ?", lot.ID).Error; err != nil {
			return err
		}
		result.Account, err = tenantAccountTx(tx, input.TenantID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// AdjustTenantPool 是平台管理员的人工调账：加积分会成为 12 个月有效的新批次，扣积分按到期先后扣批次。
func (r *Repository) AdjustTenantPool(tenantID string, amount int64, note string, actorUserID string, now time.Time) (*model.TenantCreditAccount, error) {
	if amount == 0 {
		return nil, errors.New("调账积分不能为 0")
	}
	var account model.TenantCreditAccount
	err := r.db.Transaction(func(tx *gorm.DB) error {
		current, err := lockTenantAccountTx(tx, tenantID)
		if err != nil {
			return err
		}
		if amount < 0 && current.AvailableMicrocredits+amount < 0 {
			return ErrTenantPoolNegative
		}
		lotID := ""
		if amount > 0 {
			lot := model.TenantCreditLot{
				ID: newRepositoryID(), TenantID: tenantID, Source: "adjust", Note: clipRunes(note, 500), ActorUserID: actorUserID,
				GrossMicrocredits: amount, AmountMicrocredits: amount, RemainingMicrocredits: amount,
				ExpiresAt: now.AddDate(0, model.AgencyLotValidMonths, 0), CreatedAt: now,
			}
			if err := tx.Create(&lot).Error; err != nil {
				return err
			}
			lotID = lot.ID
		} else if _, err := consumeTenantLotsTx(tx, tenantID, -amount); err != nil {
			return err
		}
		if err := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", tenantID).Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits + ?", amount),
			"version":                gorm.Expr("version + 1"), "updated_at": now,
		}).Error; err != nil {
			return err
		}
		if err := createTenantLedgerTx(tx, model.TenantLedgerEntry{
			TenantID: tenantID, Type: model.TenantLedgerAdjust, AmountMicrocredits: amount, AvailableDeltaMicrocredits: amount,
			LotID: lotID, ActorUserID: actorUserID, Note: clipRunes(note, 500), CreatedAt: now,
		}); err != nil {
			return err
		}
		if err := reconcileTenantLotsTx(tx, tenantID); err != nil {
			return err
		}
		account, err = tenantAccountTx(tx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &account, nil
}

// ExpireTenantLots 清掉已到期批次的剩余积分（最多扣到可用余额为 0，预留中的不动）。
func (r *Repository) ExpireTenantLots(now time.Time) error {
	var tenantIDs []string
	if err := r.db.Model(&model.TenantCreditLot{}).Where("remaining_microcredits > 0 AND expires_at <= ?", now).
		Distinct("tenant_id").Pluck("tenant_id", &tenantIDs).Error; err != nil {
		return err
	}
	for _, tenantID := range tenantIDs {
		if err := r.db.Transaction(func(tx *gorm.DB) error {
			account, err := lockTenantAccountTx(tx, tenantID)
			if err != nil {
				return err
			}
			var lots []model.TenantCreditLot
			if err := tx.Where("tenant_id = ? AND remaining_microcredits > 0 AND expires_at <= ?", tenantID, now).Find(&lots).Error; err != nil {
				return err
			}
			for _, lot := range lots {
				amount := min(lot.RemainingMicrocredits, max(account.AvailableMicrocredits, 0))
				if err := tx.Model(&model.TenantCreditLot{}).Where("id = ?", lot.ID).Update("remaining_microcredits", 0).Error; err != nil {
					return err
				}
				if amount <= 0 {
					continue
				}
				account.AvailableMicrocredits -= amount
				if err := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", tenantID).Updates(map[string]any{
					"available_microcredits": gorm.Expr("available_microcredits - ?", amount),
					"version":                gorm.Expr("version + 1"), "updated_at": now,
				}).Error; err != nil {
					return err
				}
				if err := createTenantLedgerTx(tx, model.TenantLedgerEntry{
					TenantID: tenantID, Type: model.TenantLedgerLotExpire, AmountMicrocredits: -amount, AvailableDeltaMicrocredits: -amount,
					LotID: lot.ID, Note: "批发积分已过期", ReferenceKey: tenantReferenceKey("lot-expire", lot.ID), CreatedAt: now,
				}); err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			return err
		}
	}
	return nil
}

// TenantPoolUsage 是时间段内已结算的批发池扣减（退款的订单没有扣减记录，不计入）。
func (r *Repository) TenantPoolUsage(tenantID string, start, end time.Time) (int64, error) {
	return tenantPoolUsageTx(r.db, tenantID, start, end)
}

func tenantPoolUsageTx(tx *gorm.DB, tenantID string, start, end time.Time) (int64, error) {
	var total int64
	err := tx.Model(&model.TenantLedgerEntry{}).
		Where("tenant_id = ? AND type = ? AND created_at >= ? AND created_at < ?", tenantID, model.TenantLedgerConsume, start, end).
		Select("COALESCE(SUM(amount_microcredits), 0)").Scan(&total).Error
	return -total, err
}

// SettleTenantMonthlyFee 结算一家代理商一个月的最低消费：同一 (租户, 月份) 只会生效一次，重跑安全。
// 月费先从池可用余额扣，不够的部分记成欠款，下次充值先还。
func (r *Repository) SettleTenantMonthlyFee(tenantID string, period string, start, end time.Time, feeFree bool, now time.Time) (*model.TenantMonthlyUsage, bool, error) {
	var row model.TenantMonthlyUsage
	created := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if _, err := lockTenantAccountTx(tx, tenantID); err != nil {
			return err
		}
		usage, err := tenantPoolUsageTx(tx, tenantID, start, end)
		if err != nil {
			return err
		}
		row = model.TenantMonthlyUsage{ID: newRepositoryID(), TenantID: tenantID, Period: period, UsageMicrocredits: usage, UsageSen: UsageSen(usage), FeeFree: feeFree, CreatedAt: now}
		if !feeFree {
			row.FeeSen = MonthlyFeeSen(usage)
			if row.FeeMicrocredits, err = FeeMicrocredits(row.FeeSen); err != nil {
				return err
			}
		}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 0 {
			return tx.First(&row, "tenant_id = ? AND period = ?", tenantID, period).Error
		}
		created = true
		if row.FeeMicrocredits <= 0 {
			return nil
		}
		account, err := tenantAccountTx(tx, tenantID)
		if err != nil {
			return err
		}
		deducted := min(row.FeeMicrocredits, max(account.AvailableMicrocredits, 0))
		debt := row.FeeMicrocredits - deducted
		if deducted > 0 {
			if err := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", tenantID).Updates(map[string]any{
				"available_microcredits": gorm.Expr("available_microcredits - ?", deducted),
				"version":                gorm.Expr("version + 1"), "updated_at": now,
			}).Error; err != nil {
				return err
			}
			if _, err := consumeTenantLotsTx(tx, tenantID, deducted); err != nil {
				return err
			}
		}
		if err := createTenantLedgerTx(tx, model.TenantLedgerEntry{
			TenantID: tenantID, Type: model.TenantLedgerMonthlyFee, AmountMicrocredits: -deducted, AvailableDeltaMicrocredits: -deducted,
			Note: clipRunes(period+" 月最低消费", 500), ReferenceKey: tenantReferenceKey("monthly-fee", tenantID+":"+period), CreatedAt: now,
		}); err != nil {
			return err
		}
		if debt > 0 {
			if err := tx.Create(&model.TenantDebt{
				ID: newRepositoryID(), TenantID: tenantID, Period: period, Reason: "monthly_fee",
				AmountMicrocredits: debt, RemainingMicrocredits: debt, Status: model.TenantDebtOpen, CreatedAt: now, UpdatedAt: now,
			}).Error; err != nil {
				return err
			}
		}
		row.DeductedMicrocredits, row.DebtMicrocredits = deducted, debt
		return tx.Model(&model.TenantMonthlyUsage{}).Where("id = ?", row.ID).
			Updates(map[string]any{"deducted_microcredits": deducted, "debt_microcredits": debt}).Error
	})
	if err != nil {
		return nil, false, err
	}
	return &row, created, nil
}

func (r *Repository) TenantCreditAccount(tenantID string) (model.TenantCreditAccount, error) {
	var account model.TenantCreditAccount
	err := r.db.Where("tenant_id = ?", tenantID).Limit(1).Find(&account).Error
	account.TenantID = tenantID
	return account, err
}

func (r *Repository) TenantCreditLots(tenantID string, activeOnly bool) ([]model.TenantCreditLot, error) {
	var lots []model.TenantCreditLot
	query := r.db.Where("tenant_id = ?", tenantID)
	if activeOnly {
		query = query.Where("remaining_microcredits > 0 AND expires_at > ?", time.Now())
	}
	return lots, query.Order("expires_at, created_at").Find(&lots).Error
}

func (r *Repository) TenantLedger(tenantID string, limit, offset int) ([]model.TenantLedgerEntry, int64, error) {
	var items []model.TenantLedgerEntry
	var total int64
	query := r.db.Model(&model.TenantLedgerEntry{}).Where("tenant_id = ?", tenantID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	err := query.Order("created_at desc, id desc").Limit(limit).Offset(max(offset, 0)).Find(&items).Error
	return items, total, err
}

func (r *Repository) TenantDebts(tenantID string, openOnly bool) ([]model.TenantDebt, error) {
	var items []model.TenantDebt
	query := r.db.Where("tenant_id = ?", tenantID)
	if openOnly {
		query = query.Where("status = ?", model.TenantDebtOpen)
	}
	return items, query.Order("created_at desc").Find(&items).Error
}

func (r *Repository) TenantOpenDebtTotal(tenantID string) (int64, error) {
	var total int64
	err := r.db.Model(&model.TenantDebt{}).Where("tenant_id = ? AND status = ?", tenantID, model.TenantDebtOpen).
		Select("COALESCE(SUM(remaining_microcredits), 0)").Scan(&total).Error
	return total, err
}

// TenantMonthlyUsages 按月份倒序；tenantID 或 period 为空时不过滤。
func (r *Repository) TenantMonthlyUsages(tenantID string, period string, limit int) ([]model.TenantMonthlyUsage, error) {
	var items []model.TenantMonthlyUsage
	query := r.db.Model(&model.TenantMonthlyUsage{})
	if tenantID != "" {
		query = query.Where("tenant_id = ?", tenantID)
	}
	if period != "" {
		query = query.Where("period = ?", period)
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return items, query.Order("period desc, tenant_id").Limit(limit).Find(&items).Error
}

// AgencyTenants 返回所有代理商（不含平台）。
func (r *Repository) AgencyTenants() ([]model.Tenant, error) {
	var items []model.Tenant
	return items, r.db.Where("is_platform = ? AND id <> ?", false, model.PlatformTenantID).Order("created_at").Find(&items).Error
}

// TenantAdminEmails 返回代理商管理员的邮箱。
func (r *Repository) TenantAdminEmails(tenantID string) ([]string, error) {
	var emails []string
	err := r.db.Model(&model.User{}).
		Where("tenant_id = ? AND role = ? AND status = ? AND email <> ''", tenantID, model.UserRoleTenantAdmin, model.UserStatusActive).
		Order("created_at").Pluck("email", &emails).Error
	return emails, err
}

// LatestTenantTopupLot 是最近一次银行转账充值，用于低余额提醒。
func (r *Repository) LatestTenantTopupLot(tenantID string) (*model.TenantCreditLot, error) {
	var lots []model.TenantCreditLot
	if err := r.db.Where("tenant_id = ? AND source = ?", tenantID, "topup").Order("created_at desc, id desc").Limit(1).Find(&lots).Error; err != nil {
		return nil, err
	}
	if len(lots) == 0 {
		return nil, nil
	}
	return &lots[0], nil
}

// MarkTenantLotAlert 记下某个提醒已发过；column 只能是 low_balance_alerted 或 zero_balance_alerted。
func (r *Repository) MarkTenantLotAlert(lotID string, column string) error {
	if column != "low_balance_alerted" && column != "zero_balance_alerted" {
		return errors.New("未知的提醒类型")
	}
	return r.db.Model(&model.TenantCreditLot{}).Where("id = ?", lotID).Update(column, true).Error
}

// TenantLotsDueExpiryReminder 返回 30 天内到期、这一档提醒还没发过的批次。
func (r *Repository) TenantLotsDueExpiryReminder(now time.Time) ([]model.TenantCreditLot, error) {
	var lots []model.TenantCreditLot
	err := r.db.Where("remaining_microcredits > 0 AND expires_at > ? AND ((expiry_reminder_stage < 1 AND expires_at <= ?) OR (expiry_reminder_stage < 2 AND expires_at <= ?))",
		now, now.AddDate(0, 0, 30), now.AddDate(0, 0, 7)).Order("tenant_id, expires_at").Find(&lots).Error
	return lots, err
}

func (r *Repository) MarkTenantLotReminderStage(lotID string, stage int) error {
	return r.db.Model(&model.TenantCreditLot{}).Where("id = ? AND expiry_reminder_stage < ?", lotID, stage).Update("expiry_reminder_stage", stage).Error
}

func (r *Repository) TenantModelPrices(tenantID string) ([]model.TenantModelPrice, error) {
	var items []model.TenantModelPrice
	return items, r.db.Where("tenant_id = ?", tenantID).Order("created_at").Find(&items).Error
}

// TenantModelPriceRules 返回对某个模型可能生效的规则：全部模型的、该模型的、该模型某规格的。
func (r *Repository) TenantModelPriceRules(tenantID string, channelModelID string) ([]model.TenantModelPrice, error) {
	var items []model.TenantModelPrice
	return items, r.db.Where("tenant_id = ? AND (channel_model_id IS NULL OR channel_model_id = ?)", tenantID, channelModelID).Find(&items).Error
}

func sameOptionalID(column string, value *string) (string, []any) {
	if value == nil {
		return column + " IS NULL", nil
	}
	return column + " = ?", []any{*value}
}

// SaveTenantModelPrice 按 (租户, 模型, 规格) 新建或覆盖一条零售价规则。
func (r *Repository) SaveTenantModelPrice(item *model.TenantModelPrice) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		modelClause, modelArgs := sameOptionalID("channel_model_id", item.ChannelModelID)
		tierClause, tierArgs := sameOptionalID("price_tier_id", item.PriceTierID)
		var existing []model.TenantModelPrice
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("tenant_id = ?", item.TenantID).
			Where(modelClause, modelArgs...).Where(tierClause, tierArgs...).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		now := time.Now()
		item.UpdatedAt = now
		if len(existing) == 0 {
			if item.ID == "" {
				item.ID = newRepositoryID()
			}
			item.CreatedAt = now
			return tx.Create(item).Error
		}
		item.ID, item.CreatedAt = existing[0].ID, existing[0].CreatedAt
		return tx.Model(&model.TenantModelPrice{}).Where("id = ?", item.ID).Updates(map[string]any{
			"multiplier_basis_points": item.MultiplierBasisPoints, "fixed_unit_price_microcredits": item.FixedUnitPriceMicrocredits,
			"enabled": item.Enabled, "updated_at": now,
		}).Error
	})
}

func (r *Repository) DeleteTenantModelPrice(tenantID string, id string) (bool, error) {
	result := r.db.Where("tenant_id = ? AND id = ?", tenantID, id).Delete(&model.TenantModelPrice{})
	return result.RowsAffected > 0, result.Error
}

// SaveTenantPaymentIntegration 保存代理商自己的收款渠道配置；ConfigJSON 由调用方先加密。
func (r *Repository) SaveTenantPaymentIntegration(item *model.TenantPaymentIntegration) error {
	now := time.Now()
	if item.ID == "" {
		item.ID = newRepositoryID()
	}
	item.CreatedAt, item.UpdatedAt = now, now
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "provider"}},
		DoUpdates: clause.Assignments(map[string]any{"enabled": item.Enabled, "config_json": item.ConfigJSON, "updated_at": now}),
	}).Create(item).Error
}

func (r *Repository) TenantPaymentIntegration(tenantID string, provider string) (*model.TenantPaymentIntegration, error) {
	var item model.TenantPaymentIntegration
	if err := r.db.Where("tenant_id = ? AND provider = ?", tenantID, provider).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

func (r *Repository) SetChannelModelAgencyDiscount(channelModelID string, percent int) error {
	if !ValidAgencyDiscount(percent) {
		return errors.New("代理商折扣只能是 15、25、30 或 40")
	}
	result := r.db.Model(&model.ChannelModel{}).Where("id = ?", channelModelID).Update("agency_discount_percent", percent)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ChannelModelAgencyDiscount 读取模型的代理商折扣（含已删除的模型，旧任务仍可结算）。
func (r *Repository) ChannelModelAgencyDiscount(channelModelID string) (int, error) {
	var percents []int
	if err := r.db.Unscoped().Model(&model.ChannelModel{}).Where("id = ?", channelModelID).Limit(1).Pluck("agency_discount_percent", &percents).Error; err != nil {
		return 0, err
	}
	if len(percents) == 0 || !ValidAgencyDiscount(percents[0]) {
		return model.AgencyDefaultDiscountPercent, nil
	}
	return percents[0], nil
}
