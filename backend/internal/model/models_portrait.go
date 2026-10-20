package model

import "time"

// 真人认证：通过 Cloudwise（BytePlus 方舟）活体认证的真人，各自拥有一个可信素材组。
// Seedance 只接受这些素材组里的真人人像，生成时以 asset://<id> 引用。
const (
	StudioPortraitPending  = "pending"
	StudioPortraitVerified = "verified"
	StudioPortraitFailed   = "failed"

	StudioPortraitPhotoProcessing = "processing"
	StudioPortraitPhotoActive     = "active"
	StudioPortraitPhotoFailed     = "failed"
)

type StudioPortrait struct {
	ID         string    `json:"id" gorm:"primaryKey;size:36"`
	UserID     string    `json:"userId" gorm:"size:36;index"`
	ChannelID  string    `json:"channelId" gorm:"size:36;index"`
	Name       string    `json:"name" gorm:"size:60"`
	BytedToken string    `json:"-" gorm:"size:128"`
	H5Link     string    `json:"h5Link" gorm:"type:text"`
	GroupID    string    `json:"groupId" gorm:"size:96"`
	Status     string    `json:"status" gorm:"size:16;index"`
	Error      string    `json:"error" gorm:"size:500"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type StudioPortraitPhoto struct {
	ID         string    `json:"id" gorm:"primaryKey;size:36"`
	PortraitID string    `json:"portraitId" gorm:"size:36;uniqueIndex:idx_studio_portrait_photo_resource,priority:1"`
	UserID     string    `json:"userId" gorm:"size:36;index"`
	ResourceID string    `json:"resourceId" gorm:"size:64;index;uniqueIndex:idx_studio_portrait_photo_resource,priority:2"`
	AssetID    string    `json:"assetId" gorm:"size:96"`
	Status     string    `json:"status" gorm:"size:16;index"`
	Error      string    `json:"error" gorm:"size:500"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}
