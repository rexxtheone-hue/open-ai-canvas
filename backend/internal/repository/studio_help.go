package repository

import "yingce/backend/internal/model"

func (r *Repository) CreateStudioFeedback(item *model.StudioFeedback) error {
	return r.db.Create(item).Error
}

func (r *Repository) StudioFeedbacks(status string, limit int) ([]model.StudioFeedback, error) {
	var items []model.StudioFeedback
	query := r.db.Model(&model.StudioFeedback{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	err := query.Order("seq desc, id").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) UpdateStudioFeedbackStatus(id, status string) (bool, error) {
	result := r.db.Model(&model.StudioFeedback{}).Where("id = ?", id).Updates(map[string]any{"status": status})
	return result.RowsAffected > 0, result.Error
}

func (r *Repository) StudioSiteContents() ([]model.StudioSiteContent, error) {
	var items []model.StudioSiteContent
	err := r.db.Find(&items).Error
	return items, err
}

func (r *Repository) SaveStudioSiteContent(item model.StudioSiteContent) error {
	return r.db.Save(&item).Error
}
