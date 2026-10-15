package app

import (
	"strings"

	"yingce/backend/internal/payment"
)

// 支持的结算币种都以 1/100 为最小单位（分、仙、cent），与 AmountFen 的语义一致。
var supportedTopupCurrencies = map[string]bool{"CNY": true, "MYR": true, "USD": true, "SGD": true, "HKD": true, "EUR": true, "GBP": true, "AUD": true}

func normalizedTopupCurrency(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if value == "" {
		return "CNY"
	}
	return value
}

func supportedTopupCurrency(value string) bool {
	return supportedTopupCurrencies[value]
}

// paymentProviderCurrency 读取渠道配置里的结算币种；没有该字段的渠道（微信、支付宝等）按人民币结算。
func paymentProviderCurrency(values payment.Config) string {
	return normalizedTopupCurrency(values["currency"])
}

func (s *Service) validateTopupPlan(planID string) error {
	planID = strings.TrimSpace(planID)
	if planID == "" {
		return nil
	}
	plan, err := s.repo.StudioPlan(planID)
	if err != nil {
		return err
	}
	if plan == nil {
		return BadAuthRequest("会员套餐不存在")
	}
	return nil
}
