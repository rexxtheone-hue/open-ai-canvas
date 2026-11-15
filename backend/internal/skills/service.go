package skills

import (
	"context"

	"yingce/backend/internal/model"

	"yingce/backend/internal/repository"
)

// Service 是技能域入口。组合根注入仓库、数据目录和后台循环，禁止 import internal/service。
type Service struct {
	repo          *repository.Repository
	dataDir       string
	runWorkerLoop func(func(context.Context)) bool
	// builtinAuthor 返回代理商网站上内置技能显示的作者名；为空时保持原作者。
	builtinAuthor func(tenantID string) string
}

// SetBuiltinAuthorResolver 让代理商网站上的内置技能显示代理商品牌，而不是平台品牌。
func (s *Service) SetBuiltinAuthorResolver(fn func(tenantID string) string) {
	s.builtinAuthor = fn
}

// userTenant 返回用户所属租户；找不到用户时按平台处理。
func (s *Service) userTenant(userID string) string {
	if s.repo == nil || userID == "" {
		return model.PlatformTenantID
	}
	user, err := s.repo.User(userID)
	if err != nil || user == nil {
		return model.PlatformTenantID
	}
	return repository.TenantIDOrPlatform(user.TenantID)
}

func New(repo *repository.Repository, dataDir string, runWorkerLoop func(func(context.Context)) bool) *Service {
	if runWorkerLoop == nil {
		runWorkerLoop = func(func(context.Context)) bool { return false }
	}
	return &Service{repo: repo, dataDir: dataDir, runWorkerLoop: runWorkerLoop}
}
