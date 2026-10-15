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
	ID             string    `json:"id" gorm:"primaryKey;size:36"`
	UserID         string    `json:"userId" gorm:"index;size:36"`
	Name           string    `json:"name" gorm:"size:80"`
	Intro          string    `json:"intro" gorm:"type:text"`
	Audience       string    `json:"audience" gorm:"size:400"`
	Tone           string    `json:"tone" gorm:"size:400"`
	Slogan         string    `json:"slogan" gorm:"size:200"`
	ColorsJSON     string    `json:"-" gorm:"type:text"`
	LogoResourceID string    `json:"logoResourceId" gorm:"size:36"`
	Avoid          string    `json:"avoid" gorm:"size:600"`
	IsDefault      bool      `json:"isDefault"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
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
