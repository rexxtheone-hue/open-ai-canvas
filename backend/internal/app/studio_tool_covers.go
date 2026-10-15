package app

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

var studioToolIDPattern = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

const studioToolCoverTTL = 24 * time.Hour

// StudioToolCovers 返回工具 ID → 封面公开地址。封面资源属于上传它的管理员，统一签发公开访问地址。
func (s *Service) StudioToolCovers() (map[string]string, error) {
	covers, err := s.repo.StudioToolCovers()
	if err != nil {
		return nil, err
	}
	expires := time.Now().Add(studioToolCoverTTL)
	result := make(map[string]string, len(covers))
	for _, cover := range covers {
		resource, err := s.repo.Resource(cover.ResourceID)
		if err != nil || resource == nil {
			continue
		}
		link, err := s.signedResourceAccessURL(resource, assets.VariantOriginal, expires, false)
		if err != nil {
			return nil, err
		}
		result[cover.ToolID] = link
	}
	return result, nil
}

// SetStudioToolCover 设置或清除（resourceID 为空）某个工具的封面。只能用管理员自己上传的图片。
func (s *Service) SetStudioToolCover(actor *model.User, toolID, resourceID string) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	toolID = strings.TrimSpace(toolID)
	if !studioToolIDPattern.MatchString(toolID) {
		return BadAuthRequest("工具 ID 无效")
	}
	resourceID = strings.TrimSpace(resourceID)
	if resourceID == "" {
		return s.repo.DeleteStudioToolCover(toolID)
	}
	resource, err := s.repo.ResourceForUser(actor.ID, resourceID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return BadAuthRequest("封面图片不存在")
	}
	if err != nil {
		return err
	}
	if resource.Kind != "image" && !strings.HasPrefix(resource.MimeType, "image/") {
		return BadAuthRequest("封面需要是图片")
	}
	return s.repo.SaveStudioToolCover(model.StudioToolCover{ToolID: toolID, ResourceID: resourceID, UpdatedAt: time.Now().UTC()})
}
