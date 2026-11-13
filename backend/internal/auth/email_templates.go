package auth

import (
	"encoding/base64"
	"html"
	"mime"
	"strings"
	"time"

	"yingce/backend/internal/kernel"
)

// EmailMessage 是一封邮件的标题、纯文本和 HTML 两个版本；邮件客户端不显示 HTML 时用纯文本。
type EmailMessage struct {
	Subject string
	Text    string
	HTML    string
}

// EmailRow 是邮件里的一行明细，例如「3,200 credits · expires 2026-12-03」。
type EmailRow struct {
	Label string
	Value string
}

// EmailContent 描述一封品牌样式邮件：标题、正文段落、可选的验证码/明细/按钮，以及结尾说明。
type EmailContent struct {
	Subject    string
	Preheader  string
	Heading    string
	Intro      []string
	Code       string
	CodeNote   string
	Rows       []EmailRow
	ButtonText string
	ButtonURL  string
	Body       []string
	Notice     string
}

const emailCodeTTLText = "This code expires in 10 minutes."

func registrationEmail(brand, code string) EmailMessage {
	return renderEmail(brand, EmailContent{
		Subject:   code + " is your " + brand + " verification code",
		Preheader: "Use this code to finish creating your " + brand + " account.",
		Heading:   "Verify your email",
		Intro:     []string{"Welcome to " + brand + "! Enter the code below to confirm your email address and finish creating your account."},
		Code:      code,
		CodeNote:  emailCodeTTLText,
		Body: []string{
			"Once you're in, you can turn a product photo into a ready-to-post ad video, create on-brand images, clone your voice for voiceovers, and plan a whole campaign with our AI agents. Your free sign-up credits will be waiting in your account.",
		},
		Notice: "Didn't try to sign up? You can safely ignore this email and no account will be created. Never share this code with anyone. Our team will never ask you for it.",
	})
}

func passwordResetEmail(brand, code string) EmailMessage {
	return renderEmail(brand, EmailContent{
		Subject:   code + " is your " + brand + " password reset code",
		Preheader: "Use this code to reset your " + brand + " password.",
		Heading:   "Reset your password",
		Intro:     []string{"We received a request to reset the password for your " + brand + " account. Enter the code below to choose a new password."},
		Code:      code,
		CodeNote:  emailCodeTTLText,
		Body: []string{
			"After you reset your password, you'll be signed out on all devices and can sign in again with your new password.",
		},
		Notice: "Didn't request a password reset? Ignore this email and your password will stay the same. If you keep getting these emails, someone may be trying to access your account, so make sure your email account is secure. Never share this code with anyone.",
	})
}

func identityVerificationEmail(brand, code string) EmailMessage {
	return renderEmail(brand, EmailContent{
		Subject:   code + " is your " + brand + " verification code",
		Preheader: "Use this code to confirm it's you.",
		Heading:   "Confirm it's you",
		Intro:     []string{"Enter the code below in " + brand + " to confirm it's you and continue."},
		Code:      code,
		CodeNote:  emailCodeTTLText + " It can only be used once.",
		Notice:    "Didn't request this code? Someone may have entered your email address by mistake, and you can ignore this email. If you didn't try to sign in, we recommend changing your password. Never share this code with anyone. Our team will never ask you for it.",
	})
}

func emailChangeCodeEmail(brand, code string) EmailMessage {
	return renderEmail(brand, EmailContent{
		Subject:   code + " is your code to confirm your new email",
		Preheader: "Confirm this address for your " + brand + " account.",
		Heading:   "Confirm your new email address",
		Intro:     []string{"You asked to use this email address for your " + brand + " account. Enter the code below to confirm the change."},
		Code:      code,
		CodeNote:  emailCodeTTLText,
		Body: []string{
			"Once confirmed, we'll send account notices, receipts and sign-in codes to this address.",
		},
		Notice: "Didn't request this change? Ignore this email and your account will stay as it is. Never share this code with anyone.",
	})
}

func emailChangedEmail(brand string) EmailMessage {
	return renderEmail(brand, EmailContent{
		Subject:   "The email address on your " + brand + " account was changed",
		Preheader: "Your account email was changed and you've been signed out everywhere.",
		Heading:   "Your email address was changed",
		Intro: []string{
			"The email address on your " + brand + " account was changed successfully. From now on, account notices and sign-in codes will go to your new address.",
			"For your security, you've been signed out on all devices. Sign in again with your new email address to continue.",
		},
		Notice: "Didn't make this change? Your account may have been accessed by someone else. Reset your password right away and contact us so we can help secure your account.",
	})
}

// buildEmailMIME 生成 multipart/alternative 邮件：纯文本 + HTML，正文用 base64 编码，避免长行被截断。
func buildEmailMIME(from, recipient string, msg EmailMessage) string {
	boundary := "omni-" + kernel.NewID()
	var b strings.Builder
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + recipient + "\r\n")
	b.WriteString("Subject: " + mime.QEncoding.Encode("UTF-8", msg.Subject) + "\r\n")
	b.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	if msg.HTML == "" {
		b.WriteString("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrapBase64(msg.Text))
		return b.String()
	}
	b.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n\r\n")
	for _, part := range []struct{ kind, body string }{{"text/plain", msg.Text}, {"text/html", msg.HTML}} {
		b.WriteString("--" + boundary + "\r\n")
		b.WriteString("Content-Type: " + part.kind + "; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrapBase64(part.body))
	}
	b.WriteString("--" + boundary + "--\r\n")
	return b.String()
}

func wrapBase64(value string) string {
	encoded := base64.StdEncoding.EncodeToString([]byte(value))
	var b strings.Builder
	for len(encoded) > 76 {
		b.WriteString(encoded[:76] + "\r\n")
		encoded = encoded[76:]
	}
	b.WriteString(encoded + "\r\n")
	return b.String()
}

// renderEmail 生成纯文本和 HTML 两个版本。HTML 只用内联样式和表格布局，兼容 Gmail、Outlook 和手机邮箱。
func renderEmail(brand string, content EmailContent) EmailMessage {
	var text strings.Builder
	text.WriteString(content.Heading + "\n\n")
	for _, line := range content.Intro {
		text.WriteString(line + "\n\n")
	}
	if content.Code != "" {
		text.WriteString("Your verification code: " + content.Code + "\n")
		if content.CodeNote != "" {
			text.WriteString(content.CodeNote + "\n")
		}
		text.WriteString("\n")
	}
	for _, row := range content.Rows {
		text.WriteString("- " + row.Label + ": " + row.Value + "\n")
	}
	if len(content.Rows) > 0 {
		text.WriteString("\n")
	}
	if content.ButtonText != "" && content.ButtonURL != "" {
		text.WriteString(content.ButtonText + ": " + content.ButtonURL + "\n\n")
	}
	for _, line := range content.Body {
		text.WriteString(line + "\n\n")
	}
	if content.Notice != "" {
		text.WriteString(content.Notice + "\n\n")
	}
	text.WriteString("- The " + brand + " team\n")

	esc := html.EscapeString
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>` + esc(content.Subject) + `</title></head>`)
	b.WriteString(`<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d21;">`)
	if content.Preheader != "" {
		b.WriteString(`<div style="display:none;max-height:0;overflow:hidden;opacity:0;">` + esc(content.Preheader) + `</div>`)
	}
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;"><tr><td align="center" style="padding:32px 16px;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">`)
	b.WriteString(`<tr><td style="background:#0b0b0d;border-radius:16px 16px 0 0;padding:22px 32px;"><span style="font-size:20px;font-weight:700;letter-spacing:0.02em;color:#ffffff;">` + esc(brand) + `</span><span style="display:inline-block;width:8px;height:8px;margin-left:6px;border-radius:50%;background:#d65cff;"></span></td></tr>`)
	b.WriteString(`<tr><td style="background:#ffffff;padding:36px 32px 28px;border-radius:0 0 16px 16px;">`)
	b.WriteString(`<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#111114;">` + esc(content.Heading) + `</h1>`)
	for _, line := range content.Intro {
		b.WriteString(`<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3a42;">` + esc(line) + `</p>`)
	}
	if content.Code != "" {
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td align="center" style="background:#f7effc;border:1px solid #ecd2fb;border-radius:12px;padding:22px 16px;">`)
		b.WriteString(`<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a4bab;margin-bottom:8px;">Your verification code</div>`)
		b.WriteString(`<div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.28em;color:#111114;">` + esc(content.Code) + `</div>`)
		if content.CodeNote != "" {
			b.WriteString(`<div style="font-size:13px;color:#6b6b75;margin-top:10px;">` + esc(content.CodeNote) + `</div>`)
		}
		b.WriteString(`</td></tr></table>`)
	}
	if len(content.Rows) > 0 {
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border:1px solid #ececf0;border-radius:12px;">`)
		for index, row := range content.Rows {
			border := ""
			if index > 0 {
				border = "border-top:1px solid #ececf0;"
			}
			b.WriteString(`<tr><td style="padding:14px 16px;font-size:15px;font-weight:600;color:#111114;` + border + `">` + esc(row.Label) + `</td><td align="right" style="padding:14px 16px;font-size:14px;color:#55555f;` + border + `">` + esc(row.Value) + `</td></tr>`)
		}
		b.WriteString(`</table>`)
	}
	if content.ButtonText != "" && content.ButtonURL != "" {
		b.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td style="border-radius:999px;background:#c13cff;"><a href="` + esc(content.ButtonURL) + `" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">` + esc(content.ButtonText) + `</a></td></tr></table>`)
	}
	for _, line := range content.Body {
		b.WriteString(`<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3a42;">` + esc(line) + `</p>`)
	}
	if content.Notice != "" {
		b.WriteString(`<p style="margin:8px 0 0;padding:14px 16px;background:#f7f7f9;border-radius:10px;font-size:13px;line-height:1.6;color:#6b6b75;">` + esc(content.Notice) + `</p>`)
	}
	b.WriteString(`<p style="margin:24px 0 0;font-size:15px;color:#3a3a42;">The ` + esc(brand) + ` team</p>`)
	b.WriteString(`</td></tr>`)
	b.WriteString(`<tr><td align="center" style="padding:20px 24px;font-size:12px;line-height:1.6;color:#8b8b95;">You're receiving this email because of activity on your ` + esc(brand) + ` account. This is an automated message, so please don't reply.</td></tr>`)
	b.WriteString(`</table></td></tr></table></body></html>`)
	return EmailMessage{Subject: content.Subject, Text: text.String(), HTML: b.String()}
}
