package app

import (
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

func validateCreditCostPricing(capability, billingMode string, cost model.CreditCostPricing) error {
	for _, price := range []int64{cost.UnitPriceMicrocredits, cost.InputTokenPriceMicrocredits, cost.OutputTokenPriceMicrocredits, cost.CachedTokenPriceMicrocredits, cost.ExtraImagePriceMicrocredits, cost.ExtraVideoSecondPriceMicrocredits, cost.ImageTokenPriceMicrocredits} {
		if price < 0 || price > 1_000_000_000_000 {
			return BadAuthRequest("积分成本价必须在 0 到 1000000 积分之间")
		}
	}
	if !cost.Configured {
		return nil
	}
	if billingMode != "token" {
		capability = ""
	}
	return validateTokenPrices(capability, cost.InputTokenPriceMicrocredits, cost.OutputTokenPriceMicrocredits, cost.CachedTokenPriceMicrocredits)
}

func snapshotCreditCost(order *model.BillingOrder, tier *model.ChannelModelPriceTier, quantity int64, estimate tokenBillingEstimate) {
	if tier == nil {
		return
	}
	order.CostPricing = tier.CostPricing
	order.CostBillingMode = tier.BillingMode
	order.CostQuantity = 1
	if tier.BillingMode == "per_second" {
		order.CostQuantity = quantity
	}
	if tier.BillingMode == "token" && estimate.Video != nil {
		order.CostVideoFormulaTokens = estimate.Video.FormulaTokens
	}
}

// 成本使用下单快照和真实用量，不套用销售倍率或用户扣费上限。
// 未结算、未配置或无法确定用量时不编造金额，历史订单也不反查当前价格。
func billingCreditCost(order model.BillingOrder) (*int64, error) {
	if !order.CostPricing.Configured || order.Status != model.BillingStatusSettled {
		return nil, nil
	}
	cost := order.CostPricing
	var amount int64
	var err error
	switch order.CostBillingMode {
	case "fixed_request", "per_second":
		amount, err = creditAmount(cost.UnitPriceMicrocredits, order.CostQuantity, 10_000)
	case "token":
		input, output, cached := order.InputTokens, order.OutputTokens, order.CachedTokens
		if !order.UsageAvailable {
			if order.Capability != "video" || order.CostVideoFormulaTokens <= 0 {
				return nil, nil
			}
			input, cached, output = 0, 0, order.CostVideoFormulaTokens
		}
		amount, err = kernel.TokenBillingAmount(10_000,
			kernel.TokenBillingTerm{Tokens: max(0, input-cached), PriceMicrocredits: cost.InputTokenPriceMicrocredits},
			kernel.TokenBillingTerm{Tokens: output, PriceMicrocredits: cost.OutputTokenPriceMicrocredits},
			kernel.TokenBillingTerm{Tokens: cached, PriceMicrocredits: cost.CachedTokenPriceMicrocredits},
			kernel.TokenBillingTerm{Tokens: order.ImageTokens, PriceMicrocredits: cost.ImageTokenPriceMicrocredits},
		)
	default:
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	extra, err := surchargeAmount(cost.ExtraImagePriceMicrocredits, order.SurchargeImages, cost.ExtraVideoSecondPriceMicrocredits, order.SurchargeVideoSeconds, 10_000)
	if err != nil {
		return nil, err
	}
	amount += extra
	return &amount, nil
}

// surchargeAmount 计算附加费：计费参考图张数 × 单张价 + 参考视频秒数 × 每秒价，再套用倍率。
func surchargeAmount(imagePrice, images, videoSecondPrice, videoSeconds, multiplierBPS int64) (int64, error) {
	var total int64
	for _, term := range [][2]int64{{imagePrice, images}, {videoSecondPrice, videoSeconds}} {
		if term[0] <= 0 || term[1] <= 0 {
			continue
		}
		amount, err := creditAmount(term[0], term[1], multiplierBPS)
		if err != nil {
			return 0, err
		}
		total += amount
	}
	return total, nil
}
