package app

// 腾讯 TokenHub 可灵 v4 不接受参考音频，只接受音色：参考音频先登记为自定义音色（custom-voices），
// 再以 kling-voice://<voice_id> 交给插件，插件转成 contents 里的 {"type":"voice"}。

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const (
	tencentKlingVideoProtocol = "tencent-kling-video"
	tencentKlingVoicePrefix   = "kling-voice://"
	tencentKlingMaxVoices     = 3
)

var tencentKlingVoiceMention = regexp.MustCompile(`@[1-3](?:[^0-9]|$)`)

func tencentKlingVoiceProject(channelID string) string {
	return "tencent-kling-voice:" + channelID
}

func klingVoiceResultID(result map[string]any) string {
	data, _ := result["data"].(map[string]any)
	taskResult, _ := data["task_result"].(map[string]any)
	voices, _ := taskResult["voices"].([]any)
	for _, item := range voices {
		if voice, ok := item.(map[string]any); ok {
			if id := strings.TrimSpace(fmt.Sprint(voice["voice_id"])); id != "" && id != "<nil>" {
				return id
			}
		}
	}
	return ""
}

func klingVoiceData(result map[string]any, key string) string {
	data, _ := result["data"].(map[string]any)
	value := strings.TrimSpace(fmt.Sprint(data[key]))
	if value == "<nil>" {
		return ""
	}
	return value
}

// ensureTencentKlingVoice 把参考音频登记为可灵音色并等到可用；同一资源在同一渠道只登记一次。
// 绑定记录里 AssetGroupID 存音色任务 ID，ArkAssetID 存最终的 voice_id。
func (s *Service) ensureTencentKlingVoice(ctx context.Context, userID string, config providerConfig, resource *model.Resource) (string, error) {
	project := tencentKlingVoiceProject(config.ChannelID)
	binding, err := s.repo.ArkPrivateAssetBinding(resource.ID, project)
	if err == nil {
		if binding.Status != arkPrivateAssetStatusFail {
			return s.waitForTencentKlingVoice(ctx, config, binding)
		}
		binding.Status = arkPrivateAssetStatusNew
		binding.Error = ""
		binding.AssetGroupID = ""
		binding.ArkAssetID = ""
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
			return s.waitForTencentKlingVoice(ctx, config, binding)
		}
	}
	if resource.Status != model.ResourceStatusReady {
		return "", s.failArkPrivateAssetBinding(binding, errors.New("参考音频还没有上传完成"))
	}
	resourceURL, err := s.providerResourceURL(resource, time.Now().Add(time.Hour))
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, fmt.Errorf("生成参考音频临时地址失败：%w", err))
	}
	result, err := callTencentWandAsset(ctx, config, "/v1/wand/kling/custom-voices", map[string]any{
		"voice_name": "voice-" + resource.ID,
		"voice_url":  resourceURL,
	})
	if err != nil {
		return "", s.failArkPrivateAssetBinding(binding, fmt.Errorf("创建音色失败：%w", err))
	}
	taskID := klingVoiceData(result, "task_id")
	if taskID == "" {
		return "", s.failArkPrivateAssetBinding(binding, errors.New("创建音色失败：没有返回任务 ID"))
	}
	binding.AssetGroupID = taskID
	binding.Status = arkPrivateAssetStatusWait
	if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
		return "", err
	}
	return s.waitForTencentKlingVoice(ctx, config, binding)
}

func (s *Service) waitForTencentKlingVoice(ctx context.Context, config providerConfig, binding *model.ArkPrivateAssetBinding) (string, error) {
	deadline := time.Now().Add(tencentWandAssetPollLimit)
	for {
		switch binding.Status {
		case arkPrivateAssetStatusLive:
			if binding.ArkAssetID != "" {
				return binding.ArkAssetID, nil
			}
		case arkPrivateAssetStatusFail:
			return "", fmt.Errorf("音色创建失败：%s", defaultString(binding.Error, "请更换参考音频后重试"))
		}
		if binding.AssetGroupID != "" {
			result, err := callTencentWandAsset(ctx, config, "/v1/wand/kling/custom-voices/"+url.PathEscape(binding.AssetGroupID), nil)
			if err != nil {
				return "", fmt.Errorf("查询音色状态失败：%w", err)
			}
			switch strings.ToLower(klingVoiceData(result, "task_status")) {
			case "succeed", "succeeded", "success":
				voiceID := klingVoiceResultID(result)
				if voiceID == "" {
					reason := "上游没有返回音色 ID"
					_ = s.failArkPrivateAssetBinding(binding, errors.New(reason))
					return "", fmt.Errorf("音色创建失败：%s", reason)
				}
				binding.ArkAssetID = voiceID
				binding.Status = arkPrivateAssetStatusLive
				binding.Error = ""
				if err := s.repo.SaveArkPrivateAssetBinding(binding); err != nil {
					return "", err
				}
				return voiceID, nil
			case "failed", "fail":
				reason := defaultString(klingVoiceData(result, "task_status_msg"), "请更换参考音频后重试")
				_ = s.failArkPrivateAssetBinding(binding, errors.New(reason))
				return "", fmt.Errorf("音色创建失败：%s", reason)
			}
		}
		if !time.Now().Before(deadline) {
			return "", errors.New("音色创建超时，请稍后重新生成")
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

// prepareTencentKlingVoiceReferences 把可灵 v4 的参考音频换成 kling-voice://<voice_id>；
// 提示词里没有用 @1 这类写法指定音色时，自动补上，否则上游不会使用音色。
func (s *Service) prepareTencentKlingVoiceReferences(ctx context.Context, userID string, input *canvasGenerationInput) error {
	if input == nil || input.Mode != "video" || strings.TrimSpace(input.Config.InterfaceType) != tencentKlingVideoProtocol || len(input.ReferenceAudios) == 0 {
		return nil
	}
	if len(input.ReferenceAudios) > tencentKlingMaxVoices {
		return fmt.Errorf("该模型最多使用 %d 段参考音频（音色）", tencentKlingMaxVoices)
	}
	started := false
	for index := range input.ReferenceAudios {
		reference := &input.ReferenceAudios[index]
		if strings.HasPrefix(strings.TrimSpace(reference.URL), tencentKlingVoicePrefix) {
			continue
		}
		resourceID := arkPrivateAssetResourceID(*reference)
		if resourceID == "" {
			return errors.New("参考音频需要先上传到素材库，才能创建音色")
		}
		if !started {
			started = true
			if taskID := taskExecutionID(ctx); taskID != "" {
				_ = s.repo.UpdateTaskProgress(taskID, "正在创建音色", 0)
			}
		}
		resource, err := s.Resource(userID, resourceID)
		if err != nil {
			return fmt.Errorf("读取参考音频失败：%w", err)
		}
		voiceID, err := s.ensureTencentKlingVoice(ctx, userID, input.Config, resource)
		if err != nil {
			return err
		}
		reference.URL = tencentKlingVoicePrefix + voiceID
		reference.DataURL = ""
	}
	if started {
		if taskID := taskExecutionID(ctx); taskID != "" {
			_ = s.repo.UpdateTaskProgress(taskID, "作品创作中", 0)
		}
	}
	input.Prompt = withKlingVoiceMentions(input.Prompt, len(input.ReferenceAudios))
	return nil
}

func withKlingVoiceMentions(prompt string, voices int) string {
	if voices <= 0 || tencentKlingVoiceMention.MatchString(prompt) {
		return prompt
	}
	mentions := make([]string, 0, voices)
	for index := 1; index <= voices; index++ {
		mentions = append(mentions, "@"+strconv.Itoa(index))
	}
	return strings.TrimSpace(prompt) + "\n人物说话使用音色 " + strings.Join(mentions, "、") + "。"
}
