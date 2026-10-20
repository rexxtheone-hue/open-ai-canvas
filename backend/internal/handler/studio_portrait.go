package handler

import (
	"time"

	"github.com/gin-gonic/gin"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"
)

// RegisterStudioPortraitRoutes 真人认证（Cloudwise 活体认证 + 可信素材组）。
func RegisterStudioPortraitRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/studio/portraits", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return svc.StudioPortraits(c.Request.Context(), user)
	}))
	r.POST("/studio/portraits", func(c *gin.Context) {
		var req service.StudioPortraitCreateRequest
		if !bindPartnerJSON(c, &req) {
			return
		}
		if !enforceRateLimit(c, "studio-portrait-create:"+c.ClientIP(), 10, 10*time.Minute) {
			return
		}
		partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
			return svc.CreateStudioPortrait(c.Request.Context(), user, req, requestOrigin(c))
		})(c)
	})
	r.POST("/studio/portraits/:id/check", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return svc.CheckStudioPortrait(c.Request.Context(), user, c.Param("id"))
	}))
	r.DELETE("/studio/portraits/:id", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return gin.H{"ok": true}, svc.DeleteStudioPortrait(c.Request.Context(), user, c.Param("id"))
	}))
	r.POST("/studio/portraits/:id/photos", func(c *gin.Context) {
		var req service.StudioPortraitPhotoRequest
		if !bindPartnerJSON(c, &req) {
			return
		}
		partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
			return svc.AddStudioPortraitPhoto(c.Request.Context(), user, c.Param("id"), req)
		})(c)
	})
	r.DELETE("/studio/portrait-photos/:id", partnerRoute(svc, func(c *gin.Context, user *model.User) (any, error) {
		return gin.H{"ok": true}, svc.DeleteStudioPortraitPhoto(c.Request.Context(), user, c.Param("id"))
	}))
}
