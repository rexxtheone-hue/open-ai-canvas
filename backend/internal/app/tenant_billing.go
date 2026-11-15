// 代理商批发计费：零售价、批发池扣减快照，以及给代理商客户的报价。
//
// 计费订单先按平台价算好（与平台用户完全相同），再对代理商客户套一层：
//   - 记下平台价快照，按模型的代理商折扣算出批发池扣减 TenantChargeMicrocredits；
//   - 按代理商零售规则把客户价换成 平台价 × 倍率，或固定价。
// 预留、结算、退款时仓储层在同一个事务里同时处理客户积分和批发池（见 repository/tenant_billing.go）。

package app

import (
	"errors"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

const tenantPoolUnavailableMessage = "服务暂时不可用，请联系客服"

// tenantRetailRule 是某个模型（规格）对代理商客户生效的零售价。
type tenantRetailRule struct {
	MultiplierBPS int64
	FixedUnit     *int64
	Hidden        bool
}

func pickTenantRetailRule(rules []model.TenantModelPrice, channelModelID string, priceTierID string) tenantRetailRule {
	var tierRule, modelRule, allRule *model.TenantModelPrice
	for index := range rules {
		rule := &rules[index]
		switch {
		case rule.ChannelModelID == nil && rule.PriceTierID == nil:
			allRule = rule
		case rule.ChannelModelID != nil && *rule.ChannelModelID == channelModelID && rule.PriceTierID == nil:
			modelRule = rule
		case rule.ChannelModelID != nil && *rule.ChannelModelID == channelModelID && rule.PriceTierID != nil && priceTierID != "" && *rule.PriceTierID == priceTierID:
			tierRule = rule
		}
	}
	result := tenantRetailRule{MultiplierBPS: 10_000}
	for _, rule := range []*model.TenantModelPrice{tierRule, modelRule, allRule} {
		if rule != nil && !rule.Enabled {
			result.Hidden = true
		}
	}
	for _, rule := range []*model.TenantModelPrice{tierRule, modelRule, allRule} {
		if rule == nil {
			continue
		}
		if rule.MultiplierBasisPoints > 0 {
			result.MultiplierBPS = rule.MultiplierBasisPoints
		}
		result.FixedUnit = rule.FixedUnitPriceMicrocredits
		break
	}
	return result
}

// agencyTenantForUser 返回用户所属的代理商；平台用户返回 nil。
func (s *Service) agencyTenantForUser(userID string) (*model.Tenant, error) {
	tenantID, err := s.repo.UserTenantID(userID)
	if err != nil {
		return nil, err
	}
	return s.agencyTenant(tenantID)
}

func (s *Service) agencyTenant(tenantID string) (*model.Tenant, error) {
	if tenantID == "" || tenantID == model.PlatformTenantID {
		return nil, nil
	}
	tenant, err := s.repo.Tenant(tenantID)
	if err != nil || tenant == nil || tenant.IsPlatform {
		return nil, err
	}
	return tenant, nil
}

// applyTenantBilling 给代理商客户的订单套上零售价与批发池扣减；平台用户的订单原样返回。
func (s *Service) applyTenantBilling(order *model.BillingOrder, userID string) error {
	if order == nil {
		return nil
	}
	tenant, err := s.agencyTenantForUser(userID)
	if err != nil || tenant == nil {
		return err
	}
	return s.applyTenantPricing(order, tenant.ID)
}

func (s *Service) tenantRetailRuleFor(tenantID string, channelModelID string, priceTierID string) (tenantRetailRule, error) {
	rules, err := s.repo.TenantModelPriceRules(tenantID, channelModelID)
	if err != nil {
		return tenantRetailRule{}, err
	}
	return pickTenantRetailRule(rules, channelModelID, priceTierID), nil
}

func (s *Service) applyTenantPricing(order *model.BillingOrder, tenantID string) error {
	rule, err := s.tenantRetailRuleFor(tenantID, order.ChannelModelID, order.PriceTierID)
	if err != nil {
		return err
	}
	if rule.Hidden {
		return BadAuthRequest("当前模型暂时不可用，请重新选择")
	}
	discount, err := s.repo.ChannelModelAgencyDiscount(order.ChannelModelID)
	if err != nil {
		return err
	}
	platform := order.AmountMicrocredits
	charge, err := repository.WholesaleMicrocredits(platform, discount)
	if err != nil {
		return err
	}
	order.PoolTenantID = tenantID
	order.TenantDiscountPercent = discount
	order.TenantPlatformAmountMicrocredits = platform
	order.TenantPlatformUnitPriceMicrocredits = order.UnitPriceMicrocredits
	order.TenantPlatformMultiplierBPS = order.MultiplierBasisPoints
	order.TenantPlatformSurchargeMicrocredits = order.SurchargeMicrocredits
	order.TenantChargeMicrocredits = charge
	order.TenantReservedMicrocredits = charge
	return applyTenantRetail(order, rule)
}

// applyTenantRetail 把订单金额换成代理商零售价。固定价只用于按次、按秒计费；Token 计费按倍率调整单价倍数。
func applyTenantRetail(order *model.BillingOrder, rule tenantRetailRule) error {
	if rule.FixedUnit != nil && order.BillingMode != "token" {
		quantity := max(order.Quantity, 1)
		amount, err := creditAmount(*rule.FixedUnit, quantity, 10_000)
		if err != nil {
			return err
		}
		amount += order.SurchargeMicrocredits
		order.UnitPriceMicrocredits = *rule.FixedUnit
		order.MultiplierBasisPoints = 10_000
		order.AmountMicrocredits, order.ReservedAmountMicrocredits = amount, amount
		return nil
	}
	if rule.MultiplierBPS == 10_000 {
		return nil
	}
	var err error
	if order.MultiplierBasisPoints, err = repository.MulDivCeil(order.MultiplierBasisPoints, rule.MultiplierBPS, 10_000); err != nil {
		return err
	}
	if order.AmountMicrocredits, err = repository.MulDivCeil(order.AmountMicrocredits, rule.MultiplierBPS, 10_000); err != nil {
		return err
	}
	if order.SurchargeMicrocredits, err = repository.MulDivCeil(order.SurchargeMicrocredits, rule.MultiplierBPS, 10_000); err != nil {
		return err
	}
	order.ReservedAmountMicrocredits = order.AmountMicrocredits
	return nil
}

// tenantRetailAmount 用于报价：把平台金额换成零售金额。
func tenantRetailAmount(rule tenantRetailRule, platformAmount int64, billingMode string, quantity int64) (int64, error) {
	if rule.FixedUnit != nil && billingMode != "token" {
		return creditAmount(*rule.FixedUnit, max(quantity, 1), 10_000)
	}
	if rule.MultiplierBPS == 10_000 {
		return platformAmount, nil
	}
	return repository.MulDivCeil(max(platformAmount, 0), rule.MultiplierBPS, 10_000)
}

// tenantQuoteOrder 把报价订单换成代理商零售价；tenantID 为平台或空时不变。
func (s *Service) tenantQuoteOrder(tenantID string, order *model.BillingOrder) error {
	tenant, err := s.agencyTenant(tenantID)
	if err != nil || tenant == nil || order == nil {
		return err
	}
	return s.applyTenantPricing(order, tenant.ID)
}

// tenantBillingError 把仓储层的批发池不足转换成对客户的提示，绝不提批发池。
func tenantBillingError(err error) error {
	if errors.Is(err, repository.ErrTenantPoolInsufficient) {
		return BadAuthRequest(tenantPoolUnavailableMessage)
	}
	return err
}

// AgencyFeeFreeUntil 是新代理商免月最低消费的截止时间：创建后 2 个月。
func AgencyFeeFreeUntil(createdAt time.Time) time.Time {
	return createdAt.AddDate(0, model.AgencyFeeFreeMonths, 0)
}

// PrepareAgencyTenant 在新建代理商租户前调用：没设免月费期限时设为创建后 2 个月。
// 目前还没有建租户的代码；以后的建租户接口必须调用它。
func PrepareAgencyTenant(tenant *model.Tenant, now time.Time) {
	if tenant == nil || tenant.IsPlatform {
		return
	}
	if tenant.CreatedAt.IsZero() {
		tenant.CreatedAt = now
	}
	if tenant.FeeFreeUntil == nil {
		until := AgencyFeeFreeUntil(tenant.CreatedAt)
		tenant.FeeFreeUntil = &until
	}
}

// ModelCatalogForTenant 是按网址租户展示的模型目录：代理商网址隐藏被代理商关掉的模型，并显示零售价。
func (s *Service) ModelCatalogForTenant(tenantID string, intent *ModelRequestIntent) (*ModelCatalogResponse, error) {
	response, err := s.ModelCatalog(intent)
	if err != nil {
		return nil, err
	}
	tenant, err := s.agencyTenant(tenantID)
	if err != nil || tenant == nil {
		return response, err
	}
	rules, err := s.repo.TenantModelPrices(tenant.ID)
	if err != nil {
		return nil, err
	}
	channels := response.Channels[:0]
	for _, channel := range response.Channels {
		models := channel.Models[:0]
		for _, item := range channel.Models {
			if pickTenantRetailRule(rules, item.ID, "").Hidden {
				continue
			}
			tiers := item.PriceTiers[:0]
			for _, tier := range item.PriceTiers {
				rule := pickTenantRetailRule(rules, item.ID, tier.ID)
				if rule.Hidden {
					continue
				}
				if err := applyTenantRetailToPublicTier(&tier, rule); err != nil {
					return nil, err
				}
				tiers = append(tiers, tier)
			}
			item.PriceTiers = tiers
			item.PricingMode, item.DisplayPrice, item.PriceLabel = computeChannelModelPriceDisplay(nil, tiers)
			item.Available = item.Available && len(tiers) > 0
			models = append(models, item)
		}
		if len(models) == 0 {
			continue
		}
		channel.Models = models
		channels = append(channels, channel)
	}
	response.Channels = channels
	return response, nil
}

func applyTenantRetailToPublicTier(tier *PublicChannelModelPriceTier, rule tenantRetailRule) error {
	if rule.FixedUnit != nil && tier.BillingMode != "token" {
		tier.UnitPriceMicrocredits = *rule.FixedUnit
		return nil
	}
	if rule.MultiplierBPS == 10_000 {
		return nil
	}
	for _, price := range []*int64{&tier.UnitPriceMicrocredits, &tier.InputTokenPriceMicrocredits, &tier.OutputTokenPriceMicrocredits, &tier.CachedTokenPriceMicrocredits, &tier.ImageTokenPriceMicrocredits} {
		scaled, err := repository.MulDivCeil(max(*price, 0), rule.MultiplierBPS, 10_000)
		if err != nil {
			return err
		}
		*price = scaled
	}
	if tier.Surcharge != nil {
		surcharge := *tier.Surcharge
		for _, price := range []*int64{&surcharge.ImagePriceMicrocredits, &surcharge.VideoSecondPriceMicrocredits} {
			scaled, err := repository.MulDivCeil(max(*price, 0), rule.MultiplierBPS, 10_000)
			if err != nil {
				return err
			}
			*price = scaled
		}
		tier.Surcharge = &surcharge
	}
	return nil
}
