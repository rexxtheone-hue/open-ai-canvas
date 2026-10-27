package paymentsdk

import (
	"context"
	"errors"
	"net/http"
	"time"
)

var (
	ErrOrderNotFound     = errors.New("payment provider order not found")
	ErrOrderNotPaid      = errors.New("payment provider order is not paid")
	ErrTradeBillNotFound = errors.New("payment provider trade bill not found")
)

type Config map[string]string

type Descriptor struct {
	ID                  string               `json:"id"`
	PluginID            string               `json:"pluginId"`
	PluginVersion       string               `json:"pluginVersion,omitempty"`
	Name                string               `json:"name"`
	Icon                string               `json:"icon"`
	CheckoutMode        string               `json:"checkoutMode"`
	IdentityFields      []string             `json:"identityFields,omitempty"`
	NotificationSuccess NotificationResponse `json:"notificationSuccess,omitempty"`
	NotificationFailure NotificationResponse `json:"notificationFailure,omitempty"`
}

type NotificationResponse struct {
	Status      int
	ContentType string
	Body        string
}

type CreateRequest struct {
	MerchantOrderNo string
	Description     string
	AmountFen       int64
	Currency        string
	ExpiresAt       time.Time
	NotifyURL       string
	ReturnURL       string
	// Interval 非空时创建自动续费订阅（month 或 year），首期付款成功后按周期自动扣款。
	Interval string `json:",omitempty"`
}

type Checkout struct {
	Mode      string
	Value     string
	ExpiresAt time.Time
}

type QueryRequest struct{ MerchantOrderNo string }
type CloseRequest struct{ MerchantOrderNo string }

type Result struct {
	MerchantOrderNo string    `json:"merchantOrderNo"`
	ProviderTradeNo string    `json:"providerTradeNo,omitempty"`
	ProviderStatus  string    `json:"providerStatus"`
	AmountFen       int64     `json:"amountFen"`
	Currency        string    `json:"currency"`
	Paid            bool      `json:"paid"`
	Closed          bool      `json:"closed"`
	PaidAt          time.Time `json:"paidAt,omitempty"`
	// 自动续费订阅：SubscriptionID 是渠道的订阅号；Renewal 表示这是续费扣款（ProviderTradeNo 是这期账单号）；
	// SubscriptionStatus 为 active（会自动续费）、canceling（本期结束后停止）或 ended（已结束）。
	SubscriptionID     string `json:"subscriptionId,omitempty"`
	Renewal            bool   `json:"renewal,omitempty"`
	SubscriptionStatus string `json:"subscriptionStatus,omitempty"`
}

const (
	SubscriptionActive    = "active"
	SubscriptionCanceling = "canceling"
	SubscriptionEnded     = "ended"
)

// SubscriptionRequest 管理自动续费：cancel_at_period_end 本期结束后停止，resume 恢复，cancel_now 立即停止。
type SubscriptionRequest struct {
	MerchantOrderNo string
	SubscriptionID  string
	Action          string
}

// SubscriptionManager 是支持自动续费的渠道额外实现的接口。
type SubscriptionManager interface {
	ManageSubscription(context.Context, Config, SubscriptionRequest) (Result, error)
}

type Notification struct {
	EventID string `json:"eventId"`
	Result
}

type BillRecord struct {
	MerchantOrderNo string
	ProviderTradeNo string
	ProviderStatus  string
	AmountFen       int64
	Currency        string
	PaidAt          time.Time
}

type Provider interface {
	Descriptor() Descriptor
	ValidateConfig(Config) error
	CreateOrder(context.Context, Config, CreateRequest) (Checkout, error)
	QueryOrder(context.Context, Config, QueryRequest) (Result, error)
	CloseOrder(context.Context, Config, CloseRequest) (Result, error)
	VerifyNotification(context.Context, Config, http.Header, []byte) (Notification, error)
	DownloadTradeBill(context.Context, Config, time.Time) ([]BillRecord, error)
}

type ProviderError struct {
	Code      string
	Message   string
	Temporary bool
	Cause     error
}

func (e *ProviderError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}
func (e *ProviderError) Unwrap() error { return e.Cause }
