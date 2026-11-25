package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// RegisterDeveloperAPIRoutes 注册开放接口：/api/v1 只认 Bearer 令牌（个人 API Key 或 MCP 的 OAuth 令牌），
// /api/api-tokens 用登录会话管理个人密钥。令牌不能用在其他接口上，避免密钥泄露后能改账号或进后台。
func RegisterDeveloperAPIRoutes(api *gin.RouterGroup, svc *service.Service) {
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
	api.GET("/api-tokens", withUser(func(c *gin.Context, user *model.User) {
		tokens, err := svc.PersonalAPITokens(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"tokens": tokens})
	}))
	api.POST("/api-tokens", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name string `json:"name"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, errors.New("请求格式错误"))
			return
		}
		token, err := svc.CreatePersonalAPIToken(user, req.Name)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"token": token})
	}))
	api.DELETE("/api-tokens/:id", withUser(func(c *gin.Context, user *model.User) {
		if err := svc.RevokePersonalAPIToken(user.ID, c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"revoked": true})
	}))

	v1 := api.Group("/v1")
	v1.GET("/me", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		account, err := svc.OpenAPIAccount(c.Request.Context(), user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, account)
	}))
	v1.GET("/models", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		models, err := svc.OpenAPIModels(c.Request.Context(), c.Query("kind"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"models": models})
	}))
	v1.POST("/quote", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		req, valid := bindGenerationRequest(c, svc)
		if !valid {
			return
		}
		quote, err := svc.QuoteOpenAPIGeneration(c.Request.Context(), user, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, quote)
	}))
	v1.POST("/uploads", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "resources-upload:"+user.ID, policy.Request.ResourceUploadPerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (policy.Resource.ResourceUploadMB<<20)+(1<<20))
		file, err := c.FormFile("file")
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				fail(c, http.StatusBadRequest, fmt.Errorf("单个上传文件必须小于 %dMB", policy.Resource.ResourceUploadMB))
				return
			}
			fail(c, http.StatusBadRequest, errors.New("请用 multipart 表单的 file 字段上传文件"))
			return
		}
		kind := strings.TrimSpace(c.PostForm("kind"))
		if kind == "" {
			kind = uploadKindFromMime(file.Header.Get("Content-Type"))
		}
		width, _ := strconv.Atoi(c.PostForm("width"))
		height, _ := strconv.Atoi(c.PostForm("height"))
		durationMs, _ := strconv.ParseInt(c.PostForm("durationMs"), 10, 64)
		resource, err := svc.UploadResource(user.ID, file, kind, width, height, durationMs, c.GetHeader("X-Idempotency-Key"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"resourceId": resource.ID, "kind": resource.Kind, "mimeType": resource.MimeType, "bytes": resource.Size, "width": resource.Width, "height": resource.Height, "durationMs": resource.DurationMs})
	}))
	v1.POST("/generations", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "tasks:"+user.ID, policy.Request.TaskCreatePerMinute, time.Minute) {
			return
		}
		req, valid := bindGenerationRequest(c, svc)
		if !valid {
			return
		}
		generations, err := svc.CreateOpenAPIGenerations(c.Request.Context(), user, req)
		if err != nil && len(generations) == 0 {
			failService(c, err)
			return
		}
		result := gin.H{"generations": generations}
		if err != nil {
			result["warning"] = err.Error()
		}
		ok(c, result)
	}))
	v1.GET("/generations", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		limit, _ := strconv.Atoi(c.Query("limit"))
		page, err := svc.OpenAPIGenerations(c.Request.Context(), user, c.Query("kind"), c.Query("cursor"), limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	}))
	v1.GET("/assets", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		limit, _ := strconv.Atoi(c.Query("limit"))
		assets, err := svc.OpenAPIAssets(c.Request.Context(), user.ID, c.Query("kind"), c.Query("query"), limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"assets": assets})
	}))
	v1.GET("/generations/:id", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		generation, err := svc.OpenAPIGeneration(c.Request.Context(), user, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, generation)
	}))
	v1.POST("/generations/:id/cancel", withAPIToken(svc, func(c *gin.Context, user *model.User) {
		generation, err := svc.CancelOpenAPIGeneration(c.Request.Context(), user, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, generation)
	}))
}

func bindGenerationRequest(c *gin.Context, svc *service.Service) (service.OpenAPIGenerationRequest, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
	var req service.OpenAPIGenerationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, errors.New("请求格式错误："+err.Error()))
		return req, false
	}
	req.Client = apiClientName(c)
	token, _ := c.Get(apiTokenContextKey)
	apiToken, _ := token.(*model.APIToken)
	req.App = svc.OpenAPIAppName(apiToken, c.GetHeader("User-Agent"), req.Client)
	return req, true
}

func apiClientName(c *gin.Context) string {
	switch strings.ToLower(strings.TrimSpace(c.GetHeader("X-OmniMuse-Client"))) {
	case "cli":
		return "cli"
	case "mcp":
		return "mcp"
	}
	return "api"
}

func uploadKindFromMime(mime string) string {
	mime = strings.ToLower(mime)
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	}
	return "file"
}

func bearerToken(c *gin.Context) string {
	scheme, token, found := strings.Cut(strings.TrimSpace(c.GetHeader("Authorization")), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

// apiTokenUser 只接受 Bearer 令牌，不读登录 Cookie，开放接口的调用方一定是密钥持有人。
func apiTokenUser(c *gin.Context, svc *service.Service) (*model.User, error) {
	token := bearerToken(c)
	if token == "" {
		return nil, service.Unauthorized("缺少 API Key：请在请求头加 Authorization: Bearer <API Key>")
	}
	user, apiToken, err := svc.AuthenticateAPIToken(token, requestTenant(c))
	if err == nil {
		c.Set(apiTokenContextKey, apiToken)
	}
	return user, err
}

const apiTokenContextKey = "omnimuse.apiToken"

func withAPIToken(svc *service.Service, next func(*gin.Context, *model.User)) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := apiTokenUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		next(c, user)
	}
}
