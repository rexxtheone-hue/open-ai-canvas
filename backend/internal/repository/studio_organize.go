package repository

import (
	"time"

	"gorm.io/gorm"

	"yingce/backend/internal/model"
)

func (r *Repository) StudioFolders(userID string) ([]model.StudioFolder, error) {
	var items []model.StudioFolder
	err := r.db.Where("user_id = ?", userID).Order("seq, id").Find(&items).Error
	return items, err
}

func (r *Repository) StudioLabels(userID string) ([]model.StudioLabel, error) {
	var items []model.StudioLabel
	err := r.db.Where("user_id = ?", userID).Order("seq, id").Find(&items).Error
	return items, err
}

func (r *Repository) StudioFolder(userID, id string) (*model.StudioFolder, error) {
	return firstOrNil[model.StudioFolder](r.db, "id = ? AND user_id = ?", id, userID)
}

func (r *Repository) StudioLabel(userID, id string) (*model.StudioLabel, error) {
	return firstOrNil[model.StudioLabel](r.db, "id = ? AND user_id = ?", id, userID)
}

func (r *Repository) CreateStudioFolder(item *model.StudioFolder) error {
	return r.db.Create(item).Error
}

func (r *Repository) CreateStudioLabel(item *model.StudioLabel) error { return r.db.Create(item).Error }

func (r *Repository) RenameStudioFolder(userID, id, name string) (bool, error) {
	result := r.db.Model(&model.StudioFolder{}).Where("id = ? AND user_id = ?", id, userID).Update("name", name)
	return result.RowsAffected > 0, result.Error
}

func (r *Repository) UpdateStudioLabel(userID, id string, fields map[string]any) (bool, error) {
	result := r.db.Model(&model.StudioLabel{}).Where("id = ? AND user_id = ?", id, userID).Updates(fields)
	return result.RowsAffected > 0, result.Error
}

// DeleteStudioFolder 删除文件夹，里面的作品回到「未归类」。
func (r *Repository) DeleteStudioFolder(userID, id string) (bool, error) {
	deleted := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioFolder{})
		if result.Error != nil {
			return result.Error
		}
		deleted = result.RowsAffected > 0
		return tx.Where("user_id = ? AND folder_id = ?", userID, id).Delete(&model.StudioWorkFolder{}).Error
	})
	return deleted, err
}

// DeleteStudioLabel 删除标签，并从所有作品上摘掉。
func (r *Repository) DeleteStudioLabel(userID, id string) (bool, error) {
	deleted := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioLabel{})
		if result.Error != nil {
			return result.Error
		}
		deleted = result.RowsAffected > 0
		return tx.Where("user_id = ? AND label_id = ?", userID, id).Delete(&model.StudioWorkLabel{}).Error
	})
	return deleted, err
}

func (r *Repository) CountStudioFolders(userID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.StudioFolder{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

func (r *Repository) CountStudioLabels(userID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.StudioLabel{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

// StudioFolderCounts 返回每个文件夹里的作品数（不含已删除的作品）。
func (r *Repository) StudioFolderCounts(userID string) (map[string]int64, error) {
	type row struct {
		FolderID string
		Count    int64
	}
	var rows []row
	err := r.db.Model(&model.StudioWorkFolder{}).Select("folder_id, COUNT(*) AS count").
		Where("user_id = ? AND task_id NOT IN (?)", userID, r.db.Model(&model.StudioHiddenTask{}).Select("task_id").Where("user_id = ?", userID)).
		Group("folder_id").Scan(&rows).Error
	counts := map[string]int64{}
	for _, item := range rows {
		counts[item.FolderID] = item.Count
	}
	return counts, err
}

// MoveStudioWorks 把作品放进文件夹；folderID 为空表示移出文件夹。
func (r *Repository) MoveStudioWorks(userID string, taskIDs []string, folderID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND task_id IN ?", userID, taskIDs).Delete(&model.StudioWorkFolder{}).Error; err != nil {
			return err
		}
		if folderID == "" {
			return nil
		}
		now := time.Now().UTC()
		items := make([]model.StudioWorkFolder, 0, len(taskIDs))
		for _, id := range taskIDs {
			items = append(items, model.StudioWorkFolder{UserID: userID, TaskID: id, FolderID: folderID, CreatedAt: now})
		}
		return tx.Create(&items).Error
	})
}

// SetStudioWorksLabel 给作品加上或摘掉一个标签。
func (r *Repository) SetStudioWorksLabel(userID string, taskIDs []string, labelID string, add bool) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND label_id = ? AND task_id IN ?", userID, labelID, taskIDs).Delete(&model.StudioWorkLabel{}).Error; err != nil {
			return err
		}
		if !add {
			return nil
		}
		now := time.Now().UTC()
		items := make([]model.StudioWorkLabel, 0, len(taskIDs))
		for _, id := range taskIDs {
			items = append(items, model.StudioWorkLabel{UserID: userID, TaskID: id, LabelID: labelID, CreatedAt: now})
		}
		return tx.Create(&items).Error
	})
}

func (r *Repository) StudioWorkFolders(userID string, taskIDs []string) (map[string]string, error) {
	result := map[string]string{}
	if len(taskIDs) == 0 {
		return result, nil
	}
	var items []model.StudioWorkFolder
	if err := r.db.Where("user_id = ? AND task_id IN ?", userID, taskIDs).Find(&items).Error; err != nil {
		return nil, err
	}
	for _, item := range items {
		result[item.TaskID] = item.FolderID
	}
	return result, nil
}

func (r *Repository) StudioWorkLabels(userID string, taskIDs []string) (map[string][]string, error) {
	result := map[string][]string{}
	if len(taskIDs) == 0 {
		return result, nil
	}
	var items []model.StudioWorkLabel
	if err := r.db.Where("user_id = ? AND task_id IN ?", userID, taskIDs).Order("created_at, label_id").Find(&items).Error; err != nil {
		return nil, err
	}
	for _, item := range items {
		result[item.TaskID] = append(result[item.TaskID], item.LabelID)
	}
	return result, nil
}
