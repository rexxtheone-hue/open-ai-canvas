package repository

import (
	"errors"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// ChannelIDForProtocol 返回第一个启用了该协议模型的启用中系统渠道。
func (r *Repository) ChannelIDForProtocol(protocol string) (string, error) {
	var ids []string
	err := r.db.Model(&model.ChannelModel{}).
		Joins("JOIN model_channels ch ON ch.id = channel_models.channel_id AND ch.enabled = ? AND ch.scope = ? AND ch.deleted_at IS NULL", true, model.ChannelScopeSystem).
		Where("channel_models.protocol = ? AND channel_models.enabled = ?", protocol, true).
		Order("channel_models.created_at").Limit(1).Pluck("channel_models.channel_id", &ids).Error
	if err != nil || len(ids) == 0 {
		return "", err
	}
	return ids[0], nil
}

func (r *Repository) StudioPortraits(userID string) ([]model.StudioPortrait, error) {
	items := []model.StudioPortrait{}
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Find(&items).Error
	return items, err
}

func (r *Repository) StudioPortrait(userID, id string) (*model.StudioPortrait, error) {
	var item model.StudioPortrait
	err := r.db.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return &item, err
}

func (r *Repository) SaveStudioPortrait(item *model.StudioPortrait) error {
	return r.db.Save(item).Error
}

func (r *Repository) DeleteStudioPortrait(userID, id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("portrait_id = ? AND user_id = ?", id, userID).Delete(&model.StudioPortraitPhoto{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioPortrait{}).Error
	})
}

func (r *Repository) StudioPortraitPhotos(userID string, portraitIDs []string) ([]model.StudioPortraitPhoto, error) {
	items := []model.StudioPortraitPhoto{}
	if len(portraitIDs) == 0 {
		return items, nil
	}
	err := r.db.Where("user_id = ? AND portrait_id IN ?", userID, portraitIDs).Order("created_at").Find(&items).Error
	return items, err
}

func (r *Repository) StudioPortraitPhoto(userID, id string) (*model.StudioPortraitPhoto, error) {
	var item model.StudioPortraitPhoto
	err := r.db.First(&item, "id = ? AND user_id = ?", id, userID).Error
	return &item, err
}

func (r *Repository) StudioPortraitPhotoByResource(portraitID, resourceID string) (*model.StudioPortraitPhoto, error) {
	var item model.StudioPortraitPhoto
	err := r.db.First(&item, "portrait_id = ? AND resource_id = ?", portraitID, resourceID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *Repository) SaveStudioPortraitPhoto(item *model.StudioPortraitPhoto) error {
	return r.db.Save(item).Error
}

func (r *Repository) DeleteStudioPortraitPhoto(userID, id string) error {
	return r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioPortraitPhoto{}).Error
}

// ActiveStudioPortraitAsset 返回该用户在指定渠道下、该资源已审核通过的真人素材 ID。
func (r *Repository) ActiveStudioPortraitAsset(userID, channelID, resourceID string) (string, error) {
	var ids []string
	err := r.db.Model(&model.StudioPortraitPhoto{}).
		Joins("JOIN studio_portraits p ON p.id = studio_portrait_photos.portrait_id AND p.status = ?", model.StudioPortraitVerified).
		Where("studio_portrait_photos.user_id = ? AND studio_portrait_photos.resource_id = ? AND studio_portrait_photos.status = ? AND p.channel_id = ?", userID, resourceID, model.StudioPortraitPhotoActive, channelID).
		Order("studio_portrait_photos.updated_at desc").Limit(1).Pluck("studio_portrait_photos.asset_id", &ids).Error
	if err != nil || len(ids) == 0 {
		return "", err
	}
	return ids[0], nil
}
