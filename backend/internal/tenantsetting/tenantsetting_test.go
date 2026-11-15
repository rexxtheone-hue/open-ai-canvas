package tenantsetting

import (
	"strings"
	"testing"
)

type sampleEmail struct {
	Host     string   `json:"host"`
	Password string   `json:"password"`
	FromName string   `json:"fromName"`
	Domains  []string `json:"registrationAllowedDomains"`
}

func TestFilterKeepsOnlyWhitelistedFields(t *testing.T) {
	encoded, err := Filter(KeyEmail, sampleEmail{Host: "smtp.evil.com", Password: "x", FromName: "A", Domains: []string{"a.com"}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(encoded, "host") || strings.Contains(encoded, "password") || !strings.Contains(encoded, "fromName") {
		t.Fatalf("unexpected tenant layer: %s", encoded)
	}
	if _, err := Filter("oss", map[string]any{"a": 1}); err == nil {
		t.Fatal("platform-only settings must be rejected")
	}
}

func TestOverlayReplacesOnlyWhitelistedFields(t *testing.T) {
	value := sampleEmail{Host: "smtp.platform.com", Password: "secret", FromName: "Platform", Domains: []string{"gmail.com", "qq.com"}}
	if err := Overlay(KeyEmail, &value, `{"fromName":"A","host":"smtp.evil.com","registrationAllowedDomains":["a.com"]}`); err != nil {
		t.Fatal(err)
	}
	if value.Host != "smtp.platform.com" || value.Password != "secret" || value.FromName != "A" || len(value.Domains) != 1 || value.Domains[0] != "a.com" {
		t.Fatalf("overlay result: %+v", value)
	}
}

type sampleFeatures struct {
	A bool `json:"a"`
	B bool `json:"b"`
}

func TestRestrictCanOnlyTurnFeaturesOff(t *testing.T) {
	platform := sampleFeatures{A: true, B: false}
	encoded, err := FilterRestrict(platform, sampleFeatures{A: false, B: true})
	if err != nil {
		t.Fatal(err)
	}
	if encoded != `{"a":false}` {
		t.Fatalf("restrict layer: %s", encoded)
	}
	merged := platform
	if err := Overlay(KeyFeatureAvailability, &merged, `{"a":false,"b":true}`); err != nil {
		t.Fatal(err)
	}
	if merged.A || merged.B {
		t.Fatalf("tenant layer must never turn a feature on: %+v", merged)
	}
}
