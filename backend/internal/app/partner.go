package app

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

var partnerKinds = map[string]string{
	model.PartnerKindCreator:   "认证创作者",
	model.PartnerKindMerchant:  "商家",
	model.PartnerKindAffiliate: "推广者",
}

// ---------- 推广设置 ----------

const affiliateSettingKey = "affiliate"

// AffiliateSetting 金额比例都用万分比：2000 = 20%。最低提现按马币计算，其它币种按汇率折算。
type AffiliateSetting struct {
	DefaultRateBP   int     `json:"defaultRateBp"`
	AttributionDays int     `json:"attributionDays"`
	HoldDays        int     `json:"holdDays"`
	MinPayoutMYR    float64 `json:"minPayoutMyr"`
	CreditBonusBP   int     `json:"creditBonusBp"`
}

func defaultAffiliateSetting() AffiliateSetting {
	return AffiliateSetting{DefaultRateBP: 2000, AttributionDays: 365, HoldDays: 14, MinPayoutMYR: 50, CreditBonusBP: 1000}
}

func validateAffiliateSetting(v AffiliateSetting) error {
	switch {
	case v.DefaultRateBP < 0 || v.DefaultRateBP > 9000:
		return BadAuthRequest("默认佣金比例需在 0% 到 90% 之间")
	case v.AttributionDays < 1 || v.AttributionDays > 3650:
		return BadAuthRequest("佣金有效期需在 1 到 3650 天之间")
	case v.HoldDays < 0 || v.HoldDays > 180:
		return BadAuthRequest("冷却期需在 0 到 180 天之间")
	case v.MinPayoutMYR < 0 || v.MinPayoutMYR > 100000 || math.IsNaN(v.MinPayoutMYR):
		return BadAuthRequest("最低提现金额无效")
	case v.CreditBonusBP < 0 || v.CreditBonusBP > 10000:
		return BadAuthRequest("换积分加成需在 0% 到 100% 之间")
	}
	return nil
}

func (s *Service) affiliateSetting() (AffiliateSetting, error) {
	setting, err := s.repo.SystemSetting(affiliateSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return defaultAffiliateSetting(), nil
	}
	if err != nil {
		return AffiliateSetting{}, err
	}
	value := defaultAffiliateSetting()
	if json.Unmarshal([]byte(setting.ValueJSON), &value) != nil || validateAffiliateSetting(value) != nil {
		return AffiliateSetting{}, errors.New("推广设置格式无效")
	}
	return value, nil
}

func (s *Service) AdminAffiliateSetting(actor *model.User) (AffiliateSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return AffiliateSetting{}, err
	}
	return s.affiliateSetting()
}

func (s *Service) UpdateAffiliateSetting(actor *model.User, value AffiliateSetting) (AffiliateSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return AffiliateSetting{}, err
	}
	if err := validateAffiliateSetting(value); err != nil {
		return AffiliateSetting{}, err
	}
	before, err := s.affiliateSetting()
	if err != nil {
		return AffiliateSetting{}, err
	}
	encoded, _ := json.Marshal(value)
	setting := model.SystemSetting{Key: affiliateSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	if current, err := s.repo.SystemSetting(affiliateSettingKey); err == nil {
		setting.CreatedAt = current.CreatedAt
	}
	if err := s.repo.SaveSystemSettings(&setting); err != nil {
		return AffiliateSetting{}, err
	}
	if err := s.appendAdminAudit(actor, "affiliate.settings", "system_setting", affiliateSettingKey, "更新推广设置", map[string]any{"before": before, "after": value}); err != nil {
		return AffiliateSetting{}, err
	}
	return value, nil
}

// ---------- 申请与审核 ----------

type PartnerApplicationRequest struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Contact string `json:"contact"`
}

type PartnerStatus struct {
	Applications []model.PartnerApplication `json:"applications"`
	Affiliate    *AffiliateDashboard        `json:"affiliate,omitempty"`
}

func (s *Service) MyPartnerStatus(user *model.User) (*PartnerStatus, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	applications, err := s.repo.PartnerApplicationsForUser(user.ID)
	if err != nil {
		return nil, err
	}
	result := &PartnerStatus{Applications: applications}
	account, err := s.repo.AffiliateAccount(user.ID)
	if err != nil {
		return nil, err
	}
	if account != nil && account.Status == model.AffiliateStatusActive {
		dashboard, err := s.affiliateDashboard(account)
		if err != nil {
			return nil, err
		}
		result.Affiliate = dashboard
	}
	return result, nil
}

func (s *Service) SubmitPartnerApplication(user *model.User, req PartnerApplicationRequest) (*model.PartnerApplication, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	kind := strings.TrimSpace(req.Kind)
	if _, ok := partnerKinds[kind]; !ok {
		return nil, BadAuthRequest("申请类型无效")
	}
	message, contact := strings.TrimSpace(req.Message), strings.TrimSpace(req.Contact)
	if utf8.RuneCountInString(message) < 10 || utf8.RuneCountInString(message) > 1000 {
		return nil, BadAuthRequest("申请说明需要 10 到 1000 个字")
	}
	if utf8.RuneCountInString(contact) > 200 {
		return nil, BadAuthRequest("联系方式最多 200 个字")
	}
	existing, err := s.repo.PartnerApplication(user.ID, kind)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	item := existing
	if item == nil {
		item = &model.PartnerApplication{ID: newID(), UserID: user.ID, Kind: kind, CreatedAt: now}
	} else {
		switch item.Status {
		case model.PartnerApplicationPending:
			return nil, BadAuthRequest("申请正在审核中，请耐心等待")
		case model.PartnerApplicationApproved:
			return nil, BadAuthRequest("你已经通过了这项认证")
		}
	}
	item.Status = model.PartnerApplicationPending
	item.Message, item.Contact = message, contact
	item.ReviewNote, item.ReviewedBy, item.ReviewedAt = "", "", nil
	item.UpdatedAt = now
	if err := s.repo.SavePartnerApplication(item); err != nil {
		return nil, err
	}
	return item, nil
}

type PartnerApplicationPage struct {
	Items []repository.PartnerApplicationRow `json:"items"`
	Total int64                              `json:"total"`
}

func (s *Service) AdminPartnerApplications(actor *model.User, kind, status string, offset int) (*PartnerApplicationPage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	rows, total, err := s.repo.AdminPartnerApplications(kind, status, offset, 50)
	if err != nil {
		return nil, err
	}
	return &PartnerApplicationPage{Items: rows, Total: total}, nil
}

type PartnerReviewRequest struct {
	Action string `json:"action"`
	Note   string `json:"note"`
	// RateBP 仅推广者通过时使用；0 表示沿用默认比例。
	RateBP int `json:"rateBp"`
}

func (s *Service) ReviewPartnerApplication(actor *model.User, id string, req PartnerReviewRequest) (*model.PartnerApplication, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	item, err := s.repo.PartnerApplicationByID(id)
	if err != nil {
		return nil, err
	}
	note := strings.TrimSpace(req.Note)
	if utf8.RuneCountInString(note) > 500 {
		return nil, BadAuthRequest("审核备注最多 500 个字")
	}
	if req.RateBP < 0 || req.RateBP > 9000 {
		return nil, BadAuthRequest("佣金比例需在 0% 到 90% 之间")
	}
	now := time.Now().UTC()
	switch req.Action {
	case "approve":
		if item.Status == model.PartnerApplicationApproved {
			return nil, BadAuthRequest("这份申请已经通过")
		}
		if err := s.grantPartnerKind(item.UserID, item.Kind, req.RateBP, now); err != nil {
			return nil, err
		}
		item.Status = model.PartnerApplicationApproved
	case "reject":
		if item.Status != model.PartnerApplicationPending {
			return nil, BadAuthRequest("只能驳回待审核的申请")
		}
		item.Status = model.PartnerApplicationRejected
	case "revoke":
		if item.Status != model.PartnerApplicationApproved {
			return nil, BadAuthRequest("只能撤销已通过的认证")
		}
		if err := s.revokePartnerKind(item.UserID, item.Kind); err != nil {
			return nil, err
		}
		item.Status = model.PartnerApplicationRevoked
	default:
		return nil, BadAuthRequest("审核操作无效")
	}
	item.ReviewNote, item.ReviewedBy, item.ReviewedAt, item.UpdatedAt = note, actor.ID, &now, now
	if err := s.repo.SavePartnerApplication(item); err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "partner."+req.Action, "partner_application", item.ID, fmt.Sprintf("%s申请：%s", partnerKinds[item.Kind], req.Action), map[string]any{"userId": item.UserID, "kind": item.Kind, "note": note, "rateBp": req.RateBP}); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) grantPartnerKind(userID, kind string, rateBP int, now time.Time) error {
	switch kind {
	case model.PartnerKindCreator, model.PartnerKindMerchant:
		if _, err := s.ensureStudioProfile(userID); err != nil {
			return err
		}
		return s.repo.SetStudioProfileVerification(userID, kind, &now)
	case model.PartnerKindAffiliate:
		account, err := s.repo.AffiliateAccount(userID)
		if err != nil {
			return err
		}
		if account != nil {
			account.Status, account.CommissionRateBP, account.UpdatedAt = model.AffiliateStatusActive, rateBP, now
			return s.repo.SaveAffiliateAccount(account)
		}
		for range 8 {
			code, err := affiliateCode()
			if err != nil {
				return err
			}
			created, err := s.repo.CreateAffiliateAccount(&model.AffiliateAccount{UserID: userID, Code: code, CommissionRateBP: rateBP, Status: model.AffiliateStatusActive, CreatedAt: now, UpdatedAt: now})
			if err != nil || created {
				return err
			}
		}
		return errors.New("无法生成推广码，请稍后重试")
	}
	return BadAuthRequest("申请类型无效")
}

func (s *Service) revokePartnerKind(userID, kind string) error {
	switch kind {
	case model.PartnerKindCreator, model.PartnerKindMerchant:
		return s.repo.SetStudioProfileVerification(userID, kind, nil)
	case model.PartnerKindAffiliate:
		account, err := s.repo.AffiliateAccount(userID)
		if err != nil || account == nil {
			return err
		}
		account.Status, account.UpdatedAt = model.AffiliateStatusSuspended, time.Now().UTC()
		return s.repo.SaveAffiliateAccount(account)
	}
	return nil
}

const affiliateCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func affiliateCode() (string, error) {
	var builder strings.Builder
	for range 8 {
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(affiliateCodeAlphabet))))
		if err != nil {
			return "", err
		}
		builder.WriteByte(affiliateCodeAlphabet[index.Int64()])
	}
	return builder.String(), nil
}

// ---------- 推荐归属与佣金 ----------

// affiliateReferralWindow 只给刚注册的账号挂推荐关系，老用户换推广链接登录不会被改归属。
const affiliateReferralWindow = 30 * time.Minute

// AttachReferral 在注册或首次验证码登录后调用，任何失败都不影响注册本身。
func (s *Service) AttachReferral(userID, code string) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if userID == "" || code == "" || len(code) > 32 {
		return
	}
	if err := s.attachReferral(userID, code); err != nil {
		log.Printf("[affiliate] attach referral for %s failed: %v", userID, err)
	}
}

func (s *Service) attachReferral(userID, code string) error {
	account, err := s.repo.AffiliateAccountByCode(code)
	if err != nil || account == nil || account.Status != model.AffiliateStatusActive || account.UserID == userID {
		return err
	}
	user, err := s.repo.User(userID)
	if err != nil {
		return err
	}
	if time.Since(user.CreatedAt) > affiliateReferralWindow {
		return nil
	}
	return s.repo.CreateAffiliateReferral(&model.AffiliateReferral{UserID: userID, AffiliateUserID: account.UserID, Code: code, CreatedAt: time.Now().UTC()})
}

// recordAffiliateCommission 在充值订单入账后调用；以订单为唯一键，重复调用安全。
func (s *Service) recordAffiliateCommission(order *model.PaymentOrder) {
	if order == nil || order.Status != model.PaymentOrderCredited || order.AmountFen <= 0 {
		return
	}
	if err := s.createAffiliateCommission(order); err != nil {
		log.Printf("[affiliate] commission for order %s failed: %v", order.ID, err)
	}
}

func (s *Service) createAffiliateCommission(order *model.PaymentOrder) error {
	referral, err := s.repo.AffiliateReferral(order.UserID)
	if err != nil || referral == nil {
		return err
	}
	account, err := s.repo.AffiliateAccount(referral.AffiliateUserID)
	if err != nil || account == nil || account.Status != model.AffiliateStatusActive {
		return err
	}
	setting, err := s.affiliateSetting()
	if err != nil {
		return err
	}
	paidAt := order.UpdatedAt
	if order.ProviderPaidAt != nil {
		paidAt = *order.ProviderPaidAt
	}
	if paidAt.After(referral.CreatedAt.AddDate(0, 0, setting.AttributionDays)) {
		return nil
	}
	rate := account.CommissionRateBP
	if rate == 0 {
		rate = setting.DefaultRateBP
	}
	amount := order.AmountFen * int64(rate) / 10000
	if amount <= 0 {
		return nil
	}
	now := time.Now().UTC()
	return s.repo.CreateAffiliateCommission(&model.AffiliateCommission{
		ID: newID(), AffiliateUserID: account.UserID, ReferredUserID: order.UserID, PaymentOrderID: order.ID,
		Currency: order.Currency, OrderAmountFen: order.AmountFen, RateBP: rate, AmountFen: amount,
		AvailableAt: now.AddDate(0, 0, setting.HoldDays), CreatedAt: now,
	})
}

// ---------- 推广者面板 ----------

type AffiliateCommissionView struct {
	model.AffiliateCommission
	ReferredName string `json:"referredName"`
	Available    bool   `json:"available"`
}

type AffiliateDashboard struct {
	Code             string                        `json:"code"`
	RateBP           int                           `json:"rateBp"`
	Referrals        int64                         `json:"referrals"`
	Balances         []repository.AffiliateBalance `json:"balances"`
	Commissions      []AffiliateCommissionView     `json:"commissions"`
	Payouts          []model.AffiliatePayout       `json:"payouts"`
	Setting          AffiliateSetting              `json:"setting"`
	CreditValueMYR   float64                       `json:"creditValueMyr"`
	CurrencyRatesMYR map[string]float64            `json:"currencyRatesMyr"`
}

func (s *Service) affiliateDashboard(account *model.AffiliateAccount) (*AffiliateDashboard, error) {
	setting, err := s.affiliateSetting()
	if err != nil {
		return nil, err
	}
	_, currency, err := s.readBillingCurrencySetting()
	if err != nil {
		return nil, err
	}
	referrals, err := s.repo.AffiliateReferralCount(account.UserID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	balances, err := s.repo.AffiliateBalances(account.UserID, now)
	if err != nil {
		return nil, err
	}
	commissions, err := s.repo.AffiliateCommissions(account.UserID, 50)
	if err != nil {
		return nil, err
	}
	payouts, err := s.repo.AffiliatePayouts(account.UserID, 30)
	if err != nil {
		return nil, err
	}
	rate := account.CommissionRateBP
	if rate == 0 {
		rate = setting.DefaultRateBP
	}
	views := make([]AffiliateCommissionView, 0, len(commissions))
	for _, item := range commissions {
		name := "新用户"
		if user, err := s.repo.User(item.ReferredUserID); err == nil {
			name = maskReferredName(user.DisplayName)
		}
		views = append(views, AffiliateCommissionView{AffiliateCommission: item, ReferredName: name, Available: item.PayoutID == "" && !item.AvailableAt.After(now)})
	}
	rates := map[string]float64{billingBaseCurrency: 1}
	for key, value := range currency.Rates {
		rates[key] = value
	}
	return &AffiliateDashboard{
		Code: account.Code, RateBP: rate, Referrals: referrals, Balances: balances, Commissions: views, Payouts: payouts,
		Setting: setting, CreditValueMYR: currency.CreditValue, CurrencyRatesMYR: rates,
	}, nil
}

// maskReferredName 推广者只看得到被推荐人的打码昵称。
func maskReferredName(name string) string {
	runes := []rune(strings.TrimSpace(name))
	switch len(runes) {
	case 0:
		return "新用户"
	case 1:
		return string(runes) + "**"
	default:
		return string(runes[0]) + "**" + string(runes[len(runes)-1])
	}
}

type AffiliatePayoutRequest struct {
	Kind     string `json:"kind"`
	Currency string `json:"currency"`
	Details  string `json:"details"`
}

func (s *Service) RequestAffiliatePayout(user *model.User, req AffiliatePayoutRequest) (*model.AffiliatePayout, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	account, err := s.repo.AffiliateAccount(user.ID)
	if err != nil {
		return nil, err
	}
	if account == nil || account.Status != model.AffiliateStatusActive {
		return nil, Forbidden("你还不是推广者")
	}
	kind := strings.TrimSpace(req.Kind)
	if kind != model.AffiliatePayoutCash && kind != model.AffiliatePayoutCredits {
		return nil, BadAuthRequest("提取方式无效")
	}
	details := strings.TrimSpace(req.Details)
	if kind == model.AffiliatePayoutCash && (utf8.RuneCountInString(details) < 6 || utf8.RuneCountInString(details) > 500) {
		return nil, BadAuthRequest("请填写收款信息（银行、户名、账号），6 到 500 个字")
	}
	currencyCode := strings.ToUpper(strings.TrimSpace(req.Currency))
	setting, err := s.affiliateSetting()
	if err != nil {
		return nil, err
	}
	_, currency, err := s.readBillingCurrencySetting()
	if err != nil {
		return nil, err
	}
	rate := 1.0
	if currencyCode != billingBaseCurrency {
		rate = currency.Rates[currencyCode]
	}
	if !(rate > 0) {
		return nil, BadAuthRequest("暂不支持该币种的佣金提取，请联系客服")
	}
	var minimum int64
	if kind == model.AffiliatePayoutCash {
		minimum = int64(math.Ceil(setting.MinPayoutMYR * 100 / rate))
	}
	now := time.Now().UTC()
	payout := &model.AffiliatePayout{ID: newID(), AffiliateUserID: user.ID, Kind: kind, Currency: currencyCode, PayoutDetails: details, Status: model.AffiliatePayoutRequested, CreatedAt: now, UpdatedAt: now}
	if kind == model.AffiliatePayoutCredits {
		payout.Status = model.AffiliatePayoutCompleted
	}
	err = s.repo.ClaimAffiliatePayout(payout, now, minimum, func(amount int64) (int64, error) {
		// 佣金（分/仙）→ 马币 → 积分，再加换积分加成。
		myr := float64(amount) / 100 * rate
		credits := myr / currency.CreditValue * (1 + float64(setting.CreditBonusBP)/10000)
		return int64(math.Round(credits * 1_000_000)), nil
	})
	var minimumErr *repository.AffiliateMinimumError
	switch {
	case errors.Is(err, repository.ErrAffiliateNothingToPayout):
		return nil, BadAuthRequest("当前没有可提取的佣金（冷却期内的佣金暂不可提取）")
	case errors.As(err, &minimumErr):
		return nil, BadAuthRequest(fmt.Sprintf("现金提现最低 RM%.2f，可提取佣金还不够", setting.MinPayoutMYR))
	case err != nil:
		return nil, err
	}
	return payout, nil
}

// ---------- 后台：推广者与提现 ----------

type AffiliateAdminPage struct {
	Items []repository.AffiliateRow `json:"items"`
	Total int64                     `json:"total"`
}

func (s *Service) AdminAffiliates(actor *model.User, search string, offset int) (*AffiliateAdminPage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	rows, total, err := s.repo.AdminAffiliates(search, offset, 50)
	if err != nil {
		return nil, err
	}
	return &AffiliateAdminPage{Items: rows, Total: total}, nil
}

type AffiliateUpdateRequest struct {
	RateBP *int    `json:"rateBp"`
	Status *string `json:"status"`
}

func (s *Service) UpdateAffiliate(actor *model.User, userID string, req AffiliateUpdateRequest) (*model.AffiliateAccount, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	account, err := s.repo.AffiliateAccount(userID)
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, NotFound("推广者不存在")
	}
	before := *account
	if req.RateBP != nil {
		if *req.RateBP < 0 || *req.RateBP > 9000 {
			return nil, BadAuthRequest("佣金比例需在 0% 到 90% 之间")
		}
		account.CommissionRateBP = *req.RateBP
	}
	if req.Status != nil {
		if *req.Status != model.AffiliateStatusActive && *req.Status != model.AffiliateStatusSuspended {
			return nil, BadAuthRequest("推广者状态无效")
		}
		account.Status = *req.Status
	}
	account.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveAffiliateAccount(account); err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "affiliate.update", "affiliate_account", userID, "更新推广者", map[string]any{"before": before, "after": account}); err != nil {
		return nil, err
	}
	return account, nil
}

type AffiliatePayoutAdminPage struct {
	Items []repository.AffiliatePayoutRow `json:"items"`
	Total int64                           `json:"total"`
}

func (s *Service) AdminAffiliatePayouts(actor *model.User, status string, offset int) (*AffiliatePayoutAdminPage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	rows, total, err := s.repo.AdminAffiliatePayouts(status, offset, 50)
	if err != nil {
		return nil, err
	}
	return &AffiliatePayoutAdminPage{Items: rows, Total: total}, nil
}

type AffiliatePayoutReview struct {
	Action string `json:"action"`
	Note   string `json:"note"`
}

func (s *Service) ReviewAffiliatePayout(actor *model.User, id string, req AffiliatePayoutReview) (*model.AffiliatePayout, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	status := ""
	switch req.Action {
	case "paid":
		status = model.AffiliatePayoutPaid
	case "reject":
		status = model.AffiliatePayoutRejected
	default:
		return nil, BadAuthRequest("操作无效")
	}
	note := strings.TrimSpace(req.Note)
	if utf8.RuneCountInString(note) > 500 {
		return nil, BadAuthRequest("备注最多 500 个字")
	}
	if status == model.AffiliatePayoutRejected && note == "" {
		return nil, BadAuthRequest("驳回时请填写原因")
	}
	payout, err := s.repo.ResolveAffiliatePayout(id, status, note, actor.ID)
	if errors.Is(err, repository.ErrCreationConflict) {
		return nil, BadAuthRequest("这笔提现已经处理过")
	}
	if err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "affiliate.payout."+req.Action, "affiliate_payout", id, "处理推广提现", map[string]any{"note": note, "amountFen": payout.AmountFen, "currency": payout.Currency}); err != nil {
		return nil, err
	}
	return payout, nil
}
