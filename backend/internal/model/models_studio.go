package model

import "time"

// AI Studio 任务复用 Task.WorkbenchKind 标记来源，便于按索引分页读取作品库。
const (
	StudioKindImage = "studio-image"
	StudioKindVideo = "studio-video"
	StudioKindAudio = "studio-audio"
)

// 用户进入网站后选择的界面：AI Studio 或 AI Canvas。
const (
	StudioSurfaceStudio = "studio"
	StudioSurfaceCanvas = "canvas"
)

// StudioKinds 是作品库允许读取的全部任务类型，顺序即筛选器展示顺序。
var StudioKinds = []string{StudioKindImage, StudioKindVideo, StudioKindAudio}

// StudioPreference 保存账号级的界面偏好，换设备也能回到上次使用的界面。
type StudioPreference struct {
	UserID    string    `json:"userId" gorm:"primaryKey;size:36"`
	Surface   string    `json:"surface" gorm:"size:16"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// StudioFavorite 记录作品库里被收藏的任务。
type StudioFavorite struct {
	UserID    string    `json:"userId" gorm:"primaryKey;size:36"`
	TaskID    string    `json:"taskId" gorm:"primaryKey;size:64;index"`
	CreatedAt time.Time `json:"createdAt"`
}

// StudioHiddenTask 记录用户从作品库删除的作品。任务与计费记录保留，只是不再展示。
type StudioHiddenTask struct {
	UserID    string    `json:"userId" gorm:"primaryKey;size:36"`
	TaskID    string    `json:"taskId" gorm:"primaryKey;size:64;index"`
	CreatedAt time.Time `json:"createdAt"`
}

// StudioBrandKit 是用户的品牌套件：生成时把品牌信息并入提示词，Logo 可加为参考图。
type StudioBrandKit struct {
	ID             string `json:"id" gorm:"primaryKey;size:36"`
	UserID         string `json:"userId" gorm:"index;size:36"`
	Name           string `json:"name" gorm:"size:80"`
	Intro          string `json:"intro" gorm:"type:text"`
	Audience       string `json:"audience" gorm:"size:400"`
	Tone           string `json:"tone" gorm:"size:400"`
	Slogan         string `json:"slogan" gorm:"size:200"`
	ColorsJSON     string `json:"-" gorm:"type:text"`
	LogoResourceID string `json:"logoResourceId" gorm:"size:36"`
	Avoid          string `json:"avoid" gorm:"size:600"`
	// Typography 是字体规范，例如「标题：思源黑体 Bold；正文：思源宋体」。
	Typography string `json:"typography" gorm:"size:400"`
	// AssetsJSON、StylesJSON 是品牌素材图和风格参考图的资源 ID 列表。
	AssetsJSON string    `json:"-" gorm:"type:text"`
	StylesJSON string    `json:"-" gorm:"type:text"`
	IsDefault  bool      `json:"isDefault"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// StudioPlan 是会员套餐：通过绑定了套餐的充值商品购买，按天数生效。
type StudioPlan struct {
	ID                string    `json:"id" gorm:"primaryKey;size:36"`
	Name              string    `json:"name" gorm:"size:80"`
	Description       string    `json:"description" gorm:"size:500"`
	Badge             string    `json:"badge" gorm:"size:24"`
	DurationDays      int       `json:"durationDays"`
	ActiveTaskLimit   int       `json:"activeTaskLimit"`
	CommercialLicense bool      `json:"commercialLicense"`
	Enabled           bool      `json:"enabled" gorm:"index"`
	SortOrder         int       `json:"sortOrder"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// UserMembership 记录用户当前会员套餐和到期时间；过期后自动回到普通用户权益。
type UserMembership struct {
	UserID    string    `json:"userId" gorm:"primaryKey;size:36"`
	PlanID    string    `json:"planId" gorm:"size:36;index"`
	StartedAt time.Time `json:"startedAt"`
	ExpiresAt time.Time `json:"expiresAt" gorm:"index"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const (
	StudioPostPublished = "published"
	StudioPostHidden    = "hidden"
)

// StudioPost 是发布到灵感社区的作品。媒体只保存资源存储键，展示时按需签发公开访问地址。
type StudioPost struct {
	ID           string    `json:"id" gorm:"primaryKey;size:36"`
	UserID       string    `json:"userId" gorm:"index;size:36"`
	TaskID       string    `json:"taskId" gorm:"uniqueIndex;size:64"`
	Kind         string    `json:"kind" gorm:"size:16;index"`
	Tool         string    `json:"tool" gorm:"size:40"`
	Title        string    `json:"title" gorm:"size:120"`
	Prompt       string    `json:"prompt" gorm:"type:text"`
	SettingsJSON string    `json:"-" gorm:"type:text"`
	MediaJSON    string    `json:"-" gorm:"type:text"`
	Status       string    `json:"status" gorm:"size:16;index"`
	Featured     bool      `json:"featured" gorm:"index"`
	IsTemplate   bool      `json:"isTemplate" gorm:"index"`
	AllowRemix   bool      `json:"allowRemix"`
	LikeCount    int64     `json:"likeCount" gorm:"index"`
	RemixCount   int64     `json:"remixCount"`
	CreatedAt    time.Time `json:"createdAt" gorm:"index"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type StudioPostLike struct {
	PostID    string    `json:"postId" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"primaryKey;size:36;index"`
	CreatedAt time.Time `json:"createdAt"`
}

// StudioToolCover 是管理员为 AI Studio 工具设置的封面图（资源 ID），工具列表和固定栏使用。
type StudioToolCover struct {
	ToolID     string    `json:"toolId" gorm:"primaryKey;size:40"`
	ResourceID string    `json:"resourceId" gorm:"size:36"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// StudioCharacter 是 AI Studio 自己的角色库，与 AI Canvas 的角色数据互不相通。
type StudioCharacter struct {
	ID     string `json:"id" gorm:"primaryKey;size:36"`
	UserID string `json:"userId" gorm:"index;size:36"`
	Name   string `json:"name" gorm:"size:80"`
	// Kind 区分角色、物体、背景和风格，都放在「角色与世界」资产库里。
	Kind        string    `json:"kind" gorm:"size:16;default:character"`
	Description string    `json:"description" gorm:"type:text"`
	ImagesJSON  string    `json:"-" gorm:"type:text"`
	VoiceName   string    `json:"voiceName" gorm:"size:120"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// StudioChatSession 是对话模式或导演模式的一段会话；导演会话关联一个故事。
type StudioChatSession struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	Mode      string    `json:"mode" gorm:"size:16;index"`
	StoryID   string    `json:"storyId,omitempty" gorm:"size:36;index"`
	Title     string    `json:"title" gorm:"size:120"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"index"`
}

type StudioChatMessage struct {
	ID          string `json:"id" gorm:"primaryKey;size:36"`
	SessionID   string `json:"sessionId" gorm:"index;size:36"`
	UserID      string `json:"userId" gorm:"index;size:36"`
	Role        string `json:"role" gorm:"size:16"`
	Content     string `json:"content" gorm:"type:text"`
	ActionsJSON string `json:"-" gorm:"type:text"`
	AttachJSON  string `json:"-" gorm:"type:text"`
	TaskID      string `json:"taskId,omitempty" gorm:"size:64"`
	// Seq 是写入顺序（纳秒时间戳）。SQLite 把时间存成文本、会省略小数末尾的 0，按 created_at 排序在同一秒内可能乱序。
	Seq       int64     `json:"-" gorm:"index"`
	CreatedAt time.Time `json:"createdAt" gorm:"index"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// StudioStory 是导演项目：故事 → 场景 → 镜头 → 版本。成片由镜头当前版本按顺序合成。
type StudioStory struct {
	ID              string    `json:"id" gorm:"primaryKey;size:36"`
	UserID          string    `json:"userId" gorm:"index;size:36"`
	Title           string    `json:"title" gorm:"size:120"`
	Ratio           string    `json:"ratio" gorm:"size:12"`
	DurationSeconds int       `json:"durationSeconds"`
	BriefJSON       string    `json:"-" gorm:"type:text"`
	MemoryJSON      string    `json:"-" gorm:"type:text"`
	SettingsJSON    string    `json:"-" gorm:"type:text"`
	Status          string    `json:"status" gorm:"size:24"`
	RenderTaskID    string    `json:"renderTaskId,omitempty" gorm:"size:64"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt" gorm:"index"`
}

type StudioScene struct {
	ID          string    `json:"id" gorm:"primaryKey;size:36"`
	StoryID     string    `json:"storyId" gorm:"index;size:36"`
	UserID      string    `json:"userId" gorm:"index;size:36"`
	Sort        int       `json:"sort"`
	Title       string    `json:"title" gorm:"size:120"`
	Description string    `json:"description" gorm:"type:text"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type StudioShot struct {
	ID                   string    `json:"id" gorm:"primaryKey;size:36"`
	StoryID              string    `json:"storyId" gorm:"index;size:36"`
	SceneID              string    `json:"sceneId" gorm:"index;size:36"`
	UserID               string    `json:"userId" gorm:"index;size:36"`
	Sort                 int       `json:"sort"`
	DurationSeconds      int       `json:"durationSeconds"`
	FieldsJSON           string    `json:"-" gorm:"type:text"`
	ActiveImageVersionID string    `json:"activeImageVersionId,omitempty" gorm:"size:36"`
	ActiveVideoVersionID string    `json:"activeVideoVersionId,omitempty" gorm:"size:36"`
	ActiveVoiceVersionID string    `json:"activeVoiceVersionId,omitempty" gorm:"size:36"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

// StudioShotVersion 是镜头的一次生成结果（画面、视频或配音），指向一个生成任务。
type StudioShotVersion struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	ShotID    string    `json:"shotId" gorm:"index;size:36"`
	StoryID   string    `json:"storyId" gorm:"index;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	Kind      string    `json:"kind" gorm:"size:16"`
	TaskID    string    `json:"taskId" gorm:"size:64;index"`
	Seq       int64     `json:"-" gorm:"index"`
	CreatedAt time.Time `json:"createdAt"`
}

// StudioUpload 记录用户在 AI Studio 上传的素材，供「添加参考」面板的「上传」分页列出。
type StudioUpload struct {
	ID         string    `json:"id" gorm:"primaryKey;size:36"`
	UserID     string    `json:"userId" gorm:"index;size:36;uniqueIndex:idx_studio_uploads_user_resource,priority:1"`
	ResourceID string    `json:"resourceId" gorm:"size:36;uniqueIndex:idx_studio_uploads_user_resource,priority:2"`
	Kind       string    `json:"kind" gorm:"index;size:16"`
	Name       string    `json:"name" gorm:"size:200"`
	Seq        int64     `json:"-" gorm:"index"`
	CreatedAt  time.Time `json:"createdAt"`
}

// StudioVoice 是用户在 AI Studio 建立的声音：录音或上传的一段人声样本，配音时作为参考音频复刻音色。
type StudioVoice struct {
	ID          string     `json:"id" gorm:"primaryKey;size:36"`
	UserID      string     `json:"userId" gorm:"index;size:36"`
	Name        string     `json:"name" gorm:"size:120"`
	Source      string     `json:"source" gorm:"size:16"`
	ResourceID  string     `json:"resourceId" gorm:"size:36"`
	Description string     `json:"description" gorm:"size:500"`
	Seq         int64      `json:"-" gorm:"index"`
	LastUsedAt  *time.Time `json:"lastUsedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// StudioFeedback 是用户在 AI Studio 帮助菜单里提交的反馈，管理员在后台处理。
type StudioFeedback struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	Category  string    `json:"category" gorm:"size:16"`
	Content   string    `json:"content" gorm:"type:text"`
	Contact   string    `json:"contact" gorm:"size:200"`
	Page      string    `json:"page" gorm:"size:300"`
	Status    string    `json:"status" gorm:"index;size:16"`
	Seq       int64     `json:"-" gorm:"index"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// StudioSiteContent 保存帮助中心的客服说明、服务条款和隐私政策，由管理员编辑。
type StudioSiteContent struct {
	Key       string    `json:"key" gorm:"primaryKey;size:32"`
	Content   string    `json:"content" gorm:"type:text"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// StudioFolder 是素材页里的文件夹，一个作品最多放进一个文件夹。
type StudioFolder struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	Name      string    `json:"name" gorm:"size:60"`
	Seq       int64     `json:"-" gorm:"index"`
	CreatedAt time.Time `json:"createdAt"`
}

// StudioLabel 是素材页里的标签，一个作品可以有多个标签。
type StudioLabel struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	Name      string    `json:"name" gorm:"size:40"`
	Color     string    `json:"color" gorm:"size:16"`
	Seq       int64     `json:"-" gorm:"index"`
	CreatedAt time.Time `json:"createdAt"`
}

// StudioWorkFolder 记录作品所在的文件夹。
type StudioWorkFolder struct {
	UserID    string `gorm:"primaryKey;size:36"`
	TaskID    string `gorm:"primaryKey;size:36"`
	FolderID  string `gorm:"index;size:36"`
	CreatedAt time.Time
}

// StudioWorkLabel 记录作品打上的标签。
type StudioWorkLabel struct {
	UserID    string `gorm:"primaryKey;size:36"`
	TaskID    string `gorm:"primaryKey;size:36"`
	LabelID   string `gorm:"primaryKey;size:36;index"`
	CreatedAt time.Time
}
