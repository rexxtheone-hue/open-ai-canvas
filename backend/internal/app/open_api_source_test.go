package app

import (
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestOpenAPIAppNameUsesOAuthClientThenUserAgent(t *testing.T) {
	svc, db, _, _ := newAppearanceTestService(t)
	if err := db.Create(&model.OAuthClient{ID: "client-chatgpt", Name: "ChatGPT Connector", RedirectURIs: "https://chatgpt.com/cb"}).Error; err != nil {
		t.Fatal(err)
	}
	oauth := &model.APIToken{Kind: model.APITokenKindOAuthAccess, ClientID: "client-chatgpt"}
	for _, tc := range []struct {
		token     *model.APIToken
		userAgent string
		client    string
		want      string
	}{
		{oauth, "python-httpx/0.27", "mcp", "ChatGPT"},
		{&model.APIToken{Kind: model.APITokenKindPersonal}, "claude-code/2.1.0 (cli)", "mcp", "Claude Code"},
		{&model.APIToken{Kind: model.APITokenKindPersonal}, "Cursor/1.4", "mcp", "Cursor"},
		{&model.APIToken{Kind: model.APITokenKindPersonal}, "Go-http-client/1.1", "cli", "OmniMuse CLI"},
		{&model.APIToken{Kind: model.APITokenKindPersonal}, "n8n/1.0", "api", "n8n"},
	} {
		if got := svc.OpenAPIAppName(tc.token, tc.userAgent, tc.client); got != tc.want {
			t.Fatalf("app(%q, %q) = %q, want %q", tc.userAgent, tc.client, got, tc.want)
		}
	}
}

func TestAnalyticsSourcesGroupsByEntryAndApp(t *testing.T) {
	svc, db, _, _ := newAppearanceTestService(t)
	now := time.Now().UTC()
	orders := []model.BillingOrder{
		{ID: "order-mcp", UserID: "u1", IdempotencyKey: "k1", Status: model.BillingStatusSettled, ActualAmountMicrocredits: 30_000_000, CreatedAt: now},
		{ID: "order-mcp-refund", UserID: "u2", IdempotencyKey: "k2", Status: model.BillingStatusRefunded, ActualAmountMicrocredits: 0, CreatedAt: now},
		{ID: "order-web", UserID: "u1", IdempotencyKey: "k3", Status: model.BillingStatusSettled, ActualAmountMicrocredits: 5_000_000, CreatedAt: now},
	}
	for i := range orders {
		if err := db.Create(&orders[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	tasks := []model.Task{
		{ID: "t1", UserID: "u1", Type: "canvas_video", Status: model.TaskStatusSucceeded, BillingOrderID: "order-mcp", APIClient: "mcp", APIApp: "Claude", CreatedAt: now},
		{ID: "t2", UserID: "u2", Type: "canvas_video", Status: model.TaskStatusFailed, BillingOrderID: "order-mcp-refund", APIClient: "mcp", APIApp: "Claude", CreatedAt: now},
		{ID: "t3", UserID: "u1", Type: "canvas_image", Status: model.TaskStatusSucceeded, BillingOrderID: "order-web", CreatedAt: now},
	}
	for i := range tasks {
		if err := db.Create(&tasks[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	rows, err := svc.repo.AnalyticsSources(repository.AnalyticsFilter{From: now.Add(-time.Hour), To: now.Add(time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	byKey := map[string]repository.AnalyticsSourceRow{}
	for _, row := range rows {
		byKey[row.Client+"/"+row.App] = row
	}
	if got := byKey["mcp/Claude"]; got.Tasks != 2 || got.Succeeded != 1 || got.Users != 2 || got.ChargedMicrocredits != 30_000_000 {
		t.Fatalf("mcp row = %+v", got)
	}
	if got := byKey["web/"]; got.Tasks != 1 || got.ChargedMicrocredits != 5_000_000 {
		t.Fatalf("web row = %+v (all rows %+v)", got, rows)
	}
}
