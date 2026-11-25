package model

import "time"

// AgentSandbox 是 MCP 工作流给每个用户开的 E2B 沙盒：同一用户的 sandbox_exec 都连同一个，
// 沙盒空闲时暂停，/home/user 的文件留着，下次调用自动恢复。
type AgentSandbox struct {
	UserID      string    `json:"userId" gorm:"primaryKey;size:32"`
	SandboxID   string    `json:"sandboxId" gorm:"size:80"`
	Domain      string    `json:"domain" gorm:"size:80"`
	AccessToken string    `json:"-" gorm:"size:200"`
	Template    string    `json:"template" gorm:"size:80"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// DramaRun 是一部 /drama-ads 短剧：get_drama_ads_config 第一次报价时建立，之后的生成都带着它的 ID。
type DramaRun struct {
	ID         string    `json:"id" gorm:"primaryKey;size:32"`
	UserID     string    `json:"userId" gorm:"size:32;index"`
	PresetID   string    `json:"presetId" gorm:"size:200"`
	Style      string    `json:"style" gorm:"size:40"`
	QuotesJSON string    `json:"-" gorm:"type:text"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// MediaUpload 是 media_upload 发出的一次上传：沙盒用 PUT 把文件送到 upload_url，media_confirm 后变成素材。
type MediaUpload struct {
	ID          string     `json:"id" gorm:"primaryKey;size:32"`
	UserID      string     `json:"userId" gorm:"size:32;index"`
	FileName    string     `json:"fileName" gorm:"size:255"`
	ContentType string     `json:"contentType" gorm:"size:120"`
	Kind        string     `json:"kind" gorm:"size:16"`
	ResourceID  string     `json:"resourceId" gorm:"size:32"`
	ExpiresAt   time.Time  `json:"expiresAt"`
	UploadedAt  *time.Time `json:"uploadedAt"`
	ConfirmedAt *time.Time `json:"confirmedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}
