package auth

import (
	"regexp"
	"strings"
	"testing"
)

var platformBrandPattern = regexp.MustCompile(`(?i)omnimuse`)

func TestEmailTemplatesRenderTenantBrand(t *testing.T) {
	agency := EmailBrand{Name: "Acme Studio", AccentColor: "#2f6fed", SiteURL: "https://studio.acme.com/"}
	messages := []EmailMessage{
		registrationEmail(agency, "123456"),
		passwordResetEmail(agency, "123456"),
		identityVerificationEmail(agency, "123456"),
		emailChangeCodeEmail(agency, "123456"),
		emailChangedEmail(agency),
		renderEmail(agency, EmailContent{Subject: "Credits", Heading: "Hi", ButtonText: "Open", ButtonURL: "https://studio.acme.com/studio"}),
	}
	for index, msg := range messages {
		all := msg.Subject + msg.Text + msg.HTML
		if n := len(platformBrandPattern.FindAllString(all, -1)); n != 0 {
			t.Fatalf("message %d leaks the platform brand %d times", index, n)
		}
		if !strings.Contains(msg.Text, "The Acme Studio team") || !strings.Contains(msg.HTML, "Acme Studio") {
			t.Fatalf("message %d does not carry the tenant brand: %s", index, msg.Text)
		}
		if !strings.Contains(msg.HTML, "#2f6fed") || strings.Contains(msg.HTML, "#c13cff") || strings.Contains(msg.HTML, "#d65cff") {
			t.Fatalf("message %d does not use the tenant accent colour", index)
		}
		if !strings.Contains(msg.HTML, `href="https://studio.acme.com"`) {
			t.Fatalf("message %d has no link to the tenant site", index)
		}
	}
}

func TestPlatformEmailKeepsOriginalLook(t *testing.T) {
	msg := registrationEmail(EmailBrand{Name: DefaultBrandName, IsPlatform: true}, "123456")
	if !strings.Contains(msg.HTML, "#d65cff") || !strings.Contains(msg.HTML, "#f7effc") || !strings.Contains(msg.Text, "The OmniMuse team") {
		t.Fatal("platform email must keep its original palette and brand")
	}
	if strings.Contains(msg.HTML, "<br><a href=") {
		t.Fatal("platform email footer must not change")
	}
}

func TestApplyEmailBrandSender(t *testing.T) {
	base := EmailSettingValue{FromEmail: "noreply@platform.example", FromName: "OmniMuse Team"}
	if got := applyEmailBrand(base, EmailBrand{Name: "OmniMuse", IsPlatform: true}); got.FromName != "OmniMuse Team" || got.FromEmail != "noreply@platform.example" {
		t.Fatalf("platform sender = %+v", got)
	}
	if got := applyEmailBrand(base, EmailBrand{Name: "Acme Studio"}); got.FromName != "Acme Studio" || got.FromEmail != "noreply@platform.example" {
		t.Fatalf("agency default sender = %+v", got)
	}
	if got := applyEmailBrand(base, EmailBrand{Name: "Acme Studio", FromName: "Acme Support", FromEmail: "Hello@Acme.com"}); got.FromName != "Acme Support" || got.FromEmail != "hello@acme.com" {
		t.Fatalf("agency custom sender = %+v", got)
	}
	if got := applyEmailBrand(base, EmailBrand{Name: "Acme Studio", FromName: "bad\r\nBcc: x", FromEmail: "not-an-email"}); got.FromName != "Acme Studio" || got.FromEmail != "noreply@platform.example" {
		t.Fatalf("unsafe sender must be ignored, got %+v", got)
	}
}
