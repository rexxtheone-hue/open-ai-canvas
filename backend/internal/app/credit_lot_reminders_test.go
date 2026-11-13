package app

import (
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

func TestCreditLotExpiryRemindersSendOncePerStage(t *testing.T) {
	svc, db := newStudioTestService(t)
	now := time.Now()
	if err := db.Create(&model.User{ID: "user-a", Username: "user-a", Email: "a@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditLot{ID: "lot-a", UserID: "user-a", PaymentOrderID: "order-a", AmountMicrocredits: 5_000_000_000, RemainingMicrocredits: 3_200_000_000, ExpiresAt: now.AddDate(0, 0, 20), CreatedAt: now.AddDate(-1, 0, 0)}).Error; err != nil {
		t.Fatal(err)
	}
	// 还有 60 天才到期的积分不该提醒。
	if err := db.Create(&model.CreditLot{ID: "lot-b", UserID: "user-a", PaymentOrderID: "order-b", AmountMicrocredits: 1_000_000_000, RemainingMicrocredits: 1_000_000_000, ExpiresAt: now.AddDate(0, 0, 60), CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	var mails []string
	svc.auth.SetMailSender(func(_ auth.EmailSettingValue, to, subject, body string) error {
		mails = append(mails, to+"|"+subject+"|"+body)
		return nil
	})
	stage := func(id string) int {
		var lot model.CreditLot
		db.First(&lot, "id = ?", id)
		return lot.ExpiryReminderStage
	}

	// 邮件没配置：不发，也不记，等配置好再补发。
	svc.remindExpiringCreditLots(now)
	if len(mails) != 0 || stage("lot-a") != 0 {
		t.Fatalf("must wait for email configuration, mails=%v stage=%d", mails, stage("lot-a"))
	}

	if err := db.Create(&model.SystemSetting{Key: "email", ValueJSON: `{"enabled":true,"host":"smtp.example.com","port":587,"fromEmail":"noreply@example.com","fromName":"OmniMuse"}`}).Error; err != nil {
		t.Fatal(err)
	}
	svc.remindExpiringCreditLots(now)
	if len(mails) != 1 || stage("lot-a") != 1 || stage("lot-b") != 0 {
		t.Fatalf("expected one 30-day reminder, mails=%v stages=%d/%d", mails, stage("lot-a"), stage("lot-b"))
	}
	if !strings.HasPrefix(mails[0], "a@example.com|") || !strings.Contains(mails[0], "3,200 积分") || strings.Contains(mails[0], "1,000 积分") {
		t.Fatalf("reminder must list only the expiring lot: %s", mails[0])
	}
	svc.remindExpiringCreditLots(now.Add(time.Hour))
	if len(mails) != 1 {
		t.Fatalf("30-day reminder must not repeat, got %d mails", len(mails))
	}

	// 剩 5 天：再发一次 7 天提醒，之后不再重复。
	later := now.AddDate(0, 0, 15)
	svc.remindExpiringCreditLots(later)
	if len(mails) != 2 || stage("lot-a") != 2 {
		t.Fatalf("expected the 7-day reminder, mails=%d stage=%d", len(mails), stage("lot-a"))
	}
	svc.remindExpiringCreditLots(later.Add(time.Hour))
	if len(mails) != 2 {
		t.Fatalf("7-day reminder must not repeat, got %d mails", len(mails))
	}
}

func TestCreditLotReminderSkipsUsersWithoutEmail(t *testing.T) {
	svc, db := newStudioTestService(t)
	now := time.Now()
	db.Create(&model.User{ID: "user-b", Username: "user-b", Role: model.UserRoleUser, Status: model.UserStatusActive})
	db.Create(&model.CreditLot{ID: "lot-c", UserID: "user-b", PaymentOrderID: "order-c", AmountMicrocredits: 1_000_000_000, RemainingMicrocredits: 1_000_000_000, ExpiresAt: now.AddDate(0, 0, 3), CreatedAt: now})
	db.Create(&model.SystemSetting{Key: "email", ValueJSON: `{"enabled":true,"host":"smtp.example.com","port":587,"fromEmail":"noreply@example.com"}`})
	sent := 0
	svc.auth.SetMailSender(func(auth.EmailSettingValue, string, string, string) error { sent++; return nil })
	svc.remindExpiringCreditLots(now)
	var lot model.CreditLot
	db.First(&lot, "id = ?", "lot-c")
	if sent != 0 || lot.ExpiryReminderStage != 2 {
		t.Fatalf("no-email users are marked without sending, sent=%d stage=%d", sent, lot.ExpiryReminderStage)
	}
}
