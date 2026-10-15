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
