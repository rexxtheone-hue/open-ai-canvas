// 代理商批发池：与客户积分在同一个事务里预留、结算、退款。
//
// 只有 BillingOrder.TenantID 非空（代理商客户）的订单才会碰批发池；平台订单完全不经过这里。
// 预留只在账户上把 Available 挪到 Reserved；结算时按实际用量扣 Reserved，并按到期先后扣减批次剩余。

package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrTenantPoolInsufficient 是代理商池余额不足；对客户只显示这句，不提批发池。
var ErrTenantPoolInsufficient = errors.New("服务暂时不可用，请联系客服")

func tenantOrderApplies(order model.BillingOrder) bool {
	return order.PoolTenantID != "" && order.PoolTenantID != model.PlatformTenantID
}

func tenantReferenceKey(prefix string, id string) *string {
	key := prefix + ":" + id
	return &key
}

func ensureTenantAccountTx(tx *gorm.DB, tenantID string) error {
	account := model.TenantCreditAccount{TenantID: tenantID}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error
}

func tenantAccountTx(tx *gorm.DB, tenantID string) (model.TenantCreditAccount, error) {
	var account model.TenantCreditAccount
	err := tx.First(&account, "tenant_id = ?", tenantID).Error
	return account, err
}

func tenantLedgerExistsTx(tx *gorm.DB, key string) (bool, error) {
	var count int64
	err := tx.Model(&model.TenantLedgerEntry{}).Where("reference_key = ?", key).Count(&count).Error
	return count > 0, err
}

func createTenantLedgerTx(tx *gorm.DB, entry model.TenantLedgerEntry) error {
	account, err := tenantAccountTx(tx, entry.TenantID)
	if err != nil {
		return err
	}
	if entry.ID == "" {
		entry.ID = newRepositoryID()
	}
	entry.AvailableAfterMicrocredits = account.AvailableMicrocredits
	entry.ReservedAfterMicrocredits = account.ReservedMicrocredits
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now()
	}
	return tx.Create(&entry).Error
}

// reserveTenantPoolTx 在客户积分预留的同一事务里预留批发池；不足时返回 ErrTenantPoolInsufficient。
func reserveTenantPoolTx(tx *gorm.DB, order *model.BillingOrder) error {
	if !tenantOrderApplies(*order) {
		return nil
	}
	charge := order.TenantChargeMicrocredits
	if charge < 0 {
		return errors.New("代理商批发扣减无效")
	}
	order.TenantReservedMicrocredits = charge
	if err := ensureTenantAccountTx(tx, order.PoolTenantID); err != nil {
		return err
	}
	updated := tx.Model(&model.TenantCreditAccount{}).
		Where("tenant_id = ? AND available_microcredits >= ?", order.PoolTenantID, charge).
		Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits - ?", charge),
			"reserved_microcredits":  gorm.Expr("reserved_microcredits + ?", charge),
			"version":                gorm.Expr("version + 1"),
			"updated_at":             time.Now(),
		})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return ErrTenantPoolInsufficient
	}
	return createTenantLedgerTx(tx, model.TenantLedgerEntry{
		TenantID: order.PoolTenantID, Type: model.TenantLedgerReserve,
		AvailableDeltaMicrocredits: -charge, ReservedDeltaMicrocredits: charge,
		BillingOrderID: order.ID, UserID: order.UserID, Model: order.Model,
		ReferenceKey: tenantReferenceKey("reserve", order.ID),
	})
}

// tenantPlatformActual 用订单里的平台价快照重算这次生成的平台积分（客户零售价可能是倍率或固定价）。
func tenantPlatformActual(order model.BillingOrder) (int64, error) {
	switch {
	case order.BillingMode == "token" && !zeroPricedTokenOrder(order):
		if order.UsageSource == billingUsageSourceReservedEstimate {
			return order.TenantPlatformAmountMicrocredits, nil
		}
		usage := &BillingUsage{InputTokens: order.InputTokens, OutputTokens: order.OutputTokens, CachedTokens: order.CachedTokens, ImageTokens: order.ImageTokens}
		platform := order
		platform.MultiplierBasisPoints = order.TenantPlatformMultiplierBPS
		amount, err := tokenUsageAmount(platform, usage)
		if err != nil {
			return 0, err
		}
		amount += order.TenantPlatformSurchargeMicrocredits
		if billingChargeLimitApplies(order) {
			retail, err := tokenUsageAmount(order, usage)
			if err != nil {
				return 0, err
			}
			retail += order.SurchargeMicrocredits
			// 客户被 Agent 上限截断时，批发池按同样比例截断。
			if retail > order.ActualAmountMicrocredits && retail > 0 {
				return MulDivCeil(amount, order.ActualAmountMicrocredits, retail)
			}
		}
		return amount, nil
	case order.BillingMode == "per_second" && order.Capability == "audio":
		return audioBillingAmount(order.TenantPlatformUnitPriceMicrocredits, order.Quantity, order.TenantPlatformMultiplierBPS)
	}
	return order.TenantPlatformAmountMicrocredits, nil
}

// consumeTenantLotsTx 按到期先后扣减批次剩余，返回批次不够扣的部分。
func consumeTenantLotsTx(tx *gorm.DB, tenantID string, amount int64) (int64, error) {
	if amount <= 0 {
		return 0, nil
	}
	var lots []model.TenantCreditLot
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("tenant_id = ? AND remaining_microcredits > 0", tenantID).
		Order("expires_at, created_at").Find(&lots).Error; err != nil {
		return 0, err
	}
	for _, lot := range lots {
		if amount <= 0 {
			break
		}
		used := min(lot.RemainingMicrocredits, amount)
		if err := tx.Model(&model.TenantCreditLot{}).Where("id = ?", lot.ID).
			Update("remaining_microcredits", gorm.Expr("remaining_microcredits - ?", used)).Error; err != nil {
			return 0, err
		}
		amount -= used
	}
	return amount, nil
}

// settleTenantPoolTx 在客户结算后按实际平台积分扣批发池，释放多预留的部分。重复调用只生效一次。
func settleTenantPoolTx(tx *gorm.DB, orderID string) error {
	var order model.BillingOrder
	if err := tx.First(&order, "id = ?", orderID).Error; err != nil {
		return err
	}
	if !tenantOrderApplies(order) || order.Status != model.BillingStatusSettled {
		return nil
	}
	key := tenantReferenceKey("settle", order.ID)
	if exists, err := tenantLedgerExistsTx(tx, *key); err != nil || exists {
		return err
	}
	platformActual, err := tenantPlatformActual(order)
	if err != nil {
		return err
	}
	actual, err := WholesaleMicrocredits(platformActual, order.TenantDiscountPercent)
	if err != nil {
		return err
	}
	reserved := order.TenantChargeMicrocredits
	updated := tx.Model(&model.TenantCreditAccount{}).
		Where("tenant_id = ? AND reserved_microcredits >= ?", order.PoolTenantID, reserved).
		Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits + ?", reserved-actual),
			"reserved_microcredits":  gorm.Expr("reserved_microcredits - ?", reserved),
			"version":                gorm.Expr("version + 1"),
			"updated_at":             time.Now(),
		})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return errors.New("代理商批发池预留余额不一致")
	}
	if _, err := consumeTenantLotsTx(tx, order.PoolTenantID, actual); err != nil {
		return err
	}
	if err := tx.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Update("tenant_charge_microcredits", actual).Error; err != nil {
		return err
	}
	return createTenantLedgerTx(tx, model.TenantLedgerEntry{
		TenantID: order.PoolTenantID, Type: model.TenantLedgerConsume, AmountMicrocredits: -actual,
		AvailableDeltaMicrocredits: reserved - actual, ReservedDeltaMicrocredits: -reserved,
		BillingOrderID: order.ID, UserID: order.UserID, Model: order.Model, ReferenceKey: key,
	})
}

// refundTenantPoolTx 在客户退款时把批发池预留全部退回。
func refundTenantPoolTx(tx *gorm.DB, orderID string) error {
	var order model.BillingOrder
	if err := tx.First(&order, "id = ?", orderID).Error; err != nil {
		return err
	}
	if !tenantOrderApplies(order) || order.Status != model.BillingStatusRefunded {
		return nil
	}
	key := tenantReferenceKey("refund", order.ID)
	if exists, err := tenantLedgerExistsTx(tx, *key); err != nil || exists {
		return err
	}
	reserved := order.TenantChargeMicrocredits
	updated := tx.Model(&model.TenantCreditAccount{}).
		Where("tenant_id = ? AND reserved_microcredits >= ?", order.PoolTenantID, reserved).
		Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits + ?", reserved),
			"reserved_microcredits":  gorm.Expr("reserved_microcredits - ?", reserved),
			"version":                gorm.Expr("version + 1"),
			"updated_at":             time.Now(),
		})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return errors.New("代理商批发池预留余额不一致")
	}
	if err := tx.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Update("tenant_charge_microcredits", 0).Error; err != nil {
		return err
	}
	return createTenantLedgerTx(tx, model.TenantLedgerEntry{
		TenantID: order.PoolTenantID, Type: model.TenantLedgerRefund, AmountMicrocredits: reserved,
		AvailableDeltaMicrocredits: reserved, ReservedDeltaMicrocredits: -reserved,
		BillingOrderID: order.ID, UserID: order.UserID, Model: order.Model, ReferenceKey: key,
	})
}

// restoreTenantPoolTx 对应人工把已退款订单改回已结算：直接从批发池可用余额扣实际用量。
func restoreTenantPoolTx(tx *gorm.DB, orderID string) error {
	var order model.BillingOrder
	if err := tx.First(&order, "id = ?", orderID).Error; err != nil {
		return err
	}
	if !tenantOrderApplies(order) || order.Status != model.BillingStatusSettled {
		return nil
	}
	key := tenantReferenceKey("restore", order.ID)
	if exists, err := tenantLedgerExistsTx(tx, *key); err != nil || exists {
		return err
	}
	platformActual, err := tenantPlatformActual(order)
	if err != nil {
		return err
	}
	actual, err := WholesaleMicrocredits(platformActual, order.TenantDiscountPercent)
	if err != nil {
		return err
	}
	if err := ensureTenantAccountTx(tx, order.PoolTenantID); err != nil {
		return err
	}
	if err := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", order.PoolTenantID).Updates(map[string]any{
		"available_microcredits": gorm.Expr("available_microcredits - ?", actual),
		"version":                gorm.Expr("version + 1"), "updated_at": time.Now(),
	}).Error; err != nil {
		return err
	}
	if _, err := consumeTenantLotsTx(tx, order.PoolTenantID, actual); err != nil {
		return err
	}
	if err := tx.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Update("tenant_charge_microcredits", actual).Error; err != nil {
		return err
	}
	return createTenantLedgerTx(tx, model.TenantLedgerEntry{
		TenantID: order.PoolTenantID, Type: model.TenantLedgerConsume, AmountMicrocredits: -actual,
		AvailableDeltaMicrocredits: -actual, BillingOrderID: order.ID, UserID: order.UserID, Model: order.Model,
		Note: "人工确认上游成功，退款订单重新扣费", ReferenceKey: key,
	})
}

// adjustTenantPoolForRouteSwitchTx 在切换备用线路、重新定价时同步调整批发池预留，返回要写回订单的栏位。
func adjustTenantPoolForRouteSwitchTx(tx *gorm.DB, order model.BillingOrder, replacement *model.BillingOrder, routeID string) (map[string]any, error) {
	if replacement == nil || !tenantOrderApplies(order) {
		return nil, nil
	}
	if replacement.PoolTenantID != order.PoolTenantID {
		return nil, ErrBillingStateConflict
	}
	delta := replacement.TenantChargeMicrocredits - order.TenantChargeMicrocredits
	if delta != 0 {
		query := tx.Model(&model.TenantCreditAccount{}).Where("tenant_id = ?", order.PoolTenantID)
		if delta > 0 {
			query = query.Where("available_microcredits >= ?", delta)
		} else {
			query = query.Where("reserved_microcredits >= ?", -delta)
		}
		updated := query.Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits - ?", delta),
			"reserved_microcredits":  gorm.Expr("reserved_microcredits + ?", delta),
			"version":                gorm.Expr("version + 1"), "updated_at": time.Now(),
		})
		if updated.Error != nil {
			return nil, updated.Error
		}
		if updated.RowsAffected != 1 {
			if delta > 0 {
				return nil, ErrTenantPoolInsufficient
			}
			return nil, errors.New("代理商批发池预留余额不一致")
		}
		if err := createTenantLedgerTx(tx, model.TenantLedgerEntry{
			TenantID: order.PoolTenantID, Type: model.TenantLedgerReserve,
			AvailableDeltaMicrocredits: -delta, ReservedDeltaMicrocredits: delta,
			BillingOrderID: order.ID, UserID: order.UserID, Model: replacement.Model, Note: "备用供应线路价格调整",
			ReferenceKey: tenantReferenceKey("route", order.ID+":"+routeID),
		}); err != nil {
			return nil, err
		}
	}
	return map[string]any{
		"tenant_discount_percent":                 replacement.TenantDiscountPercent,
		"tenant_platform_amount_microcredits":     replacement.TenantPlatformAmountMicrocredits,
		"tenant_platform_unit_price_microcredits": replacement.TenantPlatformUnitPriceMicrocredits,
		"tenant_platform_multiplier_bps":          replacement.TenantPlatformMultiplierBPS,
		"tenant_platform_surcharge_microcredits":  replacement.TenantPlatformSurchargeMicrocredits,
		"tenant_reserved_microcredits":            order.TenantReservedMicrocredits + delta,
		"tenant_charge_microcredits":              replacement.TenantChargeMicrocredits,
	}, nil
}

// UserTenantID 返回用户所属租户；用户不存在（或测试库没有用户表）时视为平台。
func (r *Repository) UserTenantID(userID string) (string, error) {
	if userID == "" {
		return model.PlatformTenantID, nil
	}
	var tenantIDs []string
	err := r.db.Model(&model.User{}).Where("id = ?", userID).Limit(1).Pluck("tenant_id", &tenantIDs).Error
	if err != nil {
		if !r.db.Migrator().HasTable(&model.User{}) {
			return model.PlatformTenantID, nil
		}
		return "", err
	}
	if len(tenantIDs) == 0 || tenantIDs[0] == "" {
		return model.PlatformTenantID, nil
	}
	return tenantIDs[0], nil
}
