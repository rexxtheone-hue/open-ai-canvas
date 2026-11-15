package handler

import (
	"net/http"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// RegisterTenantDomainRoutes 注册代理商网址管理：平台管理员可增删改，代理商管理员只读自己的网址。
func RegisterTenantDomainRoutes(r *gin.RouterGroup, svc *service.Service) {
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
	r.GET("/admin/tenants/:id/domains", withUser(func(c *gin.Context, user *model.User) {
		domains, err := svc.AdminTenantDomains(user, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"domains": domains})
	}))
	r.POST("/admin/tenants/:id/domains", withUser(func(c *gin.Context, user *model.User) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<10)
		var req service.TenantDomainRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			failService(c, service.BadAuthRequest("网址请求无效"))
			return
		}
		domain, err := svc.AddTenantDomain(c.Request.Context(), user, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"domain": domain})
	}))
	r.POST("/admin/tenants/:id/domains/:domainId/refresh", withUser(func(c *gin.Context, user *model.User) {
		domain, err := svc.RefreshTenantDomain(c.Request.Context(), user, c.Param("id"), c.Param("domainId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"domain": domain})
	}))
	r.POST("/admin/tenants/:id/domains/:domainId/primary", withUser(func(c *gin.Context, user *model.User) {
		domains, err := svc.SetTenantPrimaryDomain(user, c.Param("id"), c.Param("domainId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"domains": domains})
	}))
	r.DELETE("/admin/tenants/:id/domains/:domainId", withUser(func(c *gin.Context, user *model.User) {
		domains, err := svc.RemoveTenantDomain(c.Request.Context(), user, c.Param("id"), c.Param("domainId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"domains": domains})
	}))
	r.GET("/tenant/domains", withUser(func(c *gin.Context, user *model.User) {
		domains, err := svc.TenantOwnDomains(c.Request.Context(), user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"domains": domains})
	}))
}
