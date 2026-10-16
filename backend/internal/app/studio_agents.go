package app

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const (
	studioCharacterLimit      = 200
	studioCharacterImageLimit = 8
	studioJSONLimit           = 64 << 10
	studioShotLimit           = 60
	studioMessagePageSize     = 200
)

// studioJSON 校验前端传来的结构化内容：必须是 JSON 对象或数组且不超过上限，空值存为空字符串。
// invalid 是格式不对时的完整提示（整句，便于翻译）。
func studioJSON(raw json.RawMessage, invalid string, wantArray bool) (string, error) {
	text := strings.TrimSpace(string(raw))
	if text == "" || text == "null" {
		return "", nil
	}
	if len(text) > studioJSONLimit {
		return "", BadAuthRequest("提交的内容太长")
	}
	var value any
	if err := json.Unmarshal([]byte(text), &value); err != nil {
		return "", BadAuthRequest(invalid)
	}
	switch value.(type) {
	case map[string]any:
		if wantArray {
			return "", BadAuthRequest(invalid)
		}
	case []any:
		if !wantArray {
			return "", BadAuthRequest(invalid)
		}
	default:
		return "", BadAuthRequest(invalid)
	}
	return text, nil
}

func rawOrNull(text string) json.RawMessage {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	return json.RawMessage(text)
}

// limitText 去掉首尾空白并限制长度；tooLong 是超长时的完整提示。
func limitText(value string, max int, tooLong string) (string, error) {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > max {
		return "", BadAuthRequest(tooLong)
	}
	return value, nil
}

var (
	studioSeqMu   sync.Mutex
	studioSeqLast int64
)

// studioSeq 返回严格递增的写入序号，同一纳秒内多次写入也不会重复。
func studioSeq() int64 {
	studioSeqMu.Lock()
	defer studioSeqMu.Unlock()
	next := time.Now().UnixNano()
	if next <= studioSeqLast {
		next = studioSeqLast + 1
	}
	studioSeqLast = next
	return next
}

// ---------------- 角色库 ----------------

// studioAssetKinds 是「角色与世界」资产库里可保存的类型。
var studioAssetKinds = map[string]bool{"character": true, "object": true, "background": true, "style": true}

type StudioCharacterInput struct {
	Name             string   `json:"name"`
	Kind             string   `json:"kind"`
	Description      string   `json:"description"`
	ImageResourceIDs []string `json:"imageResourceIds"`
	VoiceName        string   `json:"voiceName"`
}

type StudioCharacterView struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Kind             string    `json:"kind"`
	Description      string    `json:"description"`
	ImageResourceIDs []string  `json:"imageResourceIds"`
	VoiceName        string    `json:"voiceName,omitempty"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func studioCharacterView(item model.StudioCharacter) StudioCharacterView {
	images := []string{}
	_ = json.Unmarshal([]byte(item.ImagesJSON), &images)
	kind := item.Kind
	if kind == "" {
		kind = "character"
	}
	return StudioCharacterView{ID: item.ID, Name: item.Name, Kind: kind, Description: item.Description, ImageResourceIDs: images, VoiceName: item.VoiceName, UpdatedAt: item.UpdatedAt}
}

func (s *Service) normalizeStudioCharacter(userID string, input StudioCharacterInput) (model.StudioCharacter, error) {
	var item model.StudioCharacter
	var err error
	if item.Name, err = limitText(input.Name, 40, "角色名称太长"); err != nil {
		return item, err
	}
	if item.Name == "" {
		return item, BadAuthRequest("请填写角色名称")
	}
	item.Kind = strings.TrimSpace(input.Kind)
	if item.Kind == "" {
		item.Kind = "character"
	}
	if !studioAssetKinds[item.Kind] {
		return item, BadAuthRequest("资产类型无效")
	}
	if item.Description, err = limitText(input.Description, 1000, "角色描述太长"); err != nil {
		return item, err
	}
	if item.VoiceName, err = limitText(input.VoiceName, 60, "声音名称太长"); err != nil {
		return item, err
	}
	images := []string{}
	seen := map[string]bool{}
	for _, id := range input.ImageResourceIDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		resource, err := s.repo.ResourceForUser(userID, id)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return item, BadAuthRequest("角色图片不存在")
		}
		if err != nil {
			return item, err
		}
		if resource.Kind != "image" && !strings.HasPrefix(resource.MimeType, "image/") {
			return item, BadAuthRequest("角色形象需要是图片")
		}
		images = append(images, id)
	}
	if len(images) > studioCharacterImageLimit {
		return item, BadAuthRequest("每个角色最多 8 张形象图")
	}
	encoded, _ := json.Marshal(images)
	item.ImagesJSON = string(encoded)
	item.UserID = userID
	return item, nil
}

func (s *Service) StudioCharacters(userID string) ([]StudioCharacterView, error) {
	items, err := s.repo.StudioCharacters(userID)
	if err != nil {
		return nil, err
	}
	views := make([]StudioCharacterView, 0, len(items))
	for _, item := range items {
		views = append(views, studioCharacterView(item))
	}
	return views, nil
}

func (s *Service) SaveStudioCharacter(userID, id string, input StudioCharacterInput) (StudioCharacterView, error) {
	item, err := s.normalizeStudioCharacter(userID, input)
	if err != nil {
		return StudioCharacterView{}, err
	}
	now := time.Now().UTC()
	id = strings.TrimSpace(id)
	if id == "" {
		count, err := s.repo.CountStudioCharacters(userID)
		if err != nil {
			return StudioCharacterView{}, err
		}
		if count >= studioCharacterLimit {
			return StudioCharacterView{}, BadAuthRequest("角色最多 200 个")
		}
		item.ID, item.CreatedAt = newID(), now
	} else {
		existing, err := s.repo.StudioCharacter(userID, id)
		if err != nil {
			return StudioCharacterView{}, err
		}
		if existing == nil {
			return StudioCharacterView{}, NotFound("角色不存在")
		}
		item.ID, item.CreatedAt = existing.ID, existing.CreatedAt
	}
	item.UpdatedAt = now
	if err := s.repo.SaveStudioCharacter(&item); err != nil {
		return StudioCharacterView{}, err
	}
	return studioCharacterView(item), nil
}

func (s *Service) DeleteStudioCharacter(userID, id string) error {
	deleted, err := s.repo.DeleteStudioCharacter(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("角色不存在")
	}
	return nil
}

// ---------------- 对话会话 ----------------

const (
	StudioChatModeChat     = "chat"
	StudioChatModeDirector = "director"
)

type StudioChatMessageView struct {
	ID          string          `json:"id"`
	Role        string          `json:"role"`
	Content     string          `json:"content"`
	Actions     json.RawMessage `json:"actions,omitempty"`
	Attachments json.RawMessage `json:"attachments,omitempty"`
	TaskID      string          `json:"taskId,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

type StudioChatView struct {
	Session  model.StudioChatSession `json:"session"`
	Messages []StudioChatMessageView `json:"messages"`
}

type StudioChatMessageInput struct {
	Role        string          `json:"role"`
	Content     string          `json:"content"`
	Actions     json.RawMessage `json:"actions"`
	Attachments json.RawMessage `json:"attachments"`
	TaskID      string          `json:"taskId"`
}

func studioChatMessageView(item model.StudioChatMessage) StudioChatMessageView {
	return StudioChatMessageView{ID: item.ID, Role: item.Role, Content: item.Content, Actions: rawOrNull(item.ActionsJSON), Attachments: rawOrNull(item.AttachJSON), TaskID: item.TaskID, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}

func (s *Service) StudioChatSessions(userID, mode string) ([]model.StudioChatSession, error) {
	if mode != "" && mode != StudioChatModeChat && mode != StudioChatModeDirector {
		return nil, BadAuthRequest("会话类型无效")
	}
	return s.repo.StudioChatSessions(userID, mode, 100)
}

func (s *Service) CreateStudioChatSession(userID, mode, title string) (model.StudioChatSession, error) {
	if mode != StudioChatModeChat {
		return model.StudioChatSession{}, BadAuthRequest("会话类型无效")
	}
	title, err := limitText(title, 60, "标题太长")
	if err != nil {
		return model.StudioChatSession{}, err
	}
	if title == "" {
		title = "新对话"
	}
	now := time.Now().UTC()
	session := model.StudioChatSession{ID: newID(), UserID: userID, Mode: mode, Title: title, CreatedAt: now, UpdatedAt: now}
	return session, s.repo.SaveStudioChatSession(&session)
}

func (s *Service) StudioChat(userID, id string) (StudioChatView, error) {
	session, err := s.repo.StudioChatSession(userID, strings.TrimSpace(id))
	if err != nil {
		return StudioChatView{}, err
	}
	if session == nil {
		return StudioChatView{}, NotFound("会话不存在")
	}
	messages, err := s.repo.StudioChatMessages(userID, session.ID, studioMessagePageSize)
	if err != nil {
		return StudioChatView{}, err
	}
	view := StudioChatView{Session: *session, Messages: make([]StudioChatMessageView, 0, len(messages))}
	for _, message := range messages {
		view.Messages = append(view.Messages, studioChatMessageView(message))
	}
	return view, nil
}

func (s *Service) RenameStudioChat(userID, id, title string) (model.StudioChatSession, error) {
	session, err := s.repo.StudioChatSession(userID, strings.TrimSpace(id))
	if err != nil {
		return model.StudioChatSession{}, err
	}
	if session == nil {
		return model.StudioChatSession{}, NotFound("会话不存在")
	}
	if session.Title, err = limitText(title, 60, "标题太长"); err != nil {
		return model.StudioChatSession{}, err
	}
	if session.Title == "" {
		return model.StudioChatSession{}, BadAuthRequest("请填写标题")
	}
	session.UpdatedAt = time.Now().UTC()
	return *session, s.repo.SaveStudioChatSession(session)
}

func (s *Service) DeleteStudioChat(userID, id string) error {
	session, err := s.repo.StudioChatSession(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if session == nil {
		return NotFound("会话不存在")
	}
	if session.StoryID != "" {
		return BadAuthRequest("导演会话随导演项目一起删除")
	}
	return s.repo.DeleteStudioChatSession(userID, session.ID)
}

func (s *Service) normalizeStudioChatMessage(userID string, input StudioChatMessageInput) (model.StudioChatMessage, error) {
	var message model.StudioChatMessage
	role := strings.TrimSpace(input.Role)
	if role != "user" && role != "assistant" {
		return message, BadAuthRequest("消息角色无效")
	}
	content := strings.TrimSpace(input.Content)
	if utf8.RuneCountInString(content) > 20000 {
		return message, BadAuthRequest("消息太长")
	}
	actions, err := studioJSON(input.Actions, "生成计划格式无效", true)
	if err != nil {
		return message, err
	}
	attachments, err := studioJSON(input.Attachments, "附件格式无效", true)
	if err != nil {
		return message, err
	}
	if content == "" && actions == "" && attachments == "" {
		return message, BadAuthRequest("消息不能为空")
	}
	taskID := strings.TrimSpace(input.TaskID)
	if taskID != "" {
		owned, err := s.repo.UserTasksByIDs(userID, []string{taskID})
		if err != nil {
			return message, err
		}
		if len(owned) == 0 {
			return message, BadAuthRequest("任务不存在")
		}
	}
	return model.StudioChatMessage{UserID: userID, Role: role, Content: content, ActionsJSON: actions, AttachJSON: attachments, TaskID: taskID}, nil
}

func (s *Service) AppendStudioChatMessage(userID, sessionID string, input StudioChatMessageInput) (StudioChatMessageView, error) {
	session, err := s.repo.StudioChatSession(userID, strings.TrimSpace(sessionID))
	if err != nil {
		return StudioChatMessageView{}, err
	}
	if session == nil {
		return StudioChatMessageView{}, NotFound("会话不存在")
	}
	message, err := s.normalizeStudioChatMessage(userID, input)
	if err != nil {
		return StudioChatMessageView{}, err
	}
	now := time.Now().UTC()
	message.ID, message.SessionID, message.CreatedAt, message.UpdatedAt, message.Seq = newID(), session.ID, now, now, studioSeq()
	// 第一条用户消息作为会话标题，方便在会话列表里找回。
	if message.Role == "user" && (session.Title == "" || session.Title == "新对话") && message.Content != "" {
		session.Title = truncateRunes(strings.ReplaceAll(message.Content, "\n", " "), 40)
	}
	session.UpdatedAt = now
	if err := s.repo.AppendStudioChatMessage(&message, session); err != nil {
		return StudioChatMessageView{}, err
	}
	return studioChatMessageView(message), nil
}

// UpdateStudioChatActions 更新消息里生成计划的状态（已确认、对应任务 ID 等）。
func (s *Service) UpdateStudioChatActions(userID, sessionID, messageID string, actions json.RawMessage) (StudioChatMessageView, error) {
	message, err := s.repo.StudioChatMessage(userID, strings.TrimSpace(sessionID), strings.TrimSpace(messageID))
	if err != nil {
		return StudioChatMessageView{}, err
	}
	if message == nil {
		return StudioChatMessageView{}, NotFound("消息不存在")
	}
	if message.ActionsJSON, err = studioJSON(actions, "生成计划格式无效", true); err != nil {
		return StudioChatMessageView{}, err
	}
	message.UpdatedAt = time.Now().UTC()
	return studioChatMessageView(*message), s.repo.UpdateStudioChatMessageActions(message)
}

// StudioWorksByIDs 按任务 ID 取回本人的 Studio 作品（对话和导演里内联展示结果）。非 Studio 任务不返回。
func (s *Service) StudioWorksByIDs(userID string, ids []string) ([]StudioWork, error) {
	unique := make([]string, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" && !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	if len(unique) > 100 {
		return nil, BadAuthRequest("一次最多查询 100 个作品")
	}
	tasks, err := s.repo.UserTasksByIDs(userID, unique)
	if err != nil {
		return nil, err
	}
	studioTasks := make([]model.Task, 0, len(tasks))
	for _, task := range tasks {
		if strings.HasPrefix(task.WorkbenchKind, "studio-") {
			studioTasks = append(studioTasks, task)
		}
	}
	favorites, err := s.repo.StudioFavoriteTaskIDs(userID, unique)
	if err != nil {
		return nil, err
	}
	orders, err := s.repo.BillingOrdersByTaskIDs(userID, taskBillingTaskIDs(studioTasks))
	if err != nil {
		return nil, err
	}
	summaries := taskSummariesForOutputWithBilling(studioTasks, orders)
	works := make([]StudioWork, 0, len(studioTasks))
	for index, task := range studioTasks {
		works = append(works, studioWorkFromTask(task, summaries[index], favorites[task.ID]))
	}
	return works, nil
}

// ---------------- 上传素材 ----------------

type StudioUploadView struct {
	ID         string    `json:"id"`
	ResourceID string    `json:"resourceId"`
	Kind       string    `json:"kind"`
	Name       string    `json:"name"`
	MimeType   string    `json:"mimeType"`
	Width      int       `json:"width,omitempty"`
	Height     int       `json:"height,omitempty"`
	DurationMs int64     `json:"durationMs,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

func studioUploadKind(resource *model.Resource) string {
	for _, kind := range []string{"image", "video", "audio"} {
		if resource.Kind == kind || strings.HasPrefix(resource.MimeType, kind+"/") {
			return kind
		}
	}
	return ""
}

func studioUploadView(item model.StudioUpload, resource *model.Resource) StudioUploadView {
	view := StudioUploadView{ID: item.ID, ResourceID: item.ResourceID, Kind: item.Kind, Name: item.Name, CreatedAt: item.CreatedAt}
	if resource != nil {
		view.MimeType, view.Width, view.Height, view.DurationMs = resource.MimeType, resource.Width, resource.Height, resource.DurationMs
	}
	return view
}

// RegisterStudioUpload 登记一个已上传到本人名下的图片、视频或音频资源。
func (s *Service) RegisterStudioUpload(userID, resourceID, name string) (StudioUploadView, error) {
	resource, err := s.repo.ResourceForUser(userID, strings.TrimSpace(resourceID))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return StudioUploadView{}, BadAuthRequest("素材不存在")
	}
	if err != nil {
		return StudioUploadView{}, err
	}
	kind := studioUploadKind(resource)
	if kind == "" {
		return StudioUploadView{}, BadAuthRequest("只能登记图片、视频或音频")
	}
	if name, err = limitText(name, 200, "文件名太长"); err != nil {
		return StudioUploadView{}, err
	}
	item := model.StudioUpload{ID: newID(), UserID: userID, ResourceID: resource.ID, Kind: kind, Name: name, Seq: studioSeq(), CreatedAt: time.Now().UTC()}
	if err := s.repo.SaveStudioUpload(&item); err != nil {
		return StudioUploadView{}, err
	}
	return studioUploadView(item, resource), nil
}

// StudioUploads 列出本人在 Studio 上传的素材；资源已被删除的记录不返回。
func (s *Service) StudioUploads(userID, kind string) ([]StudioUploadView, error) {
	if kind != "" && kind != "image" && kind != "video" && kind != "audio" {
		return nil, BadAuthRequest("素材类型无效")
	}
	items, err := s.repo.StudioUploads(userID, kind, 200)
	if err != nil {
		return nil, err
	}
	views := make([]StudioUploadView, 0, len(items))
	for _, item := range items {
		resource, err := s.repo.ResourceForUser(userID, item.ResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		views = append(views, studioUploadView(item, resource))
	}
	return views, nil
}

func (s *Service) DeleteStudioUpload(userID, id string) error {
	deleted, err := s.repo.DeleteStudioUpload(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("素材不存在")
	}
	return nil
}

// ---------------- 我的声音 ----------------

const studioVoiceLimit = 200

type StudioVoiceView struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Source      string     `json:"source"`
	ResourceID  string     `json:"resourceId"`
	Description string     `json:"description"`
	MimeType    string     `json:"mimeType"`
	DurationMs  int64      `json:"durationMs,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}

func studioVoiceView(item model.StudioVoice, resource *model.Resource) StudioVoiceView {
	view := StudioVoiceView{ID: item.ID, Name: item.Name, Source: item.Source, ResourceID: item.ResourceID, Description: item.Description, LastUsedAt: item.LastUsedAt, CreatedAt: item.CreatedAt}
	if resource != nil {
		view.MimeType, view.DurationMs = resource.MimeType, resource.DurationMs
	}
	return view
}

// StudioVoices 列出本人的声音；样本音频已被删除的声音不返回。
func (s *Service) StudioVoices(userID string) ([]StudioVoiceView, error) {
	items, err := s.repo.StudioVoices(userID, studioVoiceLimit)
	if err != nil {
		return nil, err
	}
	views := make([]StudioVoiceView, 0, len(items))
	for _, item := range items {
		resource, err := s.repo.ResourceForUser(userID, item.ResourceID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		views = append(views, studioVoiceView(item, resource))
	}
	return views, nil
}

// CreateStudioVoice 用一段本人名下的录音或上传音频建立声音。
func (s *Service) CreateStudioVoice(userID, name, source, resourceID, description string) (StudioVoiceView, error) {
	if source != "record" && source != "upload" {
		return StudioVoiceView{}, BadAuthRequest("声音来源无效")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return StudioVoiceView{}, BadAuthRequest("请填写声音名称")
	}
	var err error
	if name, err = limitText(name, 120, "声音名称太长"); err != nil {
		return StudioVoiceView{}, err
	}
	if description, err = limitText(strings.TrimSpace(description), 500, "声音描述太长"); err != nil {
		return StudioVoiceView{}, err
	}
	resource, err := s.repo.ResourceForUser(userID, strings.TrimSpace(resourceID))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return StudioVoiceView{}, BadAuthRequest("声音样本不存在")
	}
	if err != nil {
		return StudioVoiceView{}, err
	}
	if resource.Kind != "audio" && !strings.HasPrefix(resource.MimeType, "audio/") {
		return StudioVoiceView{}, BadAuthRequest("声音样本必须是音频")
	}
	count, err := s.repo.CountStudioVoices(userID)
	if err != nil {
		return StudioVoiceView{}, err
	}
	if count >= studioVoiceLimit {
		return StudioVoiceView{}, BadAuthRequest("声音数量已达上限，请先删除不用的声音")
	}
	item := model.StudioVoice{ID: newID(), UserID: userID, Name: name, Source: source, ResourceID: resource.ID, Description: description, Seq: studioSeq(), CreatedAt: time.Now().UTC()}
	if err := s.repo.CreateStudioVoice(&item); err != nil {
		return StudioVoiceView{}, err
	}
	return studioVoiceView(item, resource), nil
}

func (s *Service) RenameStudioVoice(userID, id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return BadAuthRequest("请填写声音名称")
	}
	var err error
	if name, err = limitText(name, 120, "声音名称太长"); err != nil {
		return err
	}
	updated, err := s.repo.UpdateStudioVoice(userID, strings.TrimSpace(id), map[string]any{"name": name})
	if err != nil {
		return err
	}
	if !updated {
		return NotFound("声音不存在")
	}
	return nil
}

// TouchStudioVoice 记录声音被用于配音，「只看用过的声音」据此筛选。
func (s *Service) TouchStudioVoice(userID, id string) error {
	now := time.Now().UTC()
	updated, err := s.repo.UpdateStudioVoice(userID, strings.TrimSpace(id), map[string]any{"last_used_at": now})
	if err != nil {
		return err
	}
	if !updated {
		return NotFound("声音不存在")
	}
	return nil
}

func (s *Service) DeleteStudioVoice(userID, id string) error {
	deleted, err := s.repo.DeleteStudioVoice(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !deleted {
		return NotFound("声音不存在")
	}
	return nil
}
