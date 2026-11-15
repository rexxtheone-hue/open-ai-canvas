package model

import "time"

// 代理商批发计费：每家代理商（非平台租户）有一个批发积分池。
// 代理商的客户每次生成，同时预留客户的零售积分和代理商池的批发积分；平台租户永远不碰积分池。

const (
	// AgencyWholesaleMilliRMPer100Credits 是代理商批发价：RM 0.773 / 100 积分（平台价 RM 0.909 × 0.85）。
	AgencyWholesaleMilliRMPer100Credits int64 = 773
	AgencyDefaultDiscountPercent        int   = 15
	AgencyLotValidMonths                int   = 12
	AgencyFeeFreeMonths                 int   = 2
)

type TenantLedgerType string

const (
	TenantLedgerTopup      TenantLedgerType = "topup"
	TenantLedgerAdjust     TenantLedgerType = "adjust"
	TenantLedgerReserve    TenantLedgerType = "reserve"
	TenantLedgerConsume    TenantLedgerType = "consume"
	TenantLedgerRefund     TenantLedgerType = "refund"
	TenantLedgerLotExpire  TenantLedgerType = "lot_expire"
	TenantLedgerMonthlyFee TenantLedgerType = "monthly_fee"
	TenantLedgerDebtSettle TenantLedgerType = "debt_settle"
)

// BillingTenantSnapshot 嵌在计费订单里：代理商客户的订单记下平台价快照与批发池扣减，平台订单全部为零值。
type BillingTenantSnapshot struct {
	// PoolTenantID 是要扣批发池的代理商；平台订单为空。（订单所属租户另见 BillingOrder.TenantID）
	PoolTenantID                        string `json:"poolTenantId,omitempty" gorm:"column:pool_tenant_id;size:36;not null;default:'';index"`
	TenantDiscountPercent               int    `json:"-" gorm:"not null;default:0"`
	TenantPlatformAmountMicrocredits    int64  `json:"-" gorm:"not null;default:0"`
	TenantPlatformUnitPriceMicrocredits int64  `json:"-" gorm:"not null;default:0"`
	TenantPlatformMultiplierBPS         int64  `json:"-" gorm:"column:tenant_platform_multiplier_bps;not null;default:0"`
	TenantPlatformSurchargeMicrocredits int64  `json:"-" gorm:"not null;default:0"`
	// TenantReservedMicrocredits 是提交时预留的批发积分；TenantChargeMicrocredits 是当前占用（结算后为实际扣减，退款后为 0）。
	TenantReservedMicrocredits int64 `json:"-" gorm:"not null;default:0"`
	TenantChargeMicrocredits   int64 `json:"tenantChargeMicrocredits,omitempty" gorm:"not null;default:0"`
}

// TenantCreditAccount 是代理商批发池余额。Available + Reserved 等于各批次剩余之和（结算超支时 Available 可短暂为负）。
type TenantCreditAccount struct {
	TenantID              string    `json:"tenantId" gorm:"primaryKey;size:36"`
	AvailableMicrocredits int64     `json:"availableMicrocredits"`
	ReservedMicrocredits  int64     `json:"reservedMicrocredits"`
	Version               int64     `json:"version"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

// TenantCreditLot 是一笔批发积分（银行转账充值或调账），12 个月有效，先到期先用。
type TenantCreditLot struct {
	ID                      string    `json:"id" gorm:"primaryKey;size:36"`
	TenantID                string    `json:"tenantId" gorm:"size:36;not null;index"`
	Source                  string    `json:"source" gorm:"size:16;not null;default:'topup'"`
	PaymentAmountSen        int64     `json:"paymentAmountSen" gorm:"not null;default:0"`
	PaymentReference        string    `json:"paymentReference" gorm:"size:120;not null;default:''"`
	Note                    string    `json:"note" gorm:"size:500;not null;default:''"`
	ActorUserID             string    `json:"actorUserId" gorm:"size:36;not null;default:''"`
	GrossMicrocredits       int64     `json:"grossMicrocredits"`
	DebtSettledMicrocredits int64     `json:"debtSettledMicrocredits" gorm:"not null;default:0"`
	AmountMicrocredits      int64     `json:"amountMicrocredits"`
	RemainingMicrocredits   int64     `json:"remainingMicrocredits"`
	ExpiresAt               time.Time `json:"expiresAt" gorm:"index"`
	// ExpiryReminderStage：1 = 已发到期前 30 天提醒，2 = 已发 7 天提醒。
	ExpiryReminderStage int       `json:"-" gorm:"not null;default:0"`
	LowBalanceAlerted   bool      `json:"-" gorm:"not null;default:false"`
	ZeroBalanceAlerted  bool      `json:"-" gorm:"not null;default:false"`
	CreatedAt           time.Time `json:"createdAt" gorm:"index"`
}

type TenantLedgerEntry struct {
	ID                         string           `json:"id" gorm:"primaryKey;size:36"`
	TenantID                   string           `json:"tenantId" gorm:"size:36;not null;index:idx_tenant_ledger_tenant_created,priority:1"`
	Type                       TenantLedgerType `json:"type" gorm:"size:24;index"`
	AmountMicrocredits         int64            `json:"amountMicrocredits"`
	AvailableDeltaMicrocredits int64            `json:"availableDeltaMicrocredits"`
	ReservedDeltaMicrocredits  int64            `json:"reservedDeltaMicrocredits"`
	AvailableAfterMicrocredits int64            `json:"availableAfterMicrocredits"`
	ReservedAfterMicrocredits  int64            `json:"reservedAfterMicrocredits"`
	BillingOrderID             string           `json:"billingOrderId,omitempty" gorm:"size:36;index"`
	LotID                      string           `json:"lotId,omitempty" gorm:"size:36"`
	UserID                     string           `json:"userId,omitempty" gorm:"size:36"`
	ActorUserID                string           `json:"actorUserId,omitempty" gorm:"size:36"`
	Model                      string           `json:"model,omitempty" gorm:"size:120"`
	Note                       string           `json:"note,omitempty" gorm:"size:500"`
	ReferenceKey               *string          `json:"referenceKey,omitempty" gorm:"size:180;uniqueIndex"`
	CreatedAt                  time.Time        `json:"createdAt" gorm:"index:idx_tenant_ledger_tenant_created,priority:2"`
}

type TenantDebtStatus string

const (
	TenantDebtOpen    TenantDebtStatus = "open"
	TenantDebtSettled TenantDebtStatus = "settled"
)

// TenantDebt 是月最低消费从池里扣不够的部分，下一次充值先还清。
type TenantDebt struct {
	ID                    string           `json:"id" gorm:"primaryKey;size:36"`
	TenantID              string           `json:"tenantId" gorm:"size:36;not null;index"`
	Period                string           `json:"period" gorm:"size:7;not null"`
	Reason                string           `json:"reason" gorm:"size:32;not null;default:'monthly_fee'"`
	AmountMicrocredits    int64            `json:"amountMicrocredits"`
	RemainingMicrocredits int64            `json:"remainingMicrocredits"`
	Status                TenantDebtStatus `json:"status" gorm:"size:16;not null;default:'open';index"`
	SettledAt             *time.Time       `json:"settledAt"`
	CreatedAt             time.Time        `json:"createdAt"`
	UpdatedAt             time.Time        `json:"updatedAt"`
}

// TenantMonthlyUsage 是每家代理商每月一次的最低消费结算记录。
type TenantMonthlyUsage struct {
	ID                   string    `json:"id" gorm:"primaryKey;size:36"`
	TenantID             string    `json:"tenantId" gorm:"size:36;not null;uniqueIndex:idx_tenant_monthly_usage_period,priority:1"`
	Period               string    `json:"period" gorm:"size:7;not null;uniqueIndex:idx_tenant_monthly_usage_period,priority:2"`
	UsageMicrocredits    int64     `json:"usageMicrocredits"`
	UsageSen             int64     `json:"usageSen"`
	FeeSen               int64     `json:"feeSen"`
	FeeMicrocredits      int64     `json:"feeMicrocredits"`
	DeductedMicrocredits int64     `json:"deductedMicrocredits"`
	DebtMicrocredits     int64     `json:"debtMicrocredits"`
	FeeFree              bool      `json:"feeFree"`
	CreatedAt            time.Time `json:"createdAt"`
}

// TenantModelPrice 是代理商的零售价规则。ChannelModelID 为空 = 全部模型；PriceTierID 为空 = 该模型全部规格。
// 用户价 = 平台价 × Multiplier，或填了固定价时直接用固定价（Token 计费只用倍率）。Enabled=false 表示对客户隐藏。
type TenantModelPrice struct {
	ID                         string    `json:"id" gorm:"primaryKey;size:36"`
	TenantID                   string    `json:"tenantId" gorm:"size:36;not null;index"`
	ChannelModelID             *string   `json:"channelModelId" gorm:"size:36;index"`
	PriceTierID                *string   `json:"priceTierId" gorm:"size:36"`
	MultiplierBasisPoints      int64     `json:"multiplierBasisPoints" gorm:"not null;default:10000"`
	FixedUnitPriceMicrocredits *int64    `json:"fixedUnitPriceMicrocredits"`
	Enabled                    bool      `json:"enabled" gorm:"not null;default:true"`
	CreatedAt                  time.Time `json:"createdAt"`
	UpdatedAt                  time.Time `json:"updatedAt"`
}

// TenantPaymentIntegration 预留给代理商以后接自己的收款渠道；ConfigJSON 用系统设置密钥加密保存。
type TenantPaymentIntegration struct {
	ID         string    `json:"id" gorm:"primaryKey;size:36"`
	TenantID   string    `json:"tenantId" gorm:"size:36;not null;uniqueIndex:idx_tenant_payment_integration_provider,priority:1"`
	Provider   string    `json:"provider" gorm:"size:40;not null;uniqueIndex:idx_tenant_payment_integration_provider,priority:2"`
	Enabled    bool      `json:"enabled" gorm:"not null;default:false"`
	ConfigJSON string    `json:"-" gorm:"type:text;not null;default:''"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}
