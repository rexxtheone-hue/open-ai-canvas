// 代理商后台：客户名单导出、客户作品、模型零售价总览。

package app

import (
	"strconv"
	"strings"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

const tenantCustomerExportLimit = 50_000

func formatCSVCredits(microcredits int64) string {
	sign := ""
	if microcredits < 0 {
		sign, microcredits = "-", -microcredits
	}
	cents := (microcredits*100 + CreditScale/2) / CreditScale
	return sign + strconv.FormatInt(cents/100, 10) + "." + strconv.FormatInt(cents%100+100, 10)[1:]
}

// TenantCustomersCSV 导出本网址代理商的客户名单（不含管理员）及可用积分。
func (s *Service) TenantCustomersCSV(actor *model.User, tenant model.Tenant) ([]byte, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	rows, err := s.repo.TenantCustomerExportRows(tenant.ID, tenantCustomerExportLimit+1)
	if err != nil {
		return nil, err
	}
	if len(rows) > tenantCustomerExportLimit {
		return nil, BadAuthRequest("客户超过 50000 人，请联系平台导出")
	}
	table := make([][]string, 0, len(rows)+1)
	table = append(table, []string{"username", "email", "phone", "created_at", "credit_balance"})
	for _, row := range rows {
		table = append(table, []string{row.Username, row.Email, row.Phone, row.CreatedAt.In(tenantBillingZone).Format("2006-01-02 15:04:05"), formatCSVCredits(row.AvailableMicrocredits)})
	}
	if err := s.appendAdminAudit(actor, "tenant.customers.export", "tenant", tenant.ID, "导出客户名单", map[string]any{"count": len(rows)}); err != nil {
		return nil, err
	}
	return paymentCSV(table)
}

// AdminUserWorks 让后台查看某个用户生成的作品；只能看管理员所在租户的用户。
func (s *Service) AdminUserWorks(actor *model.User, userID string, query StudioWorkQuery) (StudioWorkPage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return StudioWorkPage{}, err
	}
	user, err := s.adminTenantUser(actor, strings.TrimSpace(userID))
	if err != nil {
		return StudioWorkPage{}, err
	}
	page, err := s.StudioWorks(user.ID, query)
	if err != nil {
		return page, err
	}
	if IsTenantAdmin(actor) {
		for index := range page.Works {
			hideTaskSummaryProvider(&page.Works[index].TaskSummary)
		}
	}
	return page, nil
}

// hideTaskSummaryProvider 去掉上游供应商信息，代理商只看到模型与结果。
func hideTaskSummaryProvider(summary *TaskSummary) {
	summary.Provider, summary.ProviderRequestID, summary.ProviderCancelError = "", "", ""
	summary.ProviderCancelStatus, summary.ProviderCancelAttempts = "", 0
	summary.ProviderCancelRequestedAt, summary.ProviderCancelledAt = nil, nil
}

type TenantModelPriceTierView struct {
	ID          string            `json:"id"`
	Selector    map[string]string `json:"selector,omitempty"`
	Resolution  string            `json:"resolution,omitempty"`
	BillingMode string            `json:"billingMode"`
	// 三种价格都按「每单位」：平台积分价、批发池实际扣减、客户看到的零售价。
	PlatformUnitMicrocredits int64  `json:"platformUnitMicrocredits"`
	PoolUnitMicrocredits     int64  `json:"poolUnitMicrocredits"`
	RetailUnitMicrocredits   int64  `json:"retailUnitMicrocredits"`
	Hidden                   bool   `json:"hidden"`
	RuleID                   string `json:"ruleId,omitempty"`
}

type TenantModelPriceView struct {
	ChannelModelID        string                     `json:"channelModelId"`
	DisplayName           string                     `json:"displayName"`
	ModelKey              string                     `json:"modelKey"`
	Capability            string                     `json:"capability"`
	AgencyDiscountPercent int                        `json:"agencyDiscountPercent"`
	Hidden                bool                       `json:"hidden"`
	RuleID                string                     `json:"ruleId,omitempty"`
	MultiplierBPS         int64                      `json:"multiplierBasisPoints"`
	FixedUnitMicrocredits *int64                     `json:"fixedUnitPriceMicrocredits,omitempty"`
	Tiers                 []TenantModelPriceTierView `json:"tiers"`
}

type TenantModelPriceCatalog struct {
	GlobalRule *model.TenantModelPrice `json:"globalRule,omitempty"`
	Models     []TenantModelPriceView  `json:"models"`
}

func tenantRuleID(rules []model.TenantModelPrice, channelModelID, priceTierID string) string {
	for _, rule := range rules {
		switch {
		case channelModelID == "" && rule.ChannelModelID == nil && rule.PriceTierID == nil:
			return rule.ID
		case channelModelID != "" && rule.ChannelModelID != nil && *rule.ChannelModelID == channelModelID && priceTierID == "" && rule.PriceTierID == nil:
			return rule.ID
		case priceTierID != "" && rule.ChannelModelID != nil && *rule.ChannelModelID == channelModelID && rule.PriceTierID != nil && *rule.PriceTierID == priceTierID:
			return rule.ID
		}
	}
	return ""
}

// TenantModelPriceCatalog 给代理商看每个模型的平台积分、批发池扣减与客户零售价；不含平台成本。
func (s *Service) TenantModelPriceCatalog(actor *model.User, tenant model.Tenant) (*TenantModelPriceCatalog, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	rules, err := s.repo.TenantModelPrices(tenant.ID)
	if err != nil {
		return nil, err
	}
	result := &TenantModelPriceCatalog{Models: []TenantModelPriceView{}}
	for index := range rules {
		if rules[index].ChannelModelID == nil && rules[index].PriceTierID == nil {
			rule := rules[index]
			result.GlobalRule = &rule
		}
	}
	// 渠道名可能是上游供应商，代理商只看到模型名和能力。
	channels, err := s.repo.SystemChannels(false)
	if err != nil {
		return nil, err
	}
	for _, channel := range channels {
		items, err := s.repo.ChannelModels(channel.ID, false)
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			discount := item.AgencyDiscountPercent
			if !repository.ValidAgencyDiscount(discount) {
				discount = model.AgencyDefaultDiscountPercent
			}
			name := strings.TrimSpace(item.DisplayName)
			if name == "" {
				name = item.ModelKey
			}
			modelRule := pickTenantRetailRule(rules, item.ID, "")
			view := TenantModelPriceView{
				ChannelModelID: item.ID, DisplayName: name, ModelKey: item.ModelKey, Capability: item.Capability,
				AgencyDiscountPercent: discount, Hidden: modelRule.Hidden, RuleID: tenantRuleID(rules, item.ID, ""),
				MultiplierBPS: modelRule.MultiplierBPS, FixedUnitMicrocredits: modelRule.FixedUnit, Tiers: []TenantModelPriceTierView{},
			}
			for _, tier := range item.PriceTiers {
				if !tier.Enabled || !tier.PriceConfigured {
					continue
				}
				rule := pickTenantRetailRule(rules, item.ID, tier.ID)
				platform := tier.UnitPriceMicrocredits
				if tier.BillingMode == "token" {
					platform = tier.OutputTokenPriceMicrocredits
				}
				pool, err := repository.WholesaleMicrocredits(platform, discount)
				if err != nil {
					return nil, err
				}
				retail, err := tenantRetailAmount(rule, platform, tier.BillingMode, 1)
				if err != nil {
					return nil, err
				}
				view.Tiers = append(view.Tiers, TenantModelPriceTierView{
					ID: tier.ID, Selector: tier.Selector, Resolution: tier.Resolution, BillingMode: tier.BillingMode,
					PlatformUnitMicrocredits: platform, PoolUnitMicrocredits: pool, RetailUnitMicrocredits: retail,
					Hidden: rule.Hidden, RuleID: tenantRuleID(rules, item.ID, tier.ID),
				})
			}
			if len(view.Tiers) > 0 {
				result.Models = append(result.Models, view)
			}
		}
	}
	return result, nil
}
