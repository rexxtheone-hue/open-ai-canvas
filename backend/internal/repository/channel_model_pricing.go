package repository

import (
	"errors"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

var ErrChannelModelPriceConflict = errors.New("模型价格已变化，请刷新后重试")

// UpdateChannelModelSalePrices commits the entire selection or nothing. Only
// pricing columns are written; version checks protect the cost snapshot used by app.
func (r *Repository) UpdateChannelModelSalePrices(channelID string, items []model.ChannelModel) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			result := tx.Model(&model.ChannelModel{}).
				Where("id = ? AND channel_id = ? AND price_version = ? AND updated_at = ?", item.ID, channelID, item.PriceVersion, item.UpdatedAt).
				Updates(map[string]any{
					"unit_price_microcredits":         item.UnitPriceMicrocredits,
					"input_token_price_microcredits":  item.InputTokenPriceMicrocredits,
					"output_token_price_microcredits": item.OutputTokenPriceMicrocredits,
					"cached_token_price_microcredits": item.CachedTokenPriceMicrocredits,
					"price_version":                   item.PriceVersion + 1,
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrChannelModelPriceConflict
			}
			for _, tier := range item.PriceTiers {
				if !tier.Enabled {
					continue
				}
				result = tx.Model(&model.ChannelModelPriceTier{}).
					Where("id = ? AND channel_model_id = ? AND price_version = ? AND updated_at = ?", tier.ID, item.ID, tier.PriceVersion, tier.UpdatedAt).
					Updates(map[string]any{
						"unit_price_microcredits":         tier.UnitPriceMicrocredits,
						"input_token_price_microcredits":  tier.InputTokenPriceMicrocredits,
						"output_token_price_microcredits": tier.OutputTokenPriceMicrocredits,
						"cached_token_price_microcredits": tier.CachedTokenPriceMicrocredits,
						"price_version":                   tier.PriceVersion + 1,
					})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return ErrChannelModelPriceConflict
				}
			}
		}
		return nil
	})
}

// ChannelModelPriceTiersWithCostSource 返回按原币种填写成本的全部活动规格，供汇率变更后重算积分成本。
func (r *Repository) ChannelModelPriceTiersWithCostSource() ([]model.ChannelModelPriceTier, error) {
	var tiers []model.ChannelModelPriceTier
	err := r.db.Where("cost_source_currency <> ''").Find(&tiers).Error
	return tiers, err
}

// SaveBillingCurrencySetting 在同一事务里保存汇率并写回换算后的积分成本，不触碰销售价与价格版本。
func (r *Repository) SaveBillingCurrencySetting(setting *model.SystemSetting, tiers []model.ChannelModelPriceTier) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(setting).Error; err != nil {
			return err
		}
		for _, tier := range tiers {
			if err := tx.Model(&model.ChannelModelPriceTier{}).Where("id = ?", tier.ID).Updates(map[string]any{
				"cost_unit_price_microcredits":         tier.CostPricing.UnitPriceMicrocredits,
				"cost_input_token_price_microcredits":  tier.CostPricing.InputTokenPriceMicrocredits,
				"cost_output_token_price_microcredits": tier.CostPricing.OutputTokenPriceMicrocredits,
				"cost_cached_token_price_microcredits": tier.CostPricing.CachedTokenPriceMicrocredits,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
