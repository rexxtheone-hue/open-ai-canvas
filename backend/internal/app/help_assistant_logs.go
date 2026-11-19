// AI 助手对话记录：每轮问答落库，管理员（代理商管理员只看自己客户）在后台查看。

package app

import (
	"log"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func clipRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func (s *Service) recordHelpAssistantLog(user *model.User, req HelpAssistantRequest, messages []map[string]interface{}, answer string, runErr error, run *helpAssistantRun, duration time.Duration) {
	question := ""
	if len(messages) > 0 {
		question, _ = messages[len(messages)-1]["content"].(string)
	}
	ticket := false
	seen := map[string]bool{}
	tools := make([]string, 0, len(run.tools))
	for _, name := range run.tools {
		if name == "create_ticket" {
			ticket = true
		}
		if !seen[name] {
			seen[name] = true
			tools = append(tools, name)
		}
	}
	item := model.StudioAssistantLog{
		ID:             newID(),
		UserID:         user.ID,
		ConversationID: clipRunes(strings.TrimSpace(req.ConversationID), 64),
		Page:           clipRunes(strings.TrimSpace(req.Page), 300),
		Locale:         clipRunes(strings.TrimSpace(req.Locale), 16),
		Question:       question,
		Answer:         answer,
		Tools:          clipRunes(strings.Join(tools, ","), 300),
		Ticket:         ticket,
		Model:          clipRunes(run.model, 120),
		DurationMs:     duration.Milliseconds(),
		Seq:            studioSeq(),
		CreatedAt:      time.Now().UTC(),
	}
	if runErr != nil {
		item.Error = clipRunes(providerUserFacingErrorMessage(runErr), 500)
	}
	if err := s.repo.CreateStudioAssistantLog(&item); err != nil {
		log.Printf("save help assistant log: %v", err)
	}
}

type StudioAssistantLogView struct {
	model.StudioAssistantLog
	Username string `json:"username"`
}

type StudioAssistantLogQuery struct {
	Keyword        string `form:"q"`
	ConversationID string `form:"conversationId"`
	Kind           string `form:"kind"`
	Days           int    `form:"days"`
	Page           int    `form:"page"`
	PageSize       int    `form:"pageSize"`
}

type StudioAssistantLogPage struct {
	Items []StudioAssistantLogView           `json:"items"`
	Total int64                              `json:"total"`
	Stats repository.StudioAssistantLogStats `json:"stats"`
}

// AdminStudioAssistantLogs 列出 AI 助手的问答记录，附带所选时间范围的统计。
func (s *Service) AdminStudioAssistantLogs(actor *model.User, query StudioAssistantLogQuery) (StudioAssistantLogPage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return StudioAssistantLogPage{}, err
	}
	switch query.Kind {
	case "", "all", "failed", "ticket":
	default:
		return StudioAssistantLogPage{}, BadAuthRequest("筛选类型无效")
	}
	if query.Days <= 0 || query.Days > 365 {
		query.Days = 30
	}
	if query.Page <= 0 {
		query.Page = 1
	}
	if query.PageSize <= 0 || query.PageSize > 100 {
		query.PageSize = 20
	}
	tenantID := userTenantID(actor)
	since := time.Now().UTC().AddDate(0, 0, -query.Days)
	items, total, err := s.repo.StudioAssistantLogs(repository.StudioAssistantLogFilter{
		TenantID: tenantID, Keyword: query.Keyword, ConversationID: strings.TrimSpace(query.ConversationID), Kind: query.Kind,
		Since: since, Page: query.Page, PageSize: query.PageSize,
	})
	if err != nil {
		return StudioAssistantLogPage{}, err
	}
	stats, err := s.repo.StudioAssistantLogStats(tenantID, since)
	if err != nil {
		return StudioAssistantLogPage{}, err
	}
	names := map[string]string{}
	views := make([]StudioAssistantLogView, 0, len(items))
	for _, item := range items {
		name, ok := names[item.UserID]
		if !ok {
			if user, err := s.repo.User(item.UserID); err == nil && user != nil {
				name = user.Username
			}
			names[item.UserID] = name
		}
		views = append(views, StudioAssistantLogView{StudioAssistantLog: item, Username: name})
	}
	return StudioAssistantLogPage{Items: views, Total: total, Stats: stats}, nil
}
