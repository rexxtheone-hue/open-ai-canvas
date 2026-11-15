// 代理商批发池的管理接口、月最低消费结算和提醒邮件。

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

// tenantBillingZone 是月结的时区：每月 1 日 00:30（吉隆坡时间）结算上个月。
var tenantBillingZone = creditReminderZone

const tenantMonthlySettleDelay = 30 * time.Minute

func tenantBillingPeriod(t time.Time) (string, time.Time, time.Time) {
	local := t.In(tenantBillingZone)
	start := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, tenantBillingZone)
	end := start.AddDate(0, 1, 0)
	return start.Format("2006-01"), start, end
}

// tenantFeeFree：FeeFreeUntil 晚于结算月末时该月免最低消费。
func tenantFeeFree(tenant model.Tenant, periodEnd time.Time) bool {
	return tenant.FeeFreeUntil != nil && tenant.FeeFreeUntil.After(periodEnd)
}

// runTenantBillingJobs 挂在支付 worker 的 5 分钟周期上：过期批次、月结、提醒邮件。
func (s *Service) runTenantBillingJobs(now time.Time) {
	if err := s.repo.ExpireTenantLots(now); err != nil {
		log.Printf("tenant lot expiry failed: %v", err)
	}
	if err := s.SettleTenantMonthlyFees(now); err != nil {
		log.Printf("tenant monthly fee settlement failed: %v", err)
	}
	if err := s.SendTenantPoolAlerts(now); err != nil && !errors.Is(err, auth.ErrEmailNotConfigured) {
		log.Printf("tenant pool alerts failed: %v", err)
	}
}

// SettleTenantMonthlyFees 在每月 1 日 00:30 之后结算上个月；同一月份重跑不会重复扣。
func (s *Service) SettleTenantMonthlyFees(now time.Time) error {
	// 结算的是 1 日 00:30 之前那个完整月份。
	_, current, _ := tenantBillingPeriod(now.Add(-tenantMonthlySettleDelay))
	_, start, end := tenantBillingPeriod(current.AddDate(0, -1, 0))
	tenants, err := s.repo.AgencyTenants()
	if err != nil {
		return err
	}
	var errs []error
	for _, tenant := range tenants {
		if tenant.Status != model.TenantStatusActive || !tenant.CreatedAt.Before(end) {
			continue
		}
		if _, err := s.settleTenantMonth(tenant, start, end, now); err != nil {
			errs = append(errs, fmt.Errorf("tenant=%s: %w", tenant.ID, err))
		}
	}
	return errors.Join(errs...)
}

func (s *Service) settleTenantMonth(tenant model.Tenant, start, end, now time.Time) (*model.TenantMonthlyUsage, error) {
	period := start.Format("2006-01")
	existing, err := s.repo.TenantMonthlyUsages(tenant.ID, period, 1)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		return &existing[0], nil
	}
	row, _, err := s.repo.SettleTenantMonthlyFee(tenant.ID, period, start, end, tenantFeeFree(tenant, end), now)
	return row, err
}

// TenantMonthlyFeePreview 是代理商这个月到目前为止的用量与按此估算的月最低消费。
type TenantMonthlyFeePreview struct {
	Period            string `json:"period"`
	UsageMicrocredits int64  `json:"usageMicrocredits"`
	UsageSen          int64  `json:"usageSen"`
	FeeSen            int64  `json:"feeSen"`
	FeeFree           bool   `json:"feeFree"`
}

func (s *Service) tenantMonthlyFeePreview(tenant model.Tenant, now time.Time) (TenantMonthlyFeePreview, error) {
	period, start, end := tenantBillingPeriod(now)
	usage, err := s.repo.TenantPoolUsage(tenant.ID, start, end)
	if err != nil {
		return TenantMonthlyFeePreview{}, err
	}
	preview := TenantMonthlyFeePreview{Period: period, UsageMicrocredits: usage, UsageSen: repository.UsageSen(usage), FeeFree: tenantFeeFree(tenant, end)}
	if !preview.FeeFree {
		preview.FeeSen = repository.MonthlyFeeSen(usage)
	}
	return preview, nil
}

// SendTenantPoolAlerts 给代理商管理员发池余额提醒：低于最近一次充值的 20%、余额为 0、批次到期前 30 / 7 天，每档各一次。
func (s *Service) SendTenantPoolAlerts(now time.Time) error {
	tenants, err := s.repo.AgencyTenants()
	if err != nil {
		return err
	}
	byID := make(map[string]model.Tenant, len(tenants))
	for _, tenant := range tenants {
		byID[tenant.ID] = tenant
		if err := s.sendTenantBalanceAlert(tenant); err != nil {
			if errors.Is(err, auth.ErrEmailNotConfigured) {
				return err
			}
			log.Printf("tenant balance alert failed: tenant=%s error=%v", tenant.ID, err)
		}
	}
	lots, err := s.repo.TenantLotsDueExpiryReminder(now)
	if err != nil {
		return err
	}
	for _, lot := range lots {
		tenant, ok := byID[lot.TenantID]
		if !ok {
			continue
		}
		stage := 1
		if !lot.ExpiresAt.After(now.AddDate(0, 0, 7)) {
			stage = 2
		}
		days := int(lot.ExpiresAt.Sub(now).Hours()/24) + 1
		content := auth.EmailContent{
			Subject:   fmt.Sprintf("%s: %s wholesale credits expire in %s", tenant.Name, formatReminderCredits(lot.RemainingMicrocredits), plural(days, "day")),
			Preheader: "Unused wholesale credits are removed on the expiry date.",
			Heading:   "Wholesale credits expiring soon",
			Intro:     []string{fmt.Sprintf("%s wholesale credits in your pool expire on %s.", formatReminderCredits(lot.RemainingMicrocredits), lot.ExpiresAt.In(tenantBillingZone).Format("2 Jan 2006"))},
			Body:      []string{"Your customers' generations always use the credits that expire soonest first."},
		}
		if err := s.sendTenantAdminEmail(tenant.ID, content); err != nil {
			if errors.Is(err, auth.ErrEmailNotConfigured) {
				return err
			}
			log.Printf("tenant lot expiry reminder failed: tenant=%s lot=%s error=%v", tenant.ID, lot.ID, err)
			continue
		}
		if err := s.repo.MarkTenantLotReminderStage(lot.ID, stage); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) sendTenantBalanceAlert(tenant model.Tenant) error {
	lot, err := s.repo.LatestTenantTopupLot(tenant.ID)
	if err != nil || lot == nil {
		return err
	}
	account, err := s.repo.TenantCreditAccount(tenant.ID)
	if err != nil {
		return err
	}
	column := ""
	var content auth.EmailContent
	switch {
	case account.AvailableMicrocredits <= 0 && !lot.ZeroBalanceAlerted:
		column = "zero_balance_alerted"
		content = auth.EmailContent{
			Subject:   tenant.Name + ": your wholesale credit pool is empty",
			Preheader: "Your customers can't generate until you top up.",
			Heading:   "Your credit pool is empty",
			Intro:     []string{"Your wholesale credit pool has reached zero. Your customers will see a service-unavailable message until you top up."},
			Body:      []string{"Transfer a top-up and send us the payment reference so we can credit your pool."},
		}
	case account.AvailableMicrocredits < lot.GrossMicrocredits/5 && !lot.LowBalanceAlerted:
		column = "low_balance_alerted"
		content = auth.EmailContent{
			Subject:   tenant.Name + ": your wholesale credit pool is running low",
			Preheader: "Less than 20% of your last top-up is left.",
			Heading:   "Your credit pool is running low",
			Intro:     []string{fmt.Sprintf("%s wholesale credits are left, less than 20%% of your last top-up.", formatReminderCredits(max(account.AvailableMicrocredits, 0)))},
			Body:      []string{"Top up soon so your customers' generations aren't interrupted."},
		}
	default:
		return nil
	}
	if err := s.sendTenantAdminEmail(tenant.ID, content); err != nil {
		return err
	}
	if err := s.repo.MarkTenantLotAlert(lot.ID, column); err != nil {
		return err
	}
	if column == "zero_balance_alerted" && !lot.LowBalanceAlerted {
		return s.repo.MarkTenantLotAlert(lot.ID, "low_balance_alerted")
	}
	return nil
}

// sendTenantAdminEmail 发给代理商所有管理员；没有管理员邮箱时视为已处理。
func (s *Service) sendTenantAdminEmail(tenantID string, content auth.EmailContent) error {
	emails, err := s.repo.TenantAdminEmails(tenantID)
	if err != nil {
		return err
	}
	var errs []error
	for _, email := range emails {
		if err := s.sendNoticeEmail(tenantID, email, content); err != nil {
			if errors.Is(err, auth.ErrEmailNotConfigured) {
				return err
			}
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// sendNoticeEmail 可在测试里替换。
func (s *Service) sendNoticeEmail(tenantID, recipient string, content auth.EmailContent) error {
	if s.tenantNoticeEmailHook != nil {
		return s.tenantNoticeEmailHook(recipient, content)
	}
	return s.authDomain().SendNoticeEmail(context.Background(), tenantID, recipient, content)
}

// ---- 权限 ----

// requireTenantAdmin 只允许本网址代理商的管理员，且只能操作本租户。
func (s *Service) requireTenantAdmin(actor *model.User, tenant model.Tenant) error {
	if actor == nil {
		return Unauthorized("请先登录")
	}
	if tenant.IsPlatform || tenant.ID == "" || tenant.ID == model.PlatformTenantID || actor.TenantID != tenant.ID || !IsTenantAdmin(actor) {
		return Forbidden("需要代理商管理员权限")
	}
	return nil
}

func (s *Service) requireAgencyTenant(tenantID string) (*model.Tenant, error) {
	tenant, err := s.agencyTenant(strings.TrimSpace(tenantID))
	if err != nil {
		return nil, err
	}
	if tenant == nil {
		return nil, NotFound("代理商不存在")
	}
	return tenant, nil
}

// ---- 平台管理员 ----

type TenantPoolSummary struct {
	Tenant                 model.Tenant            `json:"tenant"`
	AvailableMicrocredits  int64                   `json:"availableMicrocredits"`
	ReservedMicrocredits   int64                   `json:"reservedMicrocredits"`
	DebtMicrocredits       int64                   `json:"debtMicrocredits"`
	CurrentMonth           TenantMonthlyFeePreview `json:"currentMonth"`
	LatestTopupMicrocredit int64                   `json:"latestTopupMicrocredits"`
}

func (s *Service) tenantPoolSummary(tenant model.Tenant, now time.Time) (TenantPoolSummary, error) {
	account, err := s.repo.TenantCreditAccount(tenant.ID)
	if err != nil {
		return TenantPoolSummary{}, err
	}
	debt, err := s.repo.TenantOpenDebtTotal(tenant.ID)
	if err != nil {
		return TenantPoolSummary{}, err
	}
	preview, err := s.tenantMonthlyFeePreview(tenant, now)
	if err != nil {
		return TenantPoolSummary{}, err
	}
	summary := TenantPoolSummary{Tenant: tenant, AvailableMicrocredits: account.AvailableMicrocredits, ReservedMicrocredits: account.ReservedMicrocredits, DebtMicrocredits: debt, CurrentMonth: preview}
	if lot, err := s.repo.LatestTenantTopupLot(tenant.ID); err != nil {
		return TenantPoolSummary{}, err
	} else if lot != nil {
		summary.LatestTopupMicrocredit = lot.GrossMicrocredits
	}
	return summary, nil
}

func (s *Service) AdminTenantPools(actor *model.User) ([]TenantPoolSummary, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenants, err := s.repo.AgencyTenants()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	result := make([]TenantPoolSummary, 0, len(tenants))
	for _, tenant := range tenants {
		summary, err := s.tenantPoolSummary(tenant, now)
		if err != nil {
			return nil, err
		}
		result = append(result, summary)
	}
	return result, nil
}

type TenantTopupRequest struct {
	AmountSen        int64  `json:"amountSen"`
	PaymentReference string `json:"paymentReference"`
	Note             string `json:"note"`
}

type TenantTopupView struct {
	*repository.TenantTopupResult
	// BelowFirstTopupMinimum：首次充值低于 RM 5,000 只提示，不拦截。
	BelowFirstTopupMinimum bool   `json:"belowFirstTopupMinimum"`
	Warning                string `json:"warning,omitempty"`
}

func (s *Service) AdminTenantTopup(actor *model.User, tenantID string, req TenantTopupRequest) (*TenantTopupView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	if req.AmountSen <= 0 {
		return nil, BadAuthRequest("充值金额必须大于 0")
	}
	if strings.TrimSpace(req.PaymentReference) == "" {
		return nil, BadAuthRequest("请填写转账参考号")
	}
	result, err := s.repo.TopupTenantPool(repository.TenantTopupInput{
		TenantID: tenant.ID, AmountSen: req.AmountSen, PaymentReference: req.PaymentReference,
		Note: truncateRunes(strings.TrimSpace(req.Note), 500), ActorUserID: actor.ID, Now: time.Now(),
	})
	if errors.Is(err, repository.ErrTenantTopupDuplicate) {
		return nil, BadAuthRequest(err.Error())
	}
	if err != nil {
		return nil, err
	}
	view := &TenantTopupView{TenantTopupResult: result}
	if result.FirstTopup && req.AmountSen < repository.FirstTopupWarningSen {
		view.BelowFirstTopupMinimum = true
		view.Warning = "首次充值低于 RM 5,000"
	}
	if err := s.appendAdminAudit(actor, "tenant_pool.topup", "tenant", tenant.ID, "记录代理商银行转账充值", map[string]any{
		"amountSen": req.AmountSen, "paymentReference": req.PaymentReference, "grossMicrocredits": result.GrossMicrocredits,
		"debtSettledMicrocredits": result.DebtSettledMicrocredits, "lotId": result.Lot.ID,
	}); err != nil {
		return nil, err
	}
	return view, nil
}

type TenantPoolAdjustRequest struct {
	AmountMicrocredits int64  `json:"amountMicrocredits"`
	Note               string `json:"note"`
}

func (s *Service) AdminTenantPoolAdjust(actor *model.User, tenantID string, req TenantPoolAdjustRequest) (*model.TenantCreditAccount, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	note := strings.TrimSpace(req.Note)
	if req.AmountMicrocredits == 0 {
		return nil, BadAuthRequest("调账积分不能为 0")
	}
	if note == "" {
		return nil, BadAuthRequest("请填写调账原因")
	}
	account, err := s.repo.AdjustTenantPool(tenant.ID, req.AmountMicrocredits, truncateRunes(note, 500), actor.ID, time.Now())
	if errors.Is(err, repository.ErrTenantPoolNegative) {
		return nil, BadAuthRequest(err.Error())
	}
	if err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "tenant_pool.adjust", "tenant", tenant.ID, "调整代理商批发池", map[string]any{"amountMicrocredits": req.AmountMicrocredits, "note": truncateRunes(note, 500)}); err != nil {
		return nil, err
	}
	return account, nil
}

type TenantLedgerPage struct {
	Items []model.TenantLedgerEntry `json:"items"`
	Total int64                     `json:"total"`
	Page  int                       `json:"page"`
	Limit int                       `json:"limit"`
}

func (s *Service) tenantLedgerPage(tenantID string, page, limit int) (*TenantLedgerPage, error) {
	page, limit = normalizeAdminPage(page, limit)
	items, total, err := s.repo.TenantLedger(tenantID, limit, (page-1)*limit)
	if err != nil {
		return nil, err
	}
	return &TenantLedgerPage{Items: items, Total: total, Page: page, Limit: limit}, nil
}

func (s *Service) AdminTenantPoolLedger(actor *model.User, tenantID string, page, limit int) (*TenantLedgerPage, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return s.tenantLedgerPage(tenant.ID, page, limit)
}

func (s *Service) AdminTenantPoolLots(actor *model.User, tenantID string) ([]model.TenantCreditLot, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return s.repo.TenantCreditLots(tenant.ID, false)
}

func (s *Service) AdminTenantMonthlySettlements(actor *model.User, tenantID string, period string) ([]model.TenantMonthlyUsage, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	return s.repo.TenantMonthlyUsages(strings.TrimSpace(tenantID), strings.TrimSpace(period), 500)
}

type AgencyDiscountItem struct {
	ChannelModelID        string `json:"channelModelId"`
	ChannelID             string `json:"channelId"`
	ModelKey              string `json:"modelKey"`
	DisplayName           string `json:"displayName"`
	Capability            string `json:"capability"`
	AgencyDiscountPercent int    `json:"agencyDiscountPercent"`
	// PoolFactorPercent 是池扣减相对平台积分的比例（×100），例如 25% 折扣为 88.235。
	PoolFactorPercent float64 `json:"poolFactorPercent"`
}

func (s *Service) AdminAgencyDiscounts(actor *model.User) ([]AgencyDiscountItem, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	channels, err := s.repo.SystemChannels(true)
	if err != nil {
		return nil, err
	}
	var items []AgencyDiscountItem
	for _, channel := range channels {
		models, err := s.repo.ChannelModels(channel.ID, true)
		if err != nil {
			return nil, err
		}
		for _, item := range models {
			percent := item.AgencyDiscountPercent
			if !repository.ValidAgencyDiscount(percent) {
				percent = model.AgencyDefaultDiscountPercent
			}
			items = append(items, AgencyDiscountItem{
				ChannelModelID: item.ID, ChannelID: item.ChannelID, ModelKey: item.ModelKey, DisplayName: item.DisplayName,
				Capability: item.Capability, AgencyDiscountPercent: percent, PoolFactorPercent: float64(int64(100-percent)*100_000/85) / 1000,
			})
		}
	}
	return items, nil
}

func (s *Service) AdminSetAgencyDiscount(actor *model.User, channelModelID string, percent int) error {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return err
	}
	if !repository.ValidAgencyDiscount(percent) {
		return BadAuthRequest("代理商折扣只能是 15、25、30 或 40")
	}
	if err := s.repo.SetChannelModelAgencyDiscount(strings.TrimSpace(channelModelID), percent); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return NotFound("模型不存在")
		}
		return err
	}
	return s.appendAdminAudit(actor, "channel_model.agency_discount", "channel_model", channelModelID, "设置代理商折扣", map[string]any{"agencyDiscountPercent": percent})
}

// ---- 代理商管理员 ----

type TenantPoolOverview struct {
	TenantPoolSummary
	Debts []model.TenantDebt `json:"debts"`
}

func (s *Service) TenantPoolOverview(actor *model.User, tenant model.Tenant) (*TenantPoolOverview, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	stored, err := s.requireAgencyTenant(tenant.ID)
	if err != nil {
		return nil, err
	}
	summary, err := s.tenantPoolSummary(*stored, time.Now())
	if err != nil {
		return nil, err
	}
	debts, err := s.repo.TenantDebts(stored.ID, true)
	if err != nil {
		return nil, err
	}
	return &TenantPoolOverview{TenantPoolSummary: summary, Debts: debts}, nil
}

func (s *Service) TenantPoolLots(actor *model.User, tenant model.Tenant) ([]model.TenantCreditLot, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	return s.repo.TenantCreditLots(tenant.ID, false)
}

func (s *Service) TenantPoolLedger(actor *model.User, tenant model.Tenant, page, limit int) (*TenantLedgerPage, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	return s.tenantLedgerPage(tenant.ID, page, limit)
}

func (s *Service) TenantPoolDebts(actor *model.User, tenant model.Tenant) ([]model.TenantDebt, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	return s.repo.TenantDebts(tenant.ID, false)
}

type TenantMonthlyUsageView struct {
	CurrentMonth TenantMonthlyFeePreview    `json:"currentMonth"`
	Settlements  []model.TenantMonthlyUsage `json:"settlements"`
}

func (s *Service) TenantMonthlyUsage(actor *model.User, tenant model.Tenant) (*TenantMonthlyUsageView, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	stored, err := s.requireAgencyTenant(tenant.ID)
	if err != nil {
		return nil, err
	}
	preview, err := s.tenantMonthlyFeePreview(*stored, time.Now())
	if err != nil {
		return nil, err
	}
	settlements, err := s.repo.TenantMonthlyUsages(stored.ID, "", 36)
	if err != nil {
		return nil, err
	}
	return &TenantMonthlyUsageView{CurrentMonth: preview, Settlements: settlements}, nil
}

func (s *Service) TenantRetailPrices(actor *model.User, tenant model.Tenant) ([]model.TenantModelPrice, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	return s.repo.TenantModelPrices(tenant.ID)
}

type TenantRetailPriceRequest struct {
	ChannelModelID             string   `json:"channelModelId"`
	PriceTierID                string   `json:"priceTierId"`
	Multiplier                 *float64 `json:"multiplier"`
	FixedUnitPriceMicrocredits *int64   `json:"fixedUnitPriceMicrocredits"`
	Enabled                    *bool    `json:"enabled"`
}

func (s *Service) SaveTenantRetailPrice(actor *model.User, tenant model.Tenant, req TenantRetailPriceRequest) (*model.TenantModelPrice, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	item := &model.TenantModelPrice{TenantID: tenant.ID, MultiplierBasisPoints: 10_000, Enabled: true}
	if req.Multiplier != nil {
		bps := int64(*req.Multiplier*10_000 + 0.5)
		if *req.Multiplier <= 0 || bps < 100 || bps > 1_000_000 {
			return nil, BadAuthRequest("倍率必须在 0.01 到 100 之间")
		}
		item.MultiplierBasisPoints = bps
	}
	if req.FixedUnitPriceMicrocredits != nil {
		if *req.FixedUnitPriceMicrocredits < 0 {
			return nil, BadAuthRequest("固定价格不能为负数")
		}
		value := *req.FixedUnitPriceMicrocredits
		item.FixedUnitPriceMicrocredits = &value
	}
	if req.Enabled != nil {
		item.Enabled = *req.Enabled
	}
	channelModelID := strings.TrimSpace(req.ChannelModelID)
	priceTierID := strings.TrimSpace(req.PriceTierID)
	if priceTierID != "" && channelModelID == "" {
		return nil, BadAuthRequest("指定规格时必须同时指定模型")
	}
	if channelModelID != "" {
		channelModel, err := s.repo.ChannelModel(channelModelID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, NotFound("模型不存在")
		}
		if err != nil {
			return nil, err
		}
		item.ChannelModelID = &channelModelID
		if priceTierID != "" {
			found := false
			for _, tier := range channelModel.PriceTiers {
				if tier.ID == priceTierID {
					found = true
					break
				}
			}
			if !found {
				return nil, NotFound("模型规格不存在")
			}
			item.PriceTierID = &priceTierID
		}
	}
	if err := s.repo.SaveTenantModelPrice(item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) DeleteTenantRetailPrice(actor *model.User, tenant model.Tenant, id string) error {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return err
	}
	deleted, err := s.repo.DeleteTenantModelPrice(tenant.ID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("价格规则不存在")
	}
	return nil
}

// ---- 代理商收款渠道（只有存取，没有界面）----

// SaveTenantPaymentIntegration 加密保存代理商自己的收款渠道配置。
func (s *Service) SaveTenantPaymentIntegration(tenantID string, provider string, enabled bool, config map[string]any) error {
	encoded, err := json.Marshal(config)
	if err != nil {
		return err
	}
	cipher, err := s.encryptSettingSecret(string(encoded))
	if err != nil {
		return err
	}
	return s.repo.SaveTenantPaymentIntegration(&model.TenantPaymentIntegration{TenantID: tenantID, Provider: strings.TrimSpace(provider), Enabled: enabled, ConfigJSON: cipher})
}

// TenantPaymentIntegrationConfig 读取并解密代理商收款渠道配置；没配置时返回 nil。
func (s *Service) TenantPaymentIntegrationConfig(tenantID string, provider string) (map[string]any, bool, error) {
	item, err := s.repo.TenantPaymentIntegration(tenantID, provider)
	if err != nil || item == nil {
		return nil, false, err
	}
	plain, err := s.decryptSettingSecret(item.ConfigJSON)
	if err != nil {
		return nil, false, err
	}
	config := map[string]any{}
	if plain != "" {
		if err := json.Unmarshal([]byte(plain), &config); err != nil {
			return nil, false, err
		}
	}
	return config, item.Enabled, nil
}
