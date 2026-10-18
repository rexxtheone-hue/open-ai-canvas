package repository

import (
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrAffiliateNothingToPayout = errors.New("没有可提取的佣金")

func (r *Repository) PartnerApplication(userID, kind string) (*model.PartnerApplication, error) {
	var item model.PartnerApplication
	err := r.db.First(&item, "user_id = ? AND kind = ?", userID, kind).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *Repository) PartnerApplicationByID(id string) (*model.PartnerApplication, error) {
	var item model.PartnerApplication
	err := r.db.First(&item, "id = ?", id).Error
	return &item, err
}

func (r *Repository) PartnerApplicationsForUser(userID string) ([]model.PartnerApplication, error) {
	items := []model.PartnerApplication{}
	err := r.db.Where("user_id = ?", userID).Order("kind").Find(&items).Error
	return items, err
}

func (r *Repository) SavePartnerApplication(item *model.PartnerApplication) error {
	return r.db.Save(item).Error
}

type PartnerApplicationRow struct {
	model.PartnerApplication `gorm:"embedded"`
	Username                 string
	DisplayName              string
	Email                    string
}

func (r *Repository) AdminPartnerApplications(kind, status string, offset, limit int) ([]PartnerApplicationRow, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	db := r.db.Table("partner_applications AS a").Joins("JOIN users u ON u.id = a.user_id")
	if kind = strings.TrimSpace(kind); kind != "" {
		db = db.Where("a.kind = ?", kind)
	}
	if status = strings.TrimSpace(status); status != "" {
		db = db.Where("a.status = ?", status)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := []PartnerApplicationRow{}
	err := db.Select("a.*, u.username, u.display_name, u.email").Order("a.updated_at desc, a.id").Offset(max(offset, 0)).Limit(limit).Scan(&rows).Error
	return rows, total, err
}

// SetStudioProfileVerification 写入或清空主页上的认证时间；column 只能是本包内的两个固定列。
func (r *Repository) SetStudioProfileVerification(userID string, kind string, at *time.Time) error {
	column := "creator_verified_at"
	if kind == model.PartnerKindMerchant {
		column = "merchant_verified_at"
	}
	return r.db.Model(&model.StudioProfile{}).Where("user_id = ?", userID).Updates(map[string]any{column: at, "updated_at": time.Now().UTC()}).Error
}

func (r *Repository) AffiliateAccount(userID string) (*model.AffiliateAccount, error) {
	var item model.AffiliateAccount
	err := r.db.First(&item, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *Repository) AffiliateAccountByCode(code string) (*model.AffiliateAccount, error) {
	var item model.AffiliateAccount
	err := r.db.First(&item, "code = ?", code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

// CreateAffiliateAccount 返回 false 表示推广码已被占用。
func (r *Repository) CreateAffiliateAccount(item *model.AffiliateAccount) (bool, error) {
	result := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(item)
	return result.RowsAffected == 1, result.Error
}

func (r *Repository) SaveAffiliateAccount(item *model.AffiliateAccount) error {
	return r.db.Save(item).Error
}

// CreateAffiliateReferral 每个用户只归属一次，重复写入静默忽略。
func (r *Repository) CreateAffiliateReferral(item *model.AffiliateReferral) error {
	return r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(item).Error
}

func (r *Repository) AffiliateReferral(userID string) (*model.AffiliateReferral, error) {
	var item model.AffiliateReferral
	err := r.db.First(&item, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

// CreateAffiliateCommission 以支付订单为唯一键，订单重复通知或对账不会重复记佣金。
func (r *Repository) CreateAffiliateCommission(item *model.AffiliateCommission) error {
	return r.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "payment_order_id"}}, DoNothing: true}).Create(item).Error
}

func (r *Repository) AffiliateCommissions(affiliateUserID string, limit int) ([]model.AffiliateCommission, error) {
	items := []model.AffiliateCommission{}
	err := r.db.Where("affiliate_user_id = ?", affiliateUserID).Order("created_at desc").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) AffiliatePayouts(affiliateUserID string, limit int) ([]model.AffiliatePayout, error) {
	items := []model.AffiliatePayout{}
	err := r.db.Where("affiliate_user_id = ?", affiliateUserID).Order("created_at desc").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) AffiliateReferralCount(affiliateUserID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.AffiliateReferral{}).Where("affiliate_user_id = ?", affiliateUserID).Count(&count).Error
	return count, err
}

// AffiliateBalance 是某一币种下各状态的佣金合计。
type AffiliateBalance struct {
	Currency  string `json:"currency"`
	Pending   int64  `json:"pending"`
	Available int64  `json:"available"`
	InPayout  int64  `json:"inPayout"`
	PaidOut   int64  `json:"paidOut"`
}

func (r *Repository) AffiliateBalances(affiliateUserID string, now time.Time) ([]AffiliateBalance, error) {
	var rows []struct {
		Currency  string
		Pending   int64
		Available int64
		Claimed   int64
	}
	err := r.db.Model(&model.AffiliateCommission{}).
		Select("currency, "+
			"COALESCE(SUM(CASE WHEN payout_id = '' AND available_at > ? THEN amount_fen ELSE 0 END), 0) AS pending, "+
			"COALESCE(SUM(CASE WHEN payout_id = '' AND available_at <= ? THEN amount_fen ELSE 0 END), 0) AS available, "+
			"COALESCE(SUM(CASE WHEN payout_id <> '' THEN amount_fen ELSE 0 END), 0) AS claimed", now, now).
		Where("affiliate_user_id = ?", affiliateUserID).Group("currency").Order("currency").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	var payouts []struct {
		Currency string
		Status   string
		Total    int64
	}
	if err := r.db.Model(&model.AffiliatePayout{}).Select("currency, status, COALESCE(SUM(amount_fen), 0) AS total").
		Where("affiliate_user_id = ? AND status IN ?", affiliateUserID, []string{model.AffiliatePayoutRequested, model.AffiliatePayoutPaid, model.AffiliatePayoutCompleted}).
		Group("currency, status").Scan(&payouts).Error; err != nil {
		return nil, err
	}
	result := make([]AffiliateBalance, 0, len(rows))
	for _, row := range rows {
		balance := AffiliateBalance{Currency: row.Currency, Pending: row.Pending, Available: row.Available}
		for _, payout := range payouts {
			if payout.Currency != row.Currency {
				continue
			}
			if payout.Status == model.AffiliatePayoutRequested {
				balance.InPayout += payout.Total
			} else {
				balance.PaidOut += payout.Total
			}
		}
		result = append(result, balance)
	}
	return result, nil
}

// ClaimAffiliatePayout 在一个事务里占用全部已过冷却期的佣金并建立提现记录。
// 换积分时同一事务内直接入账；现金提现留待财务审核。
func (r *Repository) ClaimAffiliatePayout(payout *model.AffiliatePayout, now time.Time, minAmount int64, creditsFor func(amount int64) (int64, error)) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var ids []string
		if err := tx.Model(&model.AffiliateCommission{}).Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("affiliate_user_id = ? AND currency = ? AND payout_id = '' AND available_at <= ?", payout.AffiliateUserID, payout.Currency, now).
			Pluck("id", &ids).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return ErrAffiliateNothingToPayout
		}
		var total int64
		if err := tx.Model(&model.AffiliateCommission{}).Where("id IN ?", ids).Select("COALESCE(SUM(amount_fen), 0)").Scan(&total).Error; err != nil {
			return err
		}
		if total <= 0 {
			return ErrAffiliateNothingToPayout
		}
		if total < minAmount {
			return &AffiliateMinimumError{Minimum: minAmount, Available: total}
		}
		payout.AmountFen = total
		if payout.Kind == model.AffiliatePayoutCredits {
			credits, err := creditsFor(total)
			if err != nil {
				return err
			}
			payout.CreditsMicrocredits = credits
		}
		if err := tx.Create(payout).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.AffiliateCommission{}).Where("id IN ?", ids).Update("payout_id", payout.ID).Error; err != nil {
			return err
		}
		if payout.Kind != model.AffiliatePayoutCredits {
			return nil
		}
		return grantCreditsTx(tx, payout.AffiliateUserID, model.CreditLedgerAffiliate, payout.CreditsMicrocredits, "affiliate-payout:"+payout.ID, "推广佣金兑换积分")
	})
}

type AffiliateMinimumError struct {
	Minimum   int64
	Available int64
}

func (e *AffiliateMinimumError) Error() string { return "可提取佣金未达到最低提现金额" }

func grantCreditsTx(tx *gorm.DB, userID string, entryType model.CreditLedgerType, amount int64, referenceKey, note string) error {
	account := model.CreditAccount{UserID: userID}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
		return err
	}
	entry := model.CreditLedgerEntry{ID: newRepositoryID(), UserID: userID, Type: entryType, AmountMicrocredits: amount, ReferenceKey: &referenceKey, Note: note}
	if err := tx.Create(&entry).Error; err != nil {
		return err
	}
	if err := tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
		"available_microcredits": gorm.Expr("available_microcredits + ?", amount),
		"version":                gorm.Expr("version + 1"),
		"updated_at":             time.Now(),
	}).Error; err != nil {
		return err
	}
	if err := tx.First(&account, "user_id = ?", userID).Error; err != nil {
		return err
	}
	return tx.Model(&entry).Updates(map[string]any{
		"available_delta_microcredits": amount,
		"available_after_microcredits": account.AvailableMicrocredits,
		"reserved_after_microcredits":  account.ReservedMicrocredits,
	}).Error
}

func (r *Repository) AffiliatePayout(id string) (*model.AffiliatePayout, error) {
	var item model.AffiliatePayout
	err := r.db.First(&item, "id = ?", id).Error
	return &item, err
}

// ResolveAffiliatePayout 财务处理现金提现：paid 结案；rejected 时释放佣金回到可提取余额。
func (r *Repository) ResolveAffiliatePayout(id, status, note, reviewerID string) (*model.AffiliatePayout, error) {
	var payout model.AffiliatePayout
	err := r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		result := tx.Model(&model.AffiliatePayout{}).Where("id = ? AND status = ?", id, model.AffiliatePayoutRequested).
			Updates(map[string]any{"status": status, "review_note": note, "reviewed_by": reviewerID, "reviewed_at": &now, "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrCreationConflict
		}
		if status == model.AffiliatePayoutRejected {
			if err := tx.Model(&model.AffiliateCommission{}).Where("payout_id = ?", id).Update("payout_id", "").Error; err != nil {
				return err
			}
		}
		return tx.First(&payout, "id = ?", id).Error
	})
	return &payout, err
}

type AffiliateRow struct {
	model.AffiliateAccount `gorm:"embedded"`
	Username               string
	DisplayName            string
	Referrals              int64
	TotalCommission        int64
}

func (r *Repository) AdminAffiliates(search string, offset, limit int) ([]AffiliateRow, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	db := r.db.Table("affiliate_accounts AS a").Joins("JOIN users u ON u.id = a.user_id")
	if search = strings.ToLower(strings.TrimSpace(search)); search != "" {
		pattern := "%" + escapeLike(search) + "%"
		db = db.Where("(LOWER(u.username) LIKE ? ESCAPE '\\' OR LOWER(u.display_name) LIKE ? ESCAPE '\\' OR LOWER(a.code) LIKE ? ESCAPE '\\')", pattern, pattern, pattern)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := []AffiliateRow{}
	err := db.Select("a.*, u.username, u.display_name, " +
		"(SELECT COUNT(*) FROM affiliate_referrals ar WHERE ar.affiliate_user_id = a.user_id) AS referrals, " +
		"(SELECT COALESCE(SUM(c.amount_fen), 0) FROM affiliate_commissions c WHERE c.affiliate_user_id = a.user_id) AS total_commission").
		Order("a.created_at desc").Offset(max(offset, 0)).Limit(limit).Scan(&rows).Error
	return rows, total, err
}

type AffiliatePayoutRow struct {
	model.AffiliatePayout `gorm:"embedded"`
	Username              string
	DisplayName           string
	Code                  string
}

func (r *Repository) AdminAffiliatePayouts(status string, offset, limit int) ([]AffiliatePayoutRow, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	db := r.db.Table("affiliate_payouts AS p").Joins("JOIN users u ON u.id = p.affiliate_user_id").Joins("LEFT JOIN affiliate_accounts a ON a.user_id = p.affiliate_user_id")
	if status = strings.TrimSpace(status); status != "" {
		db = db.Where("p.status = ?", status)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := []AffiliatePayoutRow{}
	err := db.Select("p.*, u.username, u.display_name, a.code").Order("p.created_at desc").Offset(max(offset, 0)).Limit(limit).Scan(&rows).Error
	return rows, total, err
}
