package app

import (
	"strings"
	"time"

	"yingce/backend/internal/model"
)

var studioFeedbackCategories = map[string]bool{"bug": true, "idea": true, "billing": true, "other": true}

var studioFeedbackStatuses = map[string]bool{"open": true, "done": true}

// StudioSiteContentKeys 是帮助中心可编辑的内容：客服说明、服务条款、隐私政策。
var StudioSiteContentKeys = []string{"support", "terms", "privacy"}

type StudioFeedbackView struct {
	model.StudioFeedback
	Username string `json:"username"`
}

// SubmitStudioFeedback 保存一条用户反馈。
func (s *Service) SubmitStudioFeedback(userID, category, content, contact, page string) (model.StudioFeedback, error) {
	category = strings.TrimSpace(category)
	if !studioFeedbackCategories[category] {
		return model.StudioFeedback{}, BadAuthRequest("反馈类型无效")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return model.StudioFeedback{}, BadAuthRequest("请填写反馈内容")
	}
	var err error
	if content, err = limitText(content, 4000, "反馈内容太长"); err != nil {
		return model.StudioFeedback{}, err
	}
	if contact, err = limitText(strings.TrimSpace(contact), 200, "联系方式太长"); err != nil {
		return model.StudioFeedback{}, err
	}
	if page, err = limitText(strings.TrimSpace(page), 300, "页面地址太长"); err != nil {
		return model.StudioFeedback{}, err
	}
	now := time.Now().UTC()
	item := model.StudioFeedback{ID: newID(), UserID: userID, Category: category, Content: content, Contact: contact, Page: page, Status: "open", Seq: studioSeq(), CreatedAt: now, UpdatedAt: now}
	if err := s.repo.CreateStudioFeedback(&item); err != nil {
		return model.StudioFeedback{}, err
	}
	return item, nil
}

// AdminStudioFeedback 列出用户反馈，可按处理状态筛选。
func (s *Service) AdminStudioFeedback(actor *model.User, status string) ([]StudioFeedbackView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	status = strings.TrimSpace(status)
	if status != "" && !studioFeedbackStatuses[status] {
		return nil, BadAuthRequest("反馈状态无效")
	}
	items, err := s.repo.StudioFeedbacks(status, 300)
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	views := make([]StudioFeedbackView, 0, len(items))
	for _, item := range items {
		name, seen := names[item.UserID]
		if !seen {
			if user, err := s.repo.User(item.UserID); err == nil && user != nil {
				name = user.Username
			}
			names[item.UserID] = name
		}
		views = append(views, StudioFeedbackView{StudioFeedback: item, Username: name})
	}
	return views, nil
}

func (s *Service) SetStudioFeedbackStatus(actor *model.User, id, status string) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	if !studioFeedbackStatuses[status] {
		return BadAuthRequest("反馈状态无效")
	}
	updated, err := s.repo.UpdateStudioFeedbackStatus(strings.TrimSpace(id), status)
	if err != nil {
		return err
	}
	if !updated {
		return NotFound("反馈不存在")
	}
	return nil
}

// StudioSiteContent 返回帮助中心内容，没填写的项为空字符串。
func (s *Service) StudioSiteContent() (map[string]string, error) {
	items, err := s.repo.StudioSiteContents()
	if err != nil {
		return nil, err
	}
	content := map[string]string{}
	for _, key := range StudioSiteContentKeys {
		content[key] = ""
	}
	for _, item := range items {
		if _, known := content[item.Key]; known {
			content[item.Key] = item.Content
		}
	}
	return content, nil
}

// SaveStudioSiteContent 由管理员保存一项帮助中心内容。
func (s *Service) SaveStudioSiteContent(actor *model.User, key, content string) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	key = strings.TrimSpace(key)
	known := false
	for _, item := range StudioSiteContentKeys {
		known = known || item == key
	}
	if !known {
		return BadAuthRequest("内容项无效")
	}
	content, err := limitText(strings.TrimSpace(content), 60000, "内容太长")
	if err != nil {
		return err
	}
	return s.repo.SaveStudioSiteContent(model.StudioSiteContent{Key: key, Content: content, UpdatedAt: time.Now().UTC()})
}
