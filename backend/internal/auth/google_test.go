package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

type googleTestHost struct {
	profileTestHost
	referrals *[]string
}

func (h googleTestHost) AttachReferral(userID, code string) {
	*h.referrals = append(*h.referrals, userID+":"+code)
}

func newGoogleTestService(t *testing.T, profile *map[string]any) (*Service, *model.User, *[]string) {
	t.Helper()
	s, db, u, _ := newProfileTestService(t)
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	referrals := &[]string{}
	s.host = googleTestHost{referrals: referrals}
	t.Setenv("CANVAS_REGISTRATION_ENABLED", "true")
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			if r.FormValue("code_verifier") == "" || r.FormValue("client_secret") != "secret" {
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			_, _ = w.Write([]byte(`{"access_token":"google-token"}`))
			return
		}
		if r.Header.Get("Authorization") != "Bearer google-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(*profile)
	}))
	t.Cleanup(server.Close)
	tokenURL, userInfoURL := googleTokenURL, googleUserInfoURL
	googleTokenURL, googleUserInfoURL = server.URL+"/token", server.URL+"/userinfo"
	t.Cleanup(func() { googleTokenURL, googleUserInfoURL = tokenURL, userInfoURL })
	setting, _ := json.Marshal(googleSettingValue{Enabled: true, ClientID: "id.apps.googleusercontent.com", ClientSecret: "secret", RedirectURL: "http://localhost/oauth/google/callback"})
	if err := db.Create(&model.SystemSetting{Key: googleSettingKey, ValueJSON: string(setting)}).Error; err != nil {
		t.Fatal(err)
	}
	return s, u, referrals
}

func googleLogin(t *testing.T, s *Service, acceptedTerms bool, ref string) (*LinuxDOCallbackResult, error) {
	t.Helper()
	location, err := s.BeginGoogleLogin("/studio", acceptedTerms, ref)
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(location)
	query := parsed.Query()
	if parsed.Host != "accounts.google.com" || query.Get("scope") != "openid email profile" || query.Get("code_challenge_method") != "S256" || query.Get("redirect_uri") != "http://localhost/oauth/google/callback" {
		t.Fatalf("authorize url %s", location)
	}
	return s.CompleteGoogleLogin(query.Get("state"), "auth-code", "")
}

func TestGoogleLoginCreatesVerifiedAccountAndAttributesReferral(t *testing.T) {
	profile := map[string]any{"sub": "g-1", "email": "Nadia.Lee@gmail.com", "email_verified": true, "name": "Nadia Lee", "picture": "https://lh3.googleusercontent.com/a"}
	s, _, referrals := newGoogleTestService(t, &profile)
	if _, err := googleLogin(t, s, false, ""); err == nil || !strings.Contains(err.Error(), "同意") {
		t.Fatalf("registration without accepted terms: %v", err)
	}
	result, err := googleLogin(t, s, true, "abcd2345")
	if err != nil {
		t.Fatal(err)
	}
	if result.Session == nil || result.Next != "/studio" {
		t.Fatalf("result = %#v", result)
	}
	user := result.Session.User
	if user.Username != "nadia_lee" || user.Email != "nadia.lee@gmail.com" || user.EmailVerifiedAt == nil || user.DisplayName != "Nadia Lee" || user.AvatarURL != "https://lh3.googleusercontent.com/a" {
		t.Fatalf("user = %#v", user)
	}
	if len(*referrals) != 1 || *referrals != nil && (*referrals)[0] != user.ID+":ABCD2345" {
		t.Fatalf("referrals = %v", *referrals)
	}
	again, err := googleLogin(t, s, false, "OTHER123")
	if err != nil || again.Session.User.ID != user.ID || len(*referrals) != 1 {
		t.Fatalf("second login = %#v, err = %v, referrals = %v", again, err, *referrals)
	}
}

func TestGoogleLoginLinksOnlyVerifiedMatchingEmail(t *testing.T) {
	profile := map[string]any{"sub": "g-2", "email": "old@example.com", "email_verified": true, "name": "Old"}
	s, u, _ := newGoogleTestService(t, &profile)
	result, err := googleLogin(t, s, true, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Session.User.ID == u.ID {
		t.Fatal("linked to an account whose email was never verified")
	}
	if result.Session.User.Email != "" {
		t.Fatalf("duplicate email assigned: %q", result.Session.User.Email)
	}

	profile = map[string]any{"sub": "g-3", "email": "old@example.com", "email_verified": true, "name": "Old"}
	now := time.Now()
	if err := s.repo.Save(&model.User{ID: u.ID, Username: u.Username, Email: u.Email, EmailVerifiedAt: &now, Status: model.UserStatusActive, PasswordHash: u.PasswordHash, Role: model.UserRoleUser}); err != nil {
		t.Fatal(err)
	}
	linked, err := googleLogin(t, s, false, "")
	if err != nil || linked.Session.User.ID != u.ID {
		t.Fatalf("verified email not linked: %#v, %v", linked, err)
	}

	profile = map[string]any{"sub": "g-4", "email": "old@example.com", "email_verified": false, "name": "Spoof"}
	spoof, err := googleLogin(t, s, true, "")
	if err != nil || spoof.Session.User.ID == u.ID || spoof.Session.User.Email != "" {
		t.Fatalf("unverified Google email took over account: %#v, %v", spoof, err)
	}
}
