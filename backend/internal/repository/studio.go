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
	Kinds []string
	// Source 为 "studio" 或 "canvas" 时只看一个产品生成的作品，空表示两边都看。
	Source        string
	FavoritesOnly bool
	Search        string
	ActiveOnly    bool
	// Tool 只列出某个 Studio 工具生成的作品（metadata.studioTool）。
	Tool string
	// Folder 为文件夹 ID；"unsorted" 表示没放进任何文件夹。
	Folder string
	Label  string
	Cursor *StudioTaskCursor
	Limit  int
}

var studioTaskColumns = []string{"id", "project_id", "type", "workbench_kind", "status", "stage", "media_stage", "media_recovery_json", "progress", "prompt", "operation", "provider", "model", "input_json", "result_json", "error", "billing_order_id", "provider_request_id", "provider_cancel_status", "provider_cancel_error", "provider_cancel_attempts", "provider_cancel_requested_at", "provider_cancelled_at", "attempts", "started_at", "completed_at", "created_at", "updated_at"}

// studioWorkCondition 是作品库的范围：Studio 作品，加上 AI Canvas 生成的图片、视频、音频（两个产品共用一个作品库）。
// source 为 "studio" 或 "canvas" 时只看一边。
func studioWorkCondition(db *gorm.DB, kinds []string, source string) *gorm.DB {
	if len(kinds) == 0 {
		kinds = model.StudioKinds
	}
	studio := db.Where("workbench_kind IN ?", kinds)
	canvas := db.Where("1 = 0")
	for _, kind := range kinds {
		switch kind {
		case model.StudioKindImage:
			canvas = canvas.Or("type = ?", "canvas_image")
		case model.StudioKindVideo:
			canvas = canvas.Or("type = ? OR type LIKE ? ESCAPE '\\'", "canvas_video", "video\\_%")
		case model.StudioKindAudio:
			canvas = canvas.Or("type = ?", "canvas_audio")
		}
	}
	// Canvas 那边失败或取消的任务没有作品，不放进作品库（Studio 自己失败的作品保留，方便重试）。
	canvas = db.Where("COALESCE(workbench_kind, '') NOT IN ?", model.StudioKinds).
		Where("status NOT IN ?", []model.TaskStatus{model.TaskStatusFailed, model.TaskStatusCancelled}).Where(canvas)
	switch source {
	case "studio":
		return studio
	case "canvas":
		return canvas
	}
	return db.Where(studio).Or(canvas)
}

// StudioTasks 读取作品库，多取一条用于判断是否还有下一页。
func (r *Repository) StudioTasks(userID string, query StudioTaskQuery) ([]model.Task, bool, error) {
	limit := query.Limit
	if limit < 1 || limit > 100 {
		limit = 40
	}
	db := r.db.Model(&model.Task{}).Select(studioTaskColumns).Where("user_id = ?", userID).Where(studioWorkCondition(r.db, query.Kinds, query.Source))
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
	if tool := strings.TrimSpace(query.Tool); tool != "" {
		db = db.Where("input_json LIKE ? ESCAPE '\\'", "%"+escapeLike(`"studioTool":"`+tool+`"`)+"%")
	}
	switch folder := strings.TrimSpace(query.Folder); folder {
	case "":
	case "unsorted":
		db = db.Where("id NOT IN (?)", r.db.Model(&model.StudioWorkFolder{}).Select("task_id").Where("user_id = ?", userID))
	default:
		db = db.Where("id IN (?)", r.db.Model(&model.StudioWorkFolder{}).Select("task_id").Where("user_id = ? AND folder_id = ?", userID, folder))
	}
	if label := strings.TrimSpace(query.Label); label != "" {
		db = db.Where("id IN (?)", r.db.Model(&model.StudioWorkLabel{}).Select("task_id").Where("user_id = ? AND label_id = ?", userID, label))
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

// StudioTaskOwned 确认任务属于该用户且在作品库范围内（Studio 作品或 Canvas 生成的媒体）。
func (r *Repository) StudioTaskOwned(userID string, taskID string) (bool, error) {
	var count int64
	err := r.db.Model(&model.Task{}).Where("id = ? AND user_id = ?", taskID, userID).Where(studioWorkCondition(r.db, nil, "")).Count(&count).Error
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

// StudioOwnedTaskIDs 过滤出属于该用户、在作品库范围内的作品 ID。
func (r *Repository) StudioOwnedTaskIDs(userID string, taskIDs []string) ([]string, error) {
	if len(taskIDs) == 0 {
		return nil, nil
	}
	var ids []string
	err := r.db.Model(&model.Task{}).Where("user_id = ? AND id IN ?", userID, taskIDs).Where(studioWorkCondition(r.db, nil, "")).Pluck("id", &ids).Error
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
