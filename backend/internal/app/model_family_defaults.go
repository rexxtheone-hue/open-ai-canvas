package app

import (
	"strings"

	"yingce/backend/internal/model"
)

const mb = 1024 * 1024

// 这些协议已有逐项配置的默认值；按模型名推断只用于其它（插件、聚合渠道）协议，
// 让 Cloudwise / ModelVerse / fal 等渠道新增模型时直接带出正确的引用与规格。
var protocolOwnedVideoDefaults = map[model.ChannelInterfaceType]bool{
	model.ChannelInterfaceVolcengineJiMengVideo:       true,
	model.ChannelInterfaceGeminiVeo:                   true,
	model.ChannelInterfaceVolcengineArkVideo:          true,
	model.ChannelInterfaceVolcengineArkAgentPlanVideo: true,
	model.ChannelInterfaceNewAPIChannel1:              true,
	model.ChannelInterfaceNewAPIChannel2:              true,
	model.ChannelInterfaceNewAPIVideo:                 true,
	model.ChannelInterfaceXAIVideo:                    true,
	model.ChannelInterfaceNovitaVideo:                 true,
	model.ChannelInterfaceMiniMaxVideo:                true,
	model.ChannelInterfaceAgnesVideo:                  true,
}

func enumDuration(defaultValue int, values ...int) VideoDurationConfig {
	return VideoDurationConfig{Selection: "enum", Values: values, Default: defaultValue}
}

func rangeDuration(min, max, defaultValue int) VideoDurationConfig {
	return VideoDurationConfig{Selection: "range", Min: min, Max: max, Step: 1, Default: defaultValue}
}

func setVideoReferences(video *VideoCapabilityConfig, images, imageMB, videos, videoMB, videoSeconds, audios, audioMB, audioSeconds int) {
	refs := &video.References
	refs.MaxImages, refs.MaxImageBytes = images, int64(imageMB)*mb
	refs.MaxVideos, refs.MaxVideoBytes, refs.MaxVideoDuration = videos, int64(videoMB)*mb, videoSeconds
	refs.MaxAudios, refs.MaxAudioBytes, refs.MaxAudioDuration = audios, int64(audioMB)*mb, audioSeconds
}

func addVideoOperations(video *VideoCapabilityConfig, operations ...string) {
	for _, operation := range operations {
		exists := false
		for _, current := range video.Operations {
			exists = exists || current == operation
		}
		if !exists {
			video.Operations = append(video.Operations, operation)
		}
	}
}

// applyModelFamilyVideoDefaults 按模型名识别常见视频模型家族，返回是否命中。
func applyModelFamilyVideoDefaults(video *VideoCapabilityConfig, protocol string, modelName string) bool {
	if video == nil || protocolOwnedVideoDefaults[model.ChannelInterfaceType(strings.TrimSpace(protocol))] {
		return false
	}
	name := strings.ToLower(strings.TrimSpace(modelName))
	has := func(parts ...string) bool {
		for _, part := range parts {
			if strings.Contains(name, part) {
				return true
			}
		}
		return false
	}
	standardRatios := []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}
	switch {
	case has("seedance-2", "seedance2", "seedance-v2"):
		setVideoReferences(video, 9, 30, 3, 50, 15, 3, 15, 15)
		video.Duration = rangeDuration(4, 15, 5)
		video.Ratios, video.DefaultRatio = append([]string{"adaptive"}, standardRatios...), "16:9"
		video.Resolutions, video.DefaultResolution = []string{"480p", "720p", "1080p"}, "720p"
		video.GenerateAudio = VideoBooleanConfig{Supported: true, Default: true}
		video.Watermark = VideoBooleanConfig{Supported: true, Default: false}
		addVideoOperations(video, "reference_to_video", "audio_to_video")
	case has("seedance-1", "seedance1"):
		setVideoReferences(video, 2, 30, 0, 0, 0, 0, 0, 0)
		video.Duration = rangeDuration(2, 12, 5)
		video.Resolutions, video.DefaultResolution = []string{"480p", "720p", "1080p"}, "720p"
		video.GenerateAudio = VideoBooleanConfig{Supported: has("1.5", "1-5"), Default: has("1.5", "1-5")}
		video.Watermark = VideoBooleanConfig{Supported: true, Default: false}
	case has("kling"):
		setVideoReferences(video, 7, 10, 1, 200, 10, 0, 0, 0)
		video.Duration = rangeDuration(3, 10, 5)
		video.Resolutions, video.DefaultResolution = []string{"720p", "1080p"}, "1080p"
		if has("v3") {
			video.Duration = rangeDuration(3, 15, 5)
			video.Resolutions = []string{"720p", "1080p", "4k"}
		}
		video.Ratios, video.DefaultRatio = []string{"16:9", "9:16", "1:1"}, "16:9"
		video.GenerateAudio = VideoBooleanConfig{Supported: true, Default: false}
		addVideoOperations(video, "reference_to_video")
	case has("minimax-h3", "minimax_h3"):
		video.Ratios, video.DefaultRatio = []string{"adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}, "16:9"
		if has("max") {
			setVideoReferences(video, 2, 30, 0, 0, 0, 0, 0, 0)
			video.Duration = rangeDuration(5, 15, 5)
			video.Resolutions, video.DefaultResolution = []string{"480P", "768P"}, "768P"
			break
		}
		setVideoReferences(video, 9, 30, 3, 50, 15, 3, 15, 15)
		video.Duration = rangeDuration(4, 15, 5)
		video.Resolutions, video.DefaultResolution = []string{"768P", "2K"}, "768P"
		addVideoOperations(video, "reference_to_video")
	case has("hailuo"):
		setVideoReferences(video, 2, 20, 0, 0, 0, 0, 0, 0)
		video.Duration = enumDuration(6, 6, 10)
		video.Resolutions, video.DefaultResolution = []string{"768P", "1080P"}, "768P"
	case has("veo-3", "veo3"):
		setVideoReferences(video, 2, 20, 0, 0, 0, 0, 0, 0)
		video.Duration = enumDuration(8, 4, 6, 8)
		video.Ratios, video.DefaultRatio = []string{"16:9", "9:16"}, "16:9"
		video.Resolutions, video.DefaultResolution = []string{"720p", "1080p"}, "720p"
		video.GenerateAudio = VideoBooleanConfig{Supported: true, Default: true}
	case has("sora-2", "sora2"):
		setVideoReferences(video, 1, 20, 0, 0, 0, 0, 0, 0)
		video.Duration = enumDuration(4, 4, 8, 12)
		video.Ratios, video.DefaultRatio = []string{"16:9", "9:16"}, "16:9"
		video.Resolutions, video.DefaultResolution = []string{"720p"}, "720p"
	case has("wan3", "wan-3"):
		setVideoReferences(video, 10, 20, 3, 100, 15, 1, 15, 30)
		video.Duration = rangeDuration(2, 15, 5)
		video.Ratios, video.DefaultRatio = append([]string{"adaptive"}, standardRatios[:5]...), "16:9"
		video.Resolutions, video.DefaultResolution = []string{"480p", "720p", "1080p"}, "1080p"
		video.GenerateAudio = VideoBooleanConfig{Supported: true, Default: false}
		video.Watermark = VideoBooleanConfig{Supported: true, Default: false}
		addVideoOperations(video, "reference_to_video")
	case has("wan2.7", "wan2-7"):
		setVideoReferences(video, 5, 20, 1, 100, 10, 1, 15, 30)
		video.Duration = rangeDuration(2, 15, 5)
		video.Ratios, video.DefaultRatio = standardRatios[:5], "16:9"
		video.Resolutions, video.DefaultResolution = []string{"720p", "1080p"}, "1080p"
		video.Watermark = VideoBooleanConfig{Supported: true, Default: false}
		addVideoOperations(video, "reference_to_video")
	case has("wan2.6", "wan2-6"):
		setVideoReferences(video, 1, 20, 0, 0, 0, 1, 15, 30)
		video.Duration = enumDuration(5, 5, 10, 15)
		video.Resolutions, video.DefaultResolution = []string{"720p", "1080p"}, "1080p"
	case has("wan2.5", "wan2-5"):
		setVideoReferences(video, 1, 20, 0, 0, 0, 1, 15, 30)
		video.Duration = enumDuration(5, 5, 10)
		video.Resolutions, video.DefaultResolution = []string{"480p", "720p", "1080p"}, "1080p"
	case has("wan2.2", "wan2-2"):
		setVideoReferences(video, 2, 20, 0, 0, 0, 0, 0, 0)
		video.Duration = enumDuration(5, 5, 8)
		video.Resolutions, video.DefaultResolution = []string{"480p", "720p"}, "720p"
	default:
		return false
	}
	return true
}
