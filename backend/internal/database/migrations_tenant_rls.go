package database

import (
	"fmt"

	"yingce/backend/internal/tenantrls"

	"gorm.io/gorm"
)

const tenantRLSPoliciesChecksum = "sha256:tenant-rls-policies-v82-20261115"

// migrateTenantRLSPolicies 只在 PostgreSQL 上为跨用户表创建按租户隔离的行级安全策略，但不启用（不执行 ENABLE ROW LEVEL SECURITY），
// 所以对现有行为没有影响；SQLite 上什么都不做。启用前必须先在 staging 验证，步骤见 internal/tenantrls。
func migrateTenantRLSPolicies(tx *gorm.DB) error {
	if tx.Dialector.Name() != "postgres" {
		return nil
	}
	for _, table := range tenantrls.Tables() {
		if !tx.Migrator().HasTable(table) {
			continue
		}
		for _, statement := range tenantrls.PolicyStatements(table) {
			if err := tx.Exec(statement).Error; err != nil {
				return fmt.Errorf("创建 %s 的租户隔离策略：%w", table, err)
			}
		}
	}
	return nil
}
