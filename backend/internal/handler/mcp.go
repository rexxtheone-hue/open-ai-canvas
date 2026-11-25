package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCP 服务：https://<网址>/mcp（Streamable HTTP，无状态）。用户身份来自 Bearer 令牌：
// Claude、ChatGPT 等走 OAuth 拿到的访问令牌，Claude Code、Cursor 等也可以直接用个人 API Key。

const mcpInstructions = `OmniMuse is an AI image and video studio. Use these tools to generate images and videos with the user's OmniMuse credits.
Workflow: (1) optionally call list_models to pick a model and see its options; (2) call generate_image or generate_video; (3) videos take minutes, so call get_generation with the returned id until status is "succeeded", then show the output URLs to the user.
Every generation costs credits. If the user has not chosen a model or the request is expensive (video, 4K, multiple outputs), call estimate_cost first and tell the user the price.
References: the user's uploaded images, videos, audio and saved characters live in their OmniMuse library. When the user names a file, character or "the material I used before", call list_assets (search by name) or get_generation (its "references" list) and pass the asset ids in reference_image_urls, first_frame_url, reference_audio_urls and so on. Public https URLs also work. Refer to references in the prompt by order: image 1, image 2, audio 1.
Video sound is on by default. Results also appear in the user's OmniMuse Studio library.`

var mcpSchemaCache = mcp.NewSchemaCache()

type mcpUserKey struct{}

func mcpUser(ctx context.Context) (*model.User, error) {
	user, _ := ctx.Value(mcpUserKey{}).(*model.User)
	if user == nil {
		return nil, errors.New("not authenticated")
	}
	return user, nil
}

type mcpModelsInput struct {
	Kind string `json:"kind,omitempty" jsonschema:"image or video; omit to list both"`
}

type mcpImageInput struct {
	Prompt             string         `json:"prompt" jsonschema:"what to generate; describe subject, style, lighting and composition"`
	Model              string         `json:"model,omitempty" jsonschema:"model id or name from list_models; omit to use the default image model"`
	AspectRatio        string         `json:"aspect_ratio,omitempty" jsonschema:"for example 1:1, 16:9, 9:16, 4:5"`
	Resolution         string         `json:"resolution,omitempty" jsonschema:"for example 1k, 2k, 4k when the model supports it"`
	Quality            string         `json:"quality,omitempty" jsonschema:"quality tier when the model supports it"`
	ReferenceImageURLs []string       `json:"reference_image_urls,omitempty" jsonschema:"asset ids from list_assets or public https image URLs, to edit or use as reference"`
	Count              int            `json:"count,omitempty" jsonschema:"number of images, 1 to 4 (default 1); each one is charged"`
	Parameters         map[string]any `json:"parameters,omitempty" jsonschema:"advanced model-specific options"`
}

type mcpVideoInput struct {
	Prompt             string   `json:"prompt" jsonschema:"what happens in the video; describe subject, action, camera movement and style"`
	Model              string   `json:"model,omitempty" jsonschema:"model id or name from list_models; omit to use the default video model"`
	AspectRatio        string   `json:"aspect_ratio,omitempty" jsonschema:"for example 16:9, 9:16, 1:1"`
	Resolution         string   `json:"resolution,omitempty" jsonschema:"for example 480p, 720p, 1080p"`
	Duration           int      `json:"duration,omitempty" jsonschema:"length in seconds; see list_models for allowed values"`
	GenerateAudio      *bool    `json:"generate_audio,omitempty" jsonschema:"sound is ON by default when the model supports it; set false only when the user asks for a silent video"`
	FirstFrameURL      string   `json:"first_frame_url,omitempty" jsonschema:"asset id or public https image URL used as the first frame (image to video)"`
	LastFrameURL       string   `json:"last_frame_url,omitempty" jsonschema:"asset id or public https image URL used as the last frame"`
	ReferenceImageURLs []string `json:"reference_image_urls,omitempty" jsonschema:"asset ids from list_assets or public https image URLs, for characters, products or scenes"`
	ReferenceVideoURLs []string `json:"reference_video_urls,omitempty" jsonschema:"asset ids from list_assets or public https video URLs, to reference, edit or extend"`
	ReferenceAudioURLs []string `json:"reference_audio_urls,omitempty" jsonschema:"asset ids from list_assets or public https audio URLs, for example a voice or voiceover for lip sync"`
	Count              int      `json:"count,omitempty" jsonschema:"number of videos, 1 to 4 (default 1); each one is charged"`
}

type mcpEstimateInput struct {
	Kind  string        `json:"kind" jsonschema:"image or video"`
	Image mcpImageInput `json:"image,omitempty" jsonschema:"the generate_image arguments when kind is image"`
	Video mcpVideoInput `json:"video,omitempty" jsonschema:"the generate_video arguments when kind is video"`
}

type mcpGenerationInput struct {
	ID          string `json:"id" jsonschema:"generation id returned by generate_image or generate_video"`
	WaitSeconds int    `json:"wait_seconds,omitempty" jsonschema:"wait up to this many seconds (max 50) for the generation to finish before returning"`
}

type mcpListInput struct {
	Kind  string `json:"kind,omitempty" jsonschema:"image or video; omit for both"`
	Limit int    `json:"limit,omitempty" jsonschema:"how many recent generations to return, up to 50 (default 10)"`
}

type mcpAssetsInput struct {
	Kind  string `json:"kind,omitempty" jsonschema:"image, video, audio or character; omit for all"`
	Query string `json:"query,omitempty" jsonschema:"part of the file or character name, for example KF4 or Adam"`
	Limit int    `json:"limit,omitempty" jsonschema:"how many to return, up to 100 (default 30)"`
}

type mcpEmpty struct{}

func mcpText(value any, summary string) *mcp.CallToolResult {
	data, _ := json.MarshalIndent(value, "", "  ")
	text := string(data)
	if summary != "" {
		text = summary + "\n\n" + text
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

func urlRefs(kind string, urls []string, role string) []service.OpenAPIReference {
	refs := make([]service.OpenAPIReference, 0, len(urls))
	for _, url := range urls {
		url = strings.TrimSpace(url)
		switch {
		case url == "":
		case strings.HasPrefix(strings.ToLower(url), "http://") || strings.HasPrefix(strings.ToLower(url), "https://"):
			refs = append(refs, service.OpenAPIReference{URL: url, Kind: kind, Role: role})
		default:
			// 不是网址就当作素材库里的素材 ID（list_assets、get_generation 返回的 id）。
			refs = append(refs, service.OpenAPIReference{ResourceID: strings.TrimPrefix(url, "resource:"), Kind: kind, Role: role})
		}
	}
	return refs
}

func (in mcpImageInput) request() service.OpenAPIGenerationRequest {
	return service.OpenAPIGenerationRequest{Model: in.Model, Prompt: in.Prompt, AspectRatio: in.AspectRatio, Resolution: in.Resolution, Quality: in.Quality, References: urlRefs("image", in.ReferenceImageURLs, ""), Parameters: in.Parameters, Count: in.Count, Client: "mcp"}
}

func (in mcpVideoInput) request() service.OpenAPIGenerationRequest {
	refs := []service.OpenAPIReference{}
	refs = append(refs, urlRefs("image", []string{in.FirstFrameURL}, "first_frame")...)
	refs = append(refs, urlRefs("image", []string{in.LastFrameURL}, "last_frame")...)
	refs = append(refs, urlRefs("image", in.ReferenceImageURLs, "")...)
	refs = append(refs, urlRefs("video", in.ReferenceVideoURLs, "")...)
	refs = append(refs, urlRefs("audio", in.ReferenceAudioURLs, "")...)
	return service.OpenAPIGenerationRequest{Model: in.Model, Prompt: in.Prompt, AspectRatio: in.AspectRatio, Resolution: in.Resolution, Duration: in.Duration, GenerateAudio: in.GenerateAudio, References: refs, Count: in.Count, Client: "mcp"}
}

// withDefaultModel 没指定模型时用目录里该类型排在第一的模型。
func withDefaultModel(ctx context.Context, svc *service.Service, kind string, req service.OpenAPIGenerationRequest) (service.OpenAPIGenerationRequest, error) {
	if strings.TrimSpace(req.Model) != "" {
		return req, nil
	}
	models, err := svc.OpenAPIModels(ctx, kind)
	if err != nil {
		return req, err
	}
	if len(models) == 0 {
		return req, fmt.Errorf("当前没有可用的%s模型", kind)
	}
	req.Model = models[0].ID
	return req, nil
}

// waitForGeneration 在服务端等待一小段时间，图片通常十几秒就能完成，省得模型来回轮询。
func waitForGeneration(ctx context.Context, svc *service.Service, user *model.User, id string, wait time.Duration) (*service.OpenAPIGeneration, error) {
	deadline := time.Now().Add(wait)
	for {
		generation, err := svc.OpenAPIGeneration(ctx, user, id)
		if err != nil {
			return nil, err
		}
		if generationDone(generation.Status) || time.Now().After(deadline) {
			return generation, nil
		}
		select {
		case <-ctx.Done():
			return generation, nil
		case <-time.After(2 * time.Second):
		}
	}
}

func generationDone(status string) bool {
	switch model.TaskStatus(status) {
	case model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled:
		return true
	}
	return false
}

// withPreviews 把已完成作品的图片缩略图附在结果里，Claude、ChatGPT 会直接在对话里显示，
// 不会再自己去找相似的网图。视频只给链接。
func withPreviews(svc *service.Service, user *model.User, result *mcp.CallToolResult, generations ...*service.OpenAPIGeneration) *mcp.CallToolResult {
	added := 0
	for _, g := range generations {
		if g == nil || model.TaskStatus(g.Status) != model.TaskStatusSucceeded {
			continue
		}
		for _, output := range g.Outputs {
			if output.Type != "image" || output.ResourceID == "" || added >= 4 {
				continue
			}
			data, mimeType, err := svc.OpenAPIImagePreview(user.ID, output.ResourceID)
			if err != nil || len(data) == 0 {
				continue
			}
			result.Content = append(result.Content, &mcp.ImageContent{Data: data, MIMEType: mimeType})
			added++
		}
	}
	return result
}

func generationSummary(g *service.OpenAPIGeneration) string {
	switch model.TaskStatus(g.Status) {
	case model.TaskStatusSucceeded:
		lines := []string{fmt.Sprintf("Generation %s finished (%g credits).", g.ID, g.Credits)}
		for _, output := range g.Outputs {
			lines = append(lines, fmt.Sprintf("%s: %s", output.Type, output.URL))
		}
		lines = append(lines, "Any generated images are attached below: show those to the user and never substitute other pictures. Download links expire in 24 hours; the work is also saved in the user's OmniMuse Studio library.")
		return strings.Join(lines, "\n")
	case model.TaskStatusFailed, model.TaskStatusCancelled:
		return fmt.Sprintf("Generation %s %s: %s. Credits for failed generations are refunded automatically.", g.ID, g.Status, g.Error)
	default:
		return fmt.Sprintf("Generation %s is %s (%d%%). Call get_generation with this id again to check progress.", g.ID, g.Status, g.Progress)
	}
}

func newMCPServer(svc *service.Service) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "omnimuse", Title: "OmniMuse", Version: "1.0.0"}, &mcp.ServerOptions{Instructions: mcpInstructions, SchemaCache: mcpSchemaCache})
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true}

	mcp.AddTool(server, &mcp.Tool{Name: "get_account", Title: "Account and credits", Description: "Show the connected OmniMuse account and its available credits.", Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ mcpEmpty) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			account, err := svc.OpenAPIAccount(ctx, user)
			if err != nil {
				return nil, nil, err
			}
			return mcpText(account, fmt.Sprintf("Signed in as %s with %g credits available.", account.Username, account.AvailableCredits)), nil, nil
		})

	mcp.AddTool(server, &mcp.Tool{Name: "list_models", Title: "List models", Description: "List the image and video models available on OmniMuse, with their price, aspect ratios, resolutions, durations and reference limits.", Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpModelsInput) (*mcp.CallToolResult, any, error) {
			models, err := svc.OpenAPIModels(ctx, in.Kind)
			if err != nil {
				return nil, nil, err
			}
			return mcpText(models, fmt.Sprintf("%d models available. Pass a model's id (or exact name) as \"model\".", len(models))), nil, nil
		})

	mcp.AddTool(server, &mcp.Tool{Name: "list_assets", Title: "Find my assets", Description: "Search the user's OmniMuse library (uploaded images, videos, audio and saved characters) by name. Returns asset ids to pass as references to generate_image or generate_video, with small previews of the images.", Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpAssetsInput) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			assets, err := svc.OpenAPIAssets(ctx, user.ID, in.Kind, in.Query, in.Limit)
			if err != nil {
				return nil, nil, err
			}
			summary := fmt.Sprintf("%d assets found. Pass an asset's id as a reference (for example in reference_image_urls).", len(assets))
			if len(assets) == 0 {
				summary = "No matching assets. Try a shorter name, another kind, or ask the user to upload the file in OmniMuse Studio."
			}
			result := mcpText(assets, summary)
			previews := 0
			for _, asset := range assets {
				if asset.Kind != "image" || previews >= 8 {
					continue
				}
				if data, mimeType, err := svc.OpenAPIImagePreview(user.ID, asset.ID); err == nil && len(data) > 0 {
					result.Content = append(result.Content, &mcp.TextContent{Text: "Preview of " + asset.Name + " (" + asset.ID + "):"}, &mcp.ImageContent{Data: data, MIMEType: mimeType})
					previews++
				}
			}
			return result, nil, nil
		})

	mcp.AddTool(server, &mcp.Tool{Name: "estimate_cost", Title: "Estimate cost", Description: "Estimate how many credits a generate_image or generate_video call would cost, without generating anything.", Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpEstimateInput) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			kind := strings.ToLower(strings.TrimSpace(in.Kind))
			req := in.Image.request()
			if kind == "video" {
				req = in.Video.request()
			} else if kind != "image" {
				return nil, nil, errors.New("kind must be image or video")
			}
			if req, err = withDefaultModel(ctx, svc, kind, req); err != nil {
				return nil, nil, err
			}
			quote, err := svc.QuoteOpenAPIGeneration(ctx, user, req)
			if err != nil {
				return nil, nil, err
			}
			return mcpText(quote, fmt.Sprintf("Estimated cost: %v credits.", quote["credits"])), nil, nil
		})

	generate := func(kind string) func(context.Context, service.OpenAPIGenerationRequest, time.Duration) (*mcp.CallToolResult, any, error) {
		return func(ctx context.Context, req service.OpenAPIGenerationRequest, wait time.Duration) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			if req, err = withDefaultModel(ctx, svc, kind, req); err != nil {
				return nil, nil, err
			}
			generations, err := svc.CreateOpenAPIGenerations(ctx, user, req)
			if err != nil && len(generations) == 0 {
				return nil, nil, err
			}
			summaries := []string{}
			for i := range generations {
				if wait > 0 {
					if done, waitErr := waitForGeneration(ctx, svc, user, generations[i].ID, wait); waitErr == nil {
						generations[i] = *done
					}
				}
				summaries = append(summaries, generationSummary(&generations[i]))
			}
			if err != nil {
				summaries = append(summaries, "Warning: "+err.Error())
			}
			finished := make([]*service.OpenAPIGeneration, 0, len(generations))
			for i := range generations {
				finished = append(finished, &generations[i])
			}
			return withPreviews(svc, user, mcpText(generations, strings.Join(summaries, "\n\n")), finished...), nil, nil
		}
	}
	generateImage, generateVideo := generate("image"), generate("video")

	mcp.AddTool(server, &mcp.Tool{Name: "generate_image", Title: "Generate image", Description: "Generate images on OmniMuse (charged in credits). Waits up to about 45 seconds and returns the image URLs; if still running, returns an id to check with get_generation."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpImageInput) (*mcp.CallToolResult, any, error) {
			return generateImage(ctx, in.request(), 45*time.Second)
		})

	mcp.AddTool(server, &mcp.Tool{Name: "generate_video", Title: "Generate video", Description: "Start a video generation on OmniMuse (charged in credits). Supports text to video, first/last frame, and reference images, videos or audio. Videos take one to several minutes: poll get_generation with the returned id."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpVideoInput) (*mcp.CallToolResult, any, error) {
			return generateVideo(ctx, in.request(), 0)
		})

	mcp.AddTool(server, &mcp.Tool{Name: "get_generation", Title: "Check generation", Description: "Get the status, output URLs and the reference assets (\"references\") of a generation. Pass those reference ids back to generate_image or generate_video to reuse the same materials. Set wait_seconds (up to 50) to wait for it to finish.", Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpGenerationInput) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			wait := time.Duration(min(max(in.WaitSeconds, 0), 50)) * time.Second
			generation, err := waitForGeneration(ctx, svc, user, in.ID, wait)
			if err != nil {
				return nil, nil, err
			}
			return withPreviews(svc, user, mcpText(generation, generationSummary(generation)), generation), nil, nil
		})

	mcp.AddTool(server, &mcp.Tool{Name: "list_generations", Title: "Recent generations", Description: "List the user's most recent OmniMuse generations (from the web Studio, CLI and MCP).", Annotations: readOnly},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpListInput) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			limit := in.Limit
			if limit <= 0 {
				limit = 10
			}
			page, err := svc.OpenAPIGenerations(ctx, user, in.Kind, "", limit)
			if err != nil {
				return nil, nil, err
			}
			return mcpText(page.Generations, fmt.Sprintf("%d recent generations. Use get_generation for output URLs.", len(page.Generations))), nil, nil
		})

	mcp.AddTool(server, &mcp.Tool{Name: "cancel_generation", Title: "Cancel generation", Description: "Cancel a generation that is still queued or running."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in mcpGenerationInput) (*mcp.CallToolResult, any, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, nil, err
			}
			generation, err := svc.CancelOpenAPIGeneration(ctx, user, in.ID)
			if err != nil {
				return nil, nil, err
			}
			return mcpText(generation, generationSummary(generation)), nil, nil
		})
	return server
}

func requestBaseURL(c *gin.Context) string {
	scheme := "https"
	if proto := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Proto"), ",")[0]); proto != "" {
		scheme = strings.ToLower(proto)
	} else if c.Request.TLS == nil {
		scheme = "http"
	}
	host := c.Request.Host
	if forwarded := strings.TrimSpace(c.GetHeader("X-Forwarded-Host")); forwarded != "" {
		host = forwarded
	}
	return scheme + "://" + host
}

// RegisterMCPRoutes 挂在网站根路径：/mcp、OAuth 元数据（/.well-known/...），以及 /api/oauth/* 授权接口。
func RegisterMCPRoutes(r *gin.Engine, api *gin.RouterGroup, svc *service.Service) {
	server := newMCPServer(svc)
	streamable := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	mcpHandler := func(c *gin.Context) {
		user, err := apiTokenUser(c, svc)
		if err != nil {
			base := requestBaseURL(c)
			c.Header("WWW-Authenticate", fmt.Sprintf(`Bearer resource_metadata="%s/.well-known/oauth-protected-resource/mcp"`, base))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token", "error_description": err.Error()})
			return
		}
		ctx := context.WithValue(c.Request.Context(), mcpUserKey{}, user)
		streamable.ServeHTTP(c.Writer, c.Request.WithContext(ctx))
	}
	r.POST("/mcp", mcpHandler)
	r.GET("/mcp", mcpHandler)
	r.DELETE("/mcp", mcpHandler)

	protectedResource := func(c *gin.Context) {
		base := requestBaseURL(c)
		c.JSON(http.StatusOK, gin.H{"resource": base + "/mcp", "authorization_servers": []string{base}, "bearer_methods_supported": []string{"header"}, "scopes_supported": []string{service.OAuthScope}, "resource_name": "OmniMuse"})
	}
	r.GET("/.well-known/oauth-protected-resource", protectedResource)
	r.GET("/.well-known/oauth-protected-resource/mcp", protectedResource)
	authorizationServer := func(c *gin.Context) {
		base := requestBaseURL(c)
		c.JSON(http.StatusOK, gin.H{
			"issuer":                                base,
			"authorization_endpoint":                base + "/oauth/authorize",
			"token_endpoint":                        base + "/api/oauth/token",
			"registration_endpoint":                 base + "/api/oauth/register",
			"response_types_supported":              []string{"code"},
			"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
			"code_challenge_methods_supported":      []string{"S256"},
			"token_endpoint_auth_methods_supported": []string{"none"},
			"scopes_supported":                      []string{service.OAuthScope},
		})
	}
	r.GET("/.well-known/oauth-authorization-server", authorizationServer)
	r.GET("/.well-known/openid-configuration", authorizationServer)

	oauthFail := func(c *gin.Context, err error) {
		var oauthError *service.OAuthError
		if errors.As(err, &oauthError) {
			c.JSON(http.StatusBadRequest, gin.H{"error": oauthError.Code, "error_description": oauthError.Description})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error", "error_description": "服务器错误，请稍后再试"})
	}
	api.POST("/oauth/register", func(c *gin.Context) {
		if !enforceRateLimit(c, "oauth-register:"+c.ClientIP(), 20, time.Hour) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
		var req service.OAuthClientRegistration
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_client_metadata", "error_description": "请求格式错误"})
			return
		}
		client, err := svc.RegisterOAuthClient(req)
		if err != nil {
			var oauthError *service.OAuthError
			if errors.As(err, &oauthError) {
				c.JSON(http.StatusBadRequest, gin.H{"error": oauthError.Code, "error_description": oauthError.Description})
				return
			}
			oauthFail(c, err)
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"client_id": client.ID, "client_id_issued_at": client.CreatedAt.Unix(), "client_name": client.Name,
			"redirect_uris": strings.Split(client.RedirectURIs, "\n"), "token_endpoint_auth_method": "none",
			"grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"},
		})
	})
	api.POST("/oauth/token", func(c *gin.Context) {
		if !enforceRateLimit(c, "oauth-token:"+c.ClientIP(), 120, time.Minute) {
			return
		}
		c.Header("Cache-Control", "no-store")
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
		var (
			response *service.OAuthTokenResponse
			err      error
		)
		switch c.PostForm("grant_type") {
		case "authorization_code":
			response, err = svc.ExchangeOAuthCode(requestTenant(c), c.PostForm("client_id"), c.PostForm("code"), c.PostForm("redirect_uri"), c.PostForm("code_verifier"))
		case "refresh_token":
			response, err = svc.RefreshOAuthToken(requestTenant(c), c.PostForm("client_id"), c.PostForm("refresh_token"))
		default:
			err = &service.OAuthError{Code: "unsupported_grant_type", Description: "只支持 authorization_code 和 refresh_token"}
		}
		if err != nil {
			oauthFail(c, err)
			return
		}
		c.JSON(http.StatusOK, response)
	})

	withSession := func(handle func(c *gin.Context, user *model.User)) gin.HandlerFunc {
		return func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			handle(c, user)
		}
	}
	api.GET("/oauth/authorize", withSession(func(c *gin.Context, _ *model.User) {
		info, err := svc.OAuthAuthorizeInfo(c.Query("client_id"), c.Query("redirect_uri"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, info)
	}))
	api.POST("/oauth/authorize", withSession(func(c *gin.Context, user *model.User) {
		var req struct {
			service.OAuthAuthorizeRequest
			Approve bool `json:"approve"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, errors.New("请求格式错误"))
			return
		}
		var (
			redirect string
			err      error
		)
		if req.Approve {
			redirect, err = svc.ApproveOAuthAuthorization(user, req.OAuthAuthorizeRequest)
		} else {
			redirect, err = svc.DenyOAuthAuthorization(req.OAuthAuthorizeRequest)
		}
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"redirectUrl": redirect})
	}))
	api.GET("/oauth/connections", withSession(func(c *gin.Context, user *model.User) {
		connections, err := svc.OAuthConnections(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"connections": connections})
	}))
	api.DELETE("/oauth/connections/:clientId", withSession(func(c *gin.Context, user *model.User) {
		if err := svc.RevokeOAuthConnection(user.ID, c.Param("clientId")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"revoked": true})
	}))
}
