package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"
)

const tenantContextKey = "tenant"

// TenantMiddleware 按网址认出租户，放进 gin 与请求上下文；后面的处理都以它为准。
func TenantMiddleware(svc *service.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenant, err := svc.ResolveTenant(c.Request.Host)
		if err != nil {
			fail(c, http.StatusServiceUnavailable, errors.New("服务暂时不可用，请稍后再试"))
			c.Abort()
			return
		}
		if !tenant.IsPlatform && tenant.Status != model.TenantStatusActive {
			fail(c, http.StatusForbidden, errors.New("此网站已暂停服务"))
			c.Abort()
			return
		}
		c.Set(tenantContextKey, tenant)
		c.Request = c.Request.WithContext(service.WithTenant(c.Request.Context(), tenant))
		c.Next()
	}
}

// requestTenant 返回当前请求的租户；没有经过中间件时（例如部分测试）当作平台租户。
func requestTenant(c *gin.Context) model.Tenant {
	return service.TenantFromContext(c.Request.Context())
}
