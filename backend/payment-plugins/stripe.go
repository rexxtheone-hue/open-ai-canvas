package paymentplugins

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	ProviderStripe           = "stripe-checkout"
	PluginStripe             = "official-payment-stripe"
	defaultStripeAPIBase     = "https://api.stripe.com"
	stripeSignatureTolerance = 5 * time.Minute
	// Stripe Checkout 会话的有效期必须在创建后 30 分钟到 24 小时之间。
	stripeMinSessionLifetime = 30 * time.Minute
	stripeMaxSessionLifetime = 24 * time.Hour
	stripeOpenSessionPages   = 10
)

// Stripe 只接受与宿主 AmountFen 语义一致（最小单位为 1/100）的币种。
var stripeCurrencies = map[string]bool{"MYR": true, "USD": true, "SGD": true, "HKD": true, "EUR": true, "GBP": true, "AUD": true, "CNY": true}

// FPX 只支持马来西亚令吉。
var stripeMethodCurrencies = map[string]map[string]bool{"fpx": {"MYR": true}, "grabpay": {"MYR": true, "SGD": true}}

type StripeProvider struct {
	client  *http.Client
	now     func() time.Time
	baseURL string
}

func NewStripeProvider(client *http.Client) *StripeProvider {
	if client == nil {
		client = http.DefaultClient
	}
	return &StripeProvider{client: client, now: time.Now}
}

func (p *StripeProvider) Descriptor() Descriptor {
	return Descriptor{
		ID: ProviderStripe, PluginID: PluginStripe, PluginVersion: "1.1.0",
		Name: "Stripe（银行卡 / FPX）", Icon: "assets/icon.svg", CheckoutMode: "redirect",
		IdentityFields:      []string{"currency"},
		NotificationSuccess: NotificationResponse{Status: 200, ContentType: "application/json", Body: `{"received":true}`},
		NotificationFailure: NotificationResponse{Status: 400, ContentType: "application/json", Body: `{"received":false}`},
	}
}

func stripeCurrency(config Config) string {
	value := strings.ToUpper(strings.TrimSpace(config["currency"]))
	if value == "" {
		return "MYR"
	}
	return value
}

func stripeMethods(config Config) []string {
	raw := strings.TrimSpace(config["paymentMethods"])
	if raw == "" {
		raw = "card,fpx"
	}
	methods := []string{}
	seen := map[string]bool{}
	for _, item := range strings.Split(raw, ",") {
		item = strings.ToLower(strings.TrimSpace(item))
		if item != "" && !seen[item] {
			seen[item] = true
			methods = append(methods, item)
		}
	}
	return methods
}

func (p *StripeProvider) ValidateConfig(config Config) error {
	secret := strings.TrimSpace(config["secretKey"])
	if !strings.HasPrefix(secret, "sk_") && !strings.HasPrefix(secret, "rk_") {
		return errors.New("Stripe 配置缺少有效的 Secret key（sk_ 或 rk_ 开头）")
	}
	if !strings.HasPrefix(strings.TrimSpace(config["webhookSecret"]), "whsec_") {
		return errors.New("Stripe 配置缺少 Webhook signing secret（whsec_ 开头）")
	}
	currency := stripeCurrency(config)
	if !stripeCurrencies[currency] {
		return fmt.Errorf("Stripe 结算币种 %s 不受支持", currency)
	}
	methods := stripeMethods(config)
	if len(methods) == 0 {
		return errors.New("Stripe 至少需要一种支付方式")
	}
	for _, method := range methods {
		if allowed, limited := stripeMethodCurrencies[method]; limited && !allowed[currency] {
			return fmt.Errorf("Stripe 支付方式 %s 不支持 %s 结算", method, currency)
		}
	}
	if _, err := p.apiBase(config); err != nil {
		return err
	}
	return nil
}

func (p *StripeProvider) apiBase(config Config) (string, error) {
	if p.baseURL != "" {
		return strings.TrimRight(p.baseURL, "/"), nil
	}
	raw := strings.TrimSpace(config["apiBase"])
	if raw == "" {
		return defaultStripeAPIBase, nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() != "api.stripe.com" {
		return "", errors.New("Stripe API 地址必须是 https://api.stripe.com")
	}
	return defaultStripeAPIBase, nil
}

type stripeError struct {
	Error struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (p *StripeProvider) call(ctx context.Context, config Config, method, path string, form url.Values, idempotencyKey string, out any) error {
	base, err := p.apiBase(config)
	if err != nil {
		return err
	}
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	request, err := http.NewRequestWithContext(ctx, method, base+path, body)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(config["secretKey"]))
	request.Header.Set("Stripe-Version", "2024-06-20")
	if form != nil {
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if idempotencyKey != "" {
		request.Header.Set("Idempotency-Key", idempotencyKey)
	}
	response, err := p.client.Do(request)
	if err != nil {
		return &ProviderError{Code: "network", Message: "连接 Stripe 失败", Temporary: true, Cause: err}
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return &ProviderError{Code: "network", Message: "读取 Stripe 响应失败", Temporary: true, Cause: err}
	}
	if response.StatusCode >= 300 {
		var failure stripeError
		_ = json.Unmarshal(data, &failure)
		message := strings.TrimSpace(failure.Error.Message)
		if message == "" {
			message = fmt.Sprintf("Stripe 返回 HTTP %d", response.StatusCode)
		}
		return &ProviderError{Code: firstNonEmpty(failure.Error.Code, failure.Error.Type, "stripe_error"), Message: "Stripe：" + message, Temporary: response.StatusCode == 429 || response.StatusCode >= 500}
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return &ProviderError{Code: "invalid_response", Message: "Stripe 响应格式无效", Cause: err}
	}
	return nil
}

type stripeCheckoutSession struct {
	ID                string `json:"id"`
	URL               string `json:"url"`
	Status            string `json:"status"`
	PaymentStatus     string `json:"payment_status"`
	ClientReferenceID string `json:"client_reference_id"`
	AmountTotal       int64  `json:"amount_total"`
	Currency          string `json:"currency"`
	PaymentIntent     any    `json:"payment_intent"`
	Mode              string `json:"mode"`
	Invoice           any    `json:"invoice"`
	Subscription      any    `json:"subscription"`
	ExpiresAt         int64  `json:"expires_at"`
	Created           int64  `json:"created"`
}

func (s stripeCheckoutSession) paymentIntentID() string {
	return stripeObjectID(s.PaymentIntent)
}

// stripeObjectID 读取可能被展开成对象的 Stripe 关联字段。
func stripeObjectID(field any) string {
	switch value := field.(type) {
	case string:
		return value
	case map[string]any:
		id, _ := value["id"].(string)
		return id
	}
	return ""
}

func (p *StripeProvider) CreateOrder(ctx context.Context, config Config, request CreateRequest) (Checkout, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Checkout{}, err
	}
	currency := stripeCurrency(config)
	if request.AmountFen <= 0 || request.MerchantOrderNo == "" || request.ReturnURL == "" {
		return Checkout{}, errors.New("Stripe 下单参数无效")
	}
	if strings.ToUpper(request.Currency) != currency {
		return Checkout{}, fmt.Errorf("Stripe 渠道只支持 %s 结算", currency)
	}
	now := p.now()
	expiresAt := request.ExpiresAt
	if expiresAt.IsZero() || expiresAt.After(now.Add(stripeMaxSessionLifetime)) {
		expiresAt = now.Add(stripeMaxSessionLifetime)
	}
	if expiresAt.Before(now.Add(stripeMinSessionLifetime)) {
		return Checkout{}, errors.New("Stripe 订单有效期不能少于 30 分钟，请把未支付关闭时间设为 30 分钟以上")
	}
	name := strings.TrimSpace(request.Description)
	if name == "" {
		name = "Credits"
	}
	interval := strings.ToLower(strings.TrimSpace(request.Interval))
	if interval != "" && interval != "month" && interval != "year" {
		return Checkout{}, errors.New("Stripe 自动续费周期只支持 month 或 year")
	}
	methods := stripeMethods(config)
	form := url.Values{}
	form.Set("client_reference_id", request.MerchantOrderNo)
	form.Set("metadata[merchant_order_no]", request.MerchantOrderNo)
	if interval == "" {
		form.Set("mode", "payment")
		form.Set("payment_intent_data[metadata][merchant_order_no]", request.MerchantOrderNo)
	} else {
		// 订阅只能用可以重复扣款的银行卡，FPX 等一次性网银不支持。
		form.Set("mode", "subscription")
		form.Set("subscription_data[metadata][merchant_order_no]", request.MerchantOrderNo)
		form.Set("line_items[0][price_data][recurring][interval]", interval)
		methods = []string{"card"}
	}
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", strings.ToLower(currency))
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(request.AmountFen, 10))
	form.Set("line_items[0][price_data][product_data][name]", name)
	for index, method := range methods {
		form.Set(fmt.Sprintf("payment_method_types[%d]", index), method)
	}
	form.Set("success_url", request.ReturnURL)
	form.Set("cancel_url", request.ReturnURL)
	form.Set("expires_at", strconv.FormatInt(expiresAt.Unix(), 10))
	var session stripeCheckoutSession
	if err := p.call(ctx, config, http.MethodPost, "/v1/checkout/sessions", form, "create:"+request.MerchantOrderNo, &session); err != nil {
		return Checkout{}, err
	}
	if strings.TrimSpace(session.URL) == "" {
		return Checkout{}, errors.New("Stripe 没有返回收银台地址")
	}
	return Checkout{Mode: "redirect", Value: session.URL, ExpiresAt: time.Unix(session.ExpiresAt, 0)}, nil
}

type stripePaymentIntent struct {
	ID             string            `json:"id"`
	Status         string            `json:"status"`
	Amount         int64             `json:"amount"`
	AmountReceived int64             `json:"amount_received"`
	Currency       string            `json:"currency"`
	Created        int64             `json:"created"`
	Metadata       map[string]string `json:"metadata"`
}

type stripeList[T any] struct {
	Data    []T  `json:"data"`
	HasMore bool `json:"has_more"`
}

// findPaymentIntent 按商户订单号搜索支付意图；Stripe 搜索有约 1 分钟的索引延迟，查单由宿主定时重试。
func (p *StripeProvider) findPaymentIntent(ctx context.Context, config Config, merchantOrderNo string) (*stripePaymentIntent, error) {
	query := url.Values{}
	query.Set("query", fmt.Sprintf("metadata['merchant_order_no']:'%s'", strings.ReplaceAll(merchantOrderNo, "'", "")))
	query.Set("limit", "10")
	var list stripeList[stripePaymentIntent]
	if err := p.call(ctx, config, http.MethodGet, "/v1/payment_intents/search?"+query.Encode(), nil, "", &list); err != nil {
		return nil, err
	}
	var best *stripePaymentIntent
	for index := range list.Data {
		intent := &list.Data[index]
		if intent.Metadata["merchant_order_no"] != merchantOrderNo {
			continue
		}
		if intent.Status == "succeeded" {
			return intent, nil
		}
		if best == nil || intent.Created > best.Created {
			best = intent
		}
	}
	return best, nil
}

func stripeIntentResult(merchantOrderNo string, intent *stripePaymentIntent) Result {
	if intent == nil {
		return Result{MerchantOrderNo: merchantOrderNo, ProviderStatus: "open"}
	}
	result := Result{MerchantOrderNo: merchantOrderNo, ProviderTradeNo: intent.ID, ProviderStatus: intent.Status, AmountFen: intent.Amount, Currency: strings.ToUpper(intent.Currency)}
	if intent.Status == "succeeded" {
		result.Paid = true
		result.AmountFen = intent.AmountReceived
		result.PaidAt = time.Unix(intent.Created, 0)
	}
	if intent.Status == "canceled" {
		result.Closed = true
	}
	return result
}

func (p *StripeProvider) QueryOrder(ctx context.Context, config Config, request QueryRequest) (Result, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(request.MerchantOrderNo) == "" {
		return Result{}, errors.New("Stripe 查单缺少商户订单号")
	}
	intent, err := p.findPaymentIntent(ctx, config, request.MerchantOrderNo)
	if err != nil {
		return Result{}, err
	}
	if intent == nil {
		if result, found, err := p.querySubscriptionOrder(ctx, config, request.MerchantOrderNo); err != nil || found {
			return result, err
		}
	}
	return stripeIntentResult(request.MerchantOrderNo, intent), nil
}

// CloseOrder 让仍然打开的收银台立即过期，之后用户无法再付款；已付款时返回已支付结果。
func (p *StripeProvider) CloseOrder(ctx context.Context, config Config, request CloseRequest) (Result, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Result{}, err
	}
	merchantOrderNo := strings.TrimSpace(request.MerchantOrderNo)
	if merchantOrderNo == "" {
		return Result{}, errors.New("Stripe 关单缺少商户订单号")
	}
	session, err := p.findOpenSession(ctx, config, merchantOrderNo)
	if err != nil {
		return Result{}, err
	}
	if session != nil {
		var expired stripeCheckoutSession
		if err := p.call(ctx, config, http.MethodPost, "/v1/checkout/sessions/"+url.PathEscape(session.ID)+"/expire", url.Values{}, "", &expired); err != nil {
			return Result{}, err
		}
	}
	intent, err := p.findPaymentIntent(ctx, config, merchantOrderNo)
	if err != nil {
		return Result{}, err
	}
	if intent == nil {
		subscription, found, err := p.querySubscriptionOrder(ctx, config, merchantOrderNo)
		if err != nil {
			return Result{}, err
		}
		if found && subscription.Paid {
			return subscription, nil
		}
	}
	result := stripeIntentResult(merchantOrderNo, intent)
	if result.Paid {
		return result, nil
	}
	if intent != nil && intent.Status == "processing" {
		return Result{}, &ProviderError{Code: "processing", Message: "Stripe 付款仍在处理中，暂时不能关闭", Temporary: true}
	}
	result.Closed = true
	result.ProviderStatus = "expired"
	return result, nil
}

func (p *StripeProvider) findOpenSession(ctx context.Context, config Config, merchantOrderNo string) (*stripeCheckoutSession, error) {
	startingAfter := ""
	for page := 0; page < stripeOpenSessionPages; page++ {
		query := url.Values{}
		query.Set("status", "open")
		query.Set("limit", "100")
		if startingAfter != "" {
			query.Set("starting_after", startingAfter)
		}
		var list stripeList[stripeCheckoutSession]
		if err := p.call(ctx, config, http.MethodGet, "/v1/checkout/sessions?"+query.Encode(), nil, "", &list); err != nil {
			return nil, err
		}
		for index := range list.Data {
			if list.Data[index].ClientReferenceID == merchantOrderNo {
				return &list.Data[index], nil
			}
		}
		if !list.HasMore || len(list.Data) == 0 {
			return nil, nil
		}
		startingAfter = list.Data[len(list.Data)-1].ID
	}
	return nil, nil
}

type stripeEvent struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Created int64  `json:"created"`
	Data    struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

// verifyStripeSignature 按 Stripe 文档校验 Stripe-Signature：t=时间戳,v1=HMAC-SHA256(时间戳.原文)。
func verifyStripeSignature(header string, body []byte, secret string, now time.Time) error {
	var timestamp string
	signatures := []string{}
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			timestamp = value
		case "v1":
			signatures = append(signatures, value)
		}
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || len(signatures) == 0 {
		return errors.New("Stripe 签名头格式无效")
	}
	signedAt := time.Unix(seconds, 0)
	if now.Sub(signedAt) > stripeSignatureTolerance || signedAt.Sub(now) > stripeSignatureTolerance {
		return errors.New("Stripe 通知时间戳超出允许范围")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	for _, signature := range signatures {
		if hmac.Equal([]byte(expected), []byte(signature)) {
			return nil
		}
	}
	return errors.New("Stripe 通知签名无效")
}

func (p *StripeProvider) VerifyNotification(_ context.Context, config Config, headers http.Header, rawBody []byte) (Notification, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Notification{}, err
	}
	if err := verifyStripeSignature(headers.Get("Stripe-Signature"), rawBody, strings.TrimSpace(config["webhookSecret"]), p.now()); err != nil {
		return Notification{}, err
	}
	var event stripeEvent
	if err := json.Unmarshal(rawBody, &event); err != nil || event.ID == "" {
		return Notification{}, errors.New("Stripe 通知内容无效")
	}
	var result Result
	var err error
	switch {
	case strings.HasPrefix(event.Type, "checkout.session."):
		result, err = stripeSessionEventResult(event)
	case event.Type == "invoice.paid":
		result, err = stripeInvoiceEventResult(event)
	case event.Type == "customer.subscription.updated" || event.Type == "customer.subscription.deleted":
		result, err = stripeSubscriptionEventResult(event)
	default:
		return Notification{}, fmt.Errorf("Stripe 事件 %s 不需要处理，请在 Webhook 中只订阅 checkout.session、invoice.paid 和 customer.subscription 事件", event.Type)
	}
	if err != nil {
		return Notification{}, err
	}
	return Notification{EventID: event.ID, Result: result}, nil
}

func stripeSessionEventResult(event stripeEvent) (Result, error) {
	var session stripeCheckoutSession
	if err := json.Unmarshal(event.Data.Object, &session); err != nil {
		return Result{}, errors.New("Stripe 通知内容无效")
	}
	merchantOrderNo := strings.TrimSpace(session.ClientReferenceID)
	if merchantOrderNo == "" {
		return Result{}, errors.New("Stripe 通知缺少订单号")
	}
	tradeNo := session.paymentIntentID()
	if session.Mode == "subscription" {
		// 订阅的首期付款以账单号作为交易号，和 invoice.paid 通知一致。
		tradeNo = stripeObjectID(session.Invoice)
	}
	result := Result{
		MerchantOrderNo: merchantOrderNo, ProviderTradeNo: tradeNo, ProviderStatus: event.Type + ":" + session.PaymentStatus,
		AmountFen: session.AmountTotal, Currency: strings.ToUpper(session.Currency), SubscriptionID: stripeObjectID(session.Subscription),
	}
	switch event.Type {
	case "checkout.session.completed", "checkout.session.async_payment_succeeded":
		// FPX 等异步支付在 completed 时可能仍是 unpaid，要等 async_payment_succeeded。
		if session.PaymentStatus == "paid" && tradeNo != "" {
			result.Paid = true
			result.PaidAt = time.Unix(event.Created, 0)
		}
	case "checkout.session.expired", "checkout.session.async_payment_failed":
		result.Closed = true
	default:
		return Result{}, fmt.Errorf("Stripe 事件 %s 不需要处理", event.Type)
	}
	return result, nil
}

type stripeInvoice struct {
	ID                  string `json:"id"`
	Status              string `json:"status"`
	AmountPaid          int64  `json:"amount_paid"`
	Currency            string `json:"currency"`
	BillingReason       string `json:"billing_reason"`
	Subscription        any    `json:"subscription"`
	Created             int64  `json:"created"`
	SubscriptionDetails struct {
		Metadata map[string]string `json:"metadata"`
	} `json:"subscription_details"`
	// 2025 年以后的 API 版本把订阅信息放在 parent 里。
	Parent struct {
		SubscriptionDetails struct {
			Subscription any               `json:"subscription"`
			Metadata     map[string]string `json:"metadata"`
		} `json:"subscription_details"`
	} `json:"parent"`
}

func (invoice stripeInvoice) subscriptionID() string {
	return firstNonEmpty(stripeObjectID(invoice.Subscription), stripeObjectID(invoice.Parent.SubscriptionDetails.Subscription))
}

func (invoice stripeInvoice) merchantOrderNo() string {
	return strings.TrimSpace(firstNonEmpty(invoice.SubscriptionDetails.Metadata["merchant_order_no"], invoice.Parent.SubscriptionDetails.Metadata["merchant_order_no"]))
}

func stripeInvoiceEventResult(event stripeEvent) (Result, error) {
	var invoice stripeInvoice
	if err := json.Unmarshal(event.Data.Object, &invoice); err != nil || invoice.ID == "" {
		return Result{}, errors.New("Stripe 通知内容无效")
	}
	merchantOrderNo := invoice.merchantOrderNo()
	if merchantOrderNo == "" || invoice.subscriptionID() == "" {
		return Result{}, errors.New("Stripe 账单通知缺少订阅订单号")
	}
	result := Result{
		MerchantOrderNo: merchantOrderNo, ProviderTradeNo: invoice.ID, ProviderStatus: event.Type + ":" + invoice.BillingReason,
		AmountFen: invoice.AmountPaid, Currency: strings.ToUpper(invoice.Currency), SubscriptionID: invoice.subscriptionID(),
		Paid: true, PaidAt: time.Unix(event.Created, 0),
	}
	switch invoice.BillingReason {
	case "subscription_create":
	case "subscription_cycle":
		result.Renewal = true
	default:
		// 改价、补差价等账单不对应新的会员周期，只记录不入账。
		result.Paid = false
	}
	return result, nil
}

type stripeSubscription struct {
	ID                string            `json:"id"`
	Status            string            `json:"status"`
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	Metadata          map[string]string `json:"metadata"`
}

func (subscription stripeSubscription) hostStatus() string {
	switch subscription.Status {
	case "canceled", "incomplete_expired", "unpaid":
		return SubscriptionEnded
	}
	if subscription.CancelAtPeriodEnd {
		return SubscriptionCanceling
	}
	return SubscriptionActive
}

func stripeSubscriptionEventResult(event stripeEvent) (Result, error) {
	var subscription stripeSubscription
	if err := json.Unmarshal(event.Data.Object, &subscription); err != nil || subscription.ID == "" {
		return Result{}, errors.New("Stripe 通知内容无效")
	}
	merchantOrderNo := strings.TrimSpace(subscription.Metadata["merchant_order_no"])
	if merchantOrderNo == "" {
		return Result{}, errors.New("Stripe 订阅通知缺少订单号")
	}
	status := subscription.hostStatus()
	if event.Type == "customer.subscription.deleted" {
		status = SubscriptionEnded
	}
	return Result{MerchantOrderNo: merchantOrderNo, ProviderStatus: event.Type + ":" + subscription.Status, SubscriptionID: subscription.ID, SubscriptionStatus: status}, nil
}

// querySubscriptionOrder 按商户订单号查找订阅，返回首期账单的支付结果。
func (p *StripeProvider) querySubscriptionOrder(ctx context.Context, config Config, merchantOrderNo string) (Result, bool, error) {
	query := url.Values{}
	query.Set("query", fmt.Sprintf("metadata['merchant_order_no']:'%s'", strings.ReplaceAll(merchantOrderNo, "'", "")))
	query.Set("limit", "10")
	var list stripeList[stripeSubscription]
	if err := p.call(ctx, config, http.MethodGet, "/v1/subscriptions/search?"+query.Encode(), nil, "", &list); err != nil {
		return Result{}, false, err
	}
	for _, subscription := range list.Data {
		if subscription.Metadata["merchant_order_no"] != merchantOrderNo {
			continue
		}
		invoices := url.Values{}
		invoices.Set("subscription", subscription.ID)
		invoices.Set("limit", "100")
		var invoiceList stripeList[stripeInvoice]
		if err := p.call(ctx, config, http.MethodGet, "/v1/invoices?"+invoices.Encode(), nil, "", &invoiceList); err != nil {
			return Result{}, false, err
		}
		result := Result{MerchantOrderNo: merchantOrderNo, ProviderStatus: "subscription:" + subscription.Status, SubscriptionID: subscription.ID, SubscriptionStatus: subscription.hostStatus()}
		for _, invoice := range invoiceList.Data {
			if invoice.BillingReason == "subscription_create" && invoice.Status == "paid" {
				result.ProviderTradeNo, result.AmountFen, result.Currency = invoice.ID, invoice.AmountPaid, strings.ToUpper(invoice.Currency)
				result.Paid, result.PaidAt = true, time.Unix(invoice.Created, 0)
			}
		}
		return result, true, nil
	}
	return Result{}, false, nil
}

// ManageSubscription 取消或恢复自动续费。
func (p *StripeProvider) ManageSubscription(ctx context.Context, config Config, request SubscriptionRequest) (Result, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Result{}, err
	}
	id := strings.TrimSpace(request.SubscriptionID)
	if !strings.HasPrefix(id, "sub_") {
		return Result{}, errors.New("Stripe 订阅号无效")
	}
	var subscription stripeSubscription
	path := "/v1/subscriptions/" + url.PathEscape(id)
	var err error
	switch request.Action {
	case "cancel_at_period_end", "resume":
		form := url.Values{}
		form.Set("cancel_at_period_end", strconv.FormatBool(request.Action == "cancel_at_period_end"))
		err = p.call(ctx, config, http.MethodPost, path, form, "", &subscription)
	case "cancel_now":
		err = p.call(ctx, config, http.MethodDelete, path, nil, "", &subscription)
	default:
		return Result{}, fmt.Errorf("不支持的订阅操作 %q", request.Action)
	}
	if err != nil {
		return Result{}, err
	}
	merchantOrderNo := firstNonEmpty(subscription.Metadata["merchant_order_no"], request.MerchantOrderNo)
	return Result{MerchantOrderNo: merchantOrderNo, ProviderStatus: "subscription:" + subscription.Status, SubscriptionID: subscription.ID, SubscriptionStatus: subscription.hostStatus()}, nil
}

func (p *StripeProvider) DownloadTradeBill(context.Context, Config, time.Time) ([]BillRecord, error) {
	return nil, fmt.Errorf("%w: Stripe 对账请在 Stripe 后台导出 Balance 报表", ErrTradeBillNotFound)
}
