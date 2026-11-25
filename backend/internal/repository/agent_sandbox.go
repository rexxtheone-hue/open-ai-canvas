package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (r *Repository) AgentSandbox(userID string) (*model.AgentSandbox, error) {
	var item model.AgentSandbox
	err := r.db.Where("user_id = ?", userID).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *Repository) SaveAgentSandbox(item *model.AgentSandbox) error {
	return r.db.Clauses(clause.OnConflict{UpdateAll: true}).Create(item).Error
}

func (r *Repository) DeleteAgentSandbox(userID string) error {
	return r.db.Where("user_id = ?", userID).Delete(&model.AgentSandbox{}).Error
}

func (r *Repository) DramaRun(userID, id string) (*model.DramaRun, error) {
	var item model.DramaRun
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *Repository) SaveDramaRun(item *model.DramaRun) error {
	return r.db.Save(item).Error
}

func (r *Repository) CreateMediaUpload(item *model.MediaUpload) error {
	return r.db.Create(item).Error
}

func (r *Repository) MediaUpload(id string) (*model.MediaUpload, error) {
	var item model.MediaUpload
	err := r.db.Where("id = ?", id).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *Repository) MarkMediaUploaded(id, resourceID string, at time.Time) error {
	return r.db.Model(&model.MediaUpload{}).Where("id = ? AND uploaded_at IS NULL", id).Updates(map[string]any{"resource_id": resourceID, "uploaded_at": at}).Error
}

func (r *Repository) MarkMediaConfirmed(id string, at time.Time) error {
	return r.db.Model(&model.MediaUpload{}).Where("id = ?", id).Update("confirmed_at", at).Error
}
