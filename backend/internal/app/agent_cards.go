package app

// 短剧故事卡片（ads_studio_story_presets / ads_studio_story_recipe）和可选演员（ads_studio_list_avatars）。
// 卡片数据放在工作流目录 drama-ads/_cards/ 下：_catalog.json 是目录，<id>.json 是每张卡片的配方。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

func (s *Service) dramaCardsDir() string {
	return filepath.Join(s.workflowsRoot(), "drama-ads", "_cards")
}

type storedCardFile struct {
	Text string `json:"text"`
}

// DramaCardCatalog 返回卡片目录（styles、cards）的原文 JSON。
func (s *Service) DramaCardCatalog() (json.RawMessage, error) {
	data, err := os.ReadFile(filepath.Join(s.dramaCardsDir(), "_catalog.json"))
	if err != nil {
		return nil, errors.New("还没有故事卡片")
	}
	var file storedCardFile
	if json.Unmarshal(data, &file) == nil && file.Text != "" {
		return json.RawMessage(file.Text), nil
	}
	return json.RawMessage(data), nil
}

// DramaCardRecipe 读一张卡片的配方，并为它开一部短剧（drama_ads_id）。
func (s *Service) DramaCardRecipe(user *model.User, presetID string) (map[string]any, error) {
	presetID = strings.TrimSpace(presetID)
	if presetID == "" || strings.ContainsAny(presetID, `/\.`) {
		return nil, fmt.Errorf("没有这张卡片：%s", presetID)
	}
	data, err := os.ReadFile(filepath.Join(s.dramaCardsDir(), presetID+".json"))
	if err != nil {
		return nil, fmt.Errorf("没有这张卡片：%s", presetID)
	}
	var file storedCardFile
	raw := data
	if json.Unmarshal(data, &file) == nil && file.Text != "" {
		raw = []byte(file.Text)
	}
	recipe := map[string]any{}
	if err := json.Unmarshal(raw, &recipe); err != nil {
		return nil, err
	}
	if instructions, _ := recipe["instructions"].(string); recipe["drama_ads_id"] == nil && instructions != "" {
		return recipe, nil
	}
	style := ""
	if styleInfo, ok := recipe["style"].(map[string]any); ok {
		style, _ = styleInfo["title"].(string)
	}
	now := time.Now()
	run := &model.DramaRun{ID: newID(), UserID: user.ID, PresetID: presetID, Style: "", CreatedAt: now, UpdatedAt: now}
	_ = style
	if err := s.repo.SaveDramaRun(run); err != nil {
		return nil, err
	}
	recipe["drama_ads_id"] = run.ID
	recipe["story_id"] = run.ID
	recipe["instructions"] = "Pass drama_ads_id in params of EVERY generation and batch item, in every get_drama_ads_config call, in every ads_studio_story_stage call and in show_result meta for the final film."
	return recipe, nil
}

type DramaAvatar struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	PreviewURL  string `json:"preview_url,omitempty"`
	Kind        string `json:"kind"`
}

// DramaAvatars 是 ads_studio_list_avatars：用户角色库里的人物，preview_url 可以用 media_import_url 导入当脸。
func (s *Service) DramaAvatars(ctx context.Context, user *model.User) ([]DramaAvatar, error) {
	characters, err := s.StudioCharacters(user.ID)
	if err != nil {
		return nil, err
	}
	out := []DramaAvatar{}
	for _, character := range characters {
		if character.Kind != "" && character.Kind != "character" {
			continue
		}
		avatar := DramaAvatar{ID: character.ID, Name: character.Name, Description: character.Description, Kind: "avatar"}
		if len(character.ImageResourceIDs) > 0 {
			avatar.PreviewURL = s.resourcePublicPath(user.ID, character.ImageResourceIDs[0])
		}
		out = append(out, avatar)
	}
	_ = ctx
	return out, nil
}
