package repository

import "yingce/backend/internal/model"

func (r *Repository) CreateStudioFeedback(item *model.StudioFeedback) error {
	return r.db.Create(item).Error
}

func (r *Repository) StudioFeedbacks(tenantID string, status string, limit int) ([]model.StudioFeedback, error) {
	var items []model.StudioFeedback
	query := scopeTenant(r.db.Model(&model.StudioFeedback{}), tenantID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	err := query.Order("seq desc, id").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) UpdateStudioFeedbackStatus(tenantID, id, status string) (bool, error) {
	result := scopeTenant(r.db.Model(&model.StudioFeedback{}), tenantID).Where("id = ?", id).Updates(map[string]any{"status": status})
	return result.RowsAffected > 0, result.Error
}

func (r *Repository) StudioSiteContents(tenantID string) ([]model.StudioSiteContent, error) {
	var items []model.StudioSiteContent
	err := scopeTenant(r.db, tenantID).Find(&items).Error
	return items, err
}

func (r *Repository) SaveStudioSiteContent(item model.StudioSiteContent) error {
	item.TenantID = TenantIDOrPlatform(item.TenantID)
	return r.db.Save(&item).Error
}
