package handler

import (
	"errors"
	"net/http"

	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// RegisterTenantBillingRoutes 注册代理商批发计费接口：/admin/tenant-billing/* 给平台管理员，/tenant-admin/billing/* 给代理商管理员（只看本网址租户）。
func RegisterTenantBillingRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/admin/tenant-billing/tenants", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		items, err := svc.AdminTenantPools(actor)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"tenants": items})
	})
	r.POST("/admin/tenant-billing/tenants/:id/topups", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.TenantTopupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, errors.New("充值请求格式错误"))
			return
		}
		result, err := svc.AdminTenantTopup(actor, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/admin/tenant-billing/tenants/:id/adjustments", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.TenantPoolAdjustRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, errors.New("调账请求格式错误"))
			return
		}
		account, err := svc.AdminTenantPoolAdjust(actor, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"account": account})
	})
	r.GET("/admin/tenant-billing/tenants/:id/ledger", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, limit, err := parsePaginationQuery(c, 50)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		ledger, err := svc.AdminTenantPoolLedger(actor, c.Param("id"), page, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, ledger)
	})
	r.GET("/admin/tenant-billing/tenants/:id/lots", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		lots, err := svc.AdminTenantPoolLots(actor, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"lots": lots})
	})
	r.GET("/admin/tenant-billing/monthly-settlements", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		items, err := svc.AdminTenantMonthlySettlements(actor, c.Query("tenantId"), c.Query("period"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"settlements": items})
	})
	r.GET("/admin/tenant-billing/agency-discounts", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		items, err := svc.AdminAgencyDiscounts(actor)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"models": items})
	})
	r.PUT("/admin/tenant-billing/agency-discounts/:channelModelId", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			AgencyDiscountPercent int `json:"agencyDiscountPercent"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, errors.New("折扣请求格式错误"))
			return
		}
		if err := svc.AdminSetAgencyDiscount(actor, c.Param("channelModelId"), req.AgencyDiscountPercent); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"agencyDiscountPercent": req.AgencyDiscountPercent})
	})

	r.GET("/tenant-admin/billing/pool", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		overview, err := svc.TenantPoolOverview(actor, requestTenant(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, overview)
	})
	r.GET("/tenant-admin/billing/lots", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		lots, err := svc.TenantPoolLots(actor, requestTenant(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"lots": lots})
	})
	r.GET("/tenant-admin/billing/ledger", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, limit, err := parsePaginationQuery(c, 50)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		ledger, err := svc.TenantPoolLedger(actor, requestTenant(c), page, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, ledger)
	})
	r.GET("/tenant-admin/billing/debts", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		debts, err := svc.TenantPoolDebts(actor, requestTenant(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"debts": debts})
	})
	r.GET("/tenant-admin/billing/monthly-usage", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		usage, err := svc.TenantMonthlyUsage(actor, requestTenant(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, usage)
	})
	r.GET("/tenant-admin/billing/prices", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		prices, err := svc.TenantRetailPrices(actor, requestTenant(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"prices": prices})
	})
	r.PUT("/tenant-admin/billing/prices", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.TenantRetailPriceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, errors.New("价格请求格式错误"))
			return
		}
		price, err := svc.SaveTenantRetailPrice(actor, requestTenant(c), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"price": price})
	})
	r.DELETE("/tenant-admin/billing/prices/:id", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.DeleteTenantRetailPrice(actor, requestTenant(c), c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	})
}
