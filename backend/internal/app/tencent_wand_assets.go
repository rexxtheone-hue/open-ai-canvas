package app

// 腾讯 TokenHub WAND 视频的参考素材：上游（火山方舟）不接受未登记的写实人像，
// 参考图和参考音频先登记为素材（is_real_person=false），再以 asset://<id> 提交。

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

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const tencentWandVideoProtocol = "tencent-wand-video"

// tencentWandAssetBaseURLOverride 仅供测试替换 TokenHub 根地址。
var tencentWandAssetBaseURLOverride = ""

var (
	tencentWandAssetPollInterval = 3 * time.Second
	tencentWandAssetPollLimit    = 3 * time.Minute
)

func tencentWandAssetProject(channelID string) string {
	return "tencent-wand:" + channelID
}

// callTencentWandAsset 调用 TokenHub 素材接口；body 为 nil 时发 GET。
func callTencentWandAsset(ctx context.Context, config providerConfig, path string, body map[string]any) (map[string]any, error) {
	origin := tencentWandAssetBaseURLOverride
	if origin == "" {
		parsed, err := url.Parse(strings.TrimSpace(config.BaseURL))
		if err != nil || parsed.Host == "" {
			return nil, errors.New("腾讯 TokenHub 渠道地址无效")
		}
		origin = parsed.Scheme + "://" + parsed.Host
	}
	if _, err := ValidateOutboundURL(origin + path); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	method := http.MethodGet
	var reader io.Reader
	if body != nil {
		method = http.MethodPost
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, origin+path, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(config.APIKey))
	resp, err := OutboundHTTPClient(30 * time.Second).Do(req)
	if err != nil {
		return nil, fmt.Errorf("腾讯素材接口请求失败：%w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	if failure, ok := payload["error"].(map[string]any); ok {
		message := strings.TrimSpace(fmt.Sprint(failure["message"]))
		if code := strings.TrimSpace(fmt.Sprint(failure["code"])); code != "" && code != "<nil>" {
			message = strings.TrimSpace(message + " (" + code + ")")
		}
		return nil, errors.New(message)
	}
	if code, ok := payload["code"].(float64); ok && code != 0 {
		return nil, fmt.Errorf("%s (%d)", defaultString(strings.TrimSpace(fmt.Sprint(payload["message"])), "腾讯接口返回错误"), int(code))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("腾讯素材接口请求失败：HTTP %d", resp.StatusCode)
	}
	if payload == nil {
		return nil, errors.New("腾讯素材接口响应无效")
	}
	return payload, nil
}

// ensureTencentWandAsset 把资源登记为 TokenHub 素材并等到可用；同一资源在同一渠道只登记一次。
func (s *Service) ensureTencentWandAsset(ctx context.Context, userID string, config providerConfig, resource *model.Resource, assetType string) (string, error) {
	project := tencentWandAssetProject(config.ChannelID)
	binding, err := s.repo.ArkPrivateAssetBinding(resource.ID, project)
	if err == nil {
		if binding.Status != arkPrivateAssetStatusFail || binding.ArkAssetID != "" {
			return s.waitForTencentWandAsset(ctx, config, binding)
		}
		binding.Status = arkPrivateAssetStatusNew
		binding.Error = ""
		if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
			return "", err
		}
	} else {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return "", err
		}
		binding = &model.ArkPrivateAssetBinding{ID: newID(), UserID: userID, ResourceID: resource.ID, ProjectName: project, Status: arkPrivateAssetStatusNew}
		created, err := s.repo.CreateArkPrivateAssetBinding(binding)
		if err != nil {
			return "", err
		}
		if !created {
			if binding, err = s.repo.ArkPrivateAssetBinding(resource.ID, project); err != nil {
				return "", err
			}
			return s.waitForTencentWandAsset(ctx, config, binding)
		}
	}
	if resource.Status != model.ResourceStatusReady {
		return "", s.failArkPrivateAssetBinding(binding, errors.New("参考素材还没有上传完成"))
	}
	resourceURL, err := s.providerResourceURL(resource, time.Now().Add(time.Hour))
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, fmt.Errorf("生成参考素材临时地址失败：%w", err))
	}
	result, err := callTencentWandAsset(ctx, config, "/v1/wand/vega-video-assets", map[string]any{
		"action":         "create",
		"url":            resourceURL,
		"asset_type":     assetType,
		"asset_name":     "ref-" + resource.ID,
		"is_real_person": false,
	})
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, fmt.Errorf("登记参考素材失败：%w", err))
	}
	assetID := cloudwiseResultString(result, "id")
	if assetID == "" {
		return "", s.failArkPrivateAssetBinding(binding, errors.New("登记参考素材失败：没有返回素材 ID"))
	}
	binding.AssetGroupID = cloudwiseResultString(result, "group_id")
	binding.ArkAssetID = assetID
	binding.Status = arkPrivateAssetStatusWait
	if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
		return "", err
	}
	return s.waitForTencentWandAsset(ctx, config, binding)
}

func (s *Service) waitForTencentWandAsset(ctx context.Context, config providerConfig, binding *model.ArkPrivateAssetBinding) (string, error) {
	deadline := time.Now().Add(tencentWandAssetPollLimit)
	for {
		switch binding.Status {
		case arkPrivateAssetStatusLive:
			return binding.ArkAssetID, nil
		case arkPrivateAssetStatusFail:
			return "", fmt.Errorf("参考素材登记失败：%s", defaultString(binding.Error, "请更换参考素材后重试"))
		}
		if binding.ArkAssetID != "" {
			result, err := callTencentWandAsset(ctx, config, "/v1/wand/vega-video-assets/"+url.PathEscape(binding.ArkAssetID), nil)
			if err != nil {
				return "", fmt.Errorf("查询参考素材状态失败：%w", err)
			}
			switch strings.ToUpper(cloudwiseResultString(result, "status")) {
			case "DONE":
				binding.Status = arkPrivateAssetStatusLive
				binding.Error = ""
				if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
					return "", err
				}
				return binding.ArkAssetID, nil
			case "FAIL":
				reason := defaultString(cloudwiseResultString(result, "message"), "请更换参考素材后重试")
				if err := s.failArkPrivateAssetBinding(binding, errors.New(reason)); err != nil && err.Error() != reason {
					return "", err
				}
				return "", fmt.Errorf("参考素材登记失败：%s", reason)
			}
		}
		if !time.Now().Before(deadline) {
			return "", errors.New("参考素材登记超时，请稍后重新生成")
		}
		if err := sleepContext(ctx, tencentWandAssetPollInterval); err != nil {
			return "", err
		}
		latest, err := s.repo.ArkPrivateAssetBinding(binding.ResourceID, binding.ProjectName)
		if err != nil {
			return "", err
		}
		binding = latest
	}
}

// prepareTencentWandAssetReferences 把 WAND 视频的参考图和参考音频换成 asset://<id>；参考视频只接受公网网址，保持不变。
func (s *Service) prepareTencentWandAssetReferences(ctx context.Context, userID string, input *canvasGenerationInput) error {
	if input == nil || input.Mode != "video" || strings.TrimSpace(input.Config.InterfaceType) != tencentWandVideoProtocol {
		return nil
	}
	started := false
	for _, group := range []struct {
		items []providerMedia
		kind  string
	}{{input.ReferenceImages, "Image"}, {input.ReferenceAudios, "Audio"}} {
		for index := range group.items {
			reference := &group.items[index]
			if strings.HasPrefix(strings.TrimSpace(reference.URL), "asset://") {
				continue
			}
			resourceID := arkPrivateAssetResourceID(*reference)
			if resourceID == "" {
				continue
			}
			if !started {
				started = true
				if taskID := taskExecutionID(ctx); taskID != "" {
					_ = s.repo.UpdateTaskProgress(taskID, "正在上传参考素材", 0)
				}
			}
			resource, err := s.Resource(userID, resourceID)
			if err != nil {
				return fmt.Errorf("读取参考素材失败：%w", err)
			}
			assetID, err := s.ensureTencentWandAsset(ctx, userID, input.Config, resource, group.kind)
			if err != nil {
				return err
			}
			reference.URL = "asset://" + assetID
			reference.DataURL = ""
		}
	}
	if started {
		if taskID := taskExecutionID(ctx); taskID != "" {
			_ = s.repo.UpdateTaskProgress(taskID, "作品创作中", 0)
		}
	}
	return nil
}
