package service

import "yingce/backend/internal/app"

var (
	IsTenantAdmin             = app.IsTenantAdmin
	RequireTenantAdminOrAdmin = app.RequireTenantAdminOrAdmin
)

