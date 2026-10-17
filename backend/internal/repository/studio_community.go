package repository

import (
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type StudioPostQuery struct {
	Kind      string
	Sort      string
	Templates bool
	Featured  bool
	UserID    string
	// FollowerID 不为空时只看这个用户关注的创作者。
	FollowerID string
	Search     string
	Offset     int
	Limit      int
	// IncludeHidden 只给管理员列表使用。
	IncludeHidden bool
}

func (r *Repository) StudioPosts(query StudioPostQuery) ([]model.StudioPost, bool, error) {
	db := r.db.Model(&model.StudioPost{})
	if !query.IncludeHidden {
		db = db.Where("status = ?", model.StudioPostPublished)
	}
	if query.Kind != "" {
		db = db.Where("kind = ?", query.Kind)
	}
	if query.Templates {
		db = db.Where("is_template = ?", true)
	}
	if query.Featured {
		db = db.Where("featured = ?", true)
	}
	if query.UserID != "" {
		db = db.Where("user_id = ?", query.UserID)
	}
	if query.FollowerID != "" {
		db = db.Where("user_id IN (?)", r.db.Model(&model.StudioFollow{}).Select("followee_id").Where("follower_id = ?", query.FollowerID))
	}
	if search := strings.TrimSpace(query.Search); search != "" {
		pattern := "%" + escapeLike(strings.ToLower(search)) + "%"
		db = db.Where("(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(prompt) LIKE ? ESCAPE '\\')", pattern, pattern)
	}
	switch query.Sort {
	case "popular":
		db = db.Order("like_count desc, remix_count desc, created_at desc, id desc")
	case "latest":
		db = db.Order("created_at desc, id desc")
	default:
		db = db.Order("featured desc, created_at desc, id desc")
	}
	limit := query.Limit
	if limit <= 0 || limit > 60 {
		limit = 30
	}
	var posts []model.StudioPost
	if err := db.Offset(query.Offset).Limit(limit + 1).Find(&posts).Error; err != nil {
		return nil, false, err
	}
	hasMore := len(posts) > limit
	if hasMore {
		posts = posts[:limit]
	}
	return posts, hasMore, nil
}

func (r *Repository) StudioPost(id string) (*model.StudioPost, error) {
	var post model.StudioPost
	err := r.db.First(&post, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *Repository) StudioPostByTask(taskID string) (*model.StudioPost, error) {
	var post model.StudioPost
	err := r.db.First(&post, "task_id = ?", taskID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *Repository) SaveStudioPost(post *model.StudioPost) error {
	return r.db.Save(post).Error
}

func (r *Repository) DeleteStudioPost(id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("post_id = ?", id).Delete(&model.StudioPostLike{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", id).Delete(&model.StudioPost{}).Error
	})
}

// SetStudioPostLike 点赞/取消点赞并在同一事务里维护计数，重复操作不会多算。
func (r *Repository) SetStudioPostLike(postID, userID string, liked bool) (int64, error) {
	var count int64
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var changed int64
		if liked {
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.StudioPostLike{PostID: postID, UserID: userID, CreatedAt: time.Now().UTC()})
			if result.Error != nil {
				return result.Error
			}
			changed = result.RowsAffected
		} else {
			result := tx.Where("post_id = ? AND user_id = ?", postID, userID).Delete(&model.StudioPostLike{})
			if result.Error != nil {
				return result.Error
			}
			changed = -result.RowsAffected
		}
		if changed != 0 {
			if err := tx.Model(&model.StudioPost{}).Where("id = ?", postID).Update("like_count", gorm.Expr("CASE WHEN like_count + ? < 0 THEN 0 ELSE like_count + ? END", changed, changed)).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.StudioPost{}).Select("like_count").Where("id = ?", postID).Scan(&count).Error
	})
	return count, err
}

func (r *Repository) StudioLikedPostIDs(userID string, postIDs []string) (map[string]bool, error) {
	liked := map[string]bool{}
	if userID == "" || len(postIDs) == 0 {
		return liked, nil
	}
	var rows []model.StudioPostLike
	if err := r.db.Where("user_id = ? AND post_id IN ?", userID, postIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		liked[row.PostID] = true
	}
	return liked, nil
}

func (r *Repository) IncrementStudioPostRemix(id string) error {
	return r.db.Model(&model.StudioPost{}).Where("id = ?", id).Update("remix_count", gorm.Expr("remix_count + 1")).Error
}

func (r *Repository) StudioTask(userID, taskID string) (*model.Task, error) {
	var task model.Task
	err := r.db.Where("id = ? AND user_id = ?", taskID, userID).Take(&task).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *Repository) UserDisplayNames(ids []string) (map[string]string, error) {
	names := map[string]string{}
	if len(ids) == 0 {
		return names, nil
	}
	var users []model.User
	if err := r.db.Select("id", "username", "display_name").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	for _, user := range users {
		name := strings.TrimSpace(user.DisplayName)
		if name == "" {
			name = user.Username
		}
		names[user.ID] = name
	}
	return names, nil
}

func (r *Repository) StudioToolCovers() ([]model.StudioToolCover, error) {
	var covers []model.StudioToolCover
	err := r.db.Order("tool_id").Find(&covers).Error
	return covers, err
}

func (r *Repository) SaveStudioToolCover(cover model.StudioToolCover) error {
	return r.db.Save(&cover).Error
}

func (r *Repository) DeleteStudioToolCover(toolID string) error {
	return r.db.Where("tool_id = ?", toolID).Delete(&model.StudioToolCover{}).Error
}
