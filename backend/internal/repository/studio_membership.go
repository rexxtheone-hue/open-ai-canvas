package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// extendMembershipTx 在支付入账的同一事务里开通或续期会员：
// 从当前到期时间（已过期则从现在）顺延，套餐换成本次购买的套餐。
func extendMembershipTx(tx *gorm.DB, userID, planID string, days int, now time.Time) error {
	var membership model.UserMembership
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&membership, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		membership = model.UserMembership{UserID: userID, PlanID: planID, StartedAt: now, ExpiresAt: now.AddDate(0, 0, days), UpdatedAt: now}
		return tx.Create(&membership).Error
	}
	if err != nil {
		return err
	}
	base := membership.ExpiresAt
	if base.Before(now) {
		base = now
		membership.StartedAt = now
	}
	membership.PlanID = planID
	membership.ExpiresAt = base.AddDate(0, 0, days)
	membership.UpdatedAt = now
	return tx.Save(&membership).Error
}

func (r *Repository) UserMembership(userID string) (*model.UserMembership, error) {
	var membership model.UserMembership
	err := r.db.First(&membership, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &membership, nil
}

func (r *Repository) StudioPlans(enabledOnly bool) ([]model.StudioPlan, error) {
	var plans []model.StudioPlan
	query := r.db.Order("sort_order, created_at")
	if enabledOnly {
		query = query.Where("enabled = ?", true)
	}
	err := query.Find(&plans).Error
	return plans, err
}

func (r *Repository) StudioPlan(id string) (*model.StudioPlan, error) {
	var plan model.StudioPlan
	err := r.db.First(&plan, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *Repository) SaveStudioPlan(plan *model.StudioPlan) error {
	return r.db.Save(plan).Error
}

func (r *Repository) TopupProductsForPlan(planID string) ([]model.TopupProduct, error) {
	var products []model.TopupProduct
	err := r.db.Where("plan_id = ? AND enabled = ?", planID, true).Order("sort_order, amount_fen").Find(&products).Error
	return products, err
}
