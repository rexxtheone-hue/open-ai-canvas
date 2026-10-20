package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const billingCurrencySettingKey = "billing_currency"

// 积分以马币计价；供应商成本可按以下币种填写，再按管理员维护的汇率换算成积分。
const billingBaseCurrency = "MYR"

var costSourceCurrencies = []string{"MYR", "USD", "CNY"}

// BillingCurrencySetting 定义积分面值与成本币种汇率。CreditValue 是 1 积分等于多少马币，
// Rates 是 1 单位外币等于多少马币。
type BillingCurrencySetting struct {
	BaseCurrency string             `json:"baseCurrency"`
	CreditValue  float64            `json:"creditValue"`
	Rates        map[string]float64 `json:"rates"`
}

type PublicBillingCurrencySetting struct {
	BillingCurrencySetting
	Currencies []string  `json:"currencies"`
	Configured bool      `json:"configured"`
	Recomputed int       `json:"recomputed"`
	UpdatedBy  string    `json:"updatedBy,omitempty"`
	UpdatedAt  time.Time `json:"updatedAt,omitempty"`
}

func defaultBillingCurrencySetting() BillingCurrencySetting {
	return BillingCurrencySetting{BaseCurrency: billingBaseCurrency, CreditValue: 0.01, Rates: map[string]float64{"USD": 4.2, "CNY": 0.59}}
}

func (s *Service) AdminBillingCurrencySetting(actor *model.User) (*PublicBillingCurrencySetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readBillingCurrencySetting()
	if err != nil {
		return nil, err
	}
	return publicBillingCurrencySetting(setting, value, 0), nil
}

// UpdateBillingCurrencySetting 保存汇率后立即重算所有按原币填写的规格成本；销售价不变。
func (s *Service) UpdateBillingCurrencySetting(actor *model.User, value BillingCurrencySetting) (*PublicBillingCurrencySetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	value = normalizeBillingCurrencySetting(value)
	if err := validateBillingCurrencySetting(value); err != nil {
		return nil, err
	}
	current, before, err := s.readBillingCurrencySetting()
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	setting := model.SystemSetting{Key: billingCurrencySettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	if current != nil {
		setting.CreatedAt = current.CreatedAt
	}
	tiers, err := s.repo.ChannelModelPriceTiersWithCostSource()
	if err != nil {
		return nil, err
	}
	for index := range tiers {
		if err := value.applyCostSource(&tiers[index].CostPricing, tiers[index].CostSource); err != nil {
			return nil, err
		}
	}
	if err := s.repo.SaveBillingCurrencySetting(&setting, tiers); err != nil {
		return nil, err
	}
	if len(tiers) > 0 {
		s.invalidateRouteCatalog()
	}
	if err := s.appendAdminAudit(actor, "billing_currency.update", "system_setting", billingCurrencySettingKey, "更新积分面值与汇率", map[string]any{"before": before, "after": value, "recomputedTiers": len(tiers)}); err != nil {
		return nil, err
	}
	return publicBillingCurrencySetting(&setting, value, len(tiers)), nil
}

func (s *Service) readBillingCurrencySetting() (*model.SystemSetting, BillingCurrencySetting, error) {
	setting, err := s.repo.SystemSetting(billingCurrencySettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, defaultBillingCurrencySetting(), nil
	}
	if err != nil {
		return nil, BillingCurrencySetting{}, err
	}
	var value BillingCurrencySetting
	if strings.TrimSpace(setting.ValueJSON) == "" || json.Unmarshal([]byte(setting.ValueJSON), &value) != nil {
		return nil, BillingCurrencySetting{}, errors.New("积分面值与汇率配置格式无效")
	}
	value = normalizeBillingCurrencySetting(value)
	if err := validateBillingCurrencySetting(value); err != nil {
		return nil, BillingCurrencySetting{}, err
	}
	return setting, value, nil
}

func normalizeBillingCurrencySetting(value BillingCurrencySetting) BillingCurrencySetting {
	rates := make(map[string]float64, len(value.Rates))
	for currency, rate := range value.Rates {
		rates[strings.ToUpper(strings.TrimSpace(currency))] = rate
	}
	value.BaseCurrency = billingBaseCurrency
	value.Rates = rates
	return value
}

func validateBillingCurrencySetting(value BillingCurrencySetting) error {
	if !(value.CreditValue > 0 && value.CreditValue <= 1000) {
		return BadAuthRequest("1 积分对应的马币金额必须大于 0 且不超过 1000")
	}
	for _, currency := range costSourceCurrencies {
		if currency == billingBaseCurrency {
			continue
		}
		rate := value.Rates[currency]
		if !(rate > 0 && rate <= 100000) || math.IsInf(rate, 0) {
			return BadAuthRequest(fmt.Sprintf("请填写有效的 %s 兑马币汇率", currency))
		}
	}
	for currency := range value.Rates {
		if !supportedCostSourceCurrency(currency) || currency == billingBaseCurrency {
			return BadAuthRequest(fmt.Sprintf("不支持的汇率币种 %s", currency))
		}
	}
	return nil
}

func supportedCostSourceCurrency(currency string) bool {
	for _, item := range costSourceCurrencies {
		if item == currency {
			return true
		}
	}
	return false
}

func normalizeCostSource(source model.CostSourcePricing) (model.CostSourcePricing, error) {
	source.Currency = strings.ToUpper(strings.TrimSpace(source.Currency))
	if source.Currency == "" || source.Currency == "CREDIT" {
		return model.CostSourcePricing{}, nil
	}
	if !supportedCostSourceCurrency(source.Currency) {
		return model.CostSourcePricing{}, BadAuthRequest("成本币种仅支持积分、MYR、USD、CNY")
	}
	for _, price := range []int64{source.UnitPrice, source.InputTokenPrice, source.OutputTokenPrice, source.CachedTokenPrice, source.ExtraImagePrice, source.ExtraVideoSecondPrice} {
		if price < 0 || price > 1_000_000_000_000_000 {
			return model.CostSourcePricing{}, BadAuthRequest("原币成本价无效")
		}
	}
	return source, nil
}

// applyCostSource 把原币成本（百万分之一单位）换算为积分成本（百万分之一积分），不改变 Configured。
func (v BillingCurrencySetting) applyCostSource(cost *model.CreditCostPricing, source model.CostSourcePricing) error {
	if source.Currency == "" {
		return nil
	}
	rate := 1.0
	if source.Currency != billingBaseCurrency {
		rate = v.Rates[source.Currency]
	}
	if !(rate > 0) || !(v.CreditValue > 0) {
		return BadAuthRequest(fmt.Sprintf("缺少 %s 兑马币汇率，请先在「币种与汇率」中配置", source.Currency))
	}
	convert := func(amount int64) int64 {
		return int64(math.Round(float64(amount) * rate / v.CreditValue))
	}
	cost.UnitPriceMicrocredits = convert(source.UnitPrice)
	cost.InputTokenPriceMicrocredits = convert(source.InputTokenPrice)
	cost.OutputTokenPriceMicrocredits = convert(source.OutputTokenPrice)
	cost.CachedTokenPriceMicrocredits = convert(source.CachedTokenPrice)
	cost.ExtraImagePriceMicrocredits = convert(source.ExtraImagePrice)
	cost.ExtraVideoSecondPriceMicrocredits = convert(source.ExtraVideoSecondPrice)
	return nil
}

func publicBillingCurrencySetting(setting *model.SystemSetting, value BillingCurrencySetting, recomputed int) *PublicBillingCurrencySetting {
	result := &PublicBillingCurrencySetting{BillingCurrencySetting: value, Currencies: costSourceCurrencies, Configured: setting != nil, Recomputed: recomputed}
	if setting != nil {
		result.UpdatedBy = setting.UpdatedBy
		result.UpdatedAt = setting.UpdatedAt
	}
	return result
}
