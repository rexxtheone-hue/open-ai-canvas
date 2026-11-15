package model

import "gorm.io/gorm"

// 跨用户查询的表（后台列表、报表）在写入时记下所属用户的租户。
// 调用方已经填了 TenantID 时保持不变；找不到用户时归平台租户。
// 会被 Save 整行写回的表用 BeforeSave，避免新建的结构体把 tenant_id 写成空值。
func stampTenantFromUser(tx *gorm.DB, tenantID *string, userID string) {
	if *tenantID != "" {
		return
	}
	*tenantID = PlatformTenantID
	if userID == "" {
		return
	}
	var owner string
	if err := tx.Session(&gorm.Session{NewDB: true}).Table("users").Select("tenant_id").Where("id = ?", userID).Limit(1).Scan(&owner).Error; err == nil && owner != "" {
		*tenantID = owner
	}
}

func (t *Task) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &t.TenantID, t.UserID)
	return nil
}

func (o *BillingOrder) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &o.TenantID, o.UserID)
	return nil
}

func (l *ApiCallLog) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &l.TenantID, l.UserID)
	return nil
}

func (l *LoginLog) BeforeCreate(tx *gorm.DB) error {
	userID := ""
	if l.UserID != nil {
		userID = *l.UserID
	}
	stampTenantFromUser(tx, &l.TenantID, userID)
	return nil
}

func (e *AdminAuditEvent) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &e.TenantID, e.ActorUserID)
	return nil
}

func (o *PaymentOrder) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &o.TenantID, o.UserID)
	return nil
}

func (p *StudioPost) BeforeSave(tx *gorm.DB) error {
	stampTenantFromUser(tx, &p.TenantID, p.UserID)
	return nil
}

func (f *StudioFeedback) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &f.TenantID, f.UserID)
	return nil
}

func (a *PartnerApplication) BeforeSave(tx *gorm.DB) error {
	stampTenantFromUser(tx, &a.TenantID, a.UserID)
	return nil
}

func (a *AffiliateAccount) BeforeSave(tx *gorm.DB) error {
	stampTenantFromUser(tx, &a.TenantID, a.UserID)
	return nil
}

func (c *AffiliateCommission) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &c.TenantID, c.AffiliateUserID)
	return nil
}

func (p *AffiliatePayout) BeforeCreate(tx *gorm.DB) error {
	stampTenantFromUser(tx, &p.TenantID, p.AffiliateUserID)
	return nil
}
