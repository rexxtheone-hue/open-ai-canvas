package repository

import (
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StudioProfileStats 是主页上的统计数字：公开作品数、收到的点赞和做同款、粉丝和关注。
type StudioProfileStats struct {
	Works     int64
	Likes     int64
	Remixes   int64
	Followers int64
	Following int64
}

func (r *Repository) StudioProfile(userID string) (*model.StudioProfile, error) {
	var profile model.StudioProfile
	err := r.db.Where("user_id = ?", userID).Take(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &profile, err
}

func (r *Repository) StudioProfileByHandle(handle string) (*model.StudioProfile, error) {
	var profile model.StudioProfile
	err := r.db.Where("handle = ?", strings.ToLower(handle)).Take(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &profile, err
}

func (r *Repository) StudioProfilesByUsers(userIDs []string) (map[string]model.StudioProfile, error) {
	profiles := map[string]model.StudioProfile{}
	if len(userIDs) == 0 {
		return profiles, nil
	}
	var rows []model.StudioProfile
	if err := r.db.Where("user_id IN ?", userIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		profiles[row.UserID] = row
	}
	return profiles, nil
}

// CreateStudioProfile 新建主页资料；handle 撞车时返回 false，由调用方换一个再试。
func (r *Repository) CreateStudioProfile(profile *model.StudioProfile) (bool, error) {
	result := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(profile)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

func (r *Repository) SaveStudioProfile(profile *model.StudioProfile) error {
	return r.db.Save(profile).Error
}

func (r *Repository) StudioHandleTaken(handle, exceptUserID string) (bool, error) {
	var count int64
	err := r.db.Model(&model.StudioProfile{}).Where("handle = ? AND user_id <> ?", handle, exceptUserID).Count(&count).Error
	return count > 0, err
}

func (r *Repository) StudioProfileStats(userID string) (StudioProfileStats, error) {
	var stats StudioProfileStats
	var sums struct {
		Works   int64
		Likes   int64
		Remixes int64
	}
	err := r.db.Model(&model.StudioPost{}).Select("COUNT(*) AS works, COALESCE(SUM(like_count), 0) AS likes, COALESCE(SUM(remix_count), 0) AS remixes").
		Where("user_id = ? AND status = ?", userID, model.StudioPostPublished).Scan(&sums).Error
	if err != nil {
		return stats, err
	}
	stats.Works, stats.Likes, stats.Remixes = sums.Works, sums.Likes, sums.Remixes
	if err := r.db.Model(&model.StudioFollow{}).Where("followee_id = ?", userID).Count(&stats.Followers).Error; err != nil {
		return stats, err
	}
	err = r.db.Model(&model.StudioFollow{}).Where("follower_id = ?", userID).Count(&stats.Following).Error
	return stats, err
}

func (r *Repository) StudioFollowing(followerID, followeeID string) (bool, error) {
	if followerID == "" {
		return false, nil
	}
	var count int64
	err := r.db.Model(&model.StudioFollow{}).Where("follower_id = ? AND followee_id = ?", followerID, followeeID).Count(&count).Error
	return count > 0, err
}

func (r *Repository) SetStudioFollow(followerID, followeeID string, following bool) error {
	if following {
		return r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.StudioFollow{FollowerID: followerID, FolloweeID: followeeID, CreatedAt: time.Now().UTC()}).Error
	}
	return r.db.Where("follower_id = ? AND followee_id = ?", followerID, followeeID).Delete(&model.StudioFollow{}).Error
}

// StudioLikedPosts 是某个用户点过赞、仍然公开的作品，按点赞时间倒序。
func (r *Repository) StudioLikedPosts(userID string, offset, limit int) ([]model.StudioPost, bool, error) {
	if limit <= 0 || limit > 60 {
		limit = 30
	}
	var posts []model.StudioPost
	err := r.db.Model(&model.StudioPost{}).
		Joins("JOIN studio_post_likes ON studio_post_likes.post_id = studio_posts.id").
		Where("studio_post_likes.user_id = ? AND studio_posts.status = ?", userID, model.StudioPostPublished).
		Order("studio_post_likes.created_at desc, studio_posts.id desc").
		Offset(max(offset, 0)).Limit(limit + 1).Find(&posts).Error
	if err != nil {
		return nil, false, err
	}
	hasMore := len(posts) > limit
	if hasMore {
		posts = posts[:limit]
	}
	return posts, hasMore, nil
}
