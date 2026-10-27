package paymentplugins

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func stripeTestConfig() Config {
	return Config{"secretKey": "sk_test_123", "webhookSecret": "whsec_abc", "currency": "myr", "paymentMethods": "card,fpx", "publicBaseUrl": "https://studio.example"}
}

func TestStripeValidateConfig(t *testing.T) {
	provider := NewStripeProvider(nil)
	if err := provider.ValidateConfig(stripeTestConfig()); err != nil {
		t.Fatal(err)
	}
	bad := []Config{
		{"secretKey": "pk_test", "webhookSecret": "whsec_x"},
		{"secretKey": "sk_test", "webhookSecret": "nope"},
		{"secretKey": "sk_test", "webhookSecret": "whsec_x", "currency": "JPY"},
		{"secretKey": "sk_test", "webhookSecret": "whsec_x", "currency": "USD", "paymentMethods": "card,fpx"},
		{"secretKey": "sk_test", "webhookSecret": "whsec_x", "apiBase": "https://evil.example"},
	}
	for _, config := range bad {
		if err := provider.ValidateConfig(config); err == nil {
			t.Fatalf("expected error for %v", config)
		}
	}
}

func TestStripeCreateOrderBuildsCheckoutSession(t *testing.T) {
	var form url.Values
	var idempotency, auth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		form, _ = url.ParseQuery(string(body))
		idempotency, auth = r.Header.Get("Idempotency-Key"), r.Header.Get("Authorization")
		fmt.Fprint(w, `{"id":"cs_1","url":"https://checkout.stripe.com/c/pay/cs_1","expires_at":1900000000}`)
	}))
	defer server.Close()
	now := time.Unix(1_800_000_000, 0)
	provider := NewStripeProvider(server.Client())
	provider.baseURL, provider.now = server.URL, func() time.Time { return now }
	checkout, err := provider.CreateOrder(context.Background(), stripeTestConfig(), CreateRequest{MerchantOrderNo: "m1", Description: "Pro 月度", AmountFen: 2990, Currency: "MYR", ExpiresAt: now.Add(48 * time.Hour), ReturnURL: "https://studio.example/api/payments/return/stripe-checkout?orderId=o1"})
	if err != nil {
		t.Fatal(err)
	}
	if checkout.Mode != "redirect" || checkout.Value != "https://checkout.stripe.com/c/pay/cs_1" {
		t.Fatalf("unexpected checkout %+v", checkout)
	}
	want := map[string]string{
		"mode": "payment", "client_reference_id": "m1", "payment_intent_data[metadata][merchant_order_no]": "m1",
		"line_items[0][price_data][currency]": "myr", "line_items[0][price_data][unit_amount]": "2990",
		"payment_method_types[0]": "card", "payment_method_types[1]": "fpx",
		"expires_at": strconv.FormatInt(now.Add(24*time.Hour).Unix(), 10),
	}
	for key, value := range want {
		if form.Get(key) != value {
			t.Fatalf("%s = %q, want %q", key, form.Get(key), value)
		}
	}
	if idempotency != "create:m1" || auth != "Bearer sk_test_123" {
		t.Fatalf("headers idempotency=%q auth=%q", idempotency, auth)
	}
	if _, err := provider.CreateOrder(context.Background(), stripeTestConfig(), CreateRequest{MerchantOrderNo: "m2", AmountFen: 100, Currency: "CNY", ReturnURL: "https://x"}); err == nil {
		t.Fatal("currency mismatch must be rejected")
	}
	if _, err := provider.CreateOrder(context.Background(), stripeTestConfig(), CreateRequest{MerchantOrderNo: "m3", AmountFen: 100, Currency: "MYR", ReturnURL: "https://x", ExpiresAt: now.Add(10 * time.Minute)}); err == nil {
		t.Fatal("sessions shorter than 30 minutes must be rejected")
	}
}

func TestStripeQueryAndCloseOrder(t *testing.T) {
	expired := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/v1/payment_intents/search"):
			if strings.Contains(r.URL.Query().Get("query"), "paid-order") {
				fmt.Fprint(w, `{"data":[{"id":"pi_old","status":"canceled","amount":2990,"currency":"myr","created":1,"metadata":{"merchant_order_no":"paid-order"}},{"id":"pi_1","status":"succeeded","amount":2990,"amount_received":2990,"currency":"myr","created":2,"metadata":{"merchant_order_no":"paid-order"}}]}`)
				return
			}
			fmt.Fprint(w, `{"data":[]}`)
		case strings.HasPrefix(r.URL.Path, "/v1/subscriptions/search"):
			fmt.Fprint(w, `{"data":[]}`)
		case r.URL.Path == "/v1/checkout/sessions":
			fmt.Fprint(w, `{"data":[{"id":"cs_other","client_reference_id":"x"},{"id":"cs_open","client_reference_id":"open-order"}],"has_more":false}`)
		case r.URL.Path == "/v1/checkout/sessions/cs_open/expire":
			expired = true
			fmt.Fprint(w, `{"id":"cs_open","status":"expired"}`)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	provider := NewStripeProvider(server.Client())
	provider.baseURL = server.URL
	paid, err := provider.QueryOrder(context.Background(), stripeTestConfig(), QueryRequest{MerchantOrderNo: "paid-order"})
	if err != nil || !paid.Paid || paid.ProviderTradeNo != "pi_1" || paid.AmountFen != 2990 || paid.Currency != "MYR" {
		t.Fatalf("unexpected paid result %+v %v", paid, err)
	}
	open, err := provider.QueryOrder(context.Background(), stripeTestConfig(), QueryRequest{MerchantOrderNo: "open-order"})
	if err != nil || open.Paid || open.Closed {
		t.Fatalf("unpaid order must stay open: %+v %v", open, err)
	}
	closed, err := provider.CloseOrder(context.Background(), stripeTestConfig(), CloseRequest{MerchantOrderNo: "open-order"})
	if err != nil || !closed.Closed || !expired {
		t.Fatalf("close must expire the open session: %+v expired=%v %v", closed, expired, err)
	}
	stillPaid, err := provider.CloseOrder(context.Background(), stripeTestConfig(), CloseRequest{MerchantOrderNo: "paid-order"})
	if err != nil || !stillPaid.Paid || stillPaid.Closed {
		t.Fatalf("closing a paid order must report paid: %+v %v", stillPaid, err)
	}
}

func signStripe(body string, secret string, at time.Time) string {
	timestamp := strconv.FormatInt(at.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + body))
	return "t=" + timestamp + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func TestStripeVerifyNotification(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	provider := NewStripeProvider(nil)
	provider.now = func() time.Time { return now }
	event := func(kind, paymentStatus string) string {
		return fmt.Sprintf(`{"id":"evt_%s_%s","type":"%s","created":1800000000,"data":{"object":{"id":"cs_1","client_reference_id":"m1","payment_status":"%s","amount_total":2990,"currency":"myr","payment_intent":"pi_1"}}}`, kind, paymentStatus, kind, paymentStatus)
	}
	headers := func(signature string) http.Header {
		header := http.Header{}
		header.Set("Stripe-Signature", signature)
		return header
	}
	body := event("checkout.session.completed", "paid")
	note, err := provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(signStripe(body, "whsec_abc", now)), []byte(body))
	if err != nil || !note.Paid || note.MerchantOrderNo != "m1" || note.ProviderTradeNo != "pi_1" || note.Currency != "MYR" || note.AmountFen != 2990 {
		t.Fatalf("unexpected paid notification %+v %v", note, err)
	}
	pending := event("checkout.session.completed", "unpaid")
	note, err = provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(signStripe(pending, "whsec_abc", now)), []byte(pending))
	if err != nil || note.Paid || note.Closed {
		t.Fatalf("async FPX completion must not credit yet: %+v %v", note, err)
	}
	if _, err := provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(signStripe(body, "whsec_wrong", now)), []byte(body)); err == nil {
		t.Fatal("wrong secret must be rejected")
	}
	if _, err := provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(signStripe(body, "whsec_abc", now.Add(-10*time.Minute))), []byte(body)); err == nil {
		t.Fatal("stale signature must be rejected")
	}
	tampered := strings.Replace(body, "2990", "1", 1)
	if _, err := provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(signStripe(body, "whsec_abc", now)), []byte(tampered)); err == nil {
		t.Fatal("tampered body must be rejected")
	}
	expiredBody := event("checkout.session.expired", "unpaid")
	note, err = provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(signStripe(expiredBody, "whsec_abc", now)), []byte(expiredBody))
	if err != nil || !note.Closed {
		t.Fatalf("expired session must close the order: %+v %v", note, err)
	}
}

func TestStripeSubscriptionCheckoutAndEvents(t *testing.T) {
	var form url.Values
	var method, path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		form, _ = url.ParseQuery(string(body))
		method, path = r.Method, r.URL.Path
		if strings.HasPrefix(r.URL.Path, "/v1/subscriptions/") {
			fmt.Fprint(w, `{"id":"sub_1","status":"active","cancel_at_period_end":true,"metadata":{"merchant_order_no":"m1"}}`)
			return
		}
		fmt.Fprint(w, `{"id":"cs_1","url":"https://checkout.stripe.com/c/pay/cs_1","expires_at":1900000000}`)
	}))
	defer server.Close()
	now := time.Unix(1_800_000_000, 0)
	provider := NewStripeProvider(server.Client())
	provider.baseURL, provider.now = server.URL, func() time.Time { return now }
	if _, err := provider.CreateOrder(context.Background(), stripeTestConfig(), CreateRequest{MerchantOrderNo: "m1", Description: "Pro 年付", AmountFen: 199900, Currency: "MYR", ExpiresAt: now.Add(time.Hour), ReturnURL: "https://x", Interval: "year"}); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"mode": "subscription", "subscription_data[metadata][merchant_order_no]": "m1", "line_items[0][price_data][recurring][interval]": "year", "payment_method_types[0]": "card", "payment_method_types[1]": ""}
	for key, value := range want {
		if form.Get(key) != value {
			t.Fatalf("%s = %q, want %q", key, form.Get(key), value)
		}
	}
	if form.Get("payment_intent_data[metadata][merchant_order_no]") != "" {
		t.Fatal("subscription checkout must not send payment_intent_data")
	}
	headers := func(body string) http.Header {
		header := http.Header{}
		header.Set("Stripe-Signature", signStripe(body, "whsec_abc", now))
		return header
	}
	session := `{"id":"evt_s","type":"checkout.session.completed","created":1800000000,"data":{"object":{"id":"cs_1","mode":"subscription","client_reference_id":"m1","payment_status":"paid","amount_total":199900,"currency":"myr","payment_intent":null,"invoice":"in_1","subscription":"sub_1"}}}`
	note, err := provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(session), []byte(session))
	if err != nil || !note.Paid || note.ProviderTradeNo != "in_1" || note.SubscriptionID != "sub_1" || note.Renewal {
		t.Fatalf("unexpected subscription checkout notification %+v %v", note, err)
	}
	renewal := `{"id":"evt_r","type":"invoice.paid","created":1800000000,"data":{"object":{"id":"in_2","status":"paid","amount_paid":199900,"currency":"myr","billing_reason":"subscription_cycle","subscription":"sub_1","subscription_details":{"metadata":{"merchant_order_no":"m1"}}}}}`
	note, err = provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(renewal), []byte(renewal))
	if err != nil || !note.Paid || !note.Renewal || note.ProviderTradeNo != "in_2" || note.MerchantOrderNo != "m1" {
		t.Fatalf("unexpected renewal notification %+v %v", note, err)
	}
	newShape := `{"id":"evt_n","type":"invoice.paid","created":1800000000,"data":{"object":{"id":"in_3","status":"paid","amount_paid":199900,"currency":"myr","billing_reason":"subscription_cycle","parent":{"subscription_details":{"subscription":"sub_1","metadata":{"merchant_order_no":"m1"}}}}}}`
	note, err = provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(newShape), []byte(newShape))
	if err != nil || !note.Renewal || note.SubscriptionID != "sub_1" {
		t.Fatalf("newer invoice shape must be understood %+v %v", note, err)
	}
	deleted := `{"id":"evt_d","type":"customer.subscription.deleted","created":1800000000,"data":{"object":{"id":"sub_1","status":"canceled","metadata":{"merchant_order_no":"m1"}}}}`
	note, err = provider.VerifyNotification(context.Background(), stripeTestConfig(), headers(deleted), []byte(deleted))
	if err != nil || note.Paid || note.SubscriptionStatus != SubscriptionEnded {
		t.Fatalf("unexpected deletion notification %+v %v", note, err)
	}
	result, err := provider.ManageSubscription(context.Background(), stripeTestConfig(), SubscriptionRequest{SubscriptionID: "sub_1", Action: "cancel_at_period_end"})
	if err != nil || method != http.MethodPost || path != "/v1/subscriptions/sub_1" || form.Get("cancel_at_period_end") != "true" || result.SubscriptionStatus != SubscriptionCanceling {
		t.Fatalf("cancel request %s %s %v -> %+v %v", method, path, form, result, err)
	}
}
