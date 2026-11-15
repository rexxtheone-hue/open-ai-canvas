package service

import "yingce/backend/internal/app"

type (
	TenantDomainRequest = app.TenantDomainRequest
	TenantDomainView    = app.TenantDomainView
	TenantBrand         = app.TenantBrand

	CreateAgencyTenantRequest = app.CreateAgencyTenantRequest
	UpdateAgencyTenantRequest = app.UpdateAgencyTenantRequest
	TenantAdminUserRequest    = app.TenantAdminUserRequest
	TenantUserStatusRequest   = app.TenantUserStatusRequest
)
