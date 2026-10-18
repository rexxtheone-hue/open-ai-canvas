package model

import "time"

// 合作身份：认证创作者、商家、推广者。三者都走“用户申请 → 后台审核”，可叠加在同一个账号上。
const (
	PartnerKindCreator   = "creator"
	PartnerKindMerchant  = "merchant"
	PartnerKindAffiliate = "affiliate"

	PartnerApplicationPending  = "pending"
	PartnerApplicationApproved = "approved"
	PartnerApplicationRejected = "rejected"
	PartnerApplicationRevoked  = "revoked"

	AffiliateStatusActive    = "active"
	AffiliateStatusSuspended = "suspended"

	AffiliatePayoutCash    = "cash"
	AffiliatePayoutCredits = "credits"

	AffiliatePayoutRequested = "requested"
	AffiliatePayoutPaid      = "paid"
	AffiliatePayoutRejected  = "rejected"
	AffiliatePayoutCompleted = "completed"
)

// PartnerApplication 每个用户每种身份一条，驳回后可以修改再提交。
type PartnerApplication struct {
	ID         string     `json:"id" gorm:"primaryKey;size:36"`
	UserID     string     `json:"userId" gorm:"size:36;uniqueIndex:idx_partner_application_user_kind,priority:1"`
	Kind       string     `json:"kind" gorm:"size:16;index;uniqueIndex:idx_partner_application_user_kind,priority:2"`
	Status     string     `json:"status" gorm:"size:16;index"`
	Message    string     `json:"message" gorm:"type:text"`
	Contact    string     `json:"contact" gorm:"size:200"`
	ReviewNote string     `json:"reviewNote" gorm:"size:500"`
	ReviewedBy string     `json:"reviewedBy,omitempty" gorm:"size:36"`
	ReviewedAt *time.Time `json:"reviewedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt" gorm:"index"`
}

// AffiliateAccount 是审核通过的推广者。CommissionRateBP 为 0 时使用系统默认比例（万分比）。
type AffiliateAccount struct {
	UserID           string    `json:"userId" gorm:"primaryKey;size:36"`
	Code             string    `json:"code" gorm:"uniqueIndex;size:32"`
	CommissionRateBP int       `json:"commissionRateBp"`
	Status           string    `json:"status" gorm:"size:16;index"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// AffiliateReferral 记录新用户注册时归属的推广者，每个用户最多一条。
type AffiliateReferral struct {
	UserID          string    `json:"userId" gorm:"primaryKey;size:36"`
	AffiliateUserID string    `json:"affiliateUserId" gorm:"size:36;index"`
	Code            string    `json:"code" gorm:"size:32"`
	CreatedAt       time.Time `json:"createdAt" gorm:"index"`
}

// AffiliateCommission 按被推荐人的每笔已入账充值订单生成一条，金额单位与订单相同（分 / 仙）。
// AvailableAt 之前处于冷却期；PayoutID 非空表示已被提现申请占用。
type AffiliateCommission struct {
	ID              string    `json:"id" gorm:"primaryKey;size:36"`
	AffiliateUserID string    `json:"affiliateUserId" gorm:"size:36;index"`
	ReferredUserID  string    `json:"referredUserId" gorm:"size:36;index"`
	PaymentOrderID  string    `json:"paymentOrderId" gorm:"uniqueIndex;size:36"`
	Currency        string    `json:"currency" gorm:"size:8"`
	OrderAmountFen  int64     `json:"orderAmountFen"`
	RateBP          int       `json:"rateBp"`
	AmountFen       int64     `json:"amountFen"`
	AvailableAt     time.Time `json:"availableAt" gorm:"index"`
	PayoutID        string    `json:"payoutId,omitempty" gorm:"size:36;index"`
	CreatedAt       time.Time `json:"createdAt" gorm:"index"`
}

// AffiliatePayout 是推广者的提现或换积分申请。现金由财务审核后线下打款，积分即时到账。
type AffiliatePayout struct {
	ID                  string     `json:"id" gorm:"primaryKey;size:36"`
	AffiliateUserID     string     `json:"affiliateUserId" gorm:"size:36;index"`
	Kind                string     `json:"kind" gorm:"size:16"`
	Currency            string     `json:"currency" gorm:"size:8"`
	AmountFen           int64      `json:"amountFen"`
	CreditsMicrocredits int64      `json:"creditsMicrocredits"`
	Status              string     `json:"status" gorm:"size:16;index"`
	PayoutDetails       string     `json:"payoutDetails" gorm:"size:500"`
	ReviewNote          string     `json:"reviewNote" gorm:"size:500"`
	ReviewedBy          string     `json:"reviewedBy,omitempty" gorm:"size:36"`
	ReviewedAt          *time.Time `json:"reviewedAt,omitempty"`
	CreatedAt           time.Time  `json:"createdAt" gorm:"index"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}
