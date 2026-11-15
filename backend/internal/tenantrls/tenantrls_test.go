package tenantrls

import (
	"context"
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPolicyStatementsCreateButNeverEnable(t *testing.T) {
	statements := PolicyStatements("tasks")
	want := []string{
		`DROP POLICY IF EXISTS tenant_isolation ON "tasks"`,
		`CREATE POLICY tenant_isolation ON "tasks" AS PERMISSIVE FOR ALL USING (NULLIF(current_setting('app.tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (NULLIF(current_setting('app.tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.tenant_id', true))`,
		`COMMENT ON POLICY tenant_isolation ON "tasks" IS 'tenant isolation (v82); disabled until ALTER TABLE ... ENABLE ROW LEVEL SECURITY, verify on staging first'`,
	}
	if len(statements) != len(want) {
		t.Fatalf("statements = %#v", statements)
	}
	for index := range want {
		if statements[index] != want[index] {
			t.Fatalf("statement %d:\n got %s\nwant %s", index, statements[index], want[index])
		}
	}
	for _, table := range Tables() {
		for _, statement := range PolicyStatements(table) {
			upper := strings.ToUpper(statement)
			if strings.Contains(upper, "ENABLE ROW LEVEL SECURITY") && !strings.HasPrefix(upper, "COMMENT") {
				t.Fatalf("migration statements must not enable RLS: %s", statement)
			}
			if strings.Count(statement, "(") != strings.Count(statement, ")") || strings.Count(statement, "'")%2 != 0 {
				t.Fatalf("unbalanced SQL: %s", statement)
			}
		}
	}
}

func TestEnableAndDisableStatements(t *testing.T) {
	if got := strings.Join(EnableStatements("users"), "; "); got != `ALTER TABLE "users" ENABLE ROW LEVEL SECURITY; ALTER TABLE "users" FORCE ROW LEVEL SECURITY` {
		t.Fatalf("enable = %s", got)
	}
	if got := strings.Join(DisableStatements("users"), "; "); got != `ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY; ALTER TABLE "users" DISABLE ROW LEVEL SECURITY` {
		t.Fatalf("disable = %s", got)
	}
	if quoteIdent(`we"ird`) != `"we""ird"` {
		t.Fatal("identifier quoting")
	}
	if SetTenantSQL != "SELECT set_config('app.tenant_id', $1, true)" {
		t.Fatalf("set tenant sql = %s", SetTenantSQL)
	}
}

func TestEnabledDefaultsOff(t *testing.T) {
	t.Setenv("TENANT_RLS", "")
	if Enabled() {
		t.Fatal("RLS plumbing must be off by default")
	}
	for _, value := range []string{"1", "true", "ON"} {
		t.Setenv("TENANT_RLS", value)
		if !Enabled() {
			t.Fatalf("TENANT_RLS=%s should enable", value)
		}
	}
	t.Setenv("TENANT_RLS", "0")
	if Enabled() {
		t.Fatal("TENANT_RLS=0 is off")
	}
}

func TestRegisterIsNoOpOnSQLite(t *testing.T) {
	t.Setenv("TENANT_RLS", "1")
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if installed, err := Register(db); err != nil || installed {
		t.Fatalf("Register on sqlite = %v, %v", installed, err)
	}
}

func TestTenantFromContextOnlyTrustsExplicitTenant(t *testing.T) {
	previous := contextResolver
	t.Cleanup(func() { contextResolver = previous })
	contextResolver = func(context.Context) (string, bool) { return "", false }
	if TenantFromContext(context.Background()) != "" {
		t.Fatal("background context has no tenant")
	}
	if TenantFromContext(WithTenant(context.Background(), "agency-a")) != "agency-a" {
		t.Fatal("explicit tenant")
	}
	contextResolver = func(context.Context) (string, bool) { return "agency-b", true }
	if TenantFromContext(context.Background()) != "agency-b" {
		t.Fatal("resolver tenant")
	}
}
