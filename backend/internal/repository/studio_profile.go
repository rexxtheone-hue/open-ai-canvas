package repository

import (
	"encoding/json"
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

type StudioCreatorQuery struct {
	Search    string
	Specialty string
	Location  string
	// Sort：popular（默认，按获赞）、followers、works、latest（最近发布）。
	Sort     string
	Verified bool
	Offset   int
	Limit    int
}

type StudioCreatorRow struct {
	model.StudioProfile `gorm:"embedded"`
	Works               int64
	Likes               int64
	Followers           int64
}

// StudioCreators 创作者列表：只列有公开作品、账号未停用的创作者。
func (r *Repository) StudioCreators(query StudioCreatorQuery) ([]StudioCreatorRow, bool, error) {
	limit := query.Limit
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	db := r.db.Table("studio_profiles AS p").
		Select("p.*, COUNT(sp.id) AS works, COALESCE(SUM(sp.like_count), 0) AS likes, (SELECT COUNT(*) FROM studio_follows f WHERE f.followee_id = p.user_id) AS followers").
		Joins("JOIN studio_posts sp ON sp.user_id = p.user_id AND sp.status = ?", model.StudioPostPublished).
		Joins("JOIN users u ON u.id = p.user_id AND u.status <> ?", model.UserStatusDisabled).
		Group("p.user_id")
	if search := strings.ToLower(strings.TrimSpace(query.Search)); search != "" {
		pattern := "%" + escapeLike(search) + "%"
		db = db.Where("(LOWER(p.name) LIKE ? ESCAPE '\\' OR p.handle LIKE ? ESCAPE '\\' OR LOWER(p.bio) LIKE ? ESCAPE '\\')", pattern, pattern, pattern)
	}
	if specialty := strings.TrimSpace(query.Specialty); specialty != "" {
		encoded, _ := json.Marshal(specialty)
		db = db.Where("p.specialties_json LIKE ? ESCAPE '\\'", "%"+escapeLike(string(encoded))+"%")
	}
	if location := strings.ToLower(strings.TrimSpace(query.Location)); location != "" {
		db = db.Where("LOWER(p.location) LIKE ? ESCAPE '\\'", "%"+escapeLike(location)+"%")
	}
	if query.Verified {
		db = db.Where("p.creator_verified_at IS NOT NULL")
	}
	switch query.Sort {
	case "followers":
		db = db.Order("followers desc, likes desc, p.user_id")
	case "works":
		db = db.Order("works desc, likes desc, p.user_id")
	case "latest":
		db = db.Order("MAX(sp.created_at) desc, p.user_id")
	default:
		db = db.Order("CASE WHEN p.creator_verified_at IS NULL THEN 1 ELSE 0 END, likes desc, followers desc, works desc, p.user_id")
	}
	var rows []StudioCreatorRow
	if err := db.Offset(max(query.Offset, 0)).Limit(limit + 1).Scan(&rows).Error; err != nil {
		return nil, false, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	return rows, hasMore, nil
}

// StudioAuthorsWithoutProfile 是发布过作品但还没有主页资料的用户（主页功能上线前发布的作品），补建后才能进创作者列表。
func (r *Repository) StudioAuthorsWithoutProfile(limit int) ([]string, error) {
	var ids []string
	err := r.db.Model(&model.StudioPost{}).Distinct("user_id").
		Where("status = ? AND user_id NOT IN (?)", model.StudioPostPublished, r.db.Model(&model.StudioProfile{}).Select("user_id")).
		Limit(limit).Pluck("user_id", &ids).Error
	return ids, err
}

func (r *Repository) StudioFollowingSet(followerID string, userIDs []string) (map[string]bool, error) {
	following := map[string]bool{}
	if followerID == "" || len(userIDs) == 0 {
		return following, nil
	}
	var ids []string
	if err := r.db.Model(&model.StudioFollow{}).Where("follower_id = ? AND followee_id IN ?", followerID, userIDs).Pluck("followee_id", &ids).Error; err != nil {
		return nil, err
	}
	for _, id := range ids {
		following[id] = true
	}
	return following, nil
}
