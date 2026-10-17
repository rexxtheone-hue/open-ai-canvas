package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// AI Studio 和 AI Canvas 共用一个素材库：Studio 上传的素材同时登记成 Canvas「资产」，
// Canvas 资产里的图片、视频、音频也出现在 Studio 的上传素材里。

const studioUploadAssetSource = "studio-upload"

func studioUploadAssetID(uploadID string) string {
	return "studio-upload-" + uploadID
}

// syncStudioUploadAsset 把一条 Studio 上传登记成 Canvas 资产（已存在时跳过，保留用户在 Canvas 里的修改）。
// 存储空间不够时只跳过登记，不影响 Studio 上传本身。
func (s *Service) syncStudioUploadAsset(item model.StudioUpload, resource *model.Resource) error {
	assetID := studioUploadAssetID(item.ID)
	if _, err := s.repo.AssetForUser(item.UserID, assetID); err == nil {
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	now := time.Now().UTC()
	url := resourceFileURL(resource.ID)
	data := map[string]any{"storageKey": "resource:" + resource.ID, "mimeType": resource.MimeType, "bytes": resource.Size, "width": resource.Width, "height": resource.Height, "durationMs": resource.DurationMs}
	if item.Kind == "image" {
		data["dataUrl"] = url
	} else {
		data["url"] = url
	}
	title := strings.TrimSpace(item.Name)
	if title == "" {
		title = map[string]string{"image": "Studio 图片", "video": "Studio 视频", "audio": "Studio 音频"}[item.Kind]
	}
	payload, err := json.Marshal(map[string]any{
		"id": assetID, "kind": item.Kind, "category": model.AssetCategoryMaterial, "status": model.AssetVersionStatusConfirmed,
		"source": "AI Studio 上传", "title": title, "coverUrl": url, "tags": []string{"Studio"},
		"createdAt": item.CreatedAt.UTC().Format(time.RFC3339Nano), "updatedAt": now.Format(time.RFC3339Nano), "data": data,
		"metadata": map[string]any{"source": studioUploadAssetSource, "studioUploadId": item.ID},
	})
	if err != nil {
		return err
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	usage, err := s.repo.UserStorageUsage(item.UserID)
	if err != nil {
		return err
	}
	if validateStructuredStorageQuotaWithPolicy(usage, "asset", true, int64(len(payload)), policy.Resource) != nil {
		return nil
	}
	asset := &model.Asset{ID: assetID, UserID: item.UserID, Kind: item.Kind, Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: title, PayloadJSON: string(payload), CreatedAt: item.CreatedAt, UpdatedAt: now}
	return s.repo.UpsertAsset(asset)
}

// syncStudioUploadAssets 给还没登记进 Canvas 资产的 Studio 上传补登记（共用素材库上线前上传的素材）。
func (s *Service) syncStudioUploadAssets(userID string) error {
	items, err := s.repo.StudioUploads(userID, "", 200)
	if err != nil {
		return err
	}
	for _, item := range items {
		if _, err := s.repo.AssetForUser(userID, studioUploadAssetID(item.ID)); err == nil {
			continue
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		resource, err := s.repo.ResourceForUser(userID, item.ResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return err
		}
		if err := s.syncStudioUploadAsset(item, resource); err != nil {
			return err
		}
	}
	return nil
}

// canvasMediaAssetUploads 是 Canvas 资产里可以在 Studio 当素材用的图片、视频、音频。
// 不含 Studio 自己登记的上传（避免重复）、生成任务自动存的作品（已经在作品里）和已归档的资产。
func (s *Service) canvasMediaAssetUploads(userID, kind string) ([]StudioUploadView, error) {
	kinds := []string{"image", "video", "audio"}
	if kind != "" {
		kinds = []string{kind}
	}
	assets, err := s.repo.UserMediaAssets(userID, kinds, 200)
	if err != nil {
		return nil, err
	}
	views := []StudioUploadView{}
	for _, asset := range assets {
		if asset.Status == model.AssetVersionStatusArchived {
			continue
		}
		var payload struct {
			Data struct {
				StorageKey string `json:"storageKey"`
			} `json:"data"`
			Metadata struct {
				Source string `json:"source"`
			} `json:"metadata"`
		}
		if json.Unmarshal([]byte(asset.PayloadJSON), &payload) != nil {
			continue
		}
		if payload.Metadata.Source == studioUploadAssetSource || payload.Metadata.Source == "generation-task" {
			continue
		}
		resourceID, found := strings.CutPrefix(strings.TrimSpace(payload.Data.StorageKey), "resource:")
		if !found || resourceID == "" {
			continue
		}
		resource, err := s.repo.ResourceForUser(userID, resourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		view := studioUploadView(model.StudioUpload{ID: "asset:" + asset.ID, ResourceID: resource.ID, Kind: asset.Kind, Name: asset.Title, CreatedAt: asset.CreatedAt}, resource)
		view.Source = "canvas"
		views = append(views, view)
	}
	return views, nil
}
