package app

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// StudioMedia 是作品库展示的一条产物。URL 可能是供应商临时地址，StorageKey 存在时前端优先用它换取签名地址。
type StudioMedia struct {
	Kind       string `json:"kind"`
	URL        string `json:"url,omitempty"`
	StorageKey string `json:"storageKey,omitempty"`
	MimeType   string `json:"mimeType,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
}

// StudioWork 是作品库的一条记录：任务状态、产物、收藏状态，以及「再次生成」所需的设置快照。
type StudioWork struct {
	TaskSummary
	Kind     string         `json:"kind"`
	Tool     string         `json:"tool,omitempty"`
	Favorite bool           `json:"favorite"`
	Error    string         `json:"error,omitempty"`
	Media    []StudioMedia  `json:"media"`
	Settings map[string]any `json:"settings,omitempty"`
	FolderID string         `json:"folderId,omitempty"`
	LabelIDs []string       `json:"labelIds,omitempty"`
}

type StudioWorkPage struct {
	Works      []StudioWork `json:"works"`
	NextCursor string       `json:"nextCursor,omitempty"`
}

type StudioWorkQuery struct {
	Kind          string
	FavoritesOnly bool
	Search        string
	ActiveOnly    bool
	Tool          string
	Folder        string
	Label         string
	Cursor        string
	Limit         int
}

func studioKindForFilter(kind string) ([]string, error) {
	switch strings.TrimSpace(kind) {
	case "", "all":
		return model.StudioKinds, nil
	case "image":
		return []string{model.StudioKindImage}, nil
	case "video":
		return []string{model.StudioKindVideo}, nil
	case "audio":
		return []string{model.StudioKindAudio}, nil
	}
	return nil, BadAuthRequest("作品类型无效")
}

func encodeStudioCursor(task model.Task) string {
	return base64.RawURLEncoding.EncodeToString([]byte(task.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + task.ID))
}

func decodeStudioCursor(raw string) (*repository.StudioTaskCursor, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	data, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, BadAuthRequest("分页位置无效")
	}
	createdAt, id, found := strings.Cut(string(data), "|")
	if !found || id == "" {
		return nil, BadAuthRequest("分页位置无效")
	}
	parsed, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return nil, BadAuthRequest("分页位置无效")
	}
	return &repository.StudioTaskCursor{CreatedAt: parsed, ID: id}, nil
}

// StudioWorks 返回作品库一页数据。
func (s *Service) StudioWorks(userID string, query StudioWorkQuery) (StudioWorkPage, error) {
	kinds, err := studioKindForFilter(query.Kind)
	if err != nil {
		return StudioWorkPage{}, err
	}
	cursor, err := decodeStudioCursor(query.Cursor)
	if err != nil {
		return StudioWorkPage{}, err
	}
	tool := strings.TrimSpace(query.Tool)
	if tool != "" && !studioToolIDPattern.MatchString(tool) {
		return StudioWorkPage{}, BadAuthRequest("工具 ID 无效")
	}
	tasks, hasMore, err := s.repo.StudioTasks(userID, repository.StudioTaskQuery{Kinds: kinds, FavoritesOnly: query.FavoritesOnly, Search: query.Search, ActiveOnly: query.ActiveOnly, Tool: tool, Folder: query.Folder, Label: query.Label, Cursor: cursor, Limit: query.Limit})
	if err != nil {
		return StudioWorkPage{}, err
	}
	ids := make([]string, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.ID)
	}
	favorites, err := s.repo.StudioFavoriteTaskIDs(userID, ids)
	if err != nil {
		return StudioWorkPage{}, err
	}
	folders, err := s.repo.StudioWorkFolders(userID, ids)
	if err != nil {
		return StudioWorkPage{}, err
	}
	labels, err := s.repo.StudioWorkLabels(userID, ids)
	if err != nil {
		return StudioWorkPage{}, err
	}
	orders, err := s.repo.BillingOrdersByTaskIDs(userID, taskBillingTaskIDs(tasks))
	if err != nil {
		return StudioWorkPage{}, err
	}
	summaries := taskSummariesForOutputWithBilling(tasks, orders)
	page := StudioWorkPage{Works: make([]StudioWork, 0, len(tasks))}
	for index, task := range tasks {
		work := studioWorkFromTask(task, summaries[index], favorites[task.ID])
		work.FolderID, work.LabelIDs = folders[task.ID], labels[task.ID]
		page.Works = append(page.Works, work)
	}
	if hasMore && len(tasks) > 0 {
		page.NextCursor = encodeStudioCursor(tasks[len(tasks)-1])
	}
	return page, nil
}

func studioWorkFromTask(task model.Task, summary TaskSummary, favorite bool) StudioWork {
	work := StudioWork{TaskSummary: summary, Kind: strings.TrimPrefix(task.WorkbenchKind, "studio-"), Favorite: favorite, Media: studioMediaFromResult(task.ResultJSON)}
	if task.Status == model.TaskStatusFailed {
		work.Error = truncateRunes(task.Error, 500)
	}
	work.Tool, work.Settings = studioSettingsFromInput(task.InputJSON)
	// 带品牌要求的作品，卡片和「再次生成」显示用户自己写的提示词，品牌部分由套件重新拼接。
	if prompt, ok := work.Settings["studioPrompt"].(string); ok {
		delete(work.Settings, "studioPrompt")
		work.Settings["userPrompt"] = prompt
		if strings.TrimSpace(prompt) != "" {
			work.Prompt = prompt
		}
	}
	return work
}

type studioResultMedia struct {
	DataURL    string `json:"dataUrl"`
	URL        string `json:"url"`
	StorageKey string `json:"storageKey"`
	MimeType   string `json:"mimeType"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	DurationMs int64  `json:"durationMs"`
}

func (m studioResultMedia) toMedia(kind string) (StudioMedia, bool) {
	url := strings.TrimSpace(m.DataURL)
	if url == "" {
		url = strings.TrimSpace(m.URL)
	}
	// 内嵌 data: 内容体积大，作品库只给存储键，由前端换取地址。
	if strings.HasPrefix(url, "data:") {
		url = ""
	}
	if url == "" && strings.TrimSpace(m.StorageKey) == "" {
		return StudioMedia{}, false
	}
	return StudioMedia{Kind: kind, URL: url, StorageKey: strings.TrimSpace(m.StorageKey), MimeType: m.MimeType, Width: m.Width, Height: m.Height, DurationMs: m.DurationMs}, true
}

// studioMediaFromResult 解析生成结果，顺序与前端 parseBackendGenerationResult 一致。
func studioMediaFromResult(raw string) []StudioMedia {
	media := []StudioMedia{}
	if strings.TrimSpace(raw) == "" {
		return media
	}
	var result struct {
		Images []studioResultMedia `json:"images"`
		Video  *studioResultMedia  `json:"video"`
		Audio  *studioResultMedia  `json:"audio"`
		Audios []studioResultMedia `json:"audios"`
	}
	if json.Unmarshal([]byte(raw), &result) != nil {
		return media
	}
	for _, item := range result.Images {
		if value, ok := item.toMedia("image"); ok {
			media = append(media, value)
		}
	}
	if result.Video != nil {
		if value, ok := result.Video.toMedia("video"); ok {
			media = append(media, value)
		}
	}
	seenAudio := map[string]bool{}
	appendAudio := func(item studioResultMedia) {
		value, ok := item.toMedia("audio")
		key := value.StorageKey + "|" + value.URL
		if ok && !seenAudio[key] {
			seenAudio[key] = true
			media = append(media, value)
		}
	}
	if result.Audio != nil {
		appendAudio(*result.Audio)
	}
	for _, item := range result.Audios {
		appendAudio(item)
	}
	return media
}

// studioSettingsWhitelist 是作品卡片「再次生成」需要恢复的参数，不下发密钥、渠道地址等内部配置。
var studioSettingsWhitelist = []string{"model", "size", "quality", "imageResolution", "videoSeconds", "vquality", "videoGenerateAudio", "videoWatermark", "audioVoice", "audioFormat", "audioSpeed"}

func studioSettingsFromInput(raw string) (string, map[string]any) {
	var input struct {
		Mode     string         `json:"mode"`
		Prompt   string         `json:"prompt"`
		Config   map[string]any `json:"config"`
		Metadata map[string]any `json:"metadata"`
	}
	if json.Unmarshal([]byte(raw), &input) != nil {
		return "", nil
	}
	settings := map[string]any{"mode": input.Mode}
	for _, key := range studioSettingsWhitelist {
		if value, exists := input.Config[key]; exists && value != nil && value != "" {
			settings[key] = value
		}
	}
	if videoMode, ok := input.Metadata["videoMode"].(string); ok && videoMode != "" {
		settings["videoMode"] = videoMode
	}
	if value, ok := input.Metadata["brandKitId"].(string); ok && value != "" {
		settings["brandKitId"] = value
	}
	// 专项工具的选项（光线、目标语言等）只保留短字符串值。
	if options, ok := input.Metadata["specialtyOptions"].(map[string]any); ok {
		clean := map[string]any{}
		for key, value := range options {
			if text, isText := value.(string); isText && len(key) <= 40 && len(text) <= 40 {
				clean[key] = text
			}
		}
		if len(clean) > 0 {
			settings["specialtyOptions"] = clean
		}
	}
	// studioPrompt 可以是空字符串（专项工具没写补充说明），空值也要保留，前端据此不回填指令原文。
	if value, ok := input.Metadata["studioPrompt"].(string); ok {
		settings["studioPrompt"] = truncateRunes(value, 20000)
	}
	tool, _ := input.Metadata["studioTool"].(string)
	return strings.TrimSpace(tool), settings
}

func (s *Service) SetStudioFavorite(userID string, taskID string, favorite bool) error {
	owned, err := s.repo.StudioTaskOwned(userID, strings.TrimSpace(taskID))
	if err != nil {
		return err
	}
	if !owned {
		return NotFound("作品不存在")
	}
	return s.repo.SetStudioFavorite(userID, strings.TrimSpace(taskID), favorite)
}

// HideStudioWorks 批量删除作品。只处理属于该用户的 Studio 作品，其余 ID 忽略。
func (s *Service) HideStudioWorks(userID string, taskIDs []string) (int, error) {
	if len(taskIDs) > 200 {
		return 0, BadAuthRequest("一次最多删除 200 个作品")
	}
	owned, err := s.repo.StudioOwnedTaskIDs(userID, taskIDs)
	if err != nil {
		return 0, err
	}
	if err := s.repo.HideStudioTasks(userID, owned); err != nil {
		return 0, err
	}
	return len(owned), nil
}

type StudioPreferenceView struct {
	Surface string `json:"surface"`
}

func (s *Service) StudioPreference(userID string) (StudioPreferenceView, error) {
	preference, err := s.repo.StudioPreference(userID)
	if err != nil {
		return StudioPreferenceView{}, err
	}
	if preference == nil {
		return StudioPreferenceView{}, nil
	}
	return StudioPreferenceView{Surface: preference.Surface}, nil
}

func (s *Service) SaveStudioPreference(userID string, surface string) (StudioPreferenceView, error) {
	surface = strings.TrimSpace(surface)
	if surface != model.StudioSurfaceStudio && surface != model.StudioSurfaceCanvas {
		return StudioPreferenceView{}, BadAuthRequest("界面选择无效")
	}
	if err := s.repo.SaveStudioPreference(model.StudioPreference{UserID: userID, Surface: surface, UpdatedAt: time.Now().UTC()}); err != nil {
		return StudioPreferenceView{}, err
	}
	return StudioPreferenceView{Surface: surface}, nil
}
