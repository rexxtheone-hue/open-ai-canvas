package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"
)

// partnerRoute 统一解析当前用户并输出结果；管理接口的权限由各 service 方法内的 RequireAdmin 判定。
func partnerRoute(svc *service.Service, handle func(c *gin.Context, user *model.User) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := handle(c, user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	}
}

func bindPartnerJSON(c *gin.Context, target any) bool {
	if err := c.ShouldBindJSON(target); err != nil {
		fail(c, http.StatusBadRequest, err)
		return false
	}
	return true
}

// RegisterPartnerRoutes 认证创作者、商家与推广者的申请、推广面板和后台审核。
func RegisterPartnerRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/partner/status", partnerRoute(svc, func(_ *gin.Context, user *model.User) (any, error) {
		return svc.MyPartnerStatus(user)
	}))
	r.POST("/partner/applications", func(c *gin.Context) {
		var req service.PartnerApplicationRequest
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(_ *gin.Context, user *model.User) (any, error) {
			return svc.SubmitPartnerApplication(user, req)
		})(c)
	})
	r.POST("/partner/affiliate/payouts", func(c *gin.Context) {
		var req service.AffiliatePayoutRequest
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(_ *gin.Context, user *model.User) (any, error) {
			return svc.RequestAffiliatePayout(user, req)
		})(c)
	})

	r.GET("/admin/partner-applications", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return svc.AdminPartnerApplications(user, c.Query("kind"), c.Query("status"), queryInt(c, "offset"))
	}))
	r.PATCH("/admin/partner-applications/:id", func(c *gin.Context) {
		var req service.PartnerReviewRequest
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
			return svc.ReviewPartnerApplication(user, c.Param("id"), req)
		})(c)
	})
	r.GET("/admin/affiliates", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return svc.AdminAffiliates(user, c.Query("q"), queryInt(c, "offset"))
	}))
	r.PATCH("/admin/affiliates/:userId", func(c *gin.Context) {
		var req service.AffiliateUpdateRequest
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
			return svc.UpdateAffiliate(user, c.Param("userId"), req)
		})(c)
	})
	r.GET("/admin/affiliate-payouts", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return svc.AdminAffiliatePayouts(user, c.Query("status"), queryInt(c, "offset"))
	}))
	r.PATCH("/admin/affiliate-payouts/:id", func(c *gin.Context) {
		var req service.AffiliatePayoutReview
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
			return svc.ReviewAffiliatePayout(user, c.Param("id"), req)
		})(c)
	})
	r.GET("/admin/affiliate-settings", partnerRoute(svc, func(_ *gin.Context, user *model.User) (any, error) {
		return svc.AdminAffiliateSetting(user)
	}))
	r.PUT("/admin/affiliate-settings", func(c *gin.Context) {
		var req service.AffiliateSetting
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(_ *gin.Context, user *model.User) (any, error) {
			return svc.UpdateAffiliateSetting(user, req)
		})(c)
	})
}
