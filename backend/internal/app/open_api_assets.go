package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// 开放接口的素材库：Studio 上传、Canvas 资产和角色形象。AI 助手用素材 ID 直接当参考素材，
// 不需要用户再复制链接。

const (
	openAPIAssetDefaultLimit = 30
	openAPIAssetMaxLimit     = 100
)

type OpenAPIAsset struct {
	ID         string    `json:"id"`
	Kind       string    `json:"kind"`
	Name       string    `json:"name"`
	Source     string    `json:"source"`
	Character  string    `json:"character,omitempty"`
	Width      int       `json:"width,omitempty"`
	Height     int       `json:"height,omitempty"`
	DurationMs int64     `json:"durationMs,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

// OpenAPIUsedReference 是某次生成用过的参考素材，可以原样传回 generate_* 重复使用。
type OpenAPIUsedReference struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Role string `json:"role,omitempty"`
	Name string `json:"name,omitempty"`
}

func openAPIAssetMatches(query string, values ...string) bool {
	if query == "" {
		return true
	}
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), query) {
			return true
		}
	}
	return false
}

// OpenAPIAssets 列出用户素材库里的图片、视频、音频和角色形象，按名称关键词筛选，最新的在前。
func (s *Service) OpenAPIAssets(ctx context.Context, userID, kind, query string, limit int) ([]OpenAPIAsset, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind != "" && kind != "image" && kind != "video" && kind != "audio" && kind != "character" {
		return nil, BadAuthRequest("kind 只能是 image、video、audio 或 character")
	}
	if limit <= 0 {
		limit = openAPIAssetDefaultLimit
	}
	limit = min(limit, openAPIAssetMaxLimit)
	query = strings.ToLower(strings.TrimSpace(query))
	assets := []OpenAPIAsset{}
	if kind != "character" {
		uploads, err := s.StudioUploads(userID, kind)
		if err != nil {
			return nil, err
		}
		for _, item := range uploads {
			if !openAPIAssetMatches(query, item.Name) {
				continue
			}
			assets = append(assets, OpenAPIAsset{ID: item.ResourceID, Kind: item.Kind, Name: item.Name, Source: "upload", Width: item.Width, Height: item.Height, DurationMs: item.DurationMs, CreatedAt: item.CreatedAt})
		}
	}
	if kind == "" || kind == "image" || kind == "character" {
		characters, err := s.StudioCharacters(userID)
		if err != nil {
			return nil, err
		}
		for _, character := range characters {
			if !openAPIAssetMatches(query, character.Name, character.Description) {
				continue
			}
			for index, resourceID := range character.ImageResourceIDs {
				name := character.Name
				if len(character.ImageResourceIDs) > 1 {
					name = fmt.Sprintf("%s (%d)", character.Name, index+1)
				}
				asset := OpenAPIAsset{ID: resourceID, Kind: "image", Name: name, Source: "character", Character: character.Name, CreatedAt: character.UpdatedAt}
				if resource, err := s.repo.ResourceForUser(userID, resourceID); err == nil {
					asset.Width, asset.Height = resource.Width, resource.Height
				}
				assets = append(assets, asset)
			}
		}
	}
	sort.SliceStable(assets, func(i, j int) bool { return assets[i].CreatedAt.After(assets[j].CreatedAt) })
	if len(assets) > limit {
		assets = assets[:limit]
	}
	return assets, nil
}

// openAPIUsedReferences 从任务输入里取出当时用的参考素材（只取存在素材库里的那些）。
func (s *Service) openAPIUsedReferences(rawInput string) []OpenAPIUsedReference {
	plain, err := s.decryptTaskInputJSON(rawInput)
	if err != nil || strings.TrimSpace(plain) == "" {
		return nil
	}
	var input struct {
		ReferenceImages []providerMedia `json:"referenceImages"`
		ReferenceVideos []providerMedia `json:"referenceVideos"`
		ReferenceAudios []providerMedia `json:"referenceAudios"`
	}
	if json.Unmarshal([]byte(plain), &input) != nil {
		return nil
	}
	refs := []OpenAPIUsedReference{}
	for kind, list := range map[string][]providerMedia{"image": input.ReferenceImages, "video": input.ReferenceVideos, "audio": input.ReferenceAudios} {
		for _, media := range list {
			if id := arkPrivateAssetResourceID(media); id != "" {
				refs = append(refs, OpenAPIUsedReference{ID: id, Kind: kind, Role: media.Role, Name: media.Name})
			}
		}
	}
	order := map[string]int{"image": 0, "video": 1, "audio": 2}
	sort.SliceStable(refs, func(i, j int) bool { return order[refs[i].Kind] < order[refs[j].Kind] })
	return refs
}
