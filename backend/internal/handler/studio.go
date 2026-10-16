package handler

import (
	"net/http"

	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// RegisterStudioRoutes 注册 AI Studio 的作品库与界面偏好接口。生成本身仍走 POST /tasks。
func RegisterStudioRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/studio/preferences", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		preference, err := svc.StudioPreference(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, preference)
	})
	r.PUT("/studio/preferences", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			Surface string `json:"surface"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		preference, err := svc.SaveStudioPreference(user.ID, req.Surface)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, preference)
	})
	r.GET("/studio/works", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, err := parsePositiveQueryInt(c.Query("pageSize"), 40)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		page, err := svc.StudioWorks(user.ID, service.StudioWorkQuery{
			Kind:          c.Query("kind"),
			FavoritesOnly: c.Query("favorite") == "true",
			Search:        c.Query("q"),
			ActiveOnly:    c.Query("activeOnly") == "true",
			Tool:          c.Query("tool"),
			Cursor:        c.Query("cursor"),
			Limit:         limit,
		})
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	r.PUT("/studio/works/:id/favorite", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			Favorite bool `json:"favorite"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := svc.SetStudioFavorite(user.ID, c.Param("id"), req.Favorite); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"favorite": req.Favorite})
	})
	r.POST("/studio/works/delete", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			IDs []string `json:"ids"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		removed, err := svc.HideStudioWorks(user.ID, req.IDs)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"removed": removed})
	})
	r.GET("/studio/brand-kits", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		kits, err := svc.StudioBrandKits(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"brandKits": kits})
	})
	r.POST("/studio/brand-kits", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.StudioBrandKitInput
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		kit, err := svc.CreateStudioBrandKit(user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, kit)
	})
	r.PUT("/studio/brand-kits/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.StudioBrandKitInput
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		kit, err := svc.UpdateStudioBrandKit(user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, kit)
	})
	r.DELETE("/studio/brand-kits/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.DeleteStudioBrandKit(user.ID, c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	})
}
