package app

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const studioBrandKitLimit = 20

var studioBrandColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type StudioBrandKitInput struct {
	Name           string   `json:"name"`
	Intro          string   `json:"intro"`
	Audience       string   `json:"audience"`
	Tone           string   `json:"tone"`
	Slogan         string   `json:"slogan"`
	Colors         []string `json:"colors"`
	LogoResourceID string   `json:"logoResourceId"`
	Avoid          string   `json:"avoid"`
	IsDefault      bool     `json:"isDefault"`
}

type StudioBrandKitView struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Intro          string    `json:"intro"`
	Audience       string    `json:"audience"`
	Tone           string    `json:"tone"`
	Slogan         string    `json:"slogan"`
	Colors         []string  `json:"colors"`
	LogoResourceID string    `json:"logoResourceId,omitempty"`
	LogoURL        string    `json:"logoUrl,omitempty"`
	Avoid          string    `json:"avoid"`
	IsDefault      bool      `json:"isDefault"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

func studioBrandKitView(kit model.StudioBrandKit) StudioBrandKitView {
	colors := []string{}
	if kit.ColorsJSON != "" {
		_ = json.Unmarshal([]byte(kit.ColorsJSON), &colors)
	}
	view := StudioBrandKitView{
		ID: kit.ID, Name: kit.Name, Intro: kit.Intro, Audience: kit.Audience, Tone: kit.Tone, Slogan: kit.Slogan,
		Colors: colors, LogoResourceID: kit.LogoResourceID, Avoid: kit.Avoid, IsDefault: kit.IsDefault, UpdatedAt: kit.UpdatedAt,
	}
	if kit.LogoResourceID != "" {
		view.LogoURL = resourceFileURL(kit.LogoResourceID)
	}
	return view
}

func studioBrandText(value string, limit int, tooLong string) (string, error) {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > limit {
		return "", BadAuthRequest(tooLong)
	}
	return value, nil
}

func (s *Service) normalizeStudioBrandKit(userID string, input StudioBrandKitInput) (model.StudioBrandKit, error) {
	var kit model.StudioBrandKit
	var err error
	if kit.Name, err = studioBrandText(input.Name, 40, "品牌名称太长"); err != nil {
		return kit, err
	}
	if kit.Name == "" {
		return kit, BadAuthRequest("请填写品牌名称")
	}
	if kit.Intro, err = studioBrandText(input.Intro, 600, "品牌介绍太长"); err != nil {
		return kit, err
	}
	if kit.Audience, err = studioBrandText(input.Audience, 120, "目标人群太长"); err != nil {
		return kit, err
	}
	if kit.Tone, err = studioBrandText(input.Tone, 120, "品牌调性太长"); err != nil {
		return kit, err
	}
	if kit.Slogan, err = studioBrandText(input.Slogan, 60, "品牌口号太长"); err != nil {
		return kit, err
	}
	if kit.Avoid, err = studioBrandText(input.Avoid, 200, "避免内容太长"); err != nil {
		return kit, err
	}
	colors := make([]string, 0, len(input.Colors))
	seen := map[string]bool{}
	for _, color := range input.Colors {
		color = strings.ToUpper(strings.TrimSpace(color))
		if !studioBrandColorPattern.MatchString(color) {
			return kit, BadAuthRequest("品牌色需要是 #RRGGBB 格式")
		}
		if !seen[color] {
			seen[color] = true
			colors = append(colors, color)
		}
	}
	if len(colors) > 6 {
		return kit, BadAuthRequest("品牌色最多 6 个")
	}
	encoded, _ := json.Marshal(colors)
	kit.ColorsJSON = string(encoded)
	kit.LogoResourceID = strings.TrimSpace(input.LogoResourceID)
	if kit.LogoResourceID != "" {
		resource, err := s.repo.ResourceForUser(userID, kit.LogoResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return kit, BadAuthRequest("Logo 图片不存在")
		}
		if err != nil {
			return kit, err
		}
		if resource.Kind != "image" && !strings.HasPrefix(resource.MimeType, "image/") {
			return kit, BadAuthRequest("Logo 需要是图片")
		}
	}
	kit.IsDefault = input.IsDefault
	kit.UserID = userID
	return kit, nil
}

func (s *Service) StudioBrandKits(userID string) ([]StudioBrandKitView, error) {
	kits, err := s.repo.StudioBrandKits(userID)
	if err != nil {
		return nil, err
	}
	views := make([]StudioBrandKitView, 0, len(kits))
	for _, kit := range kits {
		views = append(views, studioBrandKitView(kit))
	}
	return views, nil
}

func (s *Service) CreateStudioBrandKit(userID string, input StudioBrandKitInput) (StudioBrandKitView, error) {
	count, err := s.repo.CountStudioBrandKits(userID)
	if err != nil {
		return StudioBrandKitView{}, err
	}
	if count >= studioBrandKitLimit {
		return StudioBrandKitView{}, BadAuthRequest("品牌套件最多 20 个")
	}
	kit, err := s.normalizeStudioBrandKit(userID, input)
	if err != nil {
		return StudioBrandKitView{}, err
	}
	// 第一个品牌套件自动成为默认，避免用户建好后生成时却没有生效。
	if count == 0 {
		kit.IsDefault = true
	}
	now := time.Now().UTC()
	kit.ID, kit.CreatedAt, kit.UpdatedAt = newID(), now, now
	if err := s.repo.SaveStudioBrandKit(&kit); err != nil {
		return StudioBrandKitView{}, err
	}
	return studioBrandKitView(kit), nil
}

func (s *Service) UpdateStudioBrandKit(userID string, id string, input StudioBrandKitInput) (StudioBrandKitView, error) {
	existing, err := s.repo.StudioBrandKit(userID, strings.TrimSpace(id))
	if err != nil {
		return StudioBrandKitView{}, err
	}
	if existing == nil {
		return StudioBrandKitView{}, NotFound("品牌套件不存在")
	}
	kit, err := s.normalizeStudioBrandKit(userID, input)
	if err != nil {
		return StudioBrandKitView{}, err
	}
	kit.ID, kit.CreatedAt, kit.UpdatedAt = existing.ID, existing.CreatedAt, time.Now().UTC()
	if err := s.repo.SaveStudioBrandKit(&kit); err != nil {
		return StudioBrandKitView{}, err
	}
	return studioBrandKitView(kit), nil
}

func (s *Service) DeleteStudioBrandKit(userID string, id string) error {
	deleted, err := s.repo.DeleteStudioBrandKit(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("品牌套件不存在")
	}
	return nil
}
