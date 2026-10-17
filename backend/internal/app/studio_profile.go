package app

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const (
	studioProfileSpecialtyLimit = 8
	studioProfileMediaTTL       = 12 * time.Hour
)

var (
	studioHandlePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_.]{2,23}$`)
	studioHandleStrip   = regexp.MustCompile(`[^a-z0-9_.]+`)
	// 和站内路径、常见系统词冲突的主页地址不能用。
	studioReservedHandles = map[string]bool{
		"admin": true, "api": true, "studio": true, "login": true, "register": true, "settings": true, "help": true, "support": true,
		"about": true, "terms": true, "privacy": true, "pricing": true, "market": true, "marketplace": true, "official": true, "yingce": true,
		"system": true, "root": true, "null": true, "undefined": true, "share": true, "canvas": true, "user": true, "users": true,
	}
	// 主页可以填的外部链接。
	studioProfileLinkKeys = []string{"website", "instagram", "tiktok", "facebook", "youtube", "xiaohongshu", "douyin"}
)

type StudioProfileInput struct {
	Handle           string            `json:"handle"`
	Name             string            `json:"name"`
	Bio              string            `json:"bio"`
	Location         string            `json:"location"`
	Specialties      []string          `json:"specialties"`
	Links            map[string]string `json:"links"`
	AvatarResourceID string            `json:"avatarResourceId"`
	CoverResourceID  string            `json:"coverResourceId"`
}

type StudioProfileStats struct {
	Works     int64 `json:"works"`
	Likes     int64 `json:"likes"`
	Remixes   int64 `json:"remixes"`
	Followers int64 `json:"followers"`
	Following int64 `json:"following"`
}

type StudioProfileView struct {
	Handle           string             `json:"handle"`
	Name             string             `json:"name"`
	Bio              string             `json:"bio"`
	Location         string             `json:"location"`
	Specialties      []string           `json:"specialties"`
	Links            map[string]string  `json:"links"`
	AvatarURL        string             `json:"avatarUrl,omitempty"`
	CoverURL         string             `json:"coverUrl,omitempty"`
	AvatarResourceID string             `json:"avatarResourceId,omitempty"`
	CoverResourceID  string             `json:"coverResourceId,omitempty"`
	Stats            StudioProfileStats `json:"stats"`
	Mine             bool               `json:"mine"`
	Following        bool               `json:"following"`
	JoinedAt         time.Time          `json:"joinedAt"`
}

func randomDigits(n int) string {
	var builder strings.Builder
	for range n {
		digit, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			builder.WriteByte('0')
			continue
		}
		builder.WriteByte(byte('0' + digit.Int64()))
	}
	return builder.String()
}

// studioHandleBase 从用户名推一个主页地址；用户名像邮箱或手机号时不用，避免把登录信息公开出去。
func studioHandleBase(username string) string {
	name := strings.ToLower(strings.TrimSpace(username))
	if strings.Contains(name, "@") || strings.Trim(name, "0123456789+ -") == "" {
		return ""
	}
	name = strings.Trim(studioHandleStrip.ReplaceAllString(name, ""), "._")
	if len(name) > 18 {
		name = name[:18]
	}
	if len(name) < 3 || !studioHandlePattern.MatchString(name) || studioReservedHandles[name] {
		return ""
	}
	return name
}

// ensureStudioProfile 第一次用到主页时自动建一份，主页地址取自用户名，冲突就加数字。
func (s *Service) ensureStudioProfile(userID string) (*model.StudioProfile, error) {
	profile, err := s.repo.StudioProfile(userID)
	if err != nil || profile != nil {
		return profile, err
	}
	user, err := s.repo.User(userID)
	if err != nil {
		return nil, err
	}
	base := studioHandleBase(user.Username)
	now := time.Now().UTC()
	for attempt := range 8 {
		handle := base
		if handle == "" {
			handle = "creator" + randomDigits(6)
		} else if attempt > 0 {
			handle = fmt.Sprintf("%s%s", base, randomDigits(attempt+1))
		}
		candidate := &model.StudioProfile{UserID: userID, Handle: handle, Name: strings.TrimSpace(user.DisplayName), CreatedAt: now, UpdatedAt: now}
		created, err := s.repo.CreateStudioProfile(candidate)
		if err != nil {
			return nil, err
		}
		if created {
			return candidate, nil
		}
		// 可能是同一个用户并发建好了，也可能是地址被别人用了。
		if existing, err := s.repo.StudioProfile(userID); err != nil || existing != nil {
			return existing, err
		}
	}
	return nil, errors.New("无法生成主页地址，请稍后重试")
}

func (s *Service) studioProfileImage(userID, id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", nil
	}
	resource, err := s.repo.ResourceForUser(userID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", BadAuthRequest("图片不存在，请重新上传")
	}
	if err != nil {
		return "", err
	}
	if resource.Kind != "image" && !strings.HasPrefix(resource.MimeType, "image/") {
		return "", BadAuthRequest("头像和封面只能使用图片")
	}
	return id, nil
}

func studioProfileText(value string, limit int, tooLong string) (string, error) {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > limit {
		return "", BadAuthRequest(tooLong)
	}
	return value, nil
}

func normalizeStudioProfileLinks(links map[string]string) (string, error) {
	clean := map[string]string{}
	for _, key := range studioProfileLinkKeys {
		value := strings.TrimSpace(links[key])
		if value == "" {
			continue
		}
		if !strings.Contains(value, "://") {
			value = "https://" + value
		}
		parsed, err := url.Parse(value)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || len(value) > 300 {
			return "", BadAuthRequest("链接格式不正确：" + key)
		}
		clean[key] = parsed.String()
	}
	encoded, _ := json.Marshal(clean)
	return string(encoded), nil
}

// StudioMyProfile 返回自己的主页资料（第一次访问时自动创建）。
func (s *Service) StudioMyProfile(userID string) (StudioProfileView, error) {
	profile, err := s.ensureStudioProfile(userID)
	if err != nil {
		return StudioProfileView{}, err
	}
	return s.studioProfileView(userID, profile)
}

func (s *Service) UpdateStudioProfile(userID string, input StudioProfileInput) (StudioProfileView, error) {
	profile, err := s.ensureStudioProfile(userID)
	if err != nil {
		return StudioProfileView{}, err
	}
	handle := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(input.Handle), "@")))
	if !studioHandlePattern.MatchString(handle) || strings.HasSuffix(handle, ".") {
		return StudioProfileView{}, BadAuthRequest("主页地址需要 3–24 个字符，只能用小写字母、数字、下划线和点")
	}
	if studioReservedHandles[handle] {
		return StudioProfileView{}, BadAuthRequest("这个主页地址不能使用，请换一个")
	}
	if handle != profile.Handle {
		taken, err := s.repo.StudioHandleTaken(handle, userID)
		if err != nil {
			return StudioProfileView{}, err
		}
		if taken {
			return StudioProfileView{}, BadAuthRequest("这个主页地址已经被使用，请换一个")
		}
	}
	name, err := studioProfileText(input.Name, 40, "名称最多 40 个字")
	if err != nil {
		return StudioProfileView{}, err
	}
	bio, err := studioProfileText(input.Bio, 300, "简介最多 300 个字")
	if err != nil {
		return StudioProfileView{}, err
	}
	location, err := studioProfileText(input.Location, 60, "所在地最多 60 个字")
	if err != nil {
		return StudioProfileView{}, err
	}
	specialties := []string{}
	seen := map[string]bool{}
	for _, item := range input.Specialties {
		item = strings.TrimSpace(item)
		if item == "" || seen[strings.ToLower(item)] {
			continue
		}
		if utf8.RuneCountInString(item) > 20 {
			return StudioProfileView{}, BadAuthRequest("每个擅长领域最多 20 个字")
		}
		seen[strings.ToLower(item)] = true
		specialties = append(specialties, item)
	}
	if len(specialties) > studioProfileSpecialtyLimit {
		return StudioProfileView{}, BadAuthRequest(fmt.Sprintf("擅长领域最多 %d 个", studioProfileSpecialtyLimit))
	}
	links, err := normalizeStudioProfileLinks(input.Links)
	if err != nil {
		return StudioProfileView{}, err
	}
	avatar, err := s.studioProfileImage(userID, input.AvatarResourceID)
	if err != nil {
		return StudioProfileView{}, err
	}
	cover, err := s.studioProfileImage(userID, input.CoverResourceID)
	if err != nil {
		return StudioProfileView{}, err
	}
	encodedSpecialties, _ := json.Marshal(specialties)
	profile.Handle, profile.Name, profile.Bio, profile.Location = handle, name, bio, location
	profile.SpecialtiesJSON, profile.LinksJSON = string(encodedSpecialties), links
	profile.AvatarResourceID, profile.CoverResourceID = avatar, cover
	profile.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveStudioProfile(profile); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) || strings.Contains(strings.ToLower(err.Error()), "unique") {
			return StudioProfileView{}, BadAuthRequest("这个主页地址已经被使用，请换一个")
		}
		return StudioProfileView{}, err
	}
	return s.studioProfileView(userID, profile)
}

// StudioProfileByHandle 公开主页，未登录也能看（viewerID 为空）。
func (s *Service) StudioProfileByHandle(viewerID, handle string) (StudioProfileView, error) {
	profile, err := s.studioProfileForHandle(handle)
	if err != nil {
		return StudioProfileView{}, err
	}
	return s.studioProfileView(viewerID, profile)
}

func (s *Service) studioProfileForHandle(handle string) (*model.StudioProfile, error) {
	handle = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(handle), "@"))
	if !studioHandlePattern.MatchString(handle) {
		return nil, NotFound("主页不存在")
	}
	profile, err := s.repo.StudioProfileByHandle(handle)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, NotFound("主页不存在")
	}
	user, err := s.repo.User(profile.UserID)
	if err != nil || user == nil || user.Status == model.UserStatusDisabled {
		return nil, NotFound("主页不存在")
	}
	return profile, nil
}

// StudioProfilePosts 主页上的作品（tab=works）或点赞过的作品（tab=liked）。
func (s *Service) StudioProfilePosts(viewerID, handle, tab string, offset, limit int) (StudioPostPage, error) {
	profile, err := s.studioProfileForHandle(handle)
	if err != nil {
		return StudioPostPage{}, err
	}
	if tab == "liked" {
		posts, hasMore, err := s.repo.StudioLikedPosts(profile.UserID, offset, limit)
		if err != nil {
			return StudioPostPage{}, err
		}
		views, err := s.studioPostViews(viewerID, false, posts)
		if err != nil {
			return StudioPostPage{}, err
		}
		page := StudioPostPage{Posts: views}
		if hasMore {
			page.NextOffset = max(offset, 0) + len(posts)
		}
		return page, nil
	}
	return s.studioCommunityPage(viewerID, StudioCommunityQuery{Sort: "latest", Offset: offset, Limit: limit}, profile.UserID, "")
}

func (s *Service) FollowStudioProfile(userID, handle string, following bool) (StudioProfileView, error) {
	profile, err := s.studioProfileForHandle(handle)
	if err != nil {
		return StudioProfileView{}, err
	}
	if profile.UserID == userID {
		return StudioProfileView{}, BadAuthRequest("不能关注自己")
	}
	if err := s.repo.SetStudioFollow(userID, profile.UserID, following); err != nil {
		return StudioProfileView{}, err
	}
	return s.studioProfileView(userID, profile)
}

func (s *Service) studioProfileImageURL(userID, resourceID string, variant assets.ResourceVariant) string {
	if resourceID == "" {
		return ""
	}
	resource, err := s.repo.Resource(resourceID)
	if err != nil || resource == nil || resource.UserID != userID {
		return ""
	}
	link, err := s.signedResourceAccessURL(resource, variant, time.Now().Add(studioProfileMediaTTL), false)
	if err != nil {
		return ""
	}
	return link
}

func (s *Service) studioProfileView(viewerID string, profile *model.StudioProfile) (StudioProfileView, error) {
	user, err := s.repo.User(profile.UserID)
	if err != nil {
		return StudioProfileView{}, err
	}
	stats, err := s.repo.StudioProfileStats(profile.UserID)
	if err != nil {
		return StudioProfileView{}, err
	}
	following, err := s.repo.StudioFollowing(viewerID, profile.UserID)
	if err != nil {
		return StudioProfileView{}, err
	}
	view := StudioProfileView{
		Handle: profile.Handle, Name: studioProfileName(profile, user), Bio: profile.Bio, Location: profile.Location,
		Specialties: []string{}, Links: map[string]string{}, Mine: viewerID == profile.UserID, Following: following, JoinedAt: user.CreatedAt,
		Stats: StudioProfileStats{Works: stats.Works, Likes: stats.Likes, Remixes: stats.Remixes, Followers: stats.Followers, Following: stats.Following},
	}
	_ = json.Unmarshal([]byte(profile.SpecialtiesJSON), &view.Specialties)
	_ = json.Unmarshal([]byte(profile.LinksJSON), &view.Links)
	if view.Specialties == nil {
		view.Specialties = []string{}
	}
	if view.Links == nil {
		view.Links = map[string]string{}
	}
	view.AvatarURL = s.studioProfileImageURL(profile.UserID, profile.AvatarResourceID, assets.VariantOriginal)
	view.CoverURL = s.studioProfileImageURL(profile.UserID, profile.CoverResourceID, assets.VariantOriginal)
	if view.Mine {
		view.AvatarResourceID, view.CoverResourceID = profile.AvatarResourceID, profile.CoverResourceID
	}
	return view, nil
}

// studioProfileName 公开显示的名称：主页名称 → 账号昵称 → 主页地址，不使用登录用户名。
func studioProfileName(profile *model.StudioProfile, user *model.User) string {
	if name := strings.TrimSpace(profile.Name); name != "" {
		return name
	}
	if user != nil {
		if name := strings.TrimSpace(user.DisplayName); name != "" {
			return name
		}
	}
	return profile.Handle
}
