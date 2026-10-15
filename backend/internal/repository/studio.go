package repository

import (
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StudioTaskCursor 是作品库分页位置。任务 ID 是随机值，必须和创建时间一起比较才能稳定翻页。
type StudioTaskCursor struct {
	CreatedAt time.Time
	ID        string
}

type StudioTaskQuery struct {
	Kinds         []string
	FavoritesOnly bool
	Search        string
	ActiveOnly    bool
	Cursor        *StudioTaskCursor
	Limit         int
}

var studioTaskColumns = []string{"id", "project_id", "type", "workbench_kind", "status", "stage", "media_stage", "media_recovery_json", "progress", "prompt", "operation", "provider", "model", "input_json", "result_json", "error", "billing_order_id", "provider_request_id", "provider_cancel_status", "provider_cancel_error", "provider_cancel_attempts", "provider_cancel_requested_at", "provider_cancelled_at", "attempts", "started_at", "completed_at", "created_at", "updated_at"}

// StudioTasks 读取 Studio 作品，多取一条用于判断是否还有下一页。
func (r *Repository) StudioTasks(userID string, query StudioTaskQuery) ([]model.Task, bool, error) {
	limit := query.Limit
	if limit < 1 || limit > 100 {
		limit = 40
	}
	kinds := query.Kinds
	if len(kinds) == 0 {
		kinds = model.StudioKinds
	}
	db := r.db.Model(&model.Task{}).Select(studioTaskColumns).Where("user_id = ? AND workbench_kind IN ?", userID, kinds)
	if query.ActiveOnly {
		db = db.Where("status IN ?", []model.TaskStatus{model.TaskStatusQueued, model.TaskStatusRunning})
	}
	db = db.Where("id NOT IN (?)", r.db.Model(&model.StudioHiddenTask{}).Select("task_id").Where("user_id = ?", userID))
	if query.FavoritesOnly {
		db = db.Where("id IN (?)", r.db.Model(&model.StudioFavorite{}).Select("task_id").Where("user_id = ?", userID))
	}
	if search := strings.TrimSpace(query.Search); search != "" {
		db = db.Where("LOWER(prompt) LIKE ? ESCAPE '\\'", "%"+escapeLike(strings.ToLower(search))+"%")
	}
	if query.Cursor != nil {
		db = db.Where("(created_at < ?) OR (created_at = ? AND id < ?)", query.Cursor.CreatedAt, query.Cursor.CreatedAt, query.Cursor.ID)
	}
	var tasks []model.Task
	if err := db.Order("created_at desc, id desc").Limit(limit + 1).Find(&tasks).Error; err != nil {
		return nil, false, err
	}
	if len(tasks) > limit {
		return tasks[:limit], true, nil
	}
	return tasks, false, nil
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_")
	return replacer.Replace(value)
}

// StudioTaskOwned 确认任务属于该用户且是 Studio 作品。
func (r *Repository) StudioTaskOwned(userID string, taskID string) (bool, error) {
	var count int64
	err := r.db.Model(&model.Task{}).Where("id = ? AND user_id = ? AND workbench_kind IN ?", taskID, userID, model.StudioKinds).Count(&count).Error
	return count > 0, err
}

func (r *Repository) StudioFavoriteTaskIDs(userID string, taskIDs []string) (map[string]bool, error) {
	result := map[string]bool{}
	if len(taskIDs) == 0 {
		return result, nil
	}
	var favorites []model.StudioFavorite
	if err := r.db.Where("user_id = ? AND task_id IN ?", userID, taskIDs).Find(&favorites).Error; err != nil {
		return nil, err
	}
	for _, favorite := range favorites {
		result[favorite.TaskID] = true
	}
	return result, nil
}

func (r *Repository) SetStudioFavorite(userID string, taskID string, favorite bool) error {
	if !favorite {
		return r.db.Where("user_id = ? AND task_id = ?", userID, taskID).Delete(&model.StudioFavorite{}).Error
	}
	record := model.StudioFavorite{UserID: userID, TaskID: taskID, CreatedAt: time.Now().UTC()}
	return r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&record).Error
}

func (r *Repository) StudioPreference(userID string) (*model.StudioPreference, error) {
	var preference model.StudioPreference
	err := r.db.Where("user_id = ?", userID).First(&preference).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &preference, nil
}

func (r *Repository) SaveStudioPreference(preference model.StudioPreference) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"surface", "updated_at"}),
	}).Create(&preference).Error
}

// HideStudioTasks 从作品库移除作品，同时清掉收藏。
func (r *Repository) HideStudioTasks(userID string, taskIDs []string) error {
	if len(taskIDs) == 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		records := make([]model.StudioHiddenTask, 0, len(taskIDs))
		for _, taskID := range taskIDs {
			records = append(records, model.StudioHiddenTask{UserID: userID, TaskID: taskID, CreatedAt: now})
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&records).Error; err != nil {
			return err
		}
		return tx.Where("user_id = ? AND task_id IN ?", userID, taskIDs).Delete(&model.StudioFavorite{}).Error
	})
}

// StudioOwnedTaskIDs 过滤出属于该用户的 Studio 作品 ID。
func (r *Repository) StudioOwnedTaskIDs(userID string, taskIDs []string) ([]string, error) {
	if len(taskIDs) == 0 {
		return nil, nil
	}
	var ids []string
	err := r.db.Model(&model.Task{}).Where("user_id = ? AND id IN ? AND workbench_kind IN ?", userID, taskIDs, model.StudioKinds).Pluck("id", &ids).Error
	return ids, err
}

func (r *Repository) StudioBrandKits(userID string) ([]model.StudioBrandKit, error) {
	var kits []model.StudioBrandKit
	err := r.db.Where("user_id = ?", userID).Order("is_default desc, updated_at desc, id").Find(&kits).Error
	return kits, err
}

func (r *Repository) StudioBrandKit(userID string, id string) (*model.StudioBrandKit, error) {
	var kit model.StudioBrandKit
	err := r.db.Where("id = ? AND user_id = ?", id, userID).Take(&kit).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &kit, nil
}

func (r *Repository) CountStudioBrandKits(userID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.StudioBrandKit{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

// SaveStudioBrandKit 保存品牌套件；设为默认时同一事务里取消其它套件的默认标记，保证最多一个默认。
func (r *Repository) SaveStudioBrandKit(kit *model.StudioBrandKit) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if kit.IsDefault {
			if err := tx.Model(&model.StudioBrandKit{}).Where("user_id = ? AND id <> ?", kit.UserID, kit.ID).Update("is_default", false).Error; err != nil {
				return err
			}
		}
		return tx.Save(kit).Error
	})
}

func (r *Repository) DeleteStudioBrandKit(userID string, id string) (bool, error) {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioBrandKit{})
	return result.RowsAffected > 0, result.Error
}
