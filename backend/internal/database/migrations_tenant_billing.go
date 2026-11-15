package database

import (
	"fmt"
	"strings"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const tenantBillingChecksum = "sha256:tenant-wholesale-billing-v81-20261115"

// migrateTenantBilling 建立代理商批发计费的表与栏位，并按模型名称初始化代理商折扣；只新增、不删除。
func migrateTenantBilling(tx *gorm.DB) error {
	if err := tx.AutoMigrate(
		&model.TenantCreditAccount{}, &model.TenantCreditLot{}, &model.TenantLedgerEntry{},
		&model.TenantDebt{}, &model.TenantMonthlyUsage{}, &model.TenantModelPrice{}, &model.TenantPaymentIntegration{},
	); err != nil {
		return fmt.Errorf("创建代理商计费表：%w", err)
	}
	if !tx.Migrator().HasColumn(&model.ChannelModel{}, "AgencyDiscountPercent") {
		if err := tx.Migrator().AddColumn(&model.ChannelModel{}, "AgencyDiscountPercent"); err != nil {
			return fmt.Errorf("渠道模型增加代理商折扣：%w", err)
		}
	}
	for _, field := range []string{
		"TenantID", "TenantDiscountPercent", "TenantPlatformAmountMicrocredits", "TenantPlatformUnitPriceMicrocredits",
		"TenantPlatformMultiplierBPS", "TenantPlatformSurchargeMicrocredits", "TenantReservedMicrocredits", "TenantChargeMicrocredits",
	} {
		if !tx.Migrator().HasColumn(&model.BillingOrder{}, field) {
			if err := tx.Migrator().AddColumn(&model.BillingOrder{}, field); err != nil {
				return fmt.Errorf("计费订单增加 %s：%w", field, err)
			}
		}
	}
	if !tx.Migrator().HasIndex(&model.BillingOrder{}, "TenantID") {
		if err := tx.Migrator().CreateIndex(&model.BillingOrder{}, "TenantID"); err != nil {
			return fmt.Errorf("计费订单租户索引：%w", err)
		}
	}
	return seedAgencyDiscounts(tx)
}

// seedAgencyDiscounts 按模型名称写入代理商折扣；重复执行结果相同。
func seedAgencyDiscounts(tx *gorm.DB) error {
	type row struct {
		ID               string
		ModelKey         string
		ProviderModelKey string
		DisplayName      string
		Capability       string
	}
	var rows []row
	if err := tx.Model(&model.ChannelModel{}).Select("id", "model_key", "provider_model_key", "display_name", "capability").Find(&rows).Error; err != nil {
		return err
	}
	for _, item := range rows {
		percent := AgencyDiscountForModel(item.DisplayName+" "+item.ModelKey+" "+item.ProviderModelKey, item.Capability)
		if err := tx.Model(&model.ChannelModel{}).Where("id = ?", item.ID).Update("agency_discount_percent", percent).Error; err != nil {
			return err
		}
	}
	return nil
}

var agencyDiscountRules = []struct {
	percent  int
	patterns []string
}{
	{15, []string{"seedance", "seedream"}},
	{40, []string{"grok imagine"}},
	{30, []string{"nano banana", "gpt image", "midjourney", "ltx", "dreamactor", "upscale", "sound effect", "video sound", "sfx"}},
	{25, []string{"veo 3.1", "veo3.1", "kling", "vidu", "minimax h3", "wan 3", "wan3", "wan prime", "omni flash"}},
}

// AgencyDiscountForModel 按模型名称（显示名、模型键、供应商模型键）匹配代理商折扣；
// 名称都没命中时，音频模型 30%、文本模型 25%，其余 15%。
func AgencyDiscountForModel(label string, capability string) int {
	normalized := strings.NewReplacer("-", " ", "_", " ", "/", " ").Replace(strings.ToLower(label))
	normalized = strings.Join(strings.Fields(normalized), " ")
	for _, rule := range agencyDiscountRules {
		for _, pattern := range rule.patterns {
			if strings.Contains(normalized, pattern) {
				return rule.percent
			}
		}
	}
	switch strings.ToLower(strings.TrimSpace(capability)) {
	case "audio":
		return 30
	case "text":
		return 25
	}
	return model.AgencyDefaultDiscountPercent
}
