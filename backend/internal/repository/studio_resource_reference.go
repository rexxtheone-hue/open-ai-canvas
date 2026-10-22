package repository

import (
	"strings"

	"yingce/backend/internal/model"
)

// studioResourceReferences 找出 AI Studio 数据里仍在使用的资源，供资源清理与删除前的引用检查。
// Studio 的 JSON 字段格式不统一（有的存 resource:ID，有的只存 ID 列表），这里按资源 ID
// 子串保守匹配：宁可多保留，也不能把还在用的上传、封面或声音样本当成孤儿删掉。
func (r *Repository) studioResourceReferences(userID string, resourceIDs []string) ([]ResourceDirectReference, error) {
	references := []ResourceDirectReference{}
	if len(resourceIDs) == 0 {
		return references, nil
	}
	add := func(kind, id, title, resourceID string) {
		references = append(references, ResourceDirectReference{Kind: kind, ID: id, Title: title, ResourceID: resourceID})
	}
	// 表不存在（例如只建了部分表的测试库）就不可能有引用，直接跳过。
	missing := func(table any) bool { return !r.db.Migrator().HasTable(table) }

	// 工具封面是全站共用的，不按上传者过滤。
	var covers []model.StudioToolCover
	if !missing(&model.StudioToolCover{}) {
		if err := r.db.Where("resource_id IN ?", resourceIDs).Find(&covers).Error; err != nil {
			return nil, err
		}
	}
	for _, cover := range covers {
		add("Studio 工具封面", cover.ToolID, cover.ToolID, cover.ResourceID)
	}

	var uploads []model.StudioUpload
	if !missing(&model.StudioUpload{}) {
		if err := r.db.Where("user_id = ? AND resource_id IN ?", userID, resourceIDs).Find(&uploads).Error; err != nil {
			return nil, err
		}
	}
	for _, upload := range uploads {
		add("Studio 上传", upload.ID, upload.Name, upload.ResourceID)
	}

	var voices []model.StudioVoice
	if !missing(&model.StudioVoice{}) {
		if err := r.db.Where("user_id = ? AND resource_id IN ?", userID, resourceIDs).Find(&voices).Error; err != nil {
			return nil, err
		}
	}
	for _, voice := range voices {
		add("Studio 声音", voice.ID, voice.Name, voice.ResourceID)
	}

	var profiles []model.StudioProfile
	if !missing(&model.StudioProfile{}) {
		if err := r.db.Where("user_id = ? AND (avatar_resource_id IN ? OR cover_resource_id IN ?)", userID, resourceIDs, resourceIDs).Find(&profiles).Error; err != nil {
			return nil, err
		}
	}
	for _, profile := range profiles {
		for _, resourceID := range []string{profile.AvatarResourceID, profile.CoverResourceID} {
			if resourceID != "" {
				add("Studio 主页", profile.UserID, profile.Name, resourceID)
			}
		}
	}

	documents := []struct {
		kind, id, title string
		texts           []string
	}{}
	var kits []model.StudioBrandKit
	if !missing(&model.StudioBrandKit{}) {
		if err := r.db.Where("user_id = ?", userID).Find(&kits).Error; err != nil {
			return nil, err
		}
	}
	for _, kit := range kits {
		documents = append(documents, struct {
			kind, id, title string
			texts           []string
		}{"Studio 品牌套件", kit.ID, kit.Name, []string{kit.LogoResourceID, kit.AssetsJSON, kit.StylesJSON}})
	}
	var characters []model.StudioCharacter
	if !missing(&model.StudioCharacter{}) {
		if err := r.db.Select("id", "name", "images_json").Where("user_id = ?", userID).Find(&characters).Error; err != nil {
			return nil, err
		}
	}
	for _, character := range characters {
		documents = append(documents, struct {
			kind, id, title string
			texts           []string
		}{"Studio 角色", character.ID, character.Name, []string{character.ImagesJSON}})
	}
	var posts []model.StudioPost
	if !missing(&model.StudioPost{}) {
		if err := r.db.Select("id", "title", "settings_json", "media_json").Where("user_id = ?", userID).Find(&posts).Error; err != nil {
			return nil, err
		}
	}
	for _, post := range posts {
		documents = append(documents, struct {
			kind, id, title string
			texts           []string
		}{"Studio 作品", post.ID, post.Title, []string{post.SettingsJSON, post.MediaJSON}})
	}
	var messages []model.StudioChatMessage
	if !missing(&model.StudioChatMessage{}) {
		if err := r.db.Select("id", "actions_json", "attach_json").Where("user_id = ? AND (attach_json <> '' OR actions_json <> '')", userID).Find(&messages).Error; err != nil {
			return nil, err
		}
	}
	for _, message := range messages {
		documents = append(documents, struct {
			kind, id, title string
			texts           []string
		}{"Studio 对话", message.ID, "", []string{message.AttachJSON, message.ActionsJSON}})
	}
	var stories []model.StudioStory
	if !missing(&model.StudioStory{}) {
		if err := r.db.Select("id", "title", "brief_json", "memory_json", "settings_json").Where("user_id = ?", userID).Find(&stories).Error; err != nil {
			return nil, err
		}
	}
	for _, story := range stories {
		documents = append(documents, struct {
			kind, id, title string
			texts           []string
		}{"Studio 导演项目", story.ID, story.Title, []string{story.BriefJSON, story.MemoryJSON, story.SettingsJSON}})
	}
	var shots []model.StudioShot
	if !missing(&model.StudioShot{}) {
		if err := r.db.Select("id", "fields_json").Where("user_id = ?", userID).Find(&shots).Error; err != nil {
			return nil, err
		}
	}
	for _, shot := range shots {
		documents = append(documents, struct {
			kind, id, title string
			texts           []string
		}{"Studio 镜头", shot.ID, "", []string{shot.FieldsJSON}})
	}

	for _, document := range documents {
		for _, text := range document.texts {
			if text == "" {
				continue
			}
			for _, resourceID := range resourceIDs {
				if resourceID != "" && strings.Contains(text, resourceID) {
					add(document.kind, document.id, document.title, resourceID)
				}
			}
		}
	}
	return references, nil
}
