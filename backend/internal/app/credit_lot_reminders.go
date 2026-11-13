package app

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
)

// creditLotReminderStage 返回这笔积分现在应该发到哪一档提醒：7 天内到期为 2，30 天内为 1，否则 0。
func creditLotReminderStage(lot model.CreditLot, now time.Time) int {
	switch {
	case !lot.ExpiresAt.After(now) || lot.RemainingMicrocredits <= 0:
		return 0
	case !lot.ExpiresAt.After(now.AddDate(0, 0, 7)):
		return 2
	case !lot.ExpiresAt.After(now.AddDate(0, 0, 30)):
		return 1
	}
	return 0
}

// remindExpiringCreditLots 给充值积分快到期的用户发邮件，到期前 30 天、7 天各一次。
// 后台没配置邮件时什么都不记，等配置好再补发；用户没有邮箱时只记下已处理，站内提醒照常显示。
func (s *Service) remindExpiringCreditLots(now time.Time) {
	userIDs, err := s.repo.CreditLotReminderUsers(now, 50)
	if err != nil {
		log.Printf("credit lot reminder query failed: %v", err)
		return
	}
	for _, userID := range userIDs {
		if err := s.remindUserExpiringCreditLots(userID, now); err != nil {
			if errors.Is(err, auth.ErrEmailNotConfigured) {
				return
			}
			log.Printf("credit lot reminder failed: user=%s error=%v", userID, err)
		}
	}
}

func (s *Service) remindUserExpiringCreditLots(userID string, now time.Time) error {
	lots, err := s.repo.ActiveCreditLots(userID, now)
	if err != nil {
		return err
	}
	type due struct {
		lot   model.CreditLot
		stage int
	}
	var pending []due
	for _, lot := range lots {
		if stage := creditLotReminderStage(lot, now); stage > lot.ExpiryReminderStage {
			pending = append(pending, due{lot: lot, stage: stage})
		}
	}
	if len(pending) == 0 {
		return nil
	}
	user, err := s.repo.User(userID)
	if err != nil {
		return err
	}
	if email := strings.TrimSpace(user.Email); email != "" {
		items := make([]model.CreditLot, 0, len(pending))
		for _, item := range pending {
			items = append(items, item.lot)
		}
		subject, body := creditLotReminderEmail(items, now, s.studioLink())
		if err := s.auth.SendNoticeEmail(email, subject, body); err != nil {
			return err
		}
	}
	for _, item := range pending {
		if err := s.repo.MarkCreditLotReminderStage(item.lot.ID, item.stage); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) studioLink() string {
	base, err := s.publicResourceBaseURL()
	if err != nil || base == nil {
		return ""
	}
	return strings.TrimRight(base.String(), "/") + "/studio"
}

var creditReminderZone = func() *time.Location {
	if zone, err := time.LoadLocation("Asia/Kuala_Lumpur"); err == nil {
		return zone
	}
	return time.FixedZone("UTC+8", 8*60*60)
}()

func creditLotReminderEmail(lots []model.CreditLot, now time.Time, link string) (string, string) {
	var total int64
	lines := make([]string, 0, len(lots))
	for _, lot := range lots {
		total += lot.RemainingMicrocredits
		days := int(lot.ExpiresAt.Sub(now).Hours()/24) + 1
		lines = append(lines, fmt.Sprintf("· %s 积分，%s 到期（还有 %d 天）", formatReminderCredits(lot.RemainingMicrocredits), lot.ExpiresAt.In(creditReminderZone).Format("2006-01-02"), days))
	}
	subject := fmt.Sprintf("你有 %s 积分快到期了", formatReminderCredits(total))
	body := "你好，\n\n你充值的积分快到期了：\n\n" + strings.Join(lines, "\n") +
		"\n\n到期后没用完的积分会自动清零，记得在到期前用完。"
	if link != "" {
		body += "\n\n现在去创作：" + link
	}
	body += "\n\nYour purchased credits are expiring soon. Unused credits are removed on the expiry date shown above."
	return subject, body
}

func formatReminderCredits(microcredits int64) string {
	whole := (microcredits + CreditScale/2) / CreditScale
	digits := fmt.Sprint(whole)
	var out []byte
	for index := range digits {
		if index > 0 && (len(digits)-index)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, digits[index])
	}
	return string(out)
}
