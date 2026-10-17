package handler

import (
	"bytes"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func queryInt(c *gin.Context, name string) int {
	value, _ := strconv.Atoi(c.Query(name))
	return value
}

var studioProfilePreviewPage = template.Must(template.New("preview").Parse(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>{{.Title}} · AI Studio</title>
<meta name="description" content="{{.Description}}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="AI Studio">
<meta property="og:title" content="{{.Title}}">
<meta property="og:description" content="{{.Description}}">
<meta property="og:url" content="{{.URL}}">
{{if .Image}}<meta property="og:image" content="{{.Image}}">
<meta name="twitter:image" content="{{.Image}}">{{end}}
<meta name="twitter:card" content="{{if .Image}}summary_large_image{{else}}summary{{end}}">
<meta name="twitter:title" content="{{.Title}}">
<meta name="twitter:description" content="{{.Description}}">
</head><body><h1>{{.Title}}</h1><p>{{.Description}}</p><a href="{{.URL}}">{{.URL}}</a></body></html>`))

// requestOrigin 是访问者看到的站点地址（经过反向代理时取转发头）。
func requestOrigin(c *gin.Context) string {
	proto := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Proto"), ",")[0])
	if proto != "https" && proto != "http" {
		proto = "http"
		if c.Request.TLS != nil {
			proto = "https"
		}
	}
	host := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Host"), ",")[0])
	if host == "" {
		host = c.Request.Host
	}
	return proto + "://" + host
}

// RegisterStudioCommunityRoutes 注册灵感社区、会员套餐和对应的管理接口。
func RegisterStudioCommunityRoutes(r *gin.RouterGroup, svc *service.Service) {
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
	communityQuery := func(c *gin.Context) service.StudioCommunityQuery {
		return service.StudioCommunityQuery{
			Kind: c.Query("kind"), Sort: c.Query("sort"), Templates: c.Query("templates") == "true", Featured: c.Query("featured") == "true",
			Mine: c.Query("mine") == "true", Following: c.Query("following") == "true", Search: c.Query("q"), Offset: queryInt(c, "offset"), Limit: queryInt(c, "pageSize"),
		}
	}
	r.GET("/studio/community", withUser(func(c *gin.Context, user *model.User) {
		page, err := svc.StudioCommunity(user.ID, communityQuery(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	}))
	// 创作者主页：读主页不需要登录（viewer 为空），方便把主页链接分享出去。
	viewerID := func(c *gin.Context) string {
		if sessionCookie(c) == "" {
			return ""
		}
		if user, err := currentUser(c, svc); err == nil && user != nil {
			return user.ID
		}
		return ""
	}
	r.GET("/studio/profile", withUser(func(c *gin.Context, user *model.User) {
		view, err := svc.StudioMyProfile(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	}))
	r.PUT("/studio/profile", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioProfileInput
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		view, err := svc.UpdateStudioProfile(user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	}))
	r.GET("/studio/profiles/:handle", func(c *gin.Context) {
		view, err := svc.StudioProfileByHandle(viewerID(c), c.Param("handle"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.GET("/studio/profiles/:handle/posts", func(c *gin.Context) {
		page, err := svc.StudioProfilePosts(viewerID(c), c.Param("handle"), c.Query("tab"), queryInt(c, "offset"), queryInt(c, "pageSize"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	r.GET("/studio/creators", func(c *gin.Context) {
		page, err := svc.StudioCreators(viewerID(c), service.StudioCreatorQuery{
			Search: c.Query("q"), Specialty: c.Query("specialty"), Location: c.Query("location"), Sort: c.Query("sort"),
			Offset: queryInt(c, "offset"), Limit: queryInt(c, "pageSize"),
		})
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	// 分享链接预览：nginx 把 WhatsApp、Facebook 等爬虫对 /u/:handle 的请求转到这里，返回带 Open Graph 标签的页面。
	r.GET("/public/studio/profile-preview/:handle", func(c *gin.Context) {
		preview, err := svc.StudioProfilePreviewByHandle(c.Param("handle"))
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		origin := requestOrigin(c)
		image := preview.ImagePath
		if strings.HasPrefix(image, "/") {
			image = origin + image
		}
		var body bytes.Buffer
		if err := studioProfilePreviewPage.Execute(&body, map[string]string{
			"Title": preview.Title, "Description": preview.Description, "Image": image, "URL": origin + "/u/" + url.PathEscape(preview.Handle),
		}); err != nil {
			fail(c, http.StatusInternalServerError, err)
			return
		}
		// 页面里的站点地址来自请求头，不让共享缓存保存。
		c.Header("Cache-Control", "private, no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", body.Bytes())
	})
	r.PUT("/studio/profiles/:handle/follow", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Following bool `json:"following"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		view, err := svc.FollowStudioProfile(user.ID, c.Param("handle"), req.Following)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	}))
	r.POST("/studio/works/:id/publish", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioPublishInput
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		post, err := svc.PublishStudioWork(user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, post)
	}))
	r.PUT("/studio/community/:id/like", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Liked bool `json:"liked"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		count, err := svc.LikeStudioPost(user.ID, c.Param("id"), req.Liked)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"liked": req.Liked, "likeCount": count})
	}))
	r.POST("/studio/community/:id/remix", withUser(func(c *gin.Context, user *model.User) {
		remix, err := svc.RemixStudioPost(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, remix)
	}))
	r.DELETE("/studio/community/:id", withUser(func(c *gin.Context, user *model.User) {
		if err := svc.DeleteStudioPost(user, c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	}))
	r.GET("/studio/plans", withUser(func(c *gin.Context, _ *model.User) {
		offers, err := svc.StudioPlanOffers()
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"plans": offers})
	}))
	r.GET("/studio/membership", withUser(func(c *gin.Context, user *model.User) {
		view, err := svc.StudioMembership(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	}))

	r.GET("/admin/studio/community", withUser(func(c *gin.Context, user *model.User) {
		page, err := svc.AdminStudioCommunity(user, communityQuery(c))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	}))
	r.PATCH("/admin/studio/community/:id", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioPostAdminInput
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		post, err := svc.UpdateStudioPostAdmin(user, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, post)
	}))
	r.GET("/admin/studio/plans", withUser(func(c *gin.Context, user *model.User) {
		plans, err := svc.AdminStudioPlans(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"plans": plans})
	}))
	savePlan := func(c *gin.Context, user *model.User, id string) {
		var req service.StudioPlanInput
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		plan, err := svc.SaveStudioPlan(user, id, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, plan)
	}
	r.GET("/studio/tool-covers", withUser(func(c *gin.Context, _ *model.User) {
		covers, err := svc.StudioToolCovers()
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"covers": covers})
	}))
	r.PUT("/admin/studio/tool-covers/:toolId", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			ResourceID string `json:"resourceId"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := svc.SetStudioToolCover(user, c.Param("toolId"), req.ResourceID); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"saved": true})
	}))
	r.POST("/admin/studio/plans", withUser(func(c *gin.Context, user *model.User) { savePlan(c, user, "") }))
	r.PUT("/admin/studio/plans/:id", withUser(func(c *gin.Context, user *model.User) { savePlan(c, user, c.Param("id")) }))
}
