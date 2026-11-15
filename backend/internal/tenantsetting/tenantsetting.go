// Package tenantsetting 定义代理商设置层：哪些设置、哪些字段允许代理商覆盖，以及读写时怎样合并。
// 平台层仍是 system_settings；代理商层只保存白名单字段，读取时盖在平台层上。
package tenantsetting

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
)

const (
	KeyAppearance          = "appearance"
	KeyRegistration        = "registration"
	KeyEmail               = "email"
	KeyGoogleOAuth         = "google_oauth"
	KeyCreditPolicy        = "credit_policy"
	KeyFeatureAvailability = "feature_availability"
	KeyAffiliate           = "affiliate"
	KeyStudioSiteContent   = "studio_site_content"
)

type mode int

const (
	// modeFields：只覆盖列出的字段。
	modeFields mode = iota
	// modeWhole：代理商保存过就整份替换平台的值。
	modeWhole
	// modeIsolated：代理商永远不继承平台的值（例如自带的 Google OAuth 客户端）。
	modeIsolated
	// modeRestrict：只能关闭平台已打开的开关，合并结果 = 平台 AND 代理商。
	modeRestrict
)

type rule struct {
	mode   mode
	fields map[string]struct{}
}

func fields(names ...string) rule {
	set := make(map[string]struct{}, len(names))
	for _, name := range names {
		set[name] = struct{}{}
	}
	return rule{mode: modeFields, fields: set}
}

var rules = map[string]rule{
	// 备案号、更新公告、画布与看板娘等仍由平台统一管理。
	KeyAppearance: fields(
		"brandName", "authHeroTitle", "authHeroDescription",
		"logoResourceId", "darkLogoResourceId", "logoFrameEnabled",
		"authVideoResourceId", "authVideoPosterResourceId", "authVideoAutoplay",
		"skinId", "skinThemes", "seoTitle", "seoDescription", "seoKeywords",
		"footerCopyright", "redeemPurchaseUrl",
	),
	KeyRegistration: fields("enabled", "agreementTitle", "agreementContent"),
	// SMTP 主机、端口、账号与密码只属于平台。
	KeyEmail:               fields("fromName", "fromEmail", "registrationAllowedDomains"),
	KeyGoogleOAuth:         {mode: modeIsolated},
	KeyCreditPolicy:        fields("signupBonusMicrocredits"),
	KeyFeatureAvailability: {mode: modeRestrict},
	KeyAffiliate:           {mode: modeWhole},
	KeyStudioSiteContent:   {mode: modeWhole},
}

// Allowed 判断代理商能否拥有这项设置；不在表里的都是平台专属。
func Allowed(key string) bool {
	_, ok := rules[key]
	return ok
}

// Isolated 表示代理商不继承平台的值：没有自己的设置时视为未配置。
func Isolated(key string) bool {
	return rules[key].mode == modeIsolated
}

var contextResolver func(context.Context) string

// SetContextResolver 由组合根注入：从请求上下文取出代理商租户 ID，平台租户返回空字符串。
func SetContextResolver(fn func(context.Context) string) {
	contextResolver = fn
}

// TenantID 返回请求所属的代理商租户；平台或没有请求上下文时返回空字符串（只读平台层）。
func TenantID(ctx context.Context) string {
	if ctx == nil || contextResolver == nil {
		return ""
	}
	return contextResolver(ctx)
}

func toMap(value any) (map[string]json.RawMessage, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var result map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, errors.New("设置必须是 JSON 对象")
	}
	return result, nil
}

// Filter 把一份完整的设置值裁成代理商层要保存的 JSON：非白名单字段直接丢弃。
// feature_availability 需要平台值，请用 FilterRestrict。
func Filter(key string, value any) (string, error) {
	r, ok := rules[key]
	if !ok {
		return "", errors.New("该设置只能由平台管理员修改")
	}
	if r.mode == modeRestrict {
		return "", errors.New("该设置请使用 FilterRestrict")
	}
	if r.mode == modeWhole || r.mode == modeIsolated {
		encoded, err := json.Marshal(value)
		return string(encoded), err
	}
	submitted, err := toMap(value)
	if err != nil {
		return "", err
	}
	kept := map[string]json.RawMessage{}
	for name, raw := range submitted {
		if _, allowed := r.fields[name]; allowed {
			kept[name] = raw
		}
	}
	encoded, err := json.Marshal(kept)
	return string(encoded), err
}

// FilterRestrict 只记下「平台开着、代理商要关」的开关；想打开平台已关的功能会被忽略。
func FilterRestrict(platform any, submitted any) (string, error) {
	base, err := toMap(platform)
	if err != nil {
		return "", err
	}
	next, err := toMap(submitted)
	if err != nil {
		return "", err
	}
	disabled := map[string]bool{}
	for name, raw := range next {
		var on bool
		if json.Unmarshal(raw, &on) != nil || on {
			continue
		}
		var platformOn bool
		if json.Unmarshal(base[name], &platformOn) == nil && platformOn {
			disabled[name] = false
		}
	}
	encoded, err := json.Marshal(disabled)
	return string(encoded), err
}

// Overlay 把代理商层的 JSON 合并进 value（必须是指针）。tenantJSON 为空时不做任何事。
func Overlay(key string, value any, tenantJSON string) error {
	r, ok := rules[key]
	if !ok || tenantJSON == "" {
		return nil
	}
	var layer map[string]json.RawMessage
	if err := json.Unmarshal([]byte(tenantJSON), &layer); err != nil {
		return errors.New("代理商设置格式无效")
	}
	switch r.mode {
	case modeWhole, modeIsolated:
		return json.Unmarshal([]byte(tenantJSON), value)
	case modeRestrict:
		base, err := toMap(value)
		if err != nil {
			return err
		}
		for name, raw := range layer {
			var on bool
			if json.Unmarshal(raw, &on) == nil && !on {
				if _, exists := base[name]; exists {
					base[name] = json.RawMessage("false")
				}
			}
		}
		return remarshal(base, value)
	default:
		base, err := toMap(value)
		if err != nil {
			return err
		}
		for name, raw := range layer {
			if _, allowed := r.fields[name]; allowed {
				base[name] = raw
			}
		}
		return remarshal(base, value)
	}
}

// remarshal 解到一个全新的值再赋回去：直接解进旧值时切片元素会残留旧字段。
func remarshal(source map[string]json.RawMessage, target any) error {
	encoded, err := json.Marshal(source)
	if err != nil {
		return err
	}
	pointer := reflect.ValueOf(target)
	if pointer.Kind() != reflect.Pointer || pointer.IsNil() {
		return errors.New("合并目标必须是指针")
	}
	fresh := reflect.New(pointer.Elem().Type())
	if err := json.Unmarshal(encoded, fresh.Interface()); err != nil {
		return err
	}
	pointer.Elem().Set(fresh.Elem())
	return nil
}
