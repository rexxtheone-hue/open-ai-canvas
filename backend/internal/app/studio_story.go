package app

import (
	"encoding/json"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

var studioStoryRatios = map[string]bool{"9:16": true, "16:9": true, "1:1": true, "4:5": true}

type StudioStoryInput struct {
	Title           string          `json:"title"`
	Ratio           string          `json:"ratio"`
	DurationSeconds int             `json:"durationSeconds"`
	Brief           json.RawMessage `json:"brief"`
	Memory          json.RawMessage `json:"memory"`
	Settings        json.RawMessage `json:"settings"`
	Status          string          `json:"status"`
}

type StudioScenePlan struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Shots       []StudioShotPlan `json:"shots"`
}

type StudioShotPlan struct {
	ID              string          `json:"id"`
	DurationSeconds int             `json:"durationSeconds"`
	Fields          json.RawMessage `json:"fields"`
}

type StudioShotVersionView struct {
	model.StudioShotVersion
	Work *StudioWork `json:"work,omitempty"`
}

type StudioShotView struct {
	model.StudioShot
	Fields json.RawMessage `json:"fields,omitempty"`
}

type StudioRenderView struct {
	TaskID     string `json:"taskId"`
	Status     string `json:"status"`
	ResourceID string `json:"resourceId,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Error      string `json:"error,omitempty"`
	Progress   int    `json:"progress,omitempty"`
}

type StudioStoryView struct {
	model.StudioStory
	Brief     json.RawMessage         `json:"brief,omitempty"`
	Memory    json.RawMessage         `json:"memory,omitempty"`
	Settings  json.RawMessage         `json:"settings,omitempty"`
	SessionID string                  `json:"sessionId,omitempty"`
	Scenes    []model.StudioScene     `json:"scenes"`
	Shots     []StudioShotView        `json:"shots"`
	Versions  []StudioShotVersionView `json:"versions"`
	Render    *StudioRenderView       `json:"render,omitempty"`
}

func (s *Service) applyStudioStoryInput(story *model.StudioStory, input StudioStoryInput) error {
	var err error
	if story.Title, err = limitText(input.Title, 60, "项目名称太长"); err != nil {
		return err
	}
	if story.Title == "" {
		story.Title = "未命名导演项目"
	}
	ratio := strings.TrimSpace(input.Ratio)
	if ratio == "" {
		ratio = "9:16"
	}
	if !studioStoryRatios[ratio] {
		return BadAuthRequest("画面比例无效")
	}
	story.Ratio = ratio
	if input.DurationSeconds < 5 || input.DurationSeconds > 600 {
		return BadAuthRequest("成片时长需要在 5 到 600 秒之间")
	}
	story.DurationSeconds = input.DurationSeconds
	if story.BriefJSON, err = studioJSON(input.Brief, "简报格式无效", false); err != nil {
		return err
	}
	if story.MemoryJSON, err = studioJSON(input.Memory, "项目记忆格式无效", false); err != nil {
		return err
	}
	if story.SettingsJSON, err = studioJSON(input.Settings, "项目设置格式无效", false); err != nil {
		return err
	}
	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "planning"
	}
	if len(status) > 24 {
		return BadAuthRequest("项目状态无效")
	}
	story.Status = status
	return nil
}

func (s *Service) StudioStories(userID string) ([]model.StudioStory, error) {
	return s.repo.StudioStories(userID, 100)
}

// CreateStudioStory 新建导演项目并配一个导演会话，对话记录随项目保存。
func (s *Service) CreateStudioStory(userID string, input StudioStoryInput) (StudioStoryView, error) {
	now := time.Now().UTC()
	story := model.StudioStory{ID: newID(), UserID: userID, CreatedAt: now, UpdatedAt: now}
	if err := s.applyStudioStoryInput(&story, input); err != nil {
		return StudioStoryView{}, err
	}
	if err := s.repo.SaveStudioStory(&story); err != nil {
		return StudioStoryView{}, err
	}
	session := model.StudioChatSession{ID: newID(), UserID: userID, Mode: StudioChatModeDirector, StoryID: story.ID, Title: story.Title, CreatedAt: now, UpdatedAt: now}
	if err := s.repo.SaveStudioChatSession(&session); err != nil {
		return StudioStoryView{}, err
	}
	return s.StudioStory(userID, story.ID)
}

func (s *Service) UpdateStudioStory(userID, id string, input StudioStoryInput) (StudioStoryView, error) {
	story, err := s.repo.StudioStory(userID, strings.TrimSpace(id))
	if err != nil {
		return StudioStoryView{}, err
	}
	if story == nil {
		return StudioStoryView{}, NotFound("导演项目不存在")
	}
	if err := s.applyStudioStoryInput(story, input); err != nil {
		return StudioStoryView{}, err
	}
	story.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveStudioStory(story); err != nil {
		return StudioStoryView{}, err
	}
	return s.StudioStory(userID, story.ID)
}

func (s *Service) DeleteStudioStory(userID, id string) error {
	story, err := s.repo.StudioStory(userID, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if story == nil {
		return NotFound("导演项目不存在")
	}
	return s.repo.DeleteStudioStory(userID, story.ID)
}

func (s *Service) StudioStory(userID, id string) (StudioStoryView, error) {
	story, err := s.repo.StudioStory(userID, strings.TrimSpace(id))
	if err != nil {
		return StudioStoryView{}, err
	}
	if story == nil {
		return StudioStoryView{}, NotFound("导演项目不存在")
	}
	tree, err := s.repo.StudioStoryTree(userID, story.ID)
	if err != nil {
		return StudioStoryView{}, err
	}
	view := StudioStoryView{StudioStory: *story, Brief: rawOrNull(story.BriefJSON), Memory: rawOrNull(story.MemoryJSON), Settings: rawOrNull(story.SettingsJSON), Scenes: tree.Scenes, Shots: make([]StudioShotView, 0, len(tree.Shots)), Versions: make([]StudioShotVersionView, 0, len(tree.Versions))}
	if view.Scenes == nil {
		view.Scenes = []model.StudioScene{}
	}
	if session, err := s.repo.StudioChatSessionForStory(userID, story.ID); err == nil && session != nil {
		view.SessionID = session.ID
	}
	for _, shot := range tree.Shots {
		view.Shots = append(view.Shots, StudioShotView{StudioShot: shot, Fields: rawOrNull(shot.FieldsJSON)})
	}
	taskIDs := make([]string, 0, len(tree.Versions)+1)
	for _, version := range tree.Versions {
		taskIDs = append(taskIDs, version.TaskID)
	}
	if story.RenderTaskID != "" {
		taskIDs = append(taskIDs, story.RenderTaskID)
	}
	tasks, err := s.repo.UserTasksByIDs(userID, taskIDs)
	if err != nil {
		return StudioStoryView{}, err
	}
	orders, err := s.repo.BillingOrdersByTaskIDs(userID, taskBillingTaskIDs(tasks))
	if err != nil {
		return StudioStoryView{}, err
	}
	summaries := taskSummariesForOutputWithBilling(tasks, orders)
	works := make(map[string]StudioWork, len(tasks))
	byID := make(map[string]model.Task, len(tasks))
	for index, task := range tasks {
		byID[task.ID] = task
		works[task.ID] = studioWorkFromTask(task, summaries[index], false)
	}
	for _, version := range tree.Versions {
		item := StudioShotVersionView{StudioShotVersion: version}
		if work, ok := works[version.TaskID]; ok {
			copied := work
			item.Work = &copied
		}
		view.Versions = append(view.Versions, item)
	}
	if task, ok := byID[story.RenderTaskID]; ok {
		render := &StudioRenderView{TaskID: task.ID, Status: string(task.Status), Progress: task.Progress}
		if task.Status == model.TaskStatusFailed {
			render.Error = truncateRunes(task.Error, 500)
		}
		var result timelineRenderResult
		if json.Unmarshal([]byte(task.ResultJSON), &result) == nil {
			render.ResourceID, render.DurationMs = result.ResourceID, result.DurationMs
		}
		view.Render = render
		if view.Status == "rendering" && task.Status == model.TaskStatusSucceeded {
			view.Status = "done"
		}
	}
	return view, nil
}

// ReplaceStudioStoryPlan 用导演写好的分镜整体替换项目的场景和镜头。已有镜头 ID 保留版本。
func (s *Service) ReplaceStudioStoryPlan(userID, id string, scenes []StudioScenePlan) (StudioStoryView, error) {
	story, err := s.repo.StudioStory(userID, strings.TrimSpace(id))
	if err != nil {
		return StudioStoryView{}, err
	}
	if story == nil {
		return StudioStoryView{}, NotFound("导演项目不存在")
	}
	tree, err := s.repo.StudioStoryTree(userID, story.ID)
	if err != nil {
		return StudioStoryView{}, err
	}
	existingShots := map[string]model.StudioShot{}
	for _, shot := range tree.Shots {
		existingShots[shot.ID] = shot
	}
	existingScenes := map[string]model.StudioScene{}
	for _, scene := range tree.Scenes {
		existingScenes[scene.ID] = scene
	}
	now := time.Now().UTC()
	sceneRows := make([]model.StudioScene, 0, len(scenes))
	shotRows := []model.StudioShot{}
	seen := map[string]bool{}
	for sceneIndex, plan := range scenes {
		scene := model.StudioScene{ID: newID(), StoryID: story.ID, UserID: userID, CreatedAt: now}
		if previous, ok := existingScenes[strings.TrimSpace(plan.ID)]; ok && !seen[previous.ID] {
			scene.ID, scene.CreatedAt = previous.ID, previous.CreatedAt
		}
		seen[scene.ID] = true
		if scene.Title, err = limitText(plan.Title, 80, "场景名称太长"); err != nil {
			return StudioStoryView{}, err
		}
		if scene.Description, err = limitText(plan.Description, 2000, "场景描述太长"); err != nil {
			return StudioStoryView{}, err
		}
		scene.Sort, scene.UpdatedAt = sceneIndex, now
		sceneRows = append(sceneRows, scene)
		for _, shotPlan := range plan.Shots {
			shot := model.StudioShot{ID: newID(), StoryID: story.ID, UserID: userID, CreatedAt: now}
			if previous, ok := existingShots[strings.TrimSpace(shotPlan.ID)]; ok && !seen[previous.ID] {
				shot = previous
			}
			seen[shot.ID] = true
			if shotPlan.DurationSeconds < 1 || shotPlan.DurationSeconds > 60 {
				return StudioStoryView{}, BadAuthRequest("每个镜头时长需要在 1 到 60 秒之间")
			}
			if shot.FieldsJSON, err = studioJSON(shotPlan.Fields, "镜头内容格式无效", false); err != nil {
				return StudioStoryView{}, err
			}
			shot.SceneID, shot.Sort, shot.DurationSeconds, shot.UpdatedAt = scene.ID, len(shotRows), shotPlan.DurationSeconds, now
			shotRows = append(shotRows, shot)
		}
	}
	if len(shotRows) > studioShotLimit {
		return StudioStoryView{}, BadAuthRequest("一个项目最多 60 个镜头")
	}
	story.UpdatedAt = now
	if err := s.repo.ReplaceStudioStoryPlan(story, sceneRows, shotRows); err != nil {
		return StudioStoryView{}, err
	}
	return s.StudioStory(userID, story.ID)
}

type StudioShotPatch struct {
	DurationSeconds      *int            `json:"durationSeconds"`
	Fields               json.RawMessage `json:"fields"`
	ActiveImageVersionID *string         `json:"activeImageVersionId"`
	ActiveVideoVersionID *string         `json:"activeVideoVersionId"`
	ActiveVoiceVersionID *string         `json:"activeVoiceVersionId"`
}

func (s *Service) PatchStudioShot(userID, storyID, shotID string, patch StudioShotPatch) (StudioStoryView, error) {
	shot, err := s.repo.StudioShot(userID, strings.TrimSpace(storyID), strings.TrimSpace(shotID))
	if err != nil {
		return StudioStoryView{}, err
	}
	if shot == nil {
		return StudioStoryView{}, NotFound("镜头不存在")
	}
	if patch.DurationSeconds != nil {
		if *patch.DurationSeconds < 1 || *patch.DurationSeconds > 60 {
			return StudioStoryView{}, BadAuthRequest("每个镜头时长需要在 1 到 60 秒之间")
		}
		shot.DurationSeconds = *patch.DurationSeconds
	}
	if len(patch.Fields) > 0 {
		if shot.FieldsJSON, err = studioJSON(patch.Fields, "镜头内容格式无效", false); err != nil {
			return StudioStoryView{}, err
		}
	}
	activate := func(target *string, value *string, kind string) error {
		if value == nil {
			return nil
		}
		id := strings.TrimSpace(*value)
		if id == "" {
			*target = ""
			return nil
		}
		version, err := s.repo.StudioShotVersion(userID, shot.ID, id)
		if err != nil {
			return err
		}
		if version == nil || version.Kind != kind {
			return BadAuthRequest("版本不存在")
		}
		*target = id
		return nil
	}
	if err := activate(&shot.ActiveImageVersionID, patch.ActiveImageVersionID, "image"); err != nil {
		return StudioStoryView{}, err
	}
	if err := activate(&shot.ActiveVideoVersionID, patch.ActiveVideoVersionID, "video"); err != nil {
		return StudioStoryView{}, err
	}
	if err := activate(&shot.ActiveVoiceVersionID, patch.ActiveVoiceVersionID, "audio"); err != nil {
		return StudioStoryView{}, err
	}
	shot.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveStudioShot(shot); err != nil {
		return StudioStoryView{}, err
	}
	return s.StudioStory(userID, shot.StoryID)
}

// AddStudioShotVersion 记录镜头的一次生成。任务必须是本人的 Studio 生成任务，且类型与版本一致。
func (s *Service) AddStudioShotVersion(userID, storyID, shotID, kind, taskID string) (StudioStoryView, error) {
	shot, err := s.repo.StudioShot(userID, strings.TrimSpace(storyID), strings.TrimSpace(shotID))
	if err != nil {
		return StudioStoryView{}, err
	}
	if shot == nil {
		return StudioStoryView{}, NotFound("镜头不存在")
	}
	if kind != "image" && kind != "video" && kind != "audio" {
		return StudioStoryView{}, BadAuthRequest("版本类型无效")
	}
	tasks, err := s.repo.UserTasksByIDs(userID, []string{strings.TrimSpace(taskID)})
	if err != nil {
		return StudioStoryView{}, err
	}
	if len(tasks) == 0 || tasks[0].WorkbenchKind != "studio-"+kind {
		return StudioStoryView{}, BadAuthRequest("生成任务不存在或类型不符")
	}
	version := model.StudioShotVersion{ID: newID(), ShotID: shot.ID, StoryID: shot.StoryID, UserID: userID, Kind: kind, TaskID: tasks[0].ID, Seq: studioSeq(), CreatedAt: time.Now().UTC()}
	switch kind {
	case "image":
		shot.ActiveImageVersionID = version.ID
	case "video":
		shot.ActiveVideoVersionID = version.ID
	default:
		shot.ActiveVoiceVersionID = version.ID
	}
	shot.UpdatedAt = version.CreatedAt
	if err := s.repo.AddStudioShotVersion(&version, shot); err != nil {
		return StudioStoryView{}, err
	}
	return s.StudioStory(userID, shot.StoryID)
}

// SetStudioStoryRender 记录成片合成任务（本人的时间线渲染任务）。
func (s *Service) SetStudioStoryRender(userID, storyID, taskID string) (StudioStoryView, error) {
	story, err := s.repo.StudioStory(userID, strings.TrimSpace(storyID))
	if err != nil {
		return StudioStoryView{}, err
	}
	if story == nil {
		return StudioStoryView{}, NotFound("导演项目不存在")
	}
	tasks, err := s.repo.UserTasksByIDs(userID, []string{strings.TrimSpace(taskID)})
	if err != nil {
		return StudioStoryView{}, err
	}
	if len(tasks) == 0 || tasks[0].Type != model.TaskTypeTimelineRender {
		return StudioStoryView{}, BadAuthRequest("合成任务不存在")
	}
	story.RenderTaskID, story.Status, story.UpdatedAt = tasks[0].ID, "rendering", time.Now().UTC()
	if err := s.repo.SaveStudioStory(story); err != nil {
		return StudioStoryView{}, err
	}
	return s.StudioStory(userID, story.ID)
}
