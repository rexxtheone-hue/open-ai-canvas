package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	protocolcontract "yingce/backend/internal/protocol"
)

// 开放接口：命令行工具和 MCP 共用的一套简化生成合同。提交后的任务与 Studio 网页提交的完全一样
// （metadata.source=studio），会出现在用户的作品库里，按同样的价格扣费。

const (
	openAPIOutputURLTTL  = 24 * time.Hour
	openAPIMaxReferences = 16
	openAPIMaxCount      = 4
)

type OpenAPIModel struct {
	ID                 string         `json:"id"`
	Name               string         `json:"name"`
	Kind               string         `json:"kind"`
	Description        string         `json:"description,omitempty"`
	Price              string         `json:"price,omitempty"`
	Prices             []OpenAPIPrice `json:"prices,omitempty"`
	Tags               []string       `json:"tags,omitempty"`
	AspectRatios       []string       `json:"aspectRatios,omitempty"`
	DefaultAspectRatio string         `json:"defaultAspectRatio,omitempty"`
	Resolutions        []string       `json:"resolutions,omitempty"`
	DefaultResolution  string         `json:"defaultResolution,omitempty"`
	Qualities          []string       `json:"qualities,omitempty"`
	Durations          []int          `json:"durations,omitempty"`
	MinDuration        int            `json:"minDuration,omitempty"`
	MaxDuration        int            `json:"maxDuration,omitempty"`
	DefaultDuration    int            `json:"defaultDuration,omitempty"`
	Operations         []string       `json:"operations,omitempty"`
	GenerateAudio      bool           `json:"generateAudio,omitempty"`
	MaxReferenceImages int            `json:"maxReferenceImages"`
	MaxReferenceVideos int            `json:"maxReferenceVideos,omitempty"`
	MaxReferenceAudios int            `json:"maxReferenceAudios,omitempty"`
	channelID          string
	modelKey           string
	capability         *ModelCapabilityConfig
}

type OpenAPIReference struct {
	ResourceID string `json:"resourceId,omitempty"`
	URL        string `json:"url,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Role       string `json:"role,omitempty"`
}

type OpenAPIGenerationRequest struct {
	Model         string             `json:"model"`
	Prompt        string             `json:"prompt"`
	AspectRatio   string             `json:"aspectRatio,omitempty"`
	Resolution    string             `json:"resolution,omitempty"`
	Quality       string             `json:"quality,omitempty"`
	Duration      int                `json:"duration,omitempty"`
	GenerateAudio *bool              `json:"generateAudio,omitempty"`
	Operation     string             `json:"operation,omitempty"`
	References    []OpenAPIReference `json:"references,omitempty"`
	Parameters    map[string]any     `json:"parameters,omitempty"`
	Count         int                `json:"count,omitempty"`
	// Client 由服务端按入口填写（api、cli、mcp），只用于记录来源。
	Client string `json:"-"`
	// App 是具体应用（Claude、ChatGPT、Cursor、OmniMuse CLI 等），由服务端按令牌和请求头判断。
	App string `json:"-"`
	// Metadata 由服务端附加到任务（例如 MCP 短剧的 dramaAdsId）。
	Metadata map[string]any `json:"-"`
}

type OpenAPIOutput struct {
	ResourceID string `json:"-"`
	Type       string `json:"type"`
	URL        string `json:"url"`
	PreviewURL string `json:"previewUrl,omitempty"`
	MimeType   string `json:"mimeType,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Bytes      int64  `json:"bytes,omitempty"`
}

type OpenAPIGeneration struct {
	ID       string          `json:"id"`
	Kind     string          `json:"kind"`
	Status   string          `json:"status"`
	Stage    string          `json:"stage,omitempty"`
	Progress int             `json:"progress"`
	Model    string          `json:"model,omitempty"`
	Prompt   string          `json:"prompt,omitempty"`
	Error    string          `json:"error,omitempty"`
	Credits  float64         `json:"credits,omitempty"`
	Outputs  []OpenAPIOutput `json:"outputs,omitempty"`
	// References 是这次生成用过的素材库素材，可以原样传回 generate_* 重复使用。
	References []OpenAPIUsedReference `json:"references,omitempty"`
	WebURL     string                 `json:"webUrl,omitempty"`
	CreatedAt  time.Time              `json:"createdAt"`
	UpdatedAt  time.Time              `json:"updatedAt"`
}

type OpenAPIGenerationPage struct {
	Generations []OpenAPIGeneration `json:"generations"`
	NextCursor  string              `json:"nextCursor,omitempty"`
}

type OpenAPIAccount struct {
	ID               string  `json:"id"`
	Username         string  `json:"username"`
	DisplayName      string  `json:"displayName,omitempty"`
	Email            string  `json:"email,omitempty"`
	AvailableCredits float64 `json:"availableCredits"`
	ReservedCredits  float64 `json:"reservedCredits"`
	StudioURL        string  `json:"studioUrl,omitempty"`
}

func microcreditsToCredits(value int64) float64 {
	return float64(value) / float64(CreditScale)
}

func (s *Service) OpenAPIAccount(ctx context.Context, user *model.User) (*OpenAPIAccount, error) {
	account, err := s.repo.CreditAccount(user.ID)
	if err != nil {
		return nil, err
	}
	result := &OpenAPIAccount{ID: user.ID, Username: user.Username, DisplayName: user.DisplayName, Email: user.Email, AvailableCredits: microcreditsToCredits(account.AvailableMicrocredits), ReservedCredits: microcreditsToCredits(account.ReservedMicrocredits)}
	if base := s.tenantSiteURL(TenantFromContext(ctx)); base != nil {
		result.StudioURL = strings.TrimRight(base.String(), "/") + "/studio"
	}
	return result, nil
}

func openAPICapabilityConfig(raw map[string]any) *ModelCapabilityConfig {
	if raw == nil {
		return nil
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return nil
	}
	var config ModelCapabilityConfig
	if json.Unmarshal(data, &config) != nil {
		return nil
	}
	return &config
}

func imageParameterStrings(parameters []protocolcontract.ImageParameter, name string) ([]string, string) {
	for _, p := range parameters {
		if p.Name != name || !p.IsEnabled() {
			continue
		}
		values := make([]string, 0, len(p.Values))
		for _, value := range p.Values {
			values = append(values, fmt.Sprint(value))
		}
		defaultValue := ""
		if p.Default != nil {
			defaultValue = fmt.Sprint(p.Default)
		}
		return values, defaultValue
	}
	return nil, ""
}

// OpenAPIPrice 是一个价格档：tier 说明适用规格，unit 是计价单位。
type OpenAPIPrice struct {
	Tier    string  `json:"tier"`
	Unit    string  `json:"unit"`
	Credits float64 `json:"credits,omitempty"`
}

var openAPISelectorLabels = map[string]map[string]string{
	"videoInput":         {"true": "with reference video", "false": "no reference video"},
	"videoGenerateAudio": {"true": "with audio", "false": "silent"},
}

func openAPIPriceTier(selector map[string]string) string {
	parts := []string{}
	for _, key := range []string{"imageResolution", "vquality", "quality", "videoGenerateAudio", "videoInput"} {
		value := strings.TrimSpace(selector[key])
		if value == "" {
			continue
		}
		if labels, ok := openAPISelectorLabels[key]; ok {
			if label := labels[value]; label != "" {
				value = label
			}
		} else if key == "quality" {
			value += " quality"
		}
		parts = append(parts, value)
	}
	if len(parts) == 0 {
		return "all"
	}
	return strings.Join(parts, ", ")
}

func openAPIPrices(tiers []PublicChannelModelPriceTier) []OpenAPIPrice {
	prices := make([]OpenAPIPrice, 0, len(tiers))
	for _, tier := range tiers {
		price := OpenAPIPrice{Tier: openAPIPriceTier(tier.Selector)}
		switch tier.BillingMode {
		case "per_second":
			price.Unit, price.Credits = "credits per output second", microcreditsToCredits(tier.UnitPriceMicrocredits)
		case "fixed_request":
			price.Unit, price.Credits = "credits per generation", microcreditsToCredits(tier.UnitPriceMicrocredits)
		default:
			price.Unit = "billed by tokens; call estimate_cost for the exact price"
		}
		prices = append(prices, price)
	}
	return prices
}

// openAPIProcessingOnly 判断模型是否只做配音效、高清、动作迁移这类需要输入视频的处理；这些不走 generate_video。
func openAPIProcessingOnly(m PublicChannelModel) bool {
	if len(m.PriceTiers) == 0 {
		return false
	}
	for _, tier := range m.PriceTiers {
		if strings.TrimSpace(tier.Selector["operation"]) == "" {
			return false
		}
	}
	return true
}

func openAPIModelFromCatalog(channel PublicChannelCatalog, m PublicChannelModel) OpenAPIModel {
	result := OpenAPIModel{ID: m.ID, Name: firstNonEmpty(strings.TrimSpace(m.ChannelLabel), strings.TrimSpace(m.DisplayName), m.ModelKey), Kind: normalizeCapability(m.Capability), Description: m.Description, Prices: openAPIPrices(m.PriceTiers), channelID: channel.ID, modelKey: m.ModelKey}
	if len(result.Prices) == 0 {
		result.Price = m.PriceLabel
	}
	for _, tag := range m.Tags {
		if label := strings.TrimSpace(tag.Text); label != "" {
			result.Tags = append(result.Tags, label)
		}
	}
	config := openAPICapabilityConfig(m.CapabilityConfig)
	result.capability = config
	if config == nil {
		return result
	}
	if image := config.Image; image != nil && result.Kind == "image" {
		result.MaxReferenceImages = image.References.MaxImages
		if len(image.Parameters) > 0 {
			result.AspectRatios, result.DefaultAspectRatio = imageParameterStrings(image.Parameters, "size")
			result.Resolutions, result.DefaultResolution = imageParameterStrings(image.Parameters, "imageResolution")
			result.Qualities, _ = imageParameterStrings(image.Parameters, "quality")
		} else {
			result.AspectRatios, result.DefaultAspectRatio = image.Size.Values, image.Size.Default
			if image.Resolution.Supported {
				result.Resolutions, result.DefaultResolution = image.Resolution.Values, image.Resolution.Default
			}
			if image.Quality.Supported {
				result.Qualities = image.Quality.Values
			}
		}
	}
	if video := config.Video; video != nil && result.Kind == "video" {
		result.AspectRatios, result.DefaultAspectRatio = video.Ratios, video.DefaultRatio
		result.Resolutions, result.DefaultResolution = video.Resolutions, video.DefaultResolution
		result.Durations, result.MinDuration, result.MaxDuration, result.DefaultDuration = video.Duration.Values, video.Duration.Min, video.Duration.Max, video.Duration.Default
		result.Operations = video.Operations
		result.GenerateAudio = video.GenerateAudio.Supported
		result.MaxReferenceImages, result.MaxReferenceVideos, result.MaxReferenceAudios = video.References.MaxImages, video.References.MaxVideos, video.References.MaxAudios
	}
	return result
}

func (s *Service) openAPICatalog(ctx context.Context) ([]OpenAPIModel, error) {
	catalog, err := s.ModelCatalogForTenant(TenantFromContext(ctx).ID, nil)
	if err != nil {
		return nil, err
	}
	models := []OpenAPIModel{}
	for _, channel := range catalog.Channels {
		for _, m := range channel.Models {
			kind := normalizeCapability(m.Capability)
			if !m.Available || (kind != "image" && kind != "video") || openAPIProcessingOnly(m) {
				continue
			}
			models = append(models, openAPIModelFromCatalog(channel, m))
		}
	}
	return models, nil
}

// OpenAPIModels 列出当前网址可用的图片和视频模型；kind 为空时两种都返回。
func (s *Service) OpenAPIModels(ctx context.Context, kind string) ([]OpenAPIModel, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind != "" && kind != "image" && kind != "video" {
		return nil, BadAuthRequest("kind 只能是 image 或 video")
	}
	models, err := s.openAPICatalog(ctx)
	if err != nil {
		return nil, err
	}
	if kind == "" {
		return models, nil
	}
	filtered := []OpenAPIModel{}
	for _, m := range models {
		if m.Kind == kind {
			filtered = append(filtered, m)
		}
	}
	return filtered, nil
}

func (s *Service) openAPIModel(ctx context.Context, id string) (*OpenAPIModel, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, BadAuthRequest("请指定模型（model），可先查询模型列表")
	}
	models, err := s.openAPICatalog(ctx)
	if err != nil {
		return nil, err
	}
	lower := strings.ToLower(id)
	for i := range models {
		m := &models[i]
		if m.ID == id || m.channelID+"::"+m.modelKey == id {
			return m, nil
		}
	}
	// 也接受模型名称（不分大小写），方便在对话里直接说「Seedance 2.5」。
	var match *OpenAPIModel
	for i := range models {
		if strings.EqualFold(models[i].Name, id) || strings.EqualFold(models[i].modelKey, lower) {
			if match != nil {
				return nil, BadAuthRequest("有多个模型叫这个名字，请改用模型 ID：" + id)
			}
			match = &models[i]
		}
	}
	if match == nil {
		return nil, NotFound("找不到这个模型或模型暂不可用：" + id)
	}
	return match, nil
}

func pickOption(value string, allowed []string, fallback string, label string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	if len(allowed) == 0 {
		return value, nil
	}
	for _, candidate := range allowed {
		if strings.EqualFold(candidate, value) || strings.EqualFold(strings.TrimSuffix(strings.ToLower(candidate), "p"), strings.TrimSuffix(strings.ToLower(value), "p")) {
			return candidate, nil
		}
	}
	return "", BadAuthRequest(fmt.Sprintf("%s不支持 %s，可选：%s", label, value, strings.Join(allowed, "、")))
}

func (s *Service) openAPIReferenceItem(userID string, ref OpenAPIReference, index int) (map[string]any, string, error) {
	kind := strings.ToLower(strings.TrimSpace(ref.Kind))
	item := map[string]any{"id": fmt.Sprintf("ref%d", index+1), "dataUrl": ""}
	if role := strings.TrimSpace(ref.Role); role != "" {
		item["role"] = role
	}
	// 指向本站素材的网址（MCP/CLI 常把 get_generation 返回的链接再传回来）要认回素材 ID：
	// Cloudwise、腾讯、方舟的可信素材入库都只处理站内素材，按外链提交会跳过入库直接被上游判真人拦截。
	if strings.TrimSpace(ref.ResourceID) == "" {
		if id := publicResourceIDFromURL(ref.URL); id != "" {
			if _, err := s.repo.ResourceForUser(userID, id); err == nil {
				ref.ResourceID, ref.URL = id, ""
			}
		}
	}
	switch {
	case strings.TrimSpace(ref.ResourceID) != "":
		resource, err := s.repo.ResourceForUser(userID, strings.TrimSpace(ref.ResourceID))
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, "", NotFound("参考素材不存在：" + ref.ResourceID)
			}
			return nil, "", err
		}
		if resource.Status != model.ResourceStatusReady {
			return nil, "", BadAuthRequest("参考素材还没有上传完成：" + ref.ResourceID)
		}
		if kind == "" {
			kind = resource.Kind
		}
		item["name"], item["type"], item["storageKey"] = resource.ID, resource.MimeType, "resource:"+resource.ID
		item["bytes"], item["width"], item["height"] = resource.Size, resource.Width, resource.Height
		if resource.DurationMs > 0 {
			item["durationMs"] = resource.DurationMs
		}
	case strings.TrimSpace(ref.URL) != "":
		url := strings.TrimSpace(ref.URL)
		if !strings.HasPrefix(url, "https://") || len(url) > 2048 {
			return nil, "", BadAuthRequest("参考素材链接必须是 https 开头的公开网址")
		}
		if kind == "" {
			kind = guessMediaKindFromURL(url)
		}
		item["url"], item["name"] = url, url
	default:
		return nil, "", BadAuthRequest("每个参考素材需要 resourceId 或 url")
	}
	switch kind {
	case "image", "video", "audio":
		return item, kind, nil
	default:
		return nil, "", BadAuthRequest("无法判断参考素材类型，请填写 kind（image、video 或 audio）")
	}
}

func guessMediaKindFromURL(url string) string {
	path := strings.ToLower(url)
	if index := strings.IndexAny(path, "?#"); index >= 0 {
		path = path[:index]
	}
	for _, ext := range []string{".mp4", ".mov", ".webm", ".m4v"} {
		if strings.HasSuffix(path, ext) {
			return "video"
		}
	}
	for _, ext := range []string{".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"} {
		if strings.HasSuffix(path, ext) {
			return "audio"
		}
	}
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"} {
		if strings.HasSuffix(path, ext) {
			return "image"
		}
	}
	return ""
}

// openAPITaskRequest 把简化参数翻译成和 Studio 网页一致的任务请求。
func (s *Service) openAPITaskRequest(ctx context.Context, userID string, req OpenAPIGenerationRequest) (CreateTaskRequest, *OpenAPIModel, error) {
	m, err := s.openAPIModel(ctx, req.Model)
	if err != nil {
		return CreateTaskRequest{}, nil, err
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return CreateTaskRequest{}, nil, BadAuthRequest("请填写提示词（prompt）")
	}
	if utf8.RuneCountInString(prompt) > 16000 {
		return CreateTaskRequest{}, nil, BadAuthRequest("提示词最多 16000 字")
	}
	if limit := openAPIMaxReferences; len(req.References) > limit && (req.Client != "mcp" || len(req.References) > 29) {
		return CreateTaskRequest{}, nil, BadAuthRequest("参考素材最多 16 个")
	}
	refs := map[string][]any{"image": {}, "video": {}, "audio": {}}
	for index, ref := range req.References {
		item, kind, err := s.openAPIReferenceItem(userID, ref, index)
		if err != nil {
			return CreateTaskRequest{}, nil, err
		}
		if m.Kind == "image" && kind != "image" {
			return CreateTaskRequest{}, nil, BadAuthRequest("图片模型只接受参考图片")
		}
		refs[kind] = append(refs[kind], item)
	}
	config := map[string]any{"channelId": m.channelID, "model": m.modelKey}
	operation := ""
	switch m.Kind {
	case "image":
		if m.MaxReferenceImages > 0 && len(refs["image"]) > m.MaxReferenceImages {
			return CreateTaskRequest{}, nil, BadAuthRequest(fmt.Sprintf("%s 最多 %d 张参考图", m.Name, m.MaxReferenceImages))
		}
		size, err := pickOption(req.AspectRatio, m.AspectRatios, m.DefaultAspectRatio, "画面比例")
		if err != nil {
			return CreateTaskRequest{}, nil, err
		}
		resolution, err := pickOption(req.Resolution, m.Resolutions, m.DefaultResolution, "分辨率")
		if err != nil {
			return CreateTaskRequest{}, nil, err
		}
		quality, err := pickOption(req.Quality, m.Qualities, "", "质量")
		if err != nil {
			return CreateTaskRequest{}, nil, err
		}
		for key, value := range map[string]string{"size": size, "imageResolution": resolution, "quality": quality} {
			if value != "" {
				config[key] = value
			}
		}
		config["count"] = "1"
		if len(req.Parameters) > 0 {
			config["imageParameters"] = req.Parameters
		}
		operation = "image"
	case "video":
		size, err := pickOption(req.AspectRatio, m.AspectRatios, m.DefaultAspectRatio, "画面比例")
		if err != nil {
			return CreateTaskRequest{}, nil, err
		}
		resolution, err := pickOption(req.Resolution, m.Resolutions, m.DefaultResolution, "分辨率")
		if err != nil {
			return CreateTaskRequest{}, nil, err
		}
		if size != "" {
			config["size"] = size
		}
		if resolution != "" {
			config["vquality"] = strings.TrimSuffix(strings.ToLower(resolution), "p")
		}
		duration := req.Duration
		if duration == 0 {
			duration = m.DefaultDuration
		}
		if duration > 0 {
			if len(m.Durations) > 0 && !containsInt(m.Durations, duration) {
				return CreateTaskRequest{}, nil, BadAuthRequest(fmt.Sprintf("%s 的时长只能选 %s 秒", m.Name, joinInts(m.Durations)))
			}
			if (m.MinDuration > 0 && duration < m.MinDuration) || (m.MaxDuration > 0 && duration > m.MaxDuration) {
				return CreateTaskRequest{}, nil, BadAuthRequest(fmt.Sprintf("%s 的时长范围是 %d–%d 秒", m.Name, m.MinDuration, m.MaxDuration))
			}
			config["videoSeconds"] = strconv.Itoa(duration)
		}
		// 不支持音频开关的模型一律按关闭提交；否则会套用能力配置里的默认值 true 被判为不支持。
		if !m.GenerateAudio {
			config["videoGenerateAudio"] = "false"
		} else if req.GenerateAudio != nil {
			config["videoGenerateAudio"] = strconv.FormatBool(*req.GenerateAudio)
		}
		operation = strings.TrimSpace(req.Operation)
		if operation == "" {
			operation = openAPIVideoOperation(m, refs)
		}
		if len(m.Operations) > 0 && !containsString(m.Operations, operation) {
			return CreateTaskRequest{}, nil, BadAuthRequest(fmt.Sprintf("%s 不支持 %s，可选：%s", m.Name, operation, strings.Join(m.Operations, "、")))
		}
		if operation == "image_to_video" {
			for index, item := range refs["image"] {
				ref := item.(map[string]any)
				if ref["role"] == nil {
					ref["role"] = map[bool]string{true: "first_frame", false: "last_frame"}[index == 0]
				}
			}
		}
	}
	client := req.Client
	if client == "" {
		client = "api"
	}
	input := map[string]any{
		"mode": m.Kind, "prompt": prompt, "config": config,
		"referenceImages": refs["image"], "referenceVideos": refs["video"], "referenceAudios": refs["audio"],
		"metadata": map[string]any{"source": "studio", "studioTool": m.Kind, "apiClient": client, "apiApp": req.App, "clientOperationId": newID()},
	}
	if m.Kind == "video" {
		input["metadata"].(map[string]any)["videoEditOperation"] = operation
	}
	for key, value := range req.Metadata {
		input["metadata"].(map[string]any)[key] = value
	}
	return CreateTaskRequest{Type: "canvas_" + m.Kind, Operation: operation, Prompt: prompt, Model: m.channelID + "::" + m.modelKey, Input: input, apiClient: client, apiApp: req.App}, m, nil
}

func openAPIVideoOperation(m *OpenAPIModel, refs map[string][]any) string {
	switch {
	case len(refs["video"]) > 0:
		return "reference_to_video"
	case len(refs["audio"]) > 0:
		if len(m.Operations) == 0 || containsString(m.Operations, "audio_to_video") {
			return "audio_to_video"
		}
		return "reference_to_video"
	case len(refs["image"]) > 0:
		explicitRoles := false
		referenceRole := false
		for _, item := range refs["image"] {
			role, _ := item.(map[string]any)["role"].(string)
			if role == "first_frame" || role == "last_frame" {
				explicitRoles = true
			}
			if role == "reference" {
				referenceRole = true
			}
		}
		// 明确标成参考图（CLI -i、MCP reference_image_urls）时走参考生视频，不能按张数猜成首尾帧。
		if referenceRole && !explicitRoles && (len(m.Operations) == 0 || containsString(m.Operations, "reference_to_video")) {
			return "reference_to_video"
		}
		if len(m.Operations) > 0 && !containsString(m.Operations, "image_to_video") {
			return "reference_to_video"
		}
		if len(refs["image"]) > 2 && !explicitRoles && containsString(m.Operations, "reference_to_video") {
			return "reference_to_video"
		}
		return "image_to_video"
	default:
		return "text_to_video"
	}
}

func joinInts(values []int) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, strconv.Itoa(value))
	}
	return strings.Join(parts, "、")
}

// QuoteOpenAPIGeneration 返回提交前的预计积分（单次，不含 count 倍数）。
func (s *Service) QuoteOpenAPIGeneration(ctx context.Context, user *model.User, req OpenAPIGenerationRequest) (map[string]any, error) {
	taskReq, m, err := s.openAPITaskRequest(ctx, user.ID, req)
	if err != nil {
		return nil, err
	}
	intent := ModelRequestIntentFromTaskInput(taskReq.Input, taskReq.Type, taskReq.Operation)
	quote, err := s.QuoteChannelModel(ChannelModelQuoteRequest{ChannelID: m.channelID, ModelKey: m.modelKey, Intent: intent, TenantID: TenantFromContext(ctx).ID})
	if err != nil {
		return nil, err
	}
	count := clampCount(req.Count)
	return map[string]any{"model": m.ID, "modelName": m.Name, "creditsEach": microcreditsToCredits(quote.AmountMicrocredits), "count": count, "credits": microcreditsToCredits(quote.AmountMicrocredits) * float64(count), "estimated": quote.Estimated}, nil
}

func clampCount(count int) int {
	if count <= 0 {
		return 1
	}
	if count > openAPIMaxCount {
		return openAPIMaxCount
	}
	return count
}

// CreateOpenAPIGenerations 按 count 逐条提交任务（与 Studio 一致：一条任务一张图或一条视频）。
func (s *Service) CreateOpenAPIGenerations(ctx context.Context, user *model.User, req OpenAPIGenerationRequest) ([]OpenAPIGeneration, error) {
	if req.Count > openAPIMaxCount {
		return nil, BadAuthRequest("一次最多生成 4 个")
	}
	count := clampCount(req.Count)
	results := make([]OpenAPIGeneration, 0, count)
	for i := 0; i < count; i++ {
		taskReq, _, err := s.openAPITaskRequest(ctx, user.ID, req)
		if err != nil {
			return results, err
		}
		if count > 1 {
			metadata := taskReq.Input["metadata"].(map[string]any)
			metadata["batchIndex"], metadata["batchCount"] = i, count
		}
		task, err := s.CreateTask(user.ID, taskReq)
		if err != nil {
			if len(results) > 0 {
				return results, fmt.Errorf("已提交 %d 个，第 %d 个失败：%w", len(results), i+1, err)
			}
			return nil, err
		}
		generation, err := s.openAPIGeneration(ctx, user.ID, task)
		if err != nil {
			return results, err
		}
		results = append(results, *generation)
	}
	return results, nil
}

func (s *Service) OpenAPIGeneration(ctx context.Context, user *model.User, id string) (*OpenAPIGeneration, error) {
	task, err := s.repo.TaskForUser(user.ID, strings.TrimSpace(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, NotFound("找不到这个生成任务")
		}
		return nil, err
	}
	return s.openAPIGeneration(ctx, user.ID, task)
}

func (s *Service) CancelOpenAPIGeneration(ctx context.Context, user *model.User, id string) (*OpenAPIGeneration, error) {
	task, err := s.CancelTask(ctx, user.ID, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	return s.openAPIGeneration(ctx, user.ID, task)
}

func openAPIKind(task *model.Task) string {
	switch {
	case strings.HasPrefix(task.Type, "canvas_"):
		return strings.TrimPrefix(task.Type, "canvas_")
	case strings.HasPrefix(task.Type, "video_"):
		return "video"
	}
	return task.Type
}

func (s *Service) openAPIGeneration(ctx context.Context, userID string, task *model.Task) (*OpenAPIGeneration, error) {
	if task == nil {
		return nil, NotFound("找不到这个生成任务")
	}
	g := &OpenAPIGeneration{ID: task.ID, Kind: openAPIKind(task), Status: string(task.Status), Stage: task.Stage, Progress: task.Progress, Model: task.Model, Prompt: task.Prompt, CreatedAt: task.CreatedAt, UpdatedAt: task.UpdatedAt}
	if task.Status == model.TaskStatusFailed || task.Status == model.TaskStatusCancelled {
		g.Error = taskForOutput(*task).Error
	}
	if task.BillingOrderID != "" {
		if order, err := s.repo.BillingOrder(task.BillingOrderID); err == nil {
			g.Credits = microcreditsToCredits(order.AmountMicrocredits - order.RefundedAmountMicrocredits)
		}
	}
	if base := s.tenantSiteURL(TenantFromContext(ctx)); base != nil {
		g.WebURL = strings.TrimRight(base.String(), "/") + "/studio"
	}
	g.References = s.openAPIUsedReferences(task.InputJSON)
	if task.Status != model.TaskStatusSucceeded || strings.TrimSpace(task.ResultJSON) == "" {
		return g, nil
	}
	var result any
	if err := json.Unmarshal([]byte(task.ResultJSON), &result); err != nil {
		return g, nil
	}
	seen := map[string]bool{}
	for _, media := range collectResultMedia(result, "") {
		if seen[media.resourceID] {
			continue
		}
		seen[media.resourceID] = true
		resource, err := s.repo.ResourceForUser(userID, media.resourceID)
		if err != nil {
			continue
		}
		url, err := s.PublicResourceURL(ctx, resource, time.Now().Add(openAPIOutputURLTTL))
		if err != nil {
			return nil, err
		}
		kind := media.kind
		if kind == "" {
			kind = resource.Kind
		}
		previewURL := ""
		if kind == "image" && resourceThumbnailSupported(resource) {
			previewURL, _ = s.PublicResourcePreviewURL(ctx, resource, time.Now().Add(openAPIOutputURLTTL))
		}
		g.Outputs = append(g.Outputs, OpenAPIOutput{ResourceID: resource.ID, Type: kind, URL: url, PreviewURL: previewURL, MimeType: resource.MimeType, Width: resource.Width, Height: resource.Height, DurationMs: resource.DurationMs, Bytes: resource.Size})
	}
	return g, nil
}

type resultMediaRef struct {
	resourceID string
	kind       string
}

// collectResultMedia 在任务结果里找出保存好的产物资源（images、video、audio 等字段）。
func collectResultMedia(value any, kind string) []resultMediaRef {
	var refs []resultMediaRef
	switch typed := value.(type) {
	case map[string]any:
		id := strings.TrimSpace(fmt.Sprint(typed["resourceId"]))
		if id == "" || id == "<nil>" {
			if key, _ := typed["storageKey"].(string); strings.HasPrefix(key, "resource:") {
				id = strings.TrimPrefix(key, "resource:")
			} else {
				id = ""
			}
		}
		if id != "" {
			return []resultMediaRef{{resourceID: id, kind: kind}}
		}
		for key, child := range typed {
			childKind := kind
			switch key {
			case "images", "image":
				childKind = "image"
			case "video", "videos":
				childKind = "video"
			case "audio", "audios":
				childKind = "audio"
			case "references", "referenceImages", "referenceVideos", "referenceAudios", "inputs":
				continue
			}
			refs = append(refs, collectResultMedia(child, childKind)...)
		}
	case []any:
		for _, child := range typed {
			refs = append(refs, collectResultMedia(child, kind)...)
		}
	}
	return refs
}

// OpenAPIGenerations 列出用户最近的 Studio 作品（含网页、命令行和 MCP 提交的）。
func (s *Service) OpenAPIGenerations(ctx context.Context, user *model.User, kind string, cursor string, limit int) (*OpenAPIGenerationPage, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	page, err := s.StudioWorks(user.ID, StudioWorkQuery{Kind: kind, Source: "studio", Cursor: cursor, Limit: limit})
	if err != nil {
		return nil, err
	}
	result := &OpenAPIGenerationPage{Generations: []OpenAPIGeneration{}, NextCursor: page.NextCursor}
	for _, work := range page.Works {
		result.Generations = append(result.Generations, OpenAPIGeneration{ID: work.ID, Kind: work.Kind, Status: string(work.Status), Stage: work.Stage, Progress: work.Progress, Model: work.Model, Prompt: work.Prompt, Error: work.Error, CreatedAt: work.CreatedAt, UpdatedAt: work.UpdatedAt})
	}
	return result, nil
}

// OpenAPIAppName 判断请求来自哪个应用：OAuth 连接用登记时的客户端名，其余按 User-Agent 识别。
func (s *Service) OpenAPIAppName(token *model.APIToken, userAgent, client string) string {
	if token != nil && token.Kind == model.APITokenKindOAuthAccess && token.ClientID != "" {
		if oauthClient, err := s.repo.OAuthClient(token.ClientID); err == nil {
			if name := knownAPIAppName(oauthClient.Name); name != "" {
				return name
			}
			return truncateRunes(strings.TrimSpace(oauthClient.Name), 60)
		}
	}
	if name := knownAPIAppName(userAgent); name != "" {
		return name
	}
	if client == "cli" {
		return "OmniMuse CLI"
	}
	if product, _, _ := strings.Cut(strings.TrimSpace(userAgent), "/"); product != "" {
		return truncateRunes(product, 60)
	}
	return ""
}

func knownAPIAppName(value string) string {
	value = strings.ToLower(value)
	for _, known := range []struct{ marker, name string }{
		{"claude-code", "Claude Code"}, {"claude code", "Claude Code"}, {"claude", "Claude"},
		{"chatgpt", "ChatGPT"}, {"openai", "ChatGPT"}, {"codex", "Codex"}, {"cursor", "Cursor"},
		{"windsurf", "Windsurf"}, {"gemini", "Gemini"}, {"omnimuse-cli", "OmniMuse CLI"},
	} {
		if strings.Contains(value, known.marker) {
			return known.name
		}
	}
	return ""
}

// publicResourceIDFromURL 从本站素材公开链接（/api/public/resources/<id>/file）里取出素材 ID，不是这种链接返回空。
func publicResourceIDFromURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" {
		return ""
	}
	rest, ok := strings.CutPrefix(parsed.Path, "/api/public/resources/")
	if !ok {
		return ""
	}
	id, ok := strings.CutSuffix(rest, "/file")
	if !ok || id == "" || strings.Contains(id, "/") {
		return ""
	}
	return id
}
