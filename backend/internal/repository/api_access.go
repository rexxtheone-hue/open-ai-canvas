package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func (r *Repository) CreateAPIToken(token *model.APIToken) error {
	return r.db.Create(token).Error
}

func (r *Repository) CreateAPITokens(tokens ...*model.APIToken) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, token := range tokens {
			if err := tx.Create(token).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ActiveAPITokenByHash 只返回未吊销、未过期的令牌。
func (r *Repository) ActiveAPITokenByHash(kind string, hash string) (*model.APIToken, error) {
	var token model.APIToken
	err := r.db.Where("token_hash = ? AND kind = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", hash, kind, time.Now()).First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// TouchAPIToken 最多每分钟写一次最后使用时间，避免每个请求都写库。
func (r *Repository) TouchAPIToken(id string, now time.Time) error {
	return r.db.Model(&model.APIToken{}).Where("id = ? AND (last_used_at IS NULL OR last_used_at < ?)", id, now.Add(-time.Minute)).Update("last_used_at", now).Error
}

func (r *Repository) PersonalAPITokens(userID string) ([]model.APIToken, error) {
	var tokens []model.APIToken
	err := r.db.Where("user_id = ? AND kind = ? AND revoked_at IS NULL", userID, model.APITokenKindPersonal).Order("created_at desc").Find(&tokens).Error
	return tokens, err
}

func (r *Repository) CountPersonalAPITokens(userID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.APIToken{}).Where("user_id = ? AND kind = ? AND revoked_at IS NULL", userID, model.APITokenKindPersonal).Count(&count).Error
	return count, err
}

func (r *Repository) RevokePersonalAPIToken(userID string, id string) error {
	result := r.db.Model(&model.APIToken{}).Where("id = ? AND user_id = ? AND kind = ? AND revoked_at IS NULL", id, userID, model.APITokenKindPersonal).Update("revoked_at", time.Now())
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// OAuthConnections 按客户端汇总用户已授权、仍有效的 MCP 连接。
func (r *Repository) OAuthConnections(userID string) ([]model.APIToken, error) {
	var tokens []model.APIToken
	err := r.db.Where("user_id = ? AND kind = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", userID, model.APITokenKindOAuthRefresh, time.Now()).Order("created_at desc").Find(&tokens).Error
	return tokens, err
}

// RevokeOAuthClientTokens 吊销某个用户在某个客户端下的全部访问和刷新令牌。
func (r *Repository) RevokeOAuthClientTokens(userID string, clientID string) error {
	return r.db.Model(&model.APIToken{}).Where("user_id = ? AND client_id = ? AND kind IN ? AND revoked_at IS NULL", userID, clientID, []string{model.APITokenKindOAuthAccess, model.APITokenKindOAuthRefresh}).Update("revoked_at", time.Now()).Error
}

// RotateOAuthRefreshToken 原子地作废旧刷新令牌（及其签发的访问令牌）并写入新的一对；
// 旧令牌已被用过时返回 ErrRecordNotFound，防止同一刷新令牌被重放。
func (r *Repository) RotateOAuthRefreshToken(oldID string, access *model.APIToken, refresh *model.APIToken) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		result := tx.Model(&model.APIToken{}).Where("id = ? AND kind = ? AND revoked_at IS NULL", oldID, model.APITokenKindOAuthRefresh).Update("revoked_at", now)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&model.APIToken{}).Where("parent_id = ? AND kind = ? AND revoked_at IS NULL", oldID, model.APITokenKindOAuthAccess).Update("revoked_at", now).Error; err != nil {
			return err
		}
		if err := tx.Create(refresh).Error; err != nil {
			return err
		}
		return tx.Create(access).Error
	})
}

func (r *Repository) CreateOAuthClient(client *model.OAuthClient) error {
	return r.db.Create(client).Error
}

func (r *Repository) OAuthClient(id string) (*model.OAuthClient, error) {
	var client model.OAuthClient
	if err := r.db.First(&client, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &client, nil
}

func (r *Repository) OAuthClientsByIDs(ids []string) ([]model.OAuthClient, error) {
	var clients []model.OAuthClient
	if len(ids) == 0 {
		return clients, nil
	}
	err := r.db.Where("id IN ?", ids).Find(&clients).Error
	return clients, err
}

func (r *Repository) CreateOAuthAuthorizationCode(code *model.OAuthAuthorizationCode) error {
	return r.db.Create(code).Error
}

// ConsumeOAuthAuthorizationCode 把授权码标记为已用并返回；过期或已用过的码一律失败。
func (r *Repository) ConsumeOAuthAuthorizationCode(hash string) (*model.OAuthAuthorizationCode, error) {
	var code model.OAuthAuthorizationCode
	err := r.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		result := tx.Model(&model.OAuthAuthorizationCode{}).Where("code_hash = ? AND used_at IS NULL AND expires_at > ?", hash, now).Update("used_at", now)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		return tx.First(&code, "code_hash = ?", hash).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &code, nil
}
