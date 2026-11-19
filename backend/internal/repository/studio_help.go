package repository

import (
	"strings"
	"time"

	"yingce/backend/internal/model"
)

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

// HelpAssistantTasks 给帮助助手看的最近生成任务，带失败原因；不含画布对话等文本任务。
func (r *Repository) HelpAssistantTasks(userID string, limit int) ([]model.Task, error) {
	var tasks []model.Task
	err := r.db.Select("id", "type", "status", "operation", "model", "prompt", "error", "authorized_charge_microcredits", "created_at", "completed_at").
		Where("user_id = ? AND type <> ?", userID, "canvas_text").
		Order("created_at desc").Limit(limit).Find(&tasks).Error
	return tasks, err
}

func (r *Repository) CreateStudioAssistantLog(item *model.StudioAssistantLog) error {
	return r.db.Create(item).Error
}

// StudioAssistantLogFilter 是后台查看 AI 助手对话记录的筛选条件。
type StudioAssistantLogFilter struct {
	TenantID       string
	Keyword        string
	ConversationID string
	Kind           string
	Since          time.Time
	Page           int
	PageSize       int
}

func (r *Repository) StudioAssistantLogs(filter StudioAssistantLogFilter) ([]model.StudioAssistantLog, int64, error) {
	query := scopeTenant(r.db.Model(&model.StudioAssistantLog{}), filter.TenantID)
	if !filter.Since.IsZero() {
		query = query.Where("created_at >= ?", filter.Since)
	}
	if filter.ConversationID != "" {
		query = query.Where("conversation_id = ?", filter.ConversationID)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		// 关键词同时匹配提问、回答和用户名。
		like := "%" + escapeLike(strings.ToLower(keyword)) + "%"
		users := scopeTenant(r.db.Model(&model.User{}).Select("id"), filter.TenantID).Where("LOWER(username) LIKE ? ESCAPE '\\'", like)
		query = query.Where("(LOWER(question) LIKE ? ESCAPE '\\' OR LOWER(answer) LIKE ? ESCAPE '\\' OR user_id IN (?))", like, like, users)
	}
	switch filter.Kind {
	case "failed":
		query = query.Where("error <> ''")
	case "ticket":
		query = query.Where("ticket = ?", true)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.StudioAssistantLog
	err := query.Order("seq desc, id").Offset((filter.Page - 1) * filter.PageSize).Limit(filter.PageSize).Find(&items).Error
	return items, total, err
}

// StudioAssistantLogStats 是一段时间内的提问数、提问人数、失败数和转人工数。
type StudioAssistantLogStats struct {
	Questions int64 `json:"questions"`
	Users     int64 `json:"users"`
	Failed    int64 `json:"failed"`
	Tickets   int64 `json:"tickets"`
}

func (r *Repository) StudioAssistantLogStats(tenantID string, since time.Time) (StudioAssistantLogStats, error) {
	var stats StudioAssistantLogStats
	err := scopeTenant(r.db.Model(&model.StudioAssistantLog{}), tenantID).Where("created_at >= ?", since).
		Select("COUNT(*) AS questions, COUNT(DISTINCT user_id) AS users, " +
			"SUM(CASE WHEN error <> '' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN ticket THEN 1 ELSE 0 END) AS tickets").
		Scan(&stats).Error
	return stats, err
}
