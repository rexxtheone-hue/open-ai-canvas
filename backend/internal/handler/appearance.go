package handler

import (
	"net/http"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func webAppManifest(brandName, description string, logoConfigured bool, logoURL string) gin.H {
	icons := []gin.H{
		{"src": "/brand/omnimuse-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
		{"src": "/brand/omnimuse-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
	}
	// 后台换了 Logo 就只用新 Logo，不混入内置品牌图标；尺寸未知时声明 any。
	if logoConfigured && logoURL != "" {
		icons = []gin.H{{"src": logoURL, "sizes": "any", "purpose": "any"}}
	}
	return gin.H{
		"id": "/", "name": brandName, "short_name": brandName, "description": description,
		"start_url": "/", "scope": "/", "display": "standalone", "orientation": "any",
		"background_color": "#ffffff", "theme_color": "#ffffff", "icons": icons,
	}
}

func RegisterAppearanceRoutes(r *gin.RouterGroup, svc *service.Service) {
	registerLive2DRoutes(r, svc)
	serveUpdateMedia := func(admin bool) gin.HandlerFunc {
		return func(c *gin.Context) {
			var actor *model.User
			if admin {
				var err error
				actor, err = currentUser(c, svc)
				if err != nil {
					failService(c, err)
					return
				}
			}
			delivery, err := svc.PrepareUpdateAnnouncementDelivery(actor, c.Param("id"), resourceAccessOptions(c), c.GetHeader("Range"))
			if err != nil {
				failService(c, err)
				return
			}
			serveResourceDelivery(c, delivery, "private, no-store", "")
		}
	}
	r.GET("/public/appearance/updates/:id", serveUpdateMedia(false))
	r.GET("/admin/settings/appearance/updates/:id", serveUpdateMedia(true))
	r.GET("/public/appearance", func(c *gin.Context) {
		setting, err := svc.Appearance()
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"appearance": setting})
	})

	// PWA 清单跟随外观设置：首屏 HTML 保持品牌中性，安装到手机桌面时才取品牌名和图标。
	r.GET("/public/manifest.webmanifest", func(c *gin.Context) {
		setting, err := svc.Appearance()
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Header("Content-Type", "application/manifest+json; charset=utf-8")
		c.JSON(http.StatusOK, webAppManifest(setting.BrandName, setting.SEODescription, setting.LogoConfigured, setting.LogoURL))
	})

	r.GET("/public/appearance/assets/:slot", func(c *gin.Context) {
		delivery, err := svc.PrepareAppearanceAssetDelivery(c.Param("slot"), resourceAccessOptions(c), c.GetHeader("Range"))
		if err != nil {
			failService(c, err)
			return
		}
		serveResourceDelivery(c, delivery, "public, no-cache", "")
	})

	r.GET("/admin/settings/appearance", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		setting, err := svc.AdminAppearance(actor)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.PATCH("/admin/settings/appearance", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		current, err := svc.AdminAppearance(actor)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		req := current.AppearanceSetting
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.UpdateAppearance(actor, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.DELETE("/admin/settings/appearance", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		setting, err := svc.ResetAppearance(actor)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.POST("/admin/settings/appearance/assets/:slot", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "admin-appearance-upload:"+actor.ID, policy.Request.ResourceUploadPerMinute, time.Minute) {
			return
		}
		maxBytes, err := service.AppearanceAssetMaxBytes(c.Param("slot"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes+(1<<20))
		file, err := c.FormFile("file")
		if c.Request.MultipartForm != nil {
			defer c.Request.MultipartForm.RemoveAll()
		}
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		resource, err := svc.UploadAppearanceAsset(actor, c.Param("slot"), file)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"resource": resource})
	})
}
