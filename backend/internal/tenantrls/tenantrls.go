// Package tenantrls 是 PostgreSQL 行级安全（RLS）的预备设施：生成按租户隔离的策略 SQL，
// 并在 TENANT_RLS=1 时把请求所属租户写进事务内的 app.tenant_id。
//
// 现状（务必先在 staging 验证再启用）：
//   - v82 迁移只在 PostgreSQL 上「创建」策略，不执行 ENABLE ROW LEVEL SECURITY，所以策略不生效，行为与之前完全一样。
//   - TENANT_RLS 默认关闭。打开后，只有「在事务里」且「上下文带有租户」的语句才会先执行
//     SELECT set_config('app.tenant_id', <租户>, true)（等同 SET LOCAL）；没有租户的后台任务不设置，策略对它们放行。
//   - 本地没有 PostgreSQL，以上 SQL 只做了字符串层面的单元测试，从未在真实数据库上跑过。
//
// 启用步骤（staging 验证通过后）：
//  1. 部署本版本并确认 v82 已执行（pg_policies 里能看到 tenant_isolation 策略）。
//  2. 设置 TENANT_RLS=1 重启，观察一段时间（此时策略仍未生效，只验证 set_config 不报错、不影响性能）。
//  3. 对每张表执行 EnableStatements() 生成的语句（ENABLE + FORCE，应用账号通常是表的所有者，不 FORCE 不会生效）。
//  4. 回滚：对每张表执行 DisableStatements()，或把 TENANT_RLS 设回 0（策略本身对没有租户的语句放行）。
package tenantrls

import (
	"context"
	"fmt"
	"os"
	"strings"

	"gorm.io/gorm"
)

// PolicyName 是每张表上的策略名。
const PolicyName = "tenant_isolation"

// SettingName 是事务内保存当前租户的会话变量。
const SettingName = "app.tenant_id"

// Tables 是带 tenant_id 的跨用户表（v78 users、v80 各表）。只属于单个用户的数据靠 user_id 隔离，不在这里。
func Tables() []string {
	return []string{
		"users",
		"topup_products", "payment_orders", "redeem_batches", "redeem_codes",
		"announcements", "banner_announcements",
		"studio_posts", "studio_feedbacks", "studio_site_contents",
		"partner_applications", "affiliate_accounts", "affiliate_commissions", "affiliate_payouts",
		"login_logs", "admin_audit_events", "api_call_logs", "tasks", "billing_orders",
	}
}

// tenantCondition：没有设置租户（后台任务、迁移、平台运维）时放行；设置了就只能看到、写入本租户的行。
// current_setting 的第二个参数 true 表示变量不存在时返回 NULL 而不是报错；SET LOCAL 结束后同一连接上读到的是空字符串。
const tenantCondition = "(NULLIF(current_setting('" + SettingName + "', true), '') IS NULL OR tenant_id = current_setting('" + SettingName + "', true))"

func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// PolicyStatements 返回在一张表上（重新）创建策略的 SQL；不启用 RLS。
func PolicyStatements(table string) []string {
	ident := quoteIdent(table)
	return []string{
		fmt.Sprintf("DROP POLICY IF EXISTS %s ON %s", PolicyName, ident),
		fmt.Sprintf("CREATE POLICY %s ON %s AS PERMISSIVE FOR ALL USING %s WITH CHECK %s", PolicyName, ident, tenantCondition, tenantCondition),
		fmt.Sprintf("COMMENT ON POLICY %s ON %s IS 'tenant isolation (v82); disabled until ALTER TABLE ... ENABLE ROW LEVEL SECURITY, verify on staging first'", PolicyName, ident),
	}
}

// EnableStatements 是运维手动启用时执行的 SQL（迁移不会执行）。
func EnableStatements(table string) []string {
	ident := quoteIdent(table)
	return []string{
		fmt.Sprintf("ALTER TABLE %s ENABLE ROW LEVEL SECURITY", ident),
		fmt.Sprintf("ALTER TABLE %s FORCE ROW LEVEL SECURITY", ident),
	}
}

// DisableStatements 是回滚用的 SQL。
func DisableStatements(table string) []string {
	ident := quoteIdent(table)
	return []string{
		fmt.Sprintf("ALTER TABLE %s NO FORCE ROW LEVEL SECURITY", ident),
		fmt.Sprintf("ALTER TABLE %s DISABLE ROW LEVEL SECURITY", ident),
	}
}

// SetTenantSQL 在事务内设置租户；第三个参数 true 让设置只在当前事务内有效（等同 SET LOCAL，且可以用参数绑定）。
const SetTenantSQL = "SELECT set_config('" + SettingName + "', $1, true)"

// Enabled 读取 TENANT_RLS 开关，默认关闭。
func Enabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("TENANT_RLS"))) {
	case "1", "true", "on", "yes":
		return true
	}
	return false
}

type contextKey struct{}

// WithTenant 显式标记上下文所属租户（例如按请求开的事务）。
func WithTenant(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, contextKey{}, tenantID)
}

var contextResolver func(context.Context) (string, bool)

// SetContextResolver 由 app 注入：从请求上下文里取租户。只有真的带了租户时返回 true，后台任务不能被当成平台租户。
func SetContextResolver(fn func(context.Context) (string, bool)) {
	contextResolver = fn
}

// TenantFromContext 返回上下文里的租户；没有时返回空字符串。
func TenantFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if id, ok := ctx.Value(contextKey{}).(string); ok && id != "" {
		return id
	}
	if contextResolver != nil {
		if id, ok := contextResolver(ctx); ok {
			return id
		}
	}
	return ""
}

// Plugin 在每条语句执行前，把上下文里的租户写进当前事务。
type Plugin struct{}

func (Plugin) Name() string { return "tenantrls" }

func (Plugin) Initialize(db *gorm.DB) error {
	callbacks := db.Callback()
	// 写操作在 gorm:begin_transaction 之后才有事务，所以挂在它后面；查询只在调用方显式开事务时生效。
	if err := callbacks.Create().After("gorm:begin_transaction").Before("gorm:create").Register("tenantrls:create", setTenant); err != nil {
		return err
	}
	if err := callbacks.Update().After("gorm:begin_transaction").Before("gorm:update").Register("tenantrls:update", setTenant); err != nil {
		return err
	}
	if err := callbacks.Delete().After("gorm:begin_transaction").Before("gorm:delete").Register("tenantrls:delete", setTenant); err != nil {
		return err
	}
	if err := callbacks.Query().Before("gorm:query").Register("tenantrls:query", setTenant); err != nil {
		return err
	}
	if err := callbacks.Row().Before("gorm:row").Register("tenantrls:row", setTenant); err != nil {
		return err
	}
	return callbacks.Raw().Before("gorm:raw").Register("tenantrls:raw", setTenant)
}

// Register 在 PostgreSQL 且 TENANT_RLS=1 时安装插件，返回是否已安装。
func Register(db *gorm.DB) (bool, error) {
	if db == nil || db.Dialector.Name() != "postgres" || !Enabled() {
		return false, nil
	}
	return true, db.Use(Plugin{})
}

func setTenant(db *gorm.DB) {
	if db.Error != nil || db.Statement == nil || db.Dialector.Name() != "postgres" {
		return
	}
	tenantID := TenantFromContext(db.Statement.Context)
	if tenantID == "" {
		return
	}
	// 不在事务里时 set_config(..., true) 只对这条单独的语句生效，没有意义，也不能改成会话级（连接池会串租户）。
	if _, inTx := db.Statement.ConnPool.(gorm.TxCommitter); !inTx {
		return
	}
	if _, err := db.Statement.ConnPool.ExecContext(db.Statement.Context, SetTenantSQL, tenantID); err != nil {
		_ = db.AddError(fmt.Errorf("设置 %s 失败：%w", SettingName, err))
	}
}
