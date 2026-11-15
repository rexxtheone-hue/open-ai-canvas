// 多租户：平台管理员开设、停用代理商，管理代理商管理员账号；代理商管理员管理自己的员工。

package app

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

var tenantSlugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`)

// 这些短名会和平台自己的子域名或路径冲突，不分配给代理商。
var reservedTenantSlugs = map[string]bool{
	model.PlatformTenantID: true, "www": true, "admin": true, "api": true, "app": true, "platform": true,
	"mail": true, "static": true, "cdn": true, "assets": true, "media": true, "studio": true,
}

type AgencyTenantView struct {
	TenantPoolSummary
	PrimaryDomain *TenantDomainView `json:"primaryDomain,omitempty"`
	DomainCount   int               `json:"domainCount"`
	AdminCount    int64             `json:"adminCount"`
	CustomerCount int64             `json:"customerCount"`
}

type TenantAdminUserView struct {
	ID          string           `json:"id"`
	Username    string           `json:"username"`
	Email       string           `json:"email"`
	DisplayName string           `json:"displayName"`
	Status      model.UserStatus `json:"status"`
	LastLoginAt *time.Time       `json:"lastLoginAt,omitempty"`
	CreatedAt   time.Time        `json:"createdAt"`
}

type AgencyTenantDetail struct {
	AgencyTenantView
	Domains []TenantDomainView    `json:"domains"`
	Admins  []TenantAdminUserView `json:"admins"`
}

type TenantAdminUserRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
	// SendInvite 时不设密码，发邮件让对方用「忘记密码」自己设置。
	SendInvite bool `json:"sendInvite"`
}

type CreateAgencyTenantRequest struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	AdminEmail    string `json:"adminEmail"`
	AdminUsername string `json:"adminUsername"`
	AdminPassword string `json:"adminPassword"`
	SendInvite    bool   `json:"sendInvite"`
}

type CreateAgencyTenantResult struct {
	Tenant      *AgencyTenantDetail `json:"tenant"`
	InviteSent  bool                `json:"inviteSent"`
	InviteError string              `json:"inviteError,omitempty"`
}

type TenantAdminUserResult struct {
	User        TenantAdminUserView `json:"user"`
	InviteSent  bool                `json:"inviteSent"`
	InviteError string              `json:"inviteError,omitempty"`
}

type UpdateAgencyTenantRequest struct {
	Name   *string             `json:"name"`
	Status *model.TenantStatus `json:"status"`
}

type TenantUserStatusRequest struct {
	Status model.UserStatus `json:"status"`
}

func tenantAdminUserView(user model.User) TenantAdminUserView {
	return TenantAdminUserView{ID: user.ID, Username: user.Username, Email: user.Email, DisplayName: user.DisplayName, Status: user.Status, LastLoginAt: user.LastLoginAt, CreatedAt: user.CreatedAt}
}

func (s *Service) agencyTenantView(tenant model.Tenant, now time.Time) (AgencyTenantView, error) {
	summary, err := s.tenantPoolSummary(tenant, now)
	if err != nil {
		return AgencyTenantView{}, err
	}
	view := AgencyTenantView{TenantPoolSummary: summary}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil {
		return AgencyTenantView{}, err
	}
	view.DomainCount = len(domains)
	for _, domain := range s.tenantDomainViews(domains) {
		if domain.IsPrimary {
			primary := domain
			view.PrimaryDomain = &primary
		}
	}
	counts, err := s.repo.TenantUserRoleCounts(tenant.ID)
	if err != nil {
		return AgencyTenantView{}, err
	}
	view.AdminCount, view.CustomerCount = counts[model.UserRoleTenantAdmin], counts[model.UserRoleUser]
	return view, nil
}

// AdminAgencyTenants 是平台后台的代理商列表：主网址、状态、批发池、欠款与本月用量。
func (s *Service) AdminAgencyTenants(actor *model.User) ([]AgencyTenantView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenants, err := s.repo.AgencyTenants()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	result := make([]AgencyTenantView, 0, len(tenants))
	for _, tenant := range tenants {
		view, err := s.agencyTenantView(tenant, now)
		if err != nil {
			return nil, err
		}
		result = append(result, view)
	}
	return result, nil
}

func (s *Service) AdminAgencyTenant(actor *model.User, tenantID string) (*AgencyTenantDetail, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return s.agencyTenantDetail(*tenant)
}

func (s *Service) agencyTenantDetail(tenant model.Tenant) (*AgencyTenantDetail, error) {
	view, err := s.agencyTenantView(tenant, time.Now())
	if err != nil {
		return nil, err
	}
	domains, err := s.repo.TenantDomains(tenant.ID)
	if err != nil {
		return nil, err
	}
	admins, err := s.repo.TenantUsersByRole(tenant.ID, model.UserRoleTenantAdmin)
	if err != nil {
		return nil, err
	}
	detail := &AgencyTenantDetail{AgencyTenantView: view, Domains: s.tenantDomainViews(domains), Admins: make([]TenantAdminUserView, 0, len(admins))}
	for _, admin := range admins {
		detail.Admins = append(detail.Admins, tenantAdminUserView(admin))
	}
	return detail, nil
}

// newTenantAdminUser 校验并组装代理商管理员账号（邮箱视为已验证），不写库。
func (s *Service) newTenantAdminUser(tenantID string, req TenantAdminUserRequest, now time.Time) (*model.User, error) {
	username := normalizeUsername(req.Username)
	email := normalizeEmail(req.Email)
	if err := validateUsername(username); err != nil {
		return nil, err
	}
	if email == "" {
		return nil, BadAuthRequest("请填写管理员邮箱")
	}
	if err := validateEmail(email); err != nil {
		return nil, err
	}
	password := req.Password
	if req.SendInvite {
		// 邀请时设一个谁都不知道的随机密码，对方通过「忘记密码」设置自己的密码。
		password = randomToken()
	} else if err := validatePassword(password); err != nil {
		return nil, err
	}
	scoped := s.repo.ForTenant(tenantID)
	if _, err := scoped.UserByUsername(username); err == nil {
		return nil, BadAuthRequest("用户名已存在")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if _, err := scoped.UserByEmail(email); err == nil {
		return nil, BadAuthRequest("邮箱已被注册")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return nil, err
	}
	verified := now
	return &model.User{
		ID: newID(), TenantID: tenantID, Username: username, Email: email, EmailVerifiedAt: &verified,
		DisplayName: normalizeDisplayName(req.DisplayName, username), Role: model.UserRoleTenantAdmin,
		Status: model.UserStatusActive, PasswordHash: hash, CreatedAt: now, UpdatedAt: now,
	}, nil
}

// sendTenantAdminInvite 用代理商自己的品牌发邀请邮件；没有网址时也照发，只是不带按钮。
func (s *Service) sendTenantAdminInvite(tenant model.Tenant, user *model.User) error {
	brand := s.tenantBrandFor(tenant)
	content := auth.EmailContent{
		Subject:   "You're invited to manage " + brand.Name,
		Preheader: "Set your password to sign in to the admin console.",
		Heading:   "Welcome to " + brand.Name,
		Intro:     []string{"An administrator account has been created for you. Your username is " + user.Username + "."},
		Body:      []string{"To set your password, open the sign-in page, choose \"Forgot password\" and enter this email address."},
	}
	if domain, err := s.repo.TenantPrimaryDomain(tenant.ID); err == nil && domain != nil {
		content.ButtonText = "Open sign-in page"
		content.ButtonURL = "https://" + domain.Host + "/login"
	}
	return s.sendNoticeEmail(tenant.ID, user.Email, content)
}

func normalizeTenantSlug(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// CreateAgencyTenant 开设一家代理商：租户（免月费期从今天起算）、第一个代理商管理员、默认子域名。
func (s *Service) CreateAgencyTenant(ctx context.Context, actor *model.User, req CreateAgencyTenantRequest) (*CreateAgencyTenantResult, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len([]rune(name)) > 120 {
		return nil, BadAuthRequest("请填写代理商名称（不超过 120 字）")
	}
	slug := normalizeTenantSlug(req.Slug)
	if !tenantSlugPattern.MatchString(slug) {
		return nil, BadAuthRequest("短名只能用小写字母、数字和连字符，长度 1–40，且不能以连字符开头或结尾")
	}
	if reservedTenantSlugs[slug] {
		return nil, BadAuthRequest("这个短名是保留字，请换一个")
	}
	if existing, err := s.repo.TenantBySlug(slug); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, NewAppError(409, "这个短名已被使用")
	}
	now := time.Now()
	tenant := &model.Tenant{ID: newID(), Slug: slug, Name: name, Status: model.TenantStatusActive, CreatedAt: now, UpdatedAt: now}
	PrepareAgencyTenant(tenant, now)
	admin, err := s.newTenantAdminUser(tenant.ID, TenantAdminUserRequest{Username: req.AdminUsername, Email: req.AdminEmail, Password: req.AdminPassword, SendInvite: req.SendInvite}, now)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateAgencyTenant(tenant, admin); err != nil {
		return nil, err
	}
	if err := s.EnsureDefaultTenantDomain(tenant.ID); err != nil {
		return nil, err
	}
	s.InvalidateTenantCache()
	if err := s.appendAdminAudit(actor, "tenant.create", "tenant", tenant.ID, "开设代理商 "+name, map[string]any{"slug": slug, "adminUserId": admin.ID, "adminUsername": admin.Username, "feeFreeUntil": tenant.FeeFreeUntil}); err != nil {
		return nil, err
	}
	result := &CreateAgencyTenantResult{}
	if req.SendInvite {
		if err := s.sendTenantAdminInvite(*tenant, admin); err != nil {
			result.InviteError = "邀请邮件发送失败：" + err.Error()
		} else {
			result.InviteSent = true
		}
	}
	if result.Tenant, err = s.agencyTenantDetail(*tenant); err != nil {
		return nil, err
	}
	return result, nil
}

// UpdateAgencyTenant 改代理商名称或状态（停用 / 恢复）；平台租户不能改。
func (s *Service) UpdateAgencyTenant(actor *model.User, tenantID string, req UpdateAgencyTenantRequest) (*AgencyTenantDetail, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	if strings.TrimSpace(tenantID) == model.PlatformTenantID {
		return nil, Forbidden("平台租户不能修改")
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	var name *string
	if req.Name != nil {
		value := strings.TrimSpace(*req.Name)
		if value == "" || len([]rune(value)) > 120 {
			return nil, BadAuthRequest("请填写代理商名称（不超过 120 字）")
		}
		name = &value
	}
	if req.Status != nil && *req.Status != model.TenantStatusActive && *req.Status != model.TenantStatusSuspended {
		return nil, BadAuthRequest("状态只能是 active 或 suspended")
	}
	if name == nil && req.Status == nil {
		return s.agencyTenantDetail(*tenant)
	}
	if err := s.repo.UpdateTenantFields(tenant.ID, name, req.Status, time.Now()); err != nil {
		return nil, err
	}
	s.InvalidateTenantCache()
	action, summary := "tenant.update", "修改代理商资料"
	if req.Status != nil && *req.Status != tenant.Status {
		if *req.Status == model.TenantStatusSuspended {
			action, summary = "tenant.suspend", "停用代理商"
		} else {
			action, summary = "tenant.reactivate", "恢复代理商"
		}
	}
	if err := s.appendAdminAudit(actor, action, "tenant", tenant.ID, summary+" "+tenant.Name, map[string]any{"name": name, "status": req.Status, "previousStatus": tenant.Status}); err != nil {
		return nil, err
	}
	updated, err := s.requireAgencyTenant(tenant.ID)
	if err != nil {
		return nil, err
	}
	return s.agencyTenantDetail(*updated)
}

func (s *Service) addTenantAdmin(actor *model.User, tenant model.Tenant, req TenantAdminUserRequest) (*TenantAdminUserResult, error) {
	user, err := s.newTenantAdminUser(tenant.ID, req, time.Now())
	if err != nil {
		return nil, err
	}
	if err := s.repo.Create(user); err != nil {
		return nil, err
	}
	if _, err := s.repo.CreditAccount(user.ID); err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "tenant.admin.create", "user", user.ID, "添加代理商管理员 "+user.Username, map[string]any{"tenantId": tenant.ID, "username": user.Username, "invite": req.SendInvite}); err != nil {
		return nil, err
	}
	result := &TenantAdminUserResult{User: tenantAdminUserView(*user)}
	if req.SendInvite {
		if err := s.sendTenantAdminInvite(tenant, user); err != nil {
			result.InviteError = "邀请邮件发送失败：" + err.Error()
		} else {
			result.InviteSent = true
		}
	}
	return result, nil
}

// setTenantAdminStatus 停用或恢复同一租户内的代理商管理员；停用时清掉登录态，并至少保留一个可用管理员。
func (s *Service) setTenantAdminStatus(actor *model.User, tenantID, userID string, status model.UserStatus) (*TenantAdminUserView, error) {
	if status != model.UserStatusActive && status != model.UserStatusDisabled {
		return nil, BadAuthRequest("用户状态无效")
	}
	user, err := s.repo.User(strings.TrimSpace(userID))
	if err != nil || user == nil || UserTenantID(user) != tenantID {
		return nil, NotFound("管理员不存在")
	}
	if user.Role != model.UserRoleTenantAdmin {
		return nil, Forbidden("只能管理代理商管理员账号")
	}
	if user.ID == actor.ID && status == model.UserStatusDisabled {
		return nil, BadAuthRequest("不能停用自己的账号")
	}
	if status == model.UserStatusDisabled && user.Status == model.UserStatusActive {
		admins, err := s.repo.TenantUsersByRole(tenantID, model.UserRoleTenantAdmin)
		if err != nil {
			return nil, err
		}
		active := 0
		for _, admin := range admins {
			if admin.Status == model.UserStatusActive && admin.ID != user.ID {
				active++
			}
		}
		if active == 0 {
			return nil, BadAuthRequest("至少需要保留一个可用的代理商管理员")
		}
	}
	if user.Status == status {
		view := tenantAdminUserView(*user)
		return &view, nil
	}
	if status == model.UserStatusDisabled {
		if err := s.repo.DeleteUserAuthSessions(user.ID); err != nil {
			return nil, err
		}
	}
	user.Status = status
	user.UpdatedAt = time.Now()
	if err := s.repo.Save(user); err != nil {
		return nil, err
	}
	action := "tenant.admin.enable"
	if status == model.UserStatusDisabled {
		action = "tenant.admin.disable"
	}
	if err := s.appendAdminAudit(actor, action, "user", user.ID, "修改代理商管理员状态 "+user.Username, map[string]any{"tenantId": tenantID, "status": status}); err != nil {
		return nil, err
	}
	view := tenantAdminUserView(*user)
	return &view, nil
}

// ---- 平台管理员：某家代理商的管理员 ----

func (s *Service) AdminAddTenantAdmin(actor *model.User, tenantID string, req TenantAdminUserRequest) (*TenantAdminUserResult, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return s.addTenantAdmin(actor, *tenant, req)
}

func (s *Service) AdminSetTenantAdminStatus(actor *model.User, tenantID, userID string, req TenantUserStatusRequest) (*TenantAdminUserView, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	tenant, err := s.requireAgencyTenant(tenantID)
	if err != nil {
		return nil, err
	}
	return s.setTenantAdminStatus(actor, tenant.ID, userID, req.Status)
}

// ---- 代理商管理员：自己的员工 ----

func (s *Service) TenantStaff(actor *model.User, tenant model.Tenant) ([]TenantAdminUserView, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	admins, err := s.repo.TenantUsersByRole(tenant.ID, model.UserRoleTenantAdmin)
	if err != nil {
		return nil, err
	}
	result := make([]TenantAdminUserView, 0, len(admins))
	for _, admin := range admins {
		result = append(result, tenantAdminUserView(admin))
	}
	return result, nil
}

func (s *Service) CreateTenantStaff(actor *model.User, tenant model.Tenant, req TenantAdminUserRequest) (*TenantAdminUserResult, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	stored, err := s.requireAgencyTenant(tenant.ID)
	if err != nil {
		return nil, err
	}
	return s.addTenantAdmin(actor, *stored, req)
}

func (s *Service) UpdateTenantStaffStatus(actor *model.User, tenant model.Tenant, userID string, req TenantUserStatusRequest) (*TenantAdminUserView, error) {
	if err := s.requireTenantAdmin(actor, tenant); err != nil {
		return nil, err
	}
	return s.setTenantAdminStatus(actor, tenant.ID, userID, req.Status)
}
