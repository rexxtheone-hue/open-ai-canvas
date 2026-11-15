package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// tenantAdminRouteGuard 在代理商网址上把代理商管理员挡在白名单以外的 /admin 接口之外，
// 不依赖各接口自己的权限检查顺序。平台网址没有代理商管理员，直接放行。
func tenantAdminRouteGuard(svc *service.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		route := c.FullPath()
		if !strings.HasPrefix(strings.TrimPrefix(route, "/api"), "/admin/") || requestTenant(c).IsPlatform {
			c.Next()
			return
		}
		user, err := svc.CurrentUser(sessionCookie(c))
		if err == nil && user != nil && user.Role == model.UserRoleTenantAdmin && !service.TenantAdminRouteAllowed(c.Request.Method, route) {
			fail(c, http.StatusForbidden, errors.New("需要平台管理员权限"))
			c.Abort()
			return
		}
		c.Next()
	}
}

func bindTenantJSON(c *gin.Context, target any, message string) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
	if err := c.ShouldBindJSON(target); err != nil {
		fail(c, http.StatusBadRequest, errors.New(message))
		return false
	}
	return true
}

// RegisterTenantProvisioningRoutes 注册开设代理商（平台管理员）、代理商员工与客户导出（代理商管理员）、后台查看用户作品。
func RegisterTenantProvisioningRoutes(r *gin.RouterGroup, svc *service.Service) {
	withUser := func(handle func(c *gin.Context, user *model.User)) gin.HandlerFunc {
		return func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			handle(c, user)
		}
	}
	respond := func(c *gin.Context, value any, err error) {
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, value)
	}

	r.GET("/admin/tenants", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.AdminAgencyTenants(user)
		respond(c, gin.H{"tenants": items}, err)
	}))
	r.POST("/admin/tenants", withUser(func(c *gin.Context, user *model.User) {
		var req service.CreateAgencyTenantRequest
		if !bindTenantJSON(c, &req, "开设代理商请求格式错误") {
			return
		}
		result, err := svc.CreateAgencyTenant(c.Request.Context(), user, req)
		respond(c, result, err)
	}))
	r.GET("/admin/tenants/:id", withUser(func(c *gin.Context, user *model.User) {
		detail, err := svc.AdminAgencyTenant(user, c.Param("id"))
		respond(c, gin.H{"tenant": detail}, err)
	}))
	r.PATCH("/admin/tenants/:id", withUser(func(c *gin.Context, user *model.User) {
		var req service.UpdateAgencyTenantRequest
		if !bindTenantJSON(c, &req, "修改代理商请求格式错误") {
			return
		}
		detail, err := svc.UpdateAgencyTenant(user, c.Param("id"), req)
		respond(c, gin.H{"tenant": detail}, err)
	}))
	r.POST("/admin/tenants/:id/admins", withUser(func(c *gin.Context, user *model.User) {
		var req service.TenantAdminUserRequest
		if !bindTenantJSON(c, &req, "添加管理员请求格式错误") {
			return
		}
		result, err := svc.AdminAddTenantAdmin(user, c.Param("id"), req)
		respond(c, result, err)
	}))
	r.PATCH("/admin/tenants/:id/admins/:userId", withUser(func(c *gin.Context, user *model.User) {
		var req service.TenantUserStatusRequest
		if !bindTenantJSON(c, &req, "修改管理员请求格式错误") {
			return
		}
		admin, err := svc.AdminSetTenantAdminStatus(user, c.Param("id"), c.Param("userId"), req)
		respond(c, gin.H{"user": admin}, err)
	}))

	r.GET("/admin/users/:id/works", withUser(func(c *gin.Context, user *model.User) {
		limit, err := parsePositiveQueryInt(c.Query("limit"), 24)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		page, err := svc.AdminUserWorks(user, c.Param("id"), service.StudioWorkQuery{Kind: c.Query("kind"), Cursor: c.Query("cursor"), Limit: limit})
		respond(c, page, err)
	}))

	r.GET("/tenant-admin/staff", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.TenantStaff(user, requestTenant(c))
		respond(c, gin.H{"users": items}, err)
	}))
	r.POST("/tenant-admin/staff", withUser(func(c *gin.Context, user *model.User) {
		var req service.TenantAdminUserRequest
		if !bindTenantJSON(c, &req, "添加管理员请求格式错误") {
			return
		}
		result, err := svc.CreateTenantStaff(user, requestTenant(c), req)
		respond(c, result, err)
	}))
	r.PATCH("/tenant-admin/staff/:userId", withUser(func(c *gin.Context, user *model.User) {
		var req service.TenantUserStatusRequest
		if !bindTenantJSON(c, &req, "修改管理员请求格式错误") {
			return
		}
		admin, err := svc.UpdateTenantStaffStatus(user, requestTenant(c), c.Param("userId"), req)
		respond(c, gin.H{"user": admin}, err)
	}))
	r.GET("/tenant-admin/billing/models", withUser(func(c *gin.Context, user *model.User) {
		catalog, err := svc.TenantModelPriceCatalog(user, requestTenant(c))
		respond(c, catalog, err)
	}))
	r.GET("/tenant-admin/customers/export", withUser(func(c *gin.Context, user *model.User) {
		c.Header("Cache-Control", "no-store")
		data, err := svc.TenantCustomersCSV(user, requestTenant(c))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Content-Disposition", "attachment; filename=customers-"+time.Now().UTC().Format("20060102-150405")+".csv")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(http.StatusOK, "text/csv; charset=utf-8", data)
	}))
}
