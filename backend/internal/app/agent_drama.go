package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

type DramaQuoteRequest struct {
	Role    string         `json:"role,omitempty"`
	Kind    string         `json:"kind,omitempty"`
	Model   string         `json:"model,omitempty"`
	Params  map[string]any `json:"params,omitempty"`
	Count   int            `json:"count"`
	Seconds float64        `json:"seconds,omitempty"`
}

type DramaQuoteInput struct {
	Purpose     string              `json:"purpose"`
	Requests    []DramaQuoteRequest `json:"requests"`
	Resolutions []string            `json:"resolutions,omitempty"`
	Style       string              `json:"style,omitempty"`
	Narration   bool                `json:"narration,omitempty"`
	Song        bool                `json:"song,omitempty"`
	DramaAdsID  string              `json:"drama_ads_id,omitempty"`
	PresetID    string              `json:"preset_id,omitempty"`
}

type DramaQuoteItem struct {
	Role        string  `json:"role,omitempty"`
	Kind        string  `json:"kind"`
	Model       string  `json:"model"`
	Resolution  string  `json:"resolution,omitempty"`
	Seconds     float64 `json:"seconds,omitempty"`
	Count       int     `json:"count"`
	CreditsEach float64 `json:"credits_each"`
	Credits     float64 `json:"credits"`
	Unavailable string  `json:"unavailable,omitempty"`
}

type DramaQuote struct {
	DramaAdsID   string             `json:"drama_ads_id"`
	Purpose      string             `json:"purpose"`
	Totals       map[string]float64 `json:"totals,omitempty"`
	Total        *float64           `json:"total,omitempty"`
	Items        []DramaQuoteItem   `json:"items"`
	Approximate  bool               `json:"approximate,omitempty"`
	NotIncluded  []string           `json:"not_included,omitempty"`
	Instructions string             `json:"instructions,omitempty"`
}

var dramaStyles3D2D = map[string]bool{"feature-3d": true, "hyperreal-3d": true, "doll-3d": true, "crochet": true, "claymation": true, "paper-diorama": true, "pixel-art": true, "paper-collage": true, "ink-cartoon": true}

// dramaRoleRequest 是 purpose film 时每种角色用的模型和设置（与 references/models.md 一致）。
func dramaRoleRequest(style, role string, seconds float64, resolution string) (string, map[string]any, error) {
	drawn := dramaStyles3D2D[style]
	switch role {
	case "master":
		return "image", map[string]any{"model": "gpt_image_2_6_flare", "quality": "high", "resolution": "2k", "aspect_ratio": "16:9"}, nil
	case "sheet", "plate":
		if drawn {
			return "image", map[string]any{"model": "gpt_image_2_6_flare", "quality": "medium", "resolution": "2k", "aspect_ratio": "16:9"}, nil
		}
		return "image", map[string]any{"model": "seedream_5_5", "resolution": "2k", "aspect_ratio": "16:9"}, nil
	case "clip", "extension":
		duration := int(math.Ceil(seconds))
		if duration < 4 {
			duration = 4
		}
		return "video", map[string]any{"model": "seedance_2_5", "resolution": resolution, "aspect_ratio": "9:16", "duration": float64(duration), "generate_audio": true}, nil
	case "score":
		return "audio", map[string]any{"model": "elevenlabs_music_v2"}, nil
	}
	return "", nil, fmt.Errorf("不认识的 role：%s", role)
}

func (s *Service) quoteWorkflowParams(ctx context.Context, user *model.User, kind string, params map[string]any) (float64, string, error) {
	modelName := paramString(params, "model")
	if kind == "audio" {
		return 0, "这个音频模型本站还没有接入", nil
	}
	clean := map[string]any{}
	for key, value := range params {
		if key != "medias" {
			clean[key] = value
		}
	}
	if _, ok := clean["prompt"].(string); !ok {
		clean["prompt"] = "quote"
	}
	req, _, err := s.workflowRequest(ctx, user, kind, clean)
	if err != nil {
		return 0, "", err
	}
	req.Operation = ""
	quote, err := s.QuoteOpenAPIGeneration(ctx, user, req)
	if err != nil {
		return 0, "", fmt.Errorf("%s：%w", modelName, err)
	}
	each, _ := quote["creditsEach"].(float64)
	return each, "", nil
}

// EstimateWorkflowCost 是 estimate_image_cost / estimate_video_cost / estimate_audio_cost：一项请求的报价，不生成任何东西。
func (s *Service) EstimateWorkflowCost(ctx context.Context, user *model.User, kind string, params map[string]any) (map[string]any, error) {
	if ref, ok := params["ref"].(string); ok && len(params) == 1 {
		value, _, err := s.resolveSandboxRef(ctx, user, ref)
		if err != nil {
			return nil, err
		}
		resolved, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s 指向的不是一项 params", ref)
		}
		params = resolved
	}
	if paramString(params, "model") == "" {
		return nil, errors.New("params.model 必填")
	}
	count := paramNumber(params["count"])
	if count < 1 {
		count = 1
	}
	each, unavailable, err := s.quoteWorkflowParams(ctx, user, kind, withoutKeys(params, "get_cost", "run_id", "count"))
	if err != nil {
		return nil, err
	}
	out := map[string]any{"model": paramString(params, "model"), "count": count, "credits_each": roundCredits(each), "credits": roundCredits(each * count)}
	if unavailable != "" {
		out["unavailable"] = unavailable
	}
	return out, nil
}

// QuoteDrama 是 get_drama_ads_config：报价，不生成任何东西。第一次调用时开一部短剧，返回 drama_ads_id。
func (s *Service) QuoteDrama(ctx context.Context, user *model.User, input DramaQuoteInput) (*DramaQuote, error) {
	switch input.Purpose {
	case "film", "stage", "remake":
	default:
		return nil, errors.New("purpose 只能是 film、stage 或 remake")
	}
	if len(input.Requests) == 0 || len(input.Requests) > 60 {
		return nil, errors.New("requests 要 1-60 项")
	}
	run, err := s.dramaRun(user, input)
	if err != nil {
		return nil, err
	}
	style := firstNonEmpty(strings.TrimSpace(input.Style), run.Style, "live-action")
	out := &DramaQuote{DramaAdsID: run.ID, Purpose: input.Purpose, Items: []DramaQuoteItem{}}
	resolutions := input.Resolutions
	if input.Purpose == "film" {
		if len(resolutions) == 0 {
			resolutions = []string{"1080p"}
		}
		out.Totals = map[string]float64{}
		for _, resolution := range resolutions {
			total := 0.0
			for _, item := range input.Requests {
				if item.Count <= 0 {
					return nil, errors.New("每项都要 count")
				}
				kind, params, err := dramaRoleRequest(style, item.Role, item.Seconds, resolution)
				if err != nil {
					return nil, err
				}
				each, unavailable, err := s.quoteWorkflowParams(ctx, user, kind, params)
				if err != nil {
					return nil, err
				}
				row := DramaQuoteItem{Role: item.Role, Kind: kind, Model: paramString(params, "model"), Seconds: item.Seconds, Count: item.Count, CreditsEach: roundCredits(each), Credits: roundCredits(each * float64(item.Count)), Unavailable: unavailable}
				if kind == "video" {
					row.Resolution = resolution
				}
				if unavailable != "" {
					out.Approximate = true
				}
				out.Items = append(out.Items, row)
				total += row.Credits
			}
			out.Totals[resolution] = roundCredits(total)
		}
		if input.Narration {
			out.NotIncluded = append(out.NotIncluded, "narration not included: priced when the text is written")
		}
		if input.Song {
			out.NotIncluded = append(out.NotIncluded, "song not included: priced when the text is written")
		}
		out.Instructions = fmt.Sprintf("Generate each item with the model its row names. Live-action stills use %s.", "seedream_5_5")
	} else {
		videoResolutions := resolutions
		if len(videoResolutions) == 0 {
			videoResolutions = []string{""}
		}
		out.Totals = map[string]float64{}
		for _, resolution := range videoResolutions {
			total := 0.0
			for _, item := range input.Requests {
				if item.Count <= 0 {
					return nil, errors.New("每项都要 count")
				}
				params := map[string]any{}
				for key, value := range item.Params {
					params[key] = value
				}
				params["model"] = item.Model
				if item.Kind == "video" && resolution != "" {
					params["resolution"] = resolution
				}
				each, unavailable, err := s.quoteWorkflowParams(ctx, user, item.Kind, params)
				if err != nil {
					return nil, err
				}
				row := DramaQuoteItem{Kind: item.Kind, Model: item.Model, Resolution: paramString(params, "resolution"), Count: item.Count, CreditsEach: roundCredits(each), Credits: roundCredits(each * float64(item.Count)), Unavailable: unavailable}
				if unavailable != "" {
					out.Approximate = true
				}
				out.Items = append(out.Items, row)
				total += row.Credits
			}
			key := firstNonEmpty(resolution, "total")
			out.Totals[key] = roundCredits(total)
		}
		if len(out.Totals) == 1 {
			for _, value := range out.Totals {
				v := value
				out.Total = &v
			}
			out.Totals = nil
		}
	}
	data, _ := json.Marshal(out)
	run.QuotesJSON = appendQuoteLog(run.QuotesJSON, string(data))
	run.UpdatedAt = time.Now()
	_ = s.repo.SaveDramaRun(run)
	return out, nil
}

func (s *Service) dramaRun(user *model.User, input DramaQuoteInput) (*model.DramaRun, error) {
	if id := strings.TrimSpace(input.DramaAdsID); id != "" {
		run, err := s.repo.DramaRun(user.ID, id)
		if err != nil {
			return nil, err
		}
		if run == nil {
			return nil, fmt.Errorf("找不到短剧 %s", id)
		}
		if input.Style != "" {
			run.Style = input.Style
		}
		return run, nil
	}
	now := time.Now()
	run := &model.DramaRun{ID: newID(), UserID: user.ID, PresetID: input.PresetID, Style: firstNonEmpty(input.Style, "live-action"), CreatedAt: now, UpdatedAt: now}
	if err := s.repo.SaveDramaRun(run); err != nil {
		return nil, err
	}
	return run, nil
}

func appendQuoteLog(existing, entry string) string {
	var list []json.RawMessage
	_ = json.Unmarshal([]byte(existing), &list)
	list = append(list, json.RawMessage(entry))
	if len(list) > 50 {
		list = list[len(list)-50:]
	}
	data, _ := json.Marshal(list)
	return string(data)
}

func roundCredits(value float64) float64 {
	return math.Round(value*100) / 100
}
