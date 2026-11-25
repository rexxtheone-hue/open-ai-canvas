package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

const mediaUploadTTL = 2 * time.Hour

type MediaUploadTicket struct {
	MediaID     string `json:"media_id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Type        string `json:"type"`
	UploadURL   string `json:"upload_url"`
	Curl        string `json:"curl"`
	ExpiresAt   string `json:"expires_at"`
}

type MediaConfirmResult struct {
	MediaID string `json:"media_id"`
	Status  string `json:"status"`
	Type    string `json:"type,omitempty"`
	URL     string `json:"url,omitempty"`
	Error   string `json:"error,omitempty"`
}

func mediaContentType(filename, contentType string) string {
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = mime.TypeByExtension(strings.ToLower(filepath.Ext(filename)))
	}
	if i := strings.Index(contentType, ";"); i > 0 {
		contentType = strings.TrimSpace(contentType[:i])
	}
	return contentType
}

func mediaKindFor(contentType string) string {
	switch {
	case strings.HasPrefix(contentType, "image/"):
		return "image"
	case strings.HasPrefix(contentType, "video/"):
		return "video"
	case strings.HasPrefix(contentType, "audio/"):
		return "audio"
	}
	return ""
}

// CreateMediaUpload 是 media_upload：给一个 PUT 网址，沙盒把文件传上来后再 media_confirm。
func (s *Service) CreateMediaUpload(user *model.User, baseURL, filename, contentType string) (*MediaUploadTicket, error) {
	filename = filepath.Base(strings.TrimSpace(filename))
	if filename == "" || filename == "." {
		return nil, errors.New("filename 不能为空")
	}
	contentType = mediaContentType(filename, contentType)
	kind := mediaKindFor(contentType)
	if kind == "" {
		return nil, fmt.Errorf("只支持图片、视频和音频：%s", filename)
	}
	now := time.Now()
	item := &model.MediaUpload{ID: newID(), UserID: user.ID, FileName: filename, ContentType: contentType, Kind: kind, ExpiresAt: now.Add(mediaUploadTTL), CreatedAt: now}
	if err := s.repo.CreateMediaUpload(item); err != nil {
		return nil, err
	}
	uploadURL := strings.TrimRight(baseURL, "/") + "/api/media-upload/" + item.ID
	return &MediaUploadTicket{
		MediaID: item.ID, Filename: filename, ContentType: contentType, Type: kind, UploadURL: uploadURL,
		Curl:      fmt.Sprintf("curl -f -X PUT -H 'Content-Type: %s' --upload-file %s '%s'", contentType, shellQuote(filename), uploadURL),
		ExpiresAt: item.ExpiresAt.UTC().Format(time.RFC3339),
	}, nil
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}

// ReceiveMediaUpload 收 PUT 上来的文件，存成用户的素材。
func (s *Service) ReceiveMediaUpload(id, contentType string, body io.Reader) error {
	item, err := s.repo.MediaUpload(id)
	if err != nil {
		return err
	}
	if item == nil || time.Now().After(item.ExpiresAt) {
		return errors.New("上传网址无效或已过期")
	}
	if item.UploadedAt != nil {
		return errors.New("这个上传网址已经用过了")
	}
	if got := mediaContentType("", contentType); got != "" && got != item.ContentType {
		return fmt.Errorf("Content-Type 应为 %s", item.ContentType)
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	limit := megabytes(policy.Resource.ResourceUploadMB)
	file, err := os.CreateTemp("", "media-upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	size, err := io.Copy(file, io.LimitReader(body, limit+1))
	if err != nil {
		return err
	}
	if size == 0 {
		return errors.New("上传的文件是空的")
	}
	if size > limit {
		return fmt.Errorf("文件超过 %d MB", policy.Resource.ResourceUploadMB)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	resource, err := s.UploadResourceFile(item.UserID, item.FileName, size, item.Kind, 0, 0, 0, file, "media-upload:"+item.ID)
	if err != nil {
		return err
	}
	return s.repo.MarkMediaUploaded(item.ID, resource.ID, time.Now())
}

// ConfirmMediaUploads 是 media_confirm：PUT 成功后确认，之后 media_id 可以当参考素材用。
func (s *Service) ConfirmMediaUploads(user *model.User, ids []string) []MediaConfirmResult {
	results := make([]MediaConfirmResult, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		item, err := s.repo.MediaUpload(id)
		switch {
		case err != nil:
			results = append(results, MediaConfirmResult{MediaID: id, Status: "error", Error: err.Error()})
		case item == nil || item.UserID != user.ID:
			results = append(results, MediaConfirmResult{MediaID: id, Status: "error", Error: "找不到这个 media_id"})
		case item.UploadedAt == nil:
			results = append(results, MediaConfirmResult{MediaID: id, Status: "error", Error: "文件还没有上传：先 PUT 到 upload_url，返回 200 后再确认"})
		default:
			_ = s.repo.MarkMediaConfirmed(id, time.Now())
			results = append(results, MediaConfirmResult{MediaID: id, Status: "confirmed", Type: item.Kind, URL: s.resourcePublicPath(user.ID, item.ResourceID)})
		}
	}
	return results
}

// ImportMediaURL 是 media_import_url：把网上的图片、视频、音频存进素材库，返回 media_id。
func (s *Service) ImportMediaURL(user *model.User, rawURL string) (*MediaConfirmResult, error) {
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(rawURL)), "https://") {
		return nil, errors.New("只支持 https 网址")
	}
	resource, err := s.ImportResourceURL(user.ID, rawURL, "", 0, 0, 0)
	if err != nil {
		return nil, err
	}
	return &MediaConfirmResult{MediaID: resource.ID, Status: "confirmed", Type: resource.Kind, URL: s.resourcePublicPath(user.ID, resource.ID)}, nil
}

// MediaResourceID 把 media_id（上传 ID 或素材 ID）换成素材 ID。
func (s *Service) MediaResourceID(user *model.User, mediaID string) (string, bool) {
	item, err := s.repo.MediaUpload(mediaID)
	if err == nil && item != nil && item.UserID == user.ID && item.ResourceID != "" && item.UploadedAt != nil {
		return item.ResourceID, true
	}
	return "", false
}

func (s *Service) resourcePublicPath(userID, resourceID string) string {
	if resourceID == "" {
		return ""
	}
	resource, err := s.repo.ResourceForUser(userID, resourceID)
	if err != nil {
		return ""
	}
	url, err := s.PublicResourceURL(context.Background(), resource, time.Now().Add(openAPIOutputURLTTL))
	if err != nil {
		return ""
	}
	return url
}
