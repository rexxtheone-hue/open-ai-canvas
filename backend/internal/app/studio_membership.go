package app

import (
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/model"
)

type StudioPlanInput struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	Badge             string `json:"badge"`
	DurationDays      int    `json:"durationDays"`
	ActiveTaskLimit   int    `json:"activeTaskLimit"`
	CommercialLicense bool   `json:"commercialLicense"`
	Enabled           bool   `json:"enabled"`
	SortOrder         int    `json:"sortOrder"`
}

// StudioPlanOffer 是用户看到的套餐：套餐权益加上可购买的商品（不同币种、时长各一个商品）。
type StudioPlanOffer struct {
	model.StudioPlan
	Products []model.TopupProduct `json:"products"`
}

type StudioMembershipView struct {
	Active            bool              `json:"active"`
	Plan              *model.StudioPlan `json:"plan,omitempty"`
	ExpiresAt         *time.Time        `json:"expiresAt,omitempty"`
	ActiveTaskLimit   int               `json:"activeTaskLimit"`
	CommercialLicense bool              `json:"commercialLicense"`
}

func studioPlanFromInput(id string, input StudioPlanInput) (model.StudioPlan, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || utf8.RuneCountInString(name) > 40 {
		return model.StudioPlan{}, BadAuthRequest("套餐名称不能为空且不能超过 40 个字")
	}
	if utf8.RuneCountInString(input.Description) > 500 || utf8.RuneCountInString(input.Badge) > 12 {
		return model.StudioPlan{}, BadAuthRequest("套餐说明或标签太长")
	}
	if input.DurationDays < 1 || input.DurationDays > 3660 {
		return model.StudioPlan{}, BadAuthRequest("套餐时长必须为 1 到 3660 天")
	}
	if input.ActiveTaskLimit < 0 || input.ActiveTaskLimit > 1000 {
		return model.StudioPlan{}, BadAuthRequest("并发任务上限必须为 0 到 1000")
	}
	return model.StudioPlan{
		ID: id, Name: name, Description: strings.TrimSpace(input.Description), Badge: strings.TrimSpace(input.Badge),
		DurationDays: input.DurationDays, ActiveTaskLimit: input.ActiveTaskLimit, CommercialLicense: input.CommercialLicense,
		Enabled: input.Enabled, SortOrder: input.SortOrder,
	}, nil
}

func (s *Service) AdminStudioPlans(actor *model.User) ([]model.StudioPlan, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	return s.repo.StudioPlans(false)
}

func (s *Service) SaveStudioPlan(actor *model.User, id string, input StudioPlanInput) (*model.StudioPlan, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	createdAt := now
	id = strings.TrimSpace(id)
	if id != "" {
		existing, err := s.repo.StudioPlan(id)
		if err != nil {
			return nil, err
		}
		if existing == nil {
			return nil, NotFound("会员套餐不存在")
		}
		createdAt = existing.CreatedAt
	} else {
		id = newID()
	}
	plan, err := studioPlanFromInput(id, input)
	if err != nil {
		return nil, err
	}
	plan.CreatedAt, plan.UpdatedAt = createdAt, now
	if err := s.repo.SaveStudioPlan(&plan); err != nil {
		return nil, err
	}
	return &plan, nil
}

// StudioPlanOffers 只返回已上架且至少有一个在售商品的套餐。
func (s *Service) StudioPlanOffers() ([]StudioPlanOffer, error) {
	plans, err := s.repo.StudioPlans(true)
	if err != nil {
		return nil, err
	}
	offers := make([]StudioPlanOffer, 0, len(plans))
	now := time.Now()
	for _, plan := range plans {
		products, err := s.repo.TopupProductsForPlan(plan.ID)
		if err != nil {
			return nil, err
		}
		products = decorateTopupProducts(products, now)
		if len(products) == 0 {
			continue
		}
		offers = append(offers, StudioPlanOffer{StudioPlan: plan, Products: products})
	}
	return offers, nil
}

// activeStudioPlan 返回仍在有效期内的会员套餐；套餐被删除或停用后权益不再生效。
func (s *Service) activeStudioPlan(userID string, now time.Time) (*model.UserMembership, *model.StudioPlan, error) {
	membership, err := s.repo.UserMembership(userID)
	if err != nil || membership == nil || !membership.ExpiresAt.After(now) {
		return membership, nil, err
	}
	plan, err := s.repo.StudioPlan(membership.PlanID)
	if err != nil || plan == nil || !plan.Enabled {
		return membership, nil, err
	}
	return membership, plan, nil
}

func (s *Service) StudioMembership(userID string) (StudioMembershipView, error) {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return StudioMembershipView{}, err
	}
	view := StudioMembershipView{ActiveTaskLimit: policy.Task.ActiveTaskLimit}
	membership, plan, err := s.activeStudioPlan(userID, time.Now())
	if err != nil {
		return view, err
	}
	if membership != nil {
		expires := membership.ExpiresAt
		view.ExpiresAt = &expires
	}
	if plan == nil {
		return view, nil
	}
	view.Active, view.Plan, view.CommercialLicense = true, plan, plan.CommercialLicense
	view.ActiveTaskLimit = effectiveActiveTaskLimit(policy.Task.ActiveTaskLimit, plan)
	return view, nil
}

// effectiveActiveTaskLimit：会员上限只会提高、不会降低全站默认上限。
func effectiveActiveTaskLimit(base int, plan *model.StudioPlan) int {
	if plan != nil && plan.ActiveTaskLimit > base {
		return plan.ActiveTaskLimit
	}
	return base
}

func (s *Service) activeTaskLimitForUser(userID string, base int) int {
	_, plan, err := s.activeStudioPlan(userID, time.Now())
	if err != nil {
		return base
	}
	return effectiveActiveTaskLimit(base, plan)
}
