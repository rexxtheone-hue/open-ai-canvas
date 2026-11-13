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
		stage := 0
		for _, item := range pending {
			items = append(items, item.lot)
			stage = max(stage, item.stage)
		}
		if err := s.auth.SendNoticeEmail(email, creditLotReminderEmail(items, now, s.studioLink(), stage)); err != nil {
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

func creditLotReminderEmail(lots []model.CreditLot, now time.Time, link string, stage int) auth.EmailContent {
	var total int64
	soonest := lots[0]
	rows := make([]auth.EmailRow, 0, len(lots))
	for _, lot := range lots {
		total += lot.RemainingMicrocredits
		if lot.ExpiresAt.Before(soonest.ExpiresAt) {
			soonest = lot
		}
		days := int(lot.ExpiresAt.Sub(now).Hours()/24) + 1
		rows = append(rows, auth.EmailRow{
			Label: formatReminderCredits(lot.RemainingMicrocredits) + " credits",
			Value: fmt.Sprintf("Expires %s (%s left)", lot.ExpiresAt.In(creditReminderZone).Format("2 Jan 2006"), plural(days, "day")),
		})
	}
	days := int(soonest.ExpiresAt.Sub(now).Hours()/24) + 1
	content := auth.EmailContent{
		Subject:   fmt.Sprintf("Your %s credits expire in %s", formatReminderCredits(total), plural(days, "day")),
		Preheader: "Use them before " + soonest.ExpiresAt.In(creditReminderZone).Format("2 Jan 2006") + " so they don't go to waste.",
		Heading:   "Your credits are expiring soon",
		Intro: []string{
			fmt.Sprintf("You have %s purchased credits that will expire soon. Any credits you haven't used by the expiry date are removed from your account and can't be restored.", formatReminderCredits(total)),
		},
		Rows: rows,
		Body: []string{
			"Not sure what to make? Turn a product photo into a 30-second ad video, refresh your social posts with new on-brand images, or let an AI agent plan and produce a whole campaign for you.",
			"We always use the credits that expire soonest first, so anything you create now uses these credits before any others.",
		},
		Notice: "We'll remind you once more 7 days before these credits expire if they're still unused.",
	}
	if stage >= 2 {
		content.Notice = "This is your final reminder for these credits. After the expiry date, unused credits can't be restored."
	}
	if link != "" {
		content.ButtonText, content.ButtonURL = "Use my credits", link
	}
	return content
}

func plural(count int, unit string) string {
	if count == 1 {
		return "1 " + unit
	}
	return fmt.Sprintf("%d %ss", count, unit)
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
