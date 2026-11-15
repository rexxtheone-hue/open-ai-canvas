package model

import "time"

// PlatformTenantID 是平台自己（OmniMuse）的租户。没有登记到任何代理商的网址都归它，现有数据也都属于它。
const PlatformTenantID = "omnimuse"

type TenantStatus string

const (
	TenantStatusActive    TenantStatus = "active"
	TenantStatusSuspended TenantStatus = "suspended"
	TenantStatusClosed    TenantStatus = "closed"
)

// Tenant 是一家白标代理商；平台自己也是一行，IsPlatform=true。
type Tenant struct {
	ID           string       `json:"id" gorm:"primaryKey;size:36"`
	Slug         string       `json:"slug" gorm:"uniqueIndex;size:64;not null"`
	Name         string       `json:"name" gorm:"size:120;not null;default:''"`
	Status       TenantStatus `json:"status" gorm:"size:16;not null;default:'active';index"`
	IsPlatform   bool         `json:"isPlatform" gorm:"not null;default:false"`
	FeeFreeUntil *time.Time   `json:"feeFreeUntil,omitempty"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

// TenantDomain 把一个网址对应到租户。Host 统一存小写、不带端口。
type TenantDomain struct {
	ID           string    `json:"id" gorm:"primaryKey;size:36"`
	TenantID     string    `json:"tenantId" gorm:"size:36;not null;index"`
	Host         string    `json:"host" gorm:"size:253;not null;uniqueIndex"`
	IsPrimary    bool      `json:"isPrimary" gorm:"not null;default:false"`
	SSLStatus    string    `json:"sslStatus" gorm:"size:32;not null;default:''"`
	CFHostnameID string    `json:"-" gorm:"size:64;not null;default:''"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
