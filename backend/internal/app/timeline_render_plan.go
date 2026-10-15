package app

import (
	"fmt"
	"sort"
	"strings"
)

// 时间线渲染：把前端 TimelineProject 快照（tracks/clips 平铺，见
// web/src/types/timeline.ts TimelineProject v2）展开为可执行的 ffmpeg 步骤。
// 与前端 timeline-to-ffmpeg.ts 保持同一数据流：trim（按 sourceStartMs 裁切）
// → 空隙补黑场静音 → concat。字幕不烧录（依赖 libass），单独产出 SRT。
//
// 输入布局统一为「每个片段两个输入：视频源 + 音频源」，空隙展开为独立
// 黑场片段，因此第 i 个片段的视频输入为 2i、音频输入为 2i+1。

type renderClip struct {
	ID               string  `json:"id"`
	Kind             string  `json:"kind"`
	TrackID          string  `json:"trackId"`
	StartMs          int64   `json:"startMs"`
	DurationMs       int64   `json:"durationMs"`
	SourceStartMs    int64   `json:"sourceStartMs"`
	SourceDurationMs int64   `json:"sourceDurationMs"`
	Volume           float64 `json:"volume"`
	Text             string  `json:"text"`
	DirectMedia      *struct {
		ID         string `json:"id"`
		Kind       string `json:"kind"`
		StorageKey string `json:"storageKey"`
	} `json:"directMedia"`
}

type renderTrack struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Visible *bool  `json:"visible"`
	Muted   bool   `json:"muted"`
}

type renderProject struct {
	Version    int           `json:"version"`
	Tracks     []renderTrack `json:"tracks"`
	Clips      []renderClip  `json:"clips"`
	DurationMs int64         `json:"durationMs"`
	// 以下为可选项，只有 AI Studio 导演会传；画布剪辑器不传时保持原有行为。
	Width          int  `json:"width,omitempty"`
	Height         int  `json:"height,omitempty"`
	MixAudioTracks bool `json:"mixAudioTracks,omitempty"`
}

type renderSource struct {
	ResourceID string
	Clip       renderClip
	Path       string
	Ext        string
	// HasAudio 由 ffprobe 探测得到；无音轨的媒体改为静音源，避免 map 失败。
	HasAudio bool
}

// renderSegment 是渲染序列中的一段；Kind 为 video/image 表示媒体片段，
// gap 表示补黑场静音的空隙段（无 Source）。
type renderSegment struct {
	Kind       string
	DurationMs int64
	GapMs      int64
	Clip       renderClip
	Source     *renderSource
}

type renderPlan struct {
	Segments    []renderSegment
	SubtitleSRT string
	HasMedia    bool
	Width       int
	Height      int
	// Overlays 是叠加在整片上的音频片段（配音、音乐），按 startMs 延迟后与主音轨混合。
	Overlays []renderOverlay
}

type renderOverlay struct {
	Clip   renderClip
	Source *renderSource
}

// buildRenderPlan 挑选可见视频/图片轨片段按 startMs 排序，并把片段之间的
// 空隙展开为黑场段，使渲染序列在时间轴上连续。
func buildRenderPlan(project renderProject) renderPlan {
	visible := map[string]bool{}
	for _, track := range project.Tracks {
		visible[track.ID] = track.Visible == nil || *track.Visible
	}
	clips := make([]renderClip, 0, len(project.Clips))
	for _, clip := range project.Clips {
		if !visible[clip.TrackID] {
			continue
		}
		if clip.Kind != "video" && clip.Kind != "image" {
			continue
		}
		if clip.DurationMs <= 0 {
			continue
		}
		clips = append(clips, clip)
	}
	sort.SliceStable(clips, func(i, j int) bool {
		if clips[i].StartMs == clips[j].StartMs {
			return clips[i].ID < clips[j].ID
		}
		return clips[i].StartMs < clips[j].StartMs
	})

	plan := renderPlan{SubtitleSRT: buildRenderSubtitleSRT(project), Width: renderWidth, Height: renderHeight}
	if project.Width >= 256 && project.Width <= 4096 && project.Height >= 256 && project.Height <= 4096 {
		// 偶数尺寸才能用 yuv420p 编码。
		plan.Width, plan.Height = project.Width/2*2, project.Height/2*2
	}
	if project.MixAudioTracks {
		muted := map[string]bool{}
		for _, track := range project.Tracks {
			muted[track.ID] = track.Muted || !(track.Visible == nil || *track.Visible)
		}
		for _, clip := range project.Clips {
			if clip.Kind != "audio" || muted[clip.TrackID] || clip.DurationMs <= 0 {
				continue
			}
			if _, ok := mediaResourceID(clip); ok {
				plan.Overlays = append(plan.Overlays, renderOverlay{Clip: clip})
			}
		}
		sort.SliceStable(plan.Overlays, func(i, j int) bool { return plan.Overlays[i].Clip.StartMs < plan.Overlays[j].Clip.StartMs })
	}
	cursor := int64(0)
	for _, clip := range clips {
		if gap := clip.StartMs - cursor; gap > 0 {
			plan.Segments = append(plan.Segments, renderSegment{Kind: "gap", DurationMs: gap, GapMs: gap})
		}
		plan.Segments = append(plan.Segments, renderSegment{Kind: clip.Kind, DurationMs: clip.DurationMs, Clip: clip})
		cursor = clip.StartMs + clip.DurationMs
	}
	for _, seg := range plan.Segments {
		if _, ok := mediaResourceID(seg.Clip); ok {
			plan.HasMedia = true
			break
		}
	}
	return plan
}

// mediaResourceID 从片段的 directMedia.storageKey（resource:<id>）还原资源 ID。
func mediaResourceID(clip renderClip) (string, bool) {
	if clip.DirectMedia == nil {
		return "", false
	}
	key := strings.TrimSpace(clip.DirectMedia.StorageKey)
	if !strings.HasPrefix(key, "resource:") {
		return "", false
	}
	id := strings.TrimSpace(strings.TrimPrefix(key, "resource:"))
	return id, id != ""
}

func buildRenderSubtitleSRT(project renderProject) string {
	subtitle := make([]renderClip, 0, len(project.Clips))
	for _, clip := range project.Clips {
		if clip.Kind != "subtitle" || strings.TrimSpace(clip.Text) == "" || clip.DurationMs <= 0 {
			continue
		}
		subtitle = append(subtitle, clip)
	}
	sort.SliceStable(subtitle, func(i, j int) bool {
		if subtitle[i].StartMs == subtitle[j].StartMs {
			return subtitle[i].ID < subtitle[j].ID
		}
		return subtitle[i].StartMs < subtitle[j].StartMs
	})
	if len(subtitle) == 0 {
		return ""
	}
	var out strings.Builder
	for i, clip := range subtitle {
		fmt.Fprintf(&out, "%d\n%s --> %s\n%s\n\n",
			i+1,
			formatSRTTimestamp(clip.StartMs),
			formatSRTTimestamp(clip.StartMs+clip.DurationMs),
			strings.TrimSpace(clip.Text))
	}
	return out.String()
}

const (
	renderWidth      = 1920
	renderHeight     = 1080
	renderFPS        = 30
	renderSampleRate = 44100
)

// buildRenderFFmpegArgs 依据渲染计划生成 ffmpeg 参数（工作目录内相对路径）。
// 每段固定两个输入：视频源与音频源，末尾 concat 为单路输出。
func buildRenderFFmpegArgs(plan renderPlan, target string) []string {
	if len(plan.Segments) == 0 {
		return nil
	}
	width, height := plan.Width, plan.Height
	if width <= 0 || height <= 0 {
		width, height = renderWidth, renderHeight
	}
	scale := fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2",
		width, height, width, height)
	args := []string{"-nostdin", "-y"}
	for _, seg := range plan.Segments {
		seconds := fmt.Sprintf("%.3f", float64(seg.DurationMs)/1000)
		switch seg.Kind {
		case "gap":
			args = append(args,
				"-f", "lavfi", "-t", seconds,
				"-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", renderWidth, renderHeight, renderFPS),
				"-f", "lavfi", "-t", seconds,
				"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
			)
		case "image":
			if seg.Source == nil {
				args = append(args,
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", renderWidth, renderHeight, renderFPS),
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
				)
				continue
			}
			args = append(args,
				"-loop", "1", "-t", seconds, "-i", seg.Source.Path,
				"-f", "lavfi", "-t", seconds,
				"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
			)
		default:
			if seg.Source == nil {
				args = append(args,
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", renderWidth, renderHeight, renderFPS),
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
				)
				continue
			}
			if seg.Clip.SourceStartMs > 0 {
				args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000))
			}
			args = append(args, "-t", seconds, "-i", seg.Source.Path)
			// 音频输入复用同一媒体文件；无音轨时 ffmpeg 会因 map 失败，
			// 由调用方探测后回退为静音源（见 renderAudioFallback）。
			if seg.Clip.SourceStartMs > 0 {
				args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000))
			}
			args = append(args, "-t", seconds, "-i", seg.Source.Path)
		}
	}

	filters := make([]string, 0, len(plan.Segments)*2+1)
	labels := make([]string, 0, len(plan.Segments)*2)
	for i, seg := range plan.Segments {
		videoIn := 2 * i
		audioIn := 2*i + 1
		videoLabel := fmt.Sprintf("v%d", i)
		audioLabel := fmt.Sprintf("a%d", i)
		if seg.Source != nil && seg.Kind != "image" && !seg.Source.HasAudio {
			// 无音轨媒体：改用静音源，避免 map 失败。
			audioIn = videoIn
			filters = append(filters,
				fmt.Sprintf("[%d:v]fps=%d,%s,setsar=1%s[%s]", videoIn, renderFPS, scale, renderHoldLastFrame(seg), videoLabel))
			silentLabel := fmt.Sprintf("silent%d", i)
			filters = append(filters,
				fmt.Sprintf("anullsrc=r=%d:cl=stereo[%s]", renderSampleRate, silentLabel))
			filters = append(filters,
				fmt.Sprintf("[%s]atrim=0:%.3f,asetpts=N/SR/TB[%s]", silentLabel, float64(seg.DurationMs)/1000, audioLabel))
		} else {
			volume := 1.0
			if seg.Clip.Volume > 0 {
				volume = seg.Clip.Volume
			}
			filters = append(filters,
				fmt.Sprintf("[%d:v]fps=%d,%s,setsar=1%s[%s]", videoIn, renderFPS, scale, renderHoldLastFrame(seg), videoLabel))
			// apad 补到片段时长后必须截断：无限长的音频会让 concat 一直等待第一段结束而卡死。
			filters = append(filters,
				fmt.Sprintf("[%d:a]aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=stereo,volume=%.3f,apad,atrim=0:%.3f,asetpts=N/SR/TB[%s]",
					audioIn, renderSampleRate, volume, float64(seg.DurationMs)/1000, audioLabel))
		}
		labels = append(labels, videoLabel, audioLabel)
	}
	var concatInputs strings.Builder
	for _, label := range labels {
		fmt.Fprintf(&concatInputs, "[%s]", label)
	}
	audioOut := "aout"
	filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=1:a=1[vout][aout]", concatInputs.String(), len(plan.Segments)))
	mixed := 0
	for _, overlay := range plan.Overlays {
		if overlay.Source == nil {
			continue
		}
		args = append(args, "-i", overlay.Source.Path)
		input := 2*len(plan.Segments) + mixed
		volume := 1.0
		if overlay.Clip.Volume > 0 {
			volume = overlay.Clip.Volume
		}
		label := fmt.Sprintf("ov%d", mixed)
		filters = append(filters, fmt.Sprintf("[%d:a]atrim=start=%.3f:duration=%.3f,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=stereo,volume=%.3f,adelay=%d|%d[%s]",
			input, float64(overlay.Clip.SourceStartMs)/1000, float64(overlay.Clip.DurationMs)/1000, renderSampleRate, volume, overlay.Clip.StartMs, overlay.Clip.StartMs, label))
		mixed++
	}
	if mixed > 0 {
		var mixInputs strings.Builder
		mixInputs.WriteString("[aout]")
		for i := 0; i < mixed; i++ {
			fmt.Fprintf(&mixInputs, "[ov%d]", i)
		}
		// normalize=0：叠加配音和音乐时不压低原有音量。
		filters = append(filters, fmt.Sprintf("%samix=inputs=%d:duration=first:dropout_transition=0:normalize=0[amixed]", mixInputs.String(), mixed+1))
		audioOut = "amixed"
	}

	args = append(args,
		"-filter_complex", strings.Join(filters, ";"),
		"-map", "[vout]", "-map", "["+audioOut+"]",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
		"-t", fmt.Sprintf("%.3f", planTotalSeconds(plan)),
		target,
	)
	return args
}

func planTotalSeconds(plan renderPlan) float64 {
	var total int64
	for _, seg := range plan.Segments {
		total += seg.DurationMs
	}
	return float64(total) / 1000
}

// renderHoldLastFrame 让视频片段正好铺满片段时长：素材比片段短时定格最后一帧补齐。
// 否则 concat 里这段画面会提前结束，后面所有片段的画面都比声音早，成片音画不同步。
func renderHoldLastFrame(seg renderSegment) string {
	if seg.Kind != "video" || seg.DurationMs <= 0 {
		return ""
	}
	seconds := float64(seg.DurationMs) / 1000
	return fmt.Sprintf(",tpad=stop_mode=clone:stop_duration=%.3f,trim=duration=%.3f,setpts=PTS-STARTPTS", seconds, seconds)
}
