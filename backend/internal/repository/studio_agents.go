package repository

import (
	"errors"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

func firstOrNil[T any](db *gorm.DB, query string, args ...any) (*T, error) {
	var value T
	err := db.Where(query, args...).Take(&value).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &value, nil
}

// ---- 角色 ----

func (r *Repository) StudioCharacters(userID string) ([]model.StudioCharacter, error) {
	var items []model.StudioCharacter
	err := r.db.Where("user_id = ?", userID).Order("updated_at desc, id").Find(&items).Error
	return items, err
}

func (r *Repository) StudioCharacter(userID, id string) (*model.StudioCharacter, error) {
	return firstOrNil[model.StudioCharacter](r.db, "id = ? AND user_id = ?", id, userID)
}

func (r *Repository) CountStudioCharacters(userID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.StudioCharacter{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

func (r *Repository) SaveStudioCharacter(item *model.StudioCharacter) error {
	return r.db.Save(item).Error
}

func (r *Repository) DeleteStudioCharacter(userID, id string) (bool, error) {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioCharacter{})
	return result.RowsAffected > 0, result.Error
}

// ---- 会话 ----

func (r *Repository) StudioChatSessions(userID, mode string, limit int) ([]model.StudioChatSession, error) {
	var items []model.StudioChatSession
	query := r.db.Where("user_id = ?", userID)
	if mode != "" {
		query = query.Where("mode = ?", mode)
	}
	err := query.Order("updated_at desc, id").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) StudioChatSession(userID, id string) (*model.StudioChatSession, error) {
	return firstOrNil[model.StudioChatSession](r.db, "id = ? AND user_id = ?", id, userID)
}

func (r *Repository) StudioChatSessionForStory(userID, storyID string) (*model.StudioChatSession, error) {
	return firstOrNil[model.StudioChatSession](r.db, "story_id = ? AND user_id = ?", storyID, userID)
}

func (r *Repository) SaveStudioChatSession(item *model.StudioChatSession) error {
	return r.db.Save(item).Error
}

func (r *Repository) DeleteStudioChatSession(userID, id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("session_id = ? AND user_id = ?", id, userID).Delete(&model.StudioChatMessage{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioChatSession{}).Error
	})
}

func (r *Repository) StudioChatMessages(userID, sessionID string, limit int) ([]model.StudioChatMessage, error) {
	var items []model.StudioChatMessage
	err := r.db.Where("session_id = ? AND user_id = ?", sessionID, userID).Order("seq desc, id desc").Limit(limit).Find(&items).Error
	for left, right := 0, len(items)-1; left < right; left, right = left+1, right-1 {
		items[left], items[right] = items[right], items[left]
	}
	return items, err
}

func (r *Repository) StudioChatMessage(userID, sessionID, id string) (*model.StudioChatMessage, error) {
	return firstOrNil[model.StudioChatMessage](r.db, "id = ? AND session_id = ? AND user_id = ?", id, sessionID, userID)
}

// AppendStudioChatMessage 写入消息并刷新会话的更新时间，保证会话列表按最近使用排序。
func (r *Repository) AppendStudioChatMessage(message *model.StudioChatMessage, session *model.StudioChatSession) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(message).Error; err != nil {
			return err
		}
		return tx.Save(session).Error
	})
}

// UpdateStudioChatMessageActions 只改生成计划和更新时间，不重写其他列。
func (r *Repository) UpdateStudioChatMessageActions(item *model.StudioChatMessage) error {
	return r.db.Model(&model.StudioChatMessage{}).Where("id = ? AND user_id = ?", item.ID, item.UserID).Updates(map[string]any{"actions_json": item.ActionsJSON, "updated_at": item.UpdatedAt}).Error
}

// ---- 导演项目 ----

func (r *Repository) StudioStories(userID string, limit int) ([]model.StudioStory, error) {
	var items []model.StudioStory
	err := r.db.Where("user_id = ?", userID).Order("updated_at desc, id").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) StudioStory(userID, id string) (*model.StudioStory, error) {
	return firstOrNil[model.StudioStory](r.db, "id = ? AND user_id = ?", id, userID)
}

func (r *Repository) SaveStudioStory(item *model.StudioStory) error {
	return r.db.Save(item).Error
}

type StudioStoryTree struct {
	Scenes   []model.StudioScene
	Shots    []model.StudioShot
	Versions []model.StudioShotVersion
}

func (r *Repository) StudioStoryTree(userID, storyID string) (StudioStoryTree, error) {
	var tree StudioStoryTree
	if err := r.db.Where("story_id = ? AND user_id = ?", storyID, userID).Order("sort, id").Find(&tree.Scenes).Error; err != nil {
		return tree, err
	}
	if err := r.db.Where("story_id = ? AND user_id = ?", storyID, userID).Order("sort, id").Find(&tree.Shots).Error; err != nil {
		return tree, err
	}
	err := r.db.Where("story_id = ? AND user_id = ?", storyID, userID).Order("seq, id").Find(&tree.Versions).Error
	return tree, err
}

// ReplaceStudioStoryPlan 一次性替换分镜：保留仍存在的镜头（连同版本），删除不再出现的场景和镜头。
func (r *Repository) ReplaceStudioStoryPlan(story *model.StudioStory, scenes []model.StudioScene, shots []model.StudioShot) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		sceneIDs := make([]string, 0, len(scenes))
		for _, scene := range scenes {
			sceneIDs = append(sceneIDs, scene.ID)
		}
		shotIDs := make([]string, 0, len(shots))
		for _, shot := range shots {
			shotIDs = append(shotIDs, shot.ID)
		}
		staleScenes := tx.Where("story_id = ? AND user_id = ?", story.ID, story.UserID)
		if len(sceneIDs) > 0 {
			staleScenes = staleScenes.Where("id NOT IN ?", sceneIDs)
		}
		if err := staleScenes.Delete(&model.StudioScene{}).Error; err != nil {
			return err
		}
		staleShots := tx.Where("story_id = ? AND user_id = ?", story.ID, story.UserID)
		if len(shotIDs) > 0 {
			staleShots = staleShots.Where("id NOT IN ?", shotIDs)
		}
		var removed []string
		if err := staleShots.Model(&model.StudioShot{}).Pluck("id", &removed).Error; err != nil {
			return err
		}
		if len(removed) > 0 {
			if err := tx.Where("shot_id IN ? AND user_id = ?", removed, story.UserID).Delete(&model.StudioShotVersion{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ? AND user_id = ?", removed, story.UserID).Delete(&model.StudioShot{}).Error; err != nil {
				return err
			}
		}
		for i := range scenes {
			if err := tx.Save(&scenes[i]).Error; err != nil {
				return err
			}
		}
		for i := range shots {
			if err := tx.Save(&shots[i]).Error; err != nil {
				return err
			}
		}
		return tx.Save(story).Error
	})
}

func (r *Repository) StudioShot(userID, storyID, id string) (*model.StudioShot, error) {
	return firstOrNil[model.StudioShot](r.db, "id = ? AND story_id = ? AND user_id = ?", id, storyID, userID)
}

func (r *Repository) StudioShotVersion(userID, shotID, id string) (*model.StudioShotVersion, error) {
	return firstOrNil[model.StudioShotVersion](r.db, "id = ? AND shot_id = ? AND user_id = ?", id, shotID, userID)
}

func (r *Repository) SaveStudioShot(item *model.StudioShot) error {
	return r.db.Save(item).Error
}

// AddStudioShotVersion 新增版本并设为镜头当前版本。
func (r *Repository) AddStudioShotVersion(version *model.StudioShotVersion, shot *model.StudioShot) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(version).Error; err != nil {
			return err
		}
		return tx.Save(shot).Error
	})
}

func (r *Repository) DeleteStudioStory(userID, id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range []any{&model.StudioShotVersion{}, &model.StudioShot{}, &model.StudioScene{}} {
			if err := tx.Where("story_id = ? AND user_id = ?", id, userID).Delete(item).Error; err != nil {
				return err
			}
		}
		var sessionIDs []string
		if err := tx.Model(&model.StudioChatSession{}).Where("story_id = ? AND user_id = ?", id, userID).Pluck("id", &sessionIDs).Error; err != nil {
			return err
		}
		if len(sessionIDs) > 0 {
			if err := tx.Where("session_id IN ? AND user_id = ?", sessionIDs, userID).Delete(&model.StudioChatMessage{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ? AND user_id = ?", sessionIDs, userID).Delete(&model.StudioChatSession{}).Error; err != nil {
				return err
			}
		}
		return tx.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioStory{}).Error
	})
}

func (r *Repository) UserTasksByIDs(userID string, ids []string) ([]model.Task, error) {
	var tasks []model.Task
	if len(ids) == 0 {
		return tasks, nil
	}
	err := r.db.Where("user_id = ? AND id IN ?", userID, ids).Find(&tasks).Error
	return tasks, err
}

// ---- 上传素材 ----

func (r *Repository) StudioUploads(userID, kind string, limit int) ([]model.StudioUpload, error) {
	var items []model.StudioUpload
	query := r.db.Where("user_id = ?", userID)
	if kind != "" {
		query = query.Where("kind = ?", kind)
	}
	err := query.Order("seq desc, id").Limit(limit).Find(&items).Error
	return items, err
}

// SaveStudioUpload 同一资源只记一次：重复登记时返回已有记录。
func (r *Repository) SaveStudioUpload(item *model.StudioUpload) error {
	existing, err := firstOrNil[model.StudioUpload](r.db, "user_id = ? AND resource_id = ?", item.UserID, item.ResourceID)
	if err != nil {
		return err
	}
	if existing != nil {
		*item = *existing
		return nil
	}
	return r.db.Create(item).Error
}

func (r *Repository) DeleteStudioUpload(userID, id string) (bool, error) {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioUpload{})
	return result.RowsAffected > 0, result.Error
}

// ---- 我的声音 ----

func (r *Repository) StudioVoices(userID string, limit int) ([]model.StudioVoice, error) {
	var items []model.StudioVoice
	err := r.db.Where("user_id = ?", userID).Order("seq desc, id").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) StudioVoice(userID, id string) (*model.StudioVoice, error) {
	return firstOrNil[model.StudioVoice](r.db, "id = ? AND user_id = ?", id, userID)
}

func (r *Repository) CountStudioVoices(userID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.StudioVoice{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

func (r *Repository) CreateStudioVoice(item *model.StudioVoice) error {
	return r.db.Create(item).Error
}

func (r *Repository) UpdateStudioVoice(userID, id string, fields map[string]any) (bool, error) {
	result := r.db.Model(&model.StudioVoice{}).Where("id = ? AND user_id = ?", id, userID).Updates(fields)
	return result.RowsAffected > 0, result.Error
}

func (r *Repository) DeleteStudioVoice(userID, id string) (bool, error) {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.StudioVoice{})
	return result.RowsAffected > 0, result.Error
}
