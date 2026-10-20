package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// Cloudwise 的 Seedance 协议；真人素材只对这个协议的渠道生效。
const cloudwiseSeedanceProtocol = "cloudwise-seedance"

// cloudwiseAssetBaseURLOverride 仅供测试替换 Cloudwise 根地址。
var cloudwiseAssetBaseURLOverride = ""

type StudioPortraitPhotoView struct {
	model.StudioPortraitPhoto
	URL string `json:"url,omitempty"`
}

type StudioPortraitView struct {
	model.StudioPortrait
	Photos []StudioPortraitPhotoView `json:"photos"`
}

type StudioPortraitList struct {
	Available bool                 `json:"available"`
	Portraits []StudioPortraitView `json:"portraits"`
}

type cloudwiseChannel struct {
	ID      string
	BaseURL string
	APIKey  string
}

func (s *Service) cloudwiseSeedanceChannel() (*cloudwiseChannel, error) {
	id, err := s.repo.ChannelIDForProtocol(cloudwiseSeedanceProtocol)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, nil
	}
	channel, err := s.SystemChannel(id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(channel.APIKey) == "" {
		return nil, errors.New("Cloudwise 渠道缺少 API Key")
	}
	return &cloudwiseChannel{ID: channel.ID, BaseURL: channel.BaseURL, APIKey: channel.APIKey}, nil
}

func (s *Service) cloudwiseChannelByID(id string) (*cloudwiseChannel, error) {
	channel, err := s.SystemChannel(id)
	if err != nil {
		return nil, errors.New("认证所用的 Cloudwise 渠道已不可用")
	}
	return &cloudwiseChannel{ID: channel.ID, BaseURL: channel.BaseURL, APIKey: channel.APIKey}, nil
}

// callCloudwiseAsset 调用 Cloudwise 透传的方舟素材 / 活体认证接口，返回 Result 对象。
func callCloudwiseAsset(ctx context.Context, channel *cloudwiseChannel, path string, body map[string]any) (map[string]any, error) {
	origin := cloudwiseAssetBaseURLOverride
	if origin == "" {
		parsed, err := url.Parse(strings.TrimSpace(channel.BaseURL))
		if err != nil || parsed.Host == "" {
			return nil, errors.New("Cloudwise 渠道地址无效")
		}
		origin = parsed.Scheme + "://" + parsed.Host
	}
	if _, err := ValidateOutboundURL(origin + path); err != nil {
		return nil, err
	}
	encoded, _ := json.Marshal(body)
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, origin+path, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(channel.APIKey))
	resp, err := OutboundHTTPClient(30 * time.Second).Do(req)
	if err != nil {
		return nil, fmt.Errorf("Cloudwise 请求失败：%w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	if detail := cloudwiseAssetError(payload); detail != "" {
		return nil, errors.New(detail)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Cloudwise 请求失败：HTTP %d", resp.StatusCode)
	}
	if result, ok := payload["Result"].(map[string]any); ok {
		return result, nil
	}
	if payload == nil {
		return nil, errors.New("Cloudwise 响应无效")
	}
	return payload, nil
}

func cloudwiseAssetError(payload map[string]any) string {
	if meta, ok := payload["ResponseMetadata"].(map[string]any); ok {
		if failure, ok := meta["Error"].(map[string]any); ok {
			return strings.TrimSpace(fmt.Sprint(failure["Message"], " (", failure["Code"], ")"))
		}
	}
	if failure, ok := payload["error"].(map[string]any); ok {
		return strings.TrimSpace(fmt.Sprint(failure["message"]))
	}
	if success, ok := payload["success"].(bool); ok && !success {
		return strings.TrimSpace(fmt.Sprint(payload["message"]))
	}
	return ""
}

func cloudwiseResultString(result map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := result[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (s *Service) StudioPortraits(ctx context.Context, user *model.User) (*StudioPortraitList, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	channel, err := s.cloudwiseSeedanceChannel()
	if err != nil {
		return nil, err
	}
	portraits, err := s.repo.StudioPortraits(user.ID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(portraits))
	for _, portrait := range portraits {
		ids = append(ids, portrait.ID)
	}
	photos, err := s.repo.StudioPortraitPhotos(user.ID, ids)
	if err != nil {
		return nil, err
	}
	refreshed := 0
	byPortrait := map[string][]StudioPortraitPhotoView{}
	channels := map[string]*model.StudioPortrait{}
	for index := range portraits {
		channels[portraits[index].ID] = &portraits[index]
	}
	for _, photo := range photos {
		// 审核中的素材在列表读取时顺带刷新状态，避免前端另开轮询接口。
		if photo.Status == model.StudioPortraitPhotoProcessing && refreshed < 10 {
			refreshed++
			if portrait := channels[photo.PortraitID]; portrait != nil {
				if owner, err := s.cloudwiseChannelByID(portrait.ChannelID); err == nil {
					s.refreshStudioPortraitPhoto(ctx, owner, &photo)
				}
			}
		}
		view := StudioPortraitPhotoView{StudioPortraitPhoto: photo}
		if resource, err := s.Resource(user.ID, photo.ResourceID); err == nil {
			view.URL, _ = s.providerResourceURL(resource, time.Now().Add(time.Hour))
		}
		byPortrait[photo.PortraitID] = append(byPortrait[photo.PortraitID], view)
	}
	result := &StudioPortraitList{Available: channel != nil, Portraits: make([]StudioPortraitView, 0, len(portraits))}
	for _, portrait := range portraits {
		result.Portraits = append(result.Portraits, StudioPortraitView{StudioPortrait: portrait, Photos: append([]StudioPortraitPhotoView{}, byPortrait[portrait.ID]...)})
	}
	return result, nil
}

type StudioPortraitCreateRequest struct {
	Name string `json:"name"`
}

// CreateStudioPortrait 建立活体认证会话；callbackURL 是手机端认证完成后跳转的提示页。
func (s *Service) CreateStudioPortrait(ctx context.Context, user *model.User, req StudioPortraitCreateRequest, origin string) (*StudioPortraitView, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || utf8.RuneCountInString(name) > 30 {
		return nil, BadAuthRequest("请填写 1 到 30 个字的称呼，例如「本人」或模特名字")
	}
	channel, err := s.cloudwiseSeedanceChannel()
	if err != nil {
		return nil, err
	}
	if channel == nil {
		return nil, BadAuthRequest("平台还没有开通支持真人认证的 Seedance 渠道")
	}
	existing, err := s.repo.StudioPortraits(user.ID)
	if err != nil {
		return nil, err
	}
	if len(existing) >= 20 {
		return nil, BadAuthRequest("最多认证 20 位真人")
	}
	result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/visual-validate/session", map[string]any{"callbackURL": strings.TrimRight(origin, "/") + "/portrait-verified"})
	if err != nil {
		return nil, fmt.Errorf("创建真人认证失败：%w", err)
	}
	token := cloudwiseResultString(result, "BytedToken", "bytedToken")
	link := cloudwiseResultString(result, "H5Link", "h5Link")
	if token == "" || link == "" {
		return nil, errors.New("创建真人认证失败：Cloudwise 没有返回认证链接")
	}
	now := time.Now().UTC()
	portrait := &model.StudioPortrait{ID: newID(), UserID: user.ID, ChannelID: channel.ID, Name: name, BytedToken: token, H5Link: link, Status: model.StudioPortraitPending, CreatedAt: now, UpdatedAt: now}
	if err := s.repo.SaveStudioPortrait(portrait); err != nil {
		return nil, err
	}
	return &StudioPortraitView{StudioPortrait: *portrait, Photos: []StudioPortraitPhotoView{}}, nil
}

// CheckStudioPortrait 查询认证结果；拿到素材组 ID 即视为认证通过。
func (s *Service) CheckStudioPortrait(ctx context.Context, user *model.User, id string) (*model.StudioPortrait, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	portrait, err := s.repo.StudioPortrait(user.ID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, NotFound("认证记录不存在")
	}
	if err != nil {
		return nil, err
	}
	if portrait.Status == model.StudioPortraitVerified {
		return portrait, nil
	}
	channel, err := s.cloudwiseChannelByID(portrait.ChannelID)
	if err != nil {
		return nil, err
	}
	result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/visual-validate/result", map[string]any{"BytedToken": portrait.BytedToken})
	if err != nil {
		// 认证尚未完成时上游也会返回错误；保持待认证，只记录原因。
		portrait.Error = err.Error()
		portrait.UpdatedAt = time.Now().UTC()
		_ = s.repo.SaveStudioPortrait(portrait)
		return portrait, nil
	}
	if groupID := cloudwiseResultString(result, "GroupId", "GroupID", "groupId"); groupID != "" {
		portrait.GroupID, portrait.Status, portrait.Error = groupID, model.StudioPortraitVerified, ""
		portrait.UpdatedAt = time.Now().UTC()
		if err := s.repo.SaveStudioPortrait(portrait); err != nil {
			return nil, err
		}
	}
	return portrait, nil
}

type StudioPortraitPhotoRequest struct {
	ResourceID string `json:"resourceId"`
}

// AddStudioPortraitPhoto 把一张已上传的照片放进该真人的可信素材组，审核在列表读取时刷新。
func (s *Service) AddStudioPortraitPhoto(ctx context.Context, user *model.User, portraitID string, req StudioPortraitPhotoRequest) (*model.StudioPortraitPhoto, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	portrait, err := s.repo.StudioPortrait(user.ID, portraitID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, NotFound("认证记录不存在")
	}
	if err != nil {
		return nil, err
	}
	if portrait.Status != model.StudioPortraitVerified || portrait.GroupID == "" {
		return nil, BadAuthRequest("请先完成真人认证，再上传照片")
	}
	resource, err := s.Resource(user.ID, strings.TrimSpace(req.ResourceID))
	if err != nil {
		return nil, NotFound("照片不存在")
	}
	if resource.Status != model.ResourceStatusReady || !strings.HasPrefix(strings.ToLower(resource.MimeType), "image/") {
		return nil, BadAuthRequest("只能添加已上传完成的图片")
	}
	photo, err := s.repo.StudioPortraitPhotoByResource(portrait.ID, resource.ID)
	if err != nil {
		return nil, err
	}
	if photo != nil && photo.Status != model.StudioPortraitPhotoFailed {
		return photo, nil
	}
	channel, err := s.cloudwiseChannelByID(portrait.ChannelID)
	if err != nil {
		return nil, err
	}
	resourceURL, err := s.providerResourceURL(resource, time.Now().Add(time.Hour))
	if err != nil {
		return nil, fmt.Errorf("生成照片临时地址失败：%w", err)
	}
	now := time.Now().UTC()
	if photo == nil {
		photo = &model.StudioPortraitPhoto{ID: newID(), PortraitID: portrait.ID, UserID: user.ID, ResourceID: resource.ID, CreatedAt: now}
	}
	result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/create", map[string]any{
		"name": "portrait-" + resource.ID, "description": portrait.Name, "assetType": "Image", "groupId": portrait.GroupID, "url": resourceURL,
	})
	if err != nil {
		return nil, fmt.Errorf("上传真人照片失败：%w", err)
	}
	photo.AssetID = cloudwiseResultString(result, "Id", "AssetId", "id")
	if photo.AssetID == "" {
		return nil, errors.New("上传真人照片失败：Cloudwise 没有返回素材 ID")
	}
	photo.Status, photo.Error, photo.UpdatedAt = model.StudioPortraitPhotoProcessing, "", now
	if err := s.repo.SaveStudioPortraitPhoto(photo); err != nil {
		return nil, err
	}
	s.refreshStudioPortraitPhoto(ctx, channel, photo)
	return photo, nil
}

func (s *Service) refreshStudioPortraitPhoto(ctx context.Context, channel *cloudwiseChannel, photo *model.StudioPortraitPhoto) {
	result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/get", map[string]any{"Id": photo.AssetID})
	if err != nil {
		return
	}
	switch strings.ToLower(cloudwiseResultString(result, "Status", "status")) {
	case "active":
		photo.Status, photo.Error = model.StudioPortraitPhotoActive, ""
	case "failed", "rejected":
		photo.Status = model.StudioPortraitPhotoFailed
		photo.Error = firstNonEmpty(cloudwiseResultString(result, "ErrorMessage", "Message", "Reason"), "素材审核未通过")
	default:
		return
	}
	photo.UpdatedAt = time.Now().UTC()
	_ = s.repo.SaveStudioPortraitPhoto(photo)
}

func (s *Service) DeleteStudioPortraitPhoto(ctx context.Context, user *model.User, photoID string) error {
	if user == nil {
		return Unauthorized("请先登录")
	}
	photo, err := s.repo.StudioPortraitPhoto(user.ID, photoID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if portrait, err := s.repo.StudioPortrait(user.ID, photo.PortraitID); err == nil && photo.AssetID != "" {
		if channel, err := s.cloudwiseChannelByID(portrait.ChannelID); err == nil {
			_, _ = callCloudwiseAsset(ctx, channel, "/api/v1/assets/delete", map[string]any{"Id": photo.AssetID})
		}
	}
	return s.repo.DeleteStudioPortraitPhoto(user.ID, photoID)
}

func (s *Service) DeleteStudioPortrait(ctx context.Context, user *model.User, id string) error {
	if user == nil {
		return Unauthorized("请先登录")
	}
	portrait, err := s.repo.StudioPortrait(user.ID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if portrait.GroupID != "" {
		if channel, err := s.cloudwiseChannelByID(portrait.ChannelID); err == nil {
			_, _ = callCloudwiseAsset(ctx, channel, "/api/v1/assets/groups/delete", map[string]any{"Id": portrait.GroupID})
		}
	}
	return s.repo.DeleteStudioPortrait(user.ID, id)
}

// prepareCloudwisePortraitReferences 把已认证真人照片的参考图换成 asset://，其它参考图保持原样。
func (s *Service) prepareCloudwisePortraitReferences(userID string, input *canvasGenerationInput) error {
	if input == nil || input.Mode != "video" || strings.TrimSpace(input.Config.InterfaceType) != cloudwiseSeedanceProtocol {
		return nil
	}
	for index := range input.ReferenceImages {
		reference := &input.ReferenceImages[index]
		if strings.HasPrefix(strings.TrimSpace(reference.URL), "asset://") {
			continue
		}
		resourceID := arkPrivateAssetResourceID(*reference)
		if resourceID == "" {
			continue
		}
		assetID, err := s.repo.ActiveStudioPortraitAsset(userID, input.Config.ChannelID, resourceID)
		if err != nil {
			return err
		}
		if assetID != "" {
			reference.URL = "asset://" + assetID
			reference.DataURL = ""
		}
	}
	return nil
}
