package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

var (
	cloudwiseAssetPollInterval = 2 * time.Second
	cloudwiseAssetPollLimit    = 3 * time.Minute
)

func cloudwiseAssetProject(channelID string) string {
	return "cloudwise:" + channelID
}

// cloudwiseAssetGroup 返回该渠道的平台素材组，首次使用时自动创建并记住。
func (s *Service) cloudwiseAssetGroup(ctx context.Context, channel *cloudwiseChannel) (string, error) {
	key := "cloudwise_asset_group:" + channel.ID
	record, err := s.repo.SystemSettingOptional(key)
	if err != nil {
		return "", err
	}
	if record != nil {
		var groupID string
		if json.Unmarshal([]byte(record.ValueJSON), &groupID) == nil && strings.TrimSpace(groupID) != "" {
			return groupID, nil
		}
	}
	result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/groups/create", map[string]any{
		"name":        "yingce-reference",
		"description": "生成任务自动上传的参考素材",
	})
	if err != nil {
		return "", fmt.Errorf("创建 Cloudwise 素材组失败：%w", err)
	}
	groupID := cloudwiseResultString(result, "Id", "id", "GroupId")
	if groupID == "" {
		return "", errors.New("创建 Cloudwise 素材组失败：没有返回素材组 ID")
	}
	value, _ := json.Marshal(groupID)
	if err := s.repo.SaveSystemSetting(&model.SystemSetting{Key: key, ValueJSON: string(value)}); err != nil {
		return "", err
	}
	return groupID, nil
}

// ensureCloudwiseAsset 把参考素材上传到渠道素材组并等待审核通过；同一资源在同一渠道只上传一次。
func (s *Service) ensureCloudwiseAsset(ctx context.Context, userID string, channel *cloudwiseChannel, resource *model.Resource, assetType string) (string, error) {
	project := cloudwiseAssetProject(channel.ID)
	binding, err := s.repo.ArkPrivateAssetBinding(resource.ID, project)
	if err == nil {
		if binding.Status != arkPrivateAssetStatusFail || binding.ArkAssetID != "" {
			return s.waitForCloudwiseAsset(ctx, channel, binding)
		}
		// 素材还没建成（网络或配置问题）可以安全重试。
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
			return s.waitForCloudwiseAsset(ctx, channel, binding)
		}
	}
	if resource.Status != model.ResourceStatusReady {
		return "", s.failArkPrivateAssetBinding(binding, errors.New("参考素材还没有上传完成"))
	}
	groupID, err := s.cloudwiseAssetGroup(ctx, channel)
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, err)
	}
	resourceURL, err := s.providerResourceURL(resource, time.Now().Add(time.Hour))
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, fmt.Errorf("生成参考素材临时地址失败：%w", err))
	}
	result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/create", map[string]any{
		"name":        "ref-" + resource.ID,
		"description": "reference",
		"assetType":   assetType,
		"groupId":     groupID,
		"url":         resourceURL,
	})
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, fmt.Errorf("上传参考素材失败：%w", err))
	}
	assetID := cloudwiseResultString(result, "Id", "id", "AssetId")
	if assetID == "" {
		return "", s.failArkPrivateAssetBinding(binding, errors.New("上传参考素材失败：没有返回素材 ID"))
	}
	binding.AssetGroupID = groupID
	binding.ArkAssetID = assetID
	binding.Status = arkPrivateAssetStatusWait
	if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
		return "", err
	}
	return s.waitForCloudwiseAsset(ctx, channel, binding)
}

func (s *Service) waitForCloudwiseAsset(ctx context.Context, channel *cloudwiseChannel, binding *model.ArkPrivateAssetBinding) (string, error) {
	deadline := time.Now().Add(cloudwiseAssetPollLimit)
	for {
		switch binding.Status {
		case arkPrivateAssetStatusLive:
			return binding.ArkAssetID, nil
		case arkPrivateAssetStatusFail:
			return "", fmt.Errorf("参考素材审核未通过：%s", defaultString(binding.Error, "请更换参考素材后重试"))
		}
		if binding.ArkAssetID != "" {
			result, err := callCloudwiseAsset(ctx, channel, "/api/v1/assets/get", map[string]any{"Id": binding.ArkAssetID})
			if err != nil {
				return "", fmt.Errorf("查询参考素材审核状态失败：%w", err)
			}
			switch strings.ToLower(cloudwiseResultString(result, "Status", "status")) {
			case "active":
				binding.Status = arkPrivateAssetStatusLive
				binding.Error = ""
				if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
					return "", err
				}
				return binding.ArkAssetID, nil
			case "failed", "rejected":
				reason := defaultString(cloudwiseResultString(result, "ErrorMessage", "Message", "Reason"), "请更换参考素材后重试")
				if err := s.failArkPrivateAssetBinding(binding, errors.New(reason)); err != nil && err.Error() != reason {
					return "", err
				}
				return "", fmt.Errorf("参考素材审核未通过：%s", reason)
			}
		}
		if !time.Now().Before(deadline) {
			return "", errors.New("参考素材审核超时，请稍后重新生成")
		}
		if err := sleepContext(ctx, cloudwiseAssetPollInterval); err != nil {
			return "", err
		}
		latest, err := s.repo.ArkPrivateAssetBinding(binding.ResourceID, binding.ProjectName)
		if err != nil {
			return "", err
		}
		binding = latest
	}
}
