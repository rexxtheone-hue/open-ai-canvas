package app

import (
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

const studioPostMediaTTL = 12 * time.Hour

type StudioPublishInput struct {
	Title      string `json:"title"`
	AllowRemix bool   `json:"allowRemix"`
}

type StudioPostMedia struct {
	Kind       string `json:"kind"`
	URL        string `json:"url"`
	MimeType   string `json:"mimeType,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
}

type StudioPostView struct {
	ID         string            `json:"id"`
	Kind       string            `json:"kind"`
	Tool       string            `json:"tool"`
	Title      string            `json:"title"`
	Prompt     string            `json:"prompt,omitempty"`
	Settings   map[string]any    `json:"settings,omitempty"`
	Media      []StudioPostMedia `json:"media"`
	Author     string            `json:"author"`
	Mine       bool              `json:"mine"`
	Liked      bool              `json:"liked"`
	LikeCount  int64             `json:"likeCount"`
	RemixCount int64             `json:"remixCount"`
	Featured   bool              `json:"featured"`
	IsTemplate bool              `json:"isTemplate"`
	AllowRemix bool              `json:"allowRemix"`
	Hidden     bool              `json:"hidden,omitempty"`
	CreatedAt  time.Time         `json:"createdAt"`
}

type StudioPostPage struct {
	Posts      []StudioPostView `json:"posts"`
	NextOffset int              `json:"nextOffset,omitempty"`
}

type StudioCommunityQuery struct {
	Kind      string
	Sort      string
	Templates bool
	Featured  bool
	Mine      bool
	Search    string
	Offset    int
	Limit     int
}

type StudioRemix struct {
	Kind     string         `json:"kind"`
	Tool     string         `json:"tool"`
	Prompt   string         `json:"prompt"`
	Settings map[string]any `json:"settings"`
}

type StudioPostAdminInput struct {
	Featured   *bool `json:"featured"`
	IsTemplate *bool `json:"isTemplate"`
	Hidden     *bool `json:"hidden"`
}

// PublishStudioWork 把自己已完成的 Studio 作品发布到社区。只发布已保存到资源库的产物。
func (s *Service) PublishStudioWork(userID, taskID string, input StudioPublishInput) (StudioPostView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" || utf8.RuneCountInString(title) > 60 {
		return StudioPostView{}, BadAuthRequest("标题不能为空且不能超过 60 个字")
	}
	task, err := s.repo.StudioTask(userID, strings.TrimSpace(taskID))
	if err != nil {
		return StudioPostView{}, err
	}
	if task == nil || !strings.HasPrefix(task.WorkbenchKind, "studio-") {
		return StudioPostView{}, NotFound("作品不存在")
	}
	if task.Status != model.TaskStatusSucceeded {
		return StudioPostView{}, BadAuthRequest("作品完成后才能发布")
	}
	media := make([]StudioMedia, 0)
	for _, item := range studioMediaFromResult(task.ResultJSON) {
		if strings.HasPrefix(item.StorageKey, "resource:") {
			media = append(media, item)
		}
	}
	if len(media) == 0 {
		return StudioPostView{}, BadAuthRequest("作品文件还没有保存完成，暂时不能发布")
	}
	existing, err := s.repo.StudioPostByTask(task.ID)
	if err != nil {
		return StudioPostView{}, err
	}
	tool, settings := studioSettingsFromInput(task.InputJSON)
	prompt := task.Prompt
	// 专项工具的补充说明可能为空：保留原值，做同款时填回补充说明而不是完整指令。
	if userPrompt, ok := settings["studioPrompt"].(string); ok {
		delete(settings, "studioPrompt")
		settings["userPrompt"] = userPrompt
		if strings.TrimSpace(userPrompt) != "" {
			prompt = userPrompt
		}
	}
	delete(settings, "brandKitId")
	settingsJSON, _ := json.Marshal(settings)
	mediaJSON, _ := json.Marshal(media)
	now := time.Now().UTC()
	post := model.StudioPost{
		ID: newID(), UserID: userID, TaskID: task.ID, Kind: strings.TrimPrefix(task.WorkbenchKind, "studio-"), Tool: tool,
		Title: title, Prompt: truncateRunes(prompt, 20000), SettingsJSON: string(settingsJSON), MediaJSON: string(mediaJSON),
		Status: model.StudioPostPublished, AllowRemix: input.AllowRemix, CreatedAt: now, UpdatedAt: now,
	}
	if existing != nil {
		// 重新发布只更新标题和是否允许做同款，保留点赞、精选等状态。
		post = *existing
		post.Title, post.AllowRemix, post.UpdatedAt = title, input.AllowRemix, now
	}
	if err := s.repo.SaveStudioPost(&post); err != nil {
		return StudioPostView{}, err
	}
	views, err := s.studioPostViews(userID, false, []model.StudioPost{post})
	if err != nil {
		return StudioPostView{}, err
	}
	return views[0], nil
}

func (s *Service) StudioCommunity(viewerID string, query StudioCommunityQuery) (StudioPostPage, error) {
	kind := ""
	if query.Kind != "" && query.Kind != "all" {
		if _, err := studioKindForFilter(query.Kind); err != nil {
			return StudioPostPage{}, err
		}
		kind = query.Kind
	}
	repoQuery := repository.StudioPostQuery{Kind: kind, Sort: query.Sort, Templates: query.Templates, Featured: query.Featured, Search: query.Search, Offset: max(query.Offset, 0), Limit: query.Limit}
	if query.Mine {
		repoQuery.UserID = viewerID
	}
	posts, hasMore, err := s.repo.StudioPosts(repoQuery)
	if err != nil {
		return StudioPostPage{}, err
	}
	views, err := s.studioPostViews(viewerID, false, posts)
	if err != nil {
		return StudioPostPage{}, err
	}
	page := StudioPostPage{Posts: views}
	if hasMore {
		page.NextOffset = repoQuery.Offset + len(posts)
	}
	return page, nil
}

func (s *Service) AdminStudioCommunity(actor *model.User, query StudioCommunityQuery) (StudioPostPage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return StudioPostPage{}, err
	}
	posts, hasMore, err := s.repo.StudioPosts(repository.StudioPostQuery{Sort: "latest", Templates: query.Templates, Featured: query.Featured, Search: query.Search, Offset: max(query.Offset, 0), Limit: query.Limit, IncludeHidden: true})
	if err != nil {
		return StudioPostPage{}, err
	}
	views, err := s.studioPostViews(actor.ID, true, posts)
	if err != nil {
		return StudioPostPage{}, err
	}
	page := StudioPostPage{Posts: views}
	if hasMore {
		page.NextOffset = max(query.Offset, 0) + len(posts)
	}
	return page, nil
}

func (s *Service) UpdateStudioPostAdmin(actor *model.User, id string, input StudioPostAdminInput) (StudioPostView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return StudioPostView{}, err
	}
	post, err := s.repo.StudioPost(strings.TrimSpace(id))
	if err != nil {
		return StudioPostView{}, err
	}
	if post == nil {
		return StudioPostView{}, NotFound("社区作品不存在")
	}
	if input.Featured != nil {
		post.Featured = *input.Featured
	}
	if input.IsTemplate != nil {
		post.IsTemplate = *input.IsTemplate
	}
	if input.Hidden != nil {
		post.Status = model.StudioPostPublished
		if *input.Hidden {
			post.Status = model.StudioPostHidden
		}
	}
	post.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveStudioPost(post); err != nil {
		return StudioPostView{}, err
	}
	views, err := s.studioPostViews(actor.ID, true, []model.StudioPost{*post})
	if err != nil {
		return StudioPostView{}, err
	}
	return views[0], nil
}

// DeleteStudioPost：作者撤回或管理员删除。作品本身仍在作者的作品库里。
func (s *Service) DeleteStudioPost(actor *model.User, id string) error {
	post, err := s.repo.StudioPost(strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if post == nil {
		return NotFound("社区作品不存在")
	}
	if post.UserID != actor.ID && s.RequireAdmin(actor) != nil {
		return Forbidden("只能撤回自己发布的作品")
	}
	return s.repo.DeleteStudioPost(post.ID)
}

func (s *Service) LikeStudioPost(userID, id string, liked bool) (int64, error) {
	post, err := s.repo.StudioPost(strings.TrimSpace(id))
	if err != nil {
		return 0, err
	}
	if post == nil || post.Status != model.StudioPostPublished {
		return 0, NotFound("社区作品不存在")
	}
	return s.repo.SetStudioPostLike(post.ID, userID, liked)
}

// RemixStudioPost「做同款」：返回作品的工具、提示词和参数，由前端填进对应工具。
func (s *Service) RemixStudioPost(userID, id string) (StudioRemix, error) {
	post, err := s.repo.StudioPost(strings.TrimSpace(id))
	if err != nil {
		return StudioRemix{}, err
	}
	if post == nil || (post.Status != model.StudioPostPublished && post.UserID != userID) {
		return StudioRemix{}, NotFound("社区作品不存在")
	}
	if !post.AllowRemix && post.UserID != userID {
		return StudioRemix{}, Forbidden("作者没有开放做同款")
	}
	settings := map[string]any{}
	_ = json.Unmarshal([]byte(post.SettingsJSON), &settings)
	if post.UserID != userID {
		if err := s.repo.IncrementStudioPostRemix(post.ID); err != nil {
			return StudioRemix{}, err
		}
	}
	return StudioRemix{Kind: post.Kind, Tool: post.Tool, Prompt: post.Prompt, Settings: settings}, nil
}

func (s *Service) studioPostViews(viewerID string, admin bool, posts []model.StudioPost) ([]StudioPostView, error) {
	ids := make([]string, 0, len(posts))
	authors := make([]string, 0, len(posts))
	for _, post := range posts {
		ids = append(ids, post.ID)
		authors = append(authors, post.UserID)
	}
	liked, err := s.repo.StudioLikedPostIDs(viewerID, ids)
	if err != nil {
		return nil, err
	}
	names, err := s.repo.UserDisplayNames(authors)
	if err != nil {
		return nil, err
	}
	expires := time.Now().Add(studioPostMediaTTL)
	views := make([]StudioPostView, 0, len(posts))
	for _, post := range posts {
		mine := post.UserID == viewerID
		view := StudioPostView{
			ID: post.ID, Kind: post.Kind, Tool: post.Tool, Title: post.Title, Author: names[post.UserID], Mine: mine, Liked: liked[post.ID],
			LikeCount: post.LikeCount, RemixCount: post.RemixCount, Featured: post.Featured, IsTemplate: post.IsTemplate, AllowRemix: post.AllowRemix,
			Hidden: post.Status == model.StudioPostHidden, CreatedAt: post.CreatedAt, Media: []StudioPostMedia{},
		}
		// 作者没开放做同款时，别人看不到提示词和参数。
		if post.AllowRemix || mine || admin {
			view.Prompt = post.Prompt
			view.Settings = map[string]any{}
			_ = json.Unmarshal([]byte(post.SettingsJSON), &view.Settings)
		}
		var media []StudioMedia
		_ = json.Unmarshal([]byte(post.MediaJSON), &media)
		for _, item := range media {
			resource, err := s.repo.Resource(strings.TrimPrefix(item.StorageKey, "resource:"))
			if err != nil || resource == nil || resource.UserID != post.UserID {
				continue
			}
			link, err := s.signedResourceAccessURL(resource, assets.VariantOriginal, expires, false)
			if err != nil {
				return nil, err
			}
			view.Media = append(view.Media, StudioPostMedia{Kind: item.Kind, URL: link, MimeType: item.MimeType, Width: item.Width, Height: item.Height, DurationMs: item.DurationMs})
		}
		views = append(views, view)
	}
	return views, nil
}
