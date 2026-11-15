package repository

// 静态检查：仓库层里读写跨用户表（B 类表）和 users 表的函数，必须经过租户限定
// （scopeTenant / TenantIDOrPlatform / r.tenantScope / r.tenantID / 显式的 tenant_id 条件，或调用了这样的辅助函数），
// 否则必须登记在 tenantIsolationAllowlist 里并写明理由。新增查询没有限定租户、也没登记时测试失败。

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// tenantScopedModelNames 对应 v80 加了 tenant_id 的表，外加 users。
var tenantScopedModelNames = map[string]bool{
	"TopupProduct": true, "PaymentOrder": true, "RedeemBatch": true, "RedeemCode": true, "Announcement": true,
	"BannerAnnouncement": true, "StudioPost": true, "StudioFeedback": true, "StudioSiteContent": true,
	"PartnerApplication": true, "AffiliateAccount": true, "AffiliateCommission": true, "AffiliatePayout": true,
	"LoginLog": true, "AdminAuditEvent": true, "ApiCallLog": true, "Task": true, "BillingOrder": true, "User": true,
}

var tenantScopedTableNames = []string{
	"topup_products", "payment_orders", "redeem_batches", "redeem_codes", "banner_announcements", "announcements",
	"studio_posts", "studio_feedbacks", "studio_site_contents", "partner_applications", "affiliate_accounts",
	"affiliate_commissions", "affiliate_payouts", "login_logs", "admin_audit_events", "api_call_logs", "tasks",
	"billing_orders", "users",
}

var queryBuilderMethods = map[string]bool{
	"Find": true, "First": true, "Take": true, "Last": true, "Scan": true, "Count": true, "Pluck": true, "Update": true,
	"Updates": true, "UpdateColumn": true, "UpdateColumns": true, "Delete": true, "Rows": true, "Raw": true, "Exec": true,
	"FindInBatches": true,
}

var tenantConditionPattern = regexp.MustCompile(`tenant_id\s*(=|<>|!=|(?i:in)\b)`)

const (
	reasonUserOwned   = "按 user_id（或所有者字段）限定在单个用户；用户只属于一个租户"
	reasonByIDChecked = "按主键读写；app 层调用方先用 userTenantID / 所有者核对过租户"
	reasonWorker      = "后台任务、队列、租约或对账，需要处理全部租户的数据，不对外返回列表"
	reasonTaskRuntime = "任务执行链路内部（按任务 ID / 租约），任务 ID 来自已核对所有权的上游"
	reasonAuthGlobal  = "账号全局唯一性或会话级操作（按 users.id），调用方已绑定到当前用户"
	reasonAggregate   = "只做聚合或存在性判断，不返回其他租户的数据行"
	reasonHookStamped = "写入路径：tenant_id 由 GORM 钩子按所属用户补写"
)

// tenantIsolationAllowlist 是逐个审阅过、确实不需要（或不能）按租户限定的函数。
var tenantIsolationAllowlist = map[string]string{
	// 账号
	"Repository.CreateAuthSessionForUser": reasonAuthGlobal,
	"lockProfileUser":                     reasonAuthGlobal,
	"Repository.ChangeProfilePassword":    reasonAuthGlobal,
	"profileAuthorization":                reasonAuthGlobal,
	"Repository.User":                     "按主键读取；后台路径用 adminTenantUser 核对，登录态由 UserBelongsToTenant 核对",
	"Repository.UpdateUserLoginTime":      reasonAuthGlobal,
	"Repository.Users":                    "仅测试与内部工具使用，不在请求路径上",
	"Repository.UsersByIDs":               "按 ID 批量取展示名；返回 tenant_id，app 层（BulkDisableUsers 等）据此核对租户",
	"Repository.UserDisplayNames":         "按已过滤的作者 ID 取展示名，ID 来自本租户的社区作品",
	"Repository.SkillOwners":              "按技能作者 ID 取展示名，技能列表已按租户过滤",
	"Repository.UpdateUserAvatar":         reasonUserOwned,
	"Repository.RevokeAuthSessionWithLog": reasonAuthGlobal,
	"Repository.UserTenantID":             "只读取某个用户的 tenant_id，供计费判断归属",
	"Repository.UpdateSkillCuration":      "平台技能策展（只有平台管理员），审计记录按操作者补租户",
	// 后台：调用方已按租户核对或只在平台后台出现
	"Repository.APICallLog":                      "仅后台任务与内部恢复使用；后台接口改用 TenantAPICallLog",
	"Repository.DisableRedeemBatch":              "AdminDisableRedeemBatch 先用 RedeemBatch(userTenantID) 核对批次",
	"Repository.DisableRedeemCode":               "AdminDisableRedeemCode 先用 RedeemBatch(userTenantID) 核对批次",
	"Repository.AdminRedeemCodes":                "AdminRedeemCodePage 先用 RedeemBatch(userTenantID) 核对批次",
	"Repository.AnnouncementResourceReferences":  "平台存储管理（requirePlatformOperator）",
	"Repository.DeleteAdminResources":            "平台存储管理（requirePlatformOperator）",
	"Repository.AdminResources":                  "平台存储管理（requirePlatformOperator）",
	"Repository.AdminAgentLessons":               "平台经验库后台（RequirePlatformOperator）",
	"Repository.CloseAnnouncement":               "CloseAnnouncement 先用 Announcement(userTenantID) 核对",
	"Repository.AnnouncementImageReferenceCount": reasonAggregate,
	"Repository.DiscardAnnouncementImageDraft":   reasonUserOwned,
	"Repository.UpdateAnnouncementWithImage":     "app 层先用 Announcement(userTenantID) 核对公告",
	"Repository.ExportPaymentOrders":             "按传入的过滤条件（含 TenantID）导出，users 只用于补展示名",
	"Repository.TopupProduct":                    reasonByIDChecked,
	"Repository.UpdateTopupProduct":              "UpdateTopupProduct 的回调里比对 existing.TenantID",
	"Repository.TopupProductsForPlan":            "会员套餐是平台配置，商品按 plan_id 关联",
	"Repository.DeleteStudioPost":                "DeleteStudioPost 先用 StudioPost(userTenantID) 核对",
	"Repository.IncrementStudioPostRemix":        "按已核对租户的作品 ID 计数",
	"Repository.StudioPostByTask":                "按调用者自己的任务 ID 查找发布记录",
	"Repository.AffiliateAccountByCode":          "attachReferral 比对推广者与被推广者的租户",
	"Repository.AffiliatePayout":                 reasonByIDChecked,
	"Repository.PaymentOrder":                    "按主键读取；用户接口用 PaymentOrderForUser，后台接口比对订单 tenant_id",
	"Repository.PaymentOrderByMerchant":          "支付回调按商户订单号查找（全局唯一）",
	"Repository.BillingOrder":                    "按主键读取；resolveBillingOrder 比对 tenant_id，其余为任务链路内部",
	"Repository.BillingOrdersByIDs":              "按已过滤的日志/任务里的计费单 ID 取详情",
	"Repository.StaleBillingReviewStats":         reasonWorker,
	"Repository.StaleOpenTaskBillingOrders":      reasonWorker,
	"Repository.ProjectOverviewMetrics":          reasonUserOwned,
	// 统计与分析
	"Repository.AnalyticsAPICallLogs":              "过滤条件 AnalyticsFilter.TenantID 由 app 层填写，经 applyAnalyticsFilter 限定",
	"Repository.ExportAPICallLogs":                 "同上，经 APICallLogFilter 限定",
	"Repository.QueryAPICallLogs":                  "同上，经 APICallLogFilter 限定",
	"Repository.HasAPICallLogForTask":              reasonTaskRuntime,
	"Repository.HasVisibleFailedAPICallLogForTask": reasonTaskRuntime,
	"Repository.LatestAPICallForTask":              reasonTaskRuntime,
	"Repository.LatestProviderRequestIDForTask":    reasonTaskRuntime,
	"Repository.LatestProviderRequestIDsForTasks":  reasonTaskRuntime,
	"Repository.APICallLogTasks":                   "按已过滤日志里的任务 ID 取任务",
	"Repository.APICallLogUsageForTask":            reasonTaskRuntime,
	"Repository.PublicModelAvailabilityLogs":       "全站模型可用率统计，只输出按模型聚合的成功率，不含日志内容",
	"Repository.PublicModelRecentLogs":             "同上，只输出按模型聚合的状态",
	"Repository.VideoAPICallRoot":                  reasonTaskRuntime,
	"Repository.DiagnosticAPICallLogs":             reasonUserOwned,
	"Repository.DiagnosticTaskLogs":                reasonUserOwned,
	"Repository.DiagnosticTasks":                   reasonUserOwned,
	"Repository.AdminUserCounts":                   "按已核对租户的用户 ID 统计",
	"Repository.AdminUserTasks":                    "AdminUserTasks 先用 adminTenantUser 核对用户",
	// 计费与任务链路
	"Repository.MarkBillingRunning":             reasonTaskRuntime,
	"Repository.MarkBillingUncertain":           reasonTaskRuntime,
	"Repository.RecordBillingResolution":        "resolveBillingOrder 先比对 tenant_id",
	"Repository.TaskHasSuccessfulBillableCall":  reasonTaskRuntime,
	"Repository.UpdateBillingProviderRequestID": reasonTaskRuntime,
	"billingUsage":                                        reasonTaskRuntime,
	"Repository.BillingOrdersByTaskIDs":                   reasonTaskRuntime,
	"Repository.RefundBillingOrder":                       reasonTaskRuntime,
	"Repository.RestoreRefundedBillingOrder":              reasonTaskRuntime,
	"Repository.settleBillingOrder":                       reasonTaskRuntime,
	"enforceActiveTaskLimit":                              reasonUserOwned,
	"Repository.DeleteChannelModels":                      "平台渠道配置（只有平台管理员），只检查是否仍有任务引用",
	"Repository.ArchiveLogicalModel":                      "平台模型配置（只有平台管理员），只检查是否仍有任务引用",
	"Repository.CloudAgentRoots":                          reasonWorker,
	"Repository.AllTasks":                                 "存储迁移工具，平台运维",
	"Repository.ReleaseTaskLease":                         reasonTaskRuntime,
	"Repository.ClaimNextTask":                            reasonWorker,
	"Repository.ClaimNextTaskProviderCancellation":        reasonWorker,
	"Repository.DeferRunningTaskForProviderPoll":          reasonTaskRuntime,
	"Repository.ReleaseTaskProviderRecovery":              reasonTaskRuntime,
	"Repository.RenewTaskLease":                           reasonTaskRuntime,
	"Repository.SaveTaskCompletionWithRegistration":       reasonTaskRuntime,
	"Repository.Task":                                     "按主键读取；用户接口用 TaskForUser，后台接口核对任务所属用户的租户",
	"Repository.UpdateTaskProgress":                       reasonTaskRuntime,
	"Repository.UpdateTaskProgressForLease":               reasonTaskRuntime,
	"Repository.UpdateTaskProviderCancellation":           reasonTaskRuntime,
	"Repository.UpdateTaskProviderProgress":               reasonTaskRuntime,
	"Repository.UpdateTaskProviderState":                  reasonTaskRuntime,
	"Repository.UpdateTaskTerminalDiagnostic":             reasonTaskRuntime,
	"Repository.UpdateTaskTerminalState":                  reasonTaskRuntime,
	"Repository.CleanupTaskTextDeltas":                    reasonWorker,
	"Repository.CompactTaskTextDeltas":                    reasonWorker,
	"Repository.ActiveTaskCountForProjectIDs":             reasonUserOwned,
	"Repository.ActiveTaskCountForUser":                   reasonUserOwned,
	"Repository.CancelTaskIfStatus":                       reasonUserOwned,
	"Repository.ClaimFailedTaskProviderRecovery":          reasonUserOwned,
	"Repository.ClaimTaskProviderCancellation":            reasonUserOwned,
	"Repository.SuccessfulWorkflowTasksForProject":        reasonUserOwned,
	"Repository.TaskForUser":                              reasonUserOwned,
	"Repository.TasksWithWorkbenchKind":                   reasonUserOwned,
	"Repository.UpdateTaskExecutionDiagnostic":            reasonUserOwned,
	"Repository.UnboundCharacterTurnaroundTasks":          reasonUserOwned,
	"Repository.UserStorageUsage":                         reasonUserOwned,
	"Repository.DeleteCanvasProject":                      reasonUserOwned,
	"Repository.DeleteProject":                            reasonUserOwned,
	"Repository.DeleteDetachedResources":                  reasonUserOwned,
	"Repository.ResourceReferenceSnapshotExcludingAssets": reasonUserOwned,
	"Repository.RequeueTaskMediaRecovery":                 reasonUserOwned,
	"Repository.SaveTaskMediaCheckpoint":                  reasonTaskRuntime,
	"Repository.AppendTaskTextDelta":                      reasonUserOwned,
	"Repository.CompleteTextReplayTask":                   reasonUserOwned,
	"Repository.WorkbenchTasks":                           reasonUserOwned,
	"Repository.UserTasksByIDs":                           reasonUserOwned,
	"Repository.StudioOwnedTaskIDs":                       reasonUserOwned,
	"Repository.StudioTaskOwned":                          reasonUserOwned,
	"Repository.StudioTasks":                              reasonUserOwned,
	"Repository.StudioTask":                               reasonUserOwned,
	"Repository.SetStudioPostLike":                        "作品先经 StudioPost(userTenantID) 核对，点赞按 user_id 记录",
	"Repository.StudioAuthorsWithoutProfile":              reasonWorker,
	"Repository.StudioLikedPosts":                         reasonUserOwned,
	"Repository.StudioProfileStats":                       reasonUserOwned,
	"Repository.studioResourceReferences":                 reasonUserOwned,
	// 支付
	"Repository.ActivePaymentOrderCountForPlugin":                reasonAggregate,
	"Repository.AdminPaymentOrders":                              "过滤条件 PaymentOrderFilter.TenantID 由 app 层填写",
	"Repository.ClaimExpiredPaymentOrders":                       reasonWorker,
	"Repository.CreditedPaymentOrdersBetween":                    "平台对账（requirePlatformPaymentReconciliation）",
	"Repository.MarkPaymentOrderClosed":                          "按已核对的订单 ID 关单",
	"Repository.PaymentOrderCountForProvider":                    reasonAggregate,
	"Repository.PaymentOrdersNeedingQuery":                       reasonWorker,
	"Repository.RecordPaymentQuery":                              reasonWorker,
	"Repository.RestoreClosingPaymentOrder":                      reasonWorker,
	"Repository.SetPaymentOrderCheckout":                         reasonTaskRuntime,
	"Repository.SetPaymentOrderCreateFailure":                    reasonTaskRuntime,
	"Repository.UnresolvedPaymentOrderCandidateCountOverlapping": "平台对账（requirePlatformPaymentReconciliation）",
	"Repository.ActivePaymentOrderCount":                         reasonUserOwned,
	"Repository.CompletePaymentOrder":                            "支付回调按订单 ID 入账，订单本身带 tenant_id",
	"Repository.CreatePaymentOrderWithProductReservation":        reasonHookStamped,
	"Repository.PaymentOrderByIdempotency":                       reasonUserOwned,
	"Repository.PaymentOrderForUser":                             reasonUserOwned,
	"Repository.RenewalPaymentOrder":                             reasonUserOwned,
	"Repository.TopupPeriodPurchaseCount":                        reasonUserOwned,
	// 推广
	"Repository.AffiliateAccount":           reasonUserOwned,
	"Repository.AffiliateBalances":          reasonUserOwned,
	"Repository.AffiliateCommissions":       reasonUserOwned,
	"Repository.AffiliatePayouts":           reasonUserOwned,
	"Repository.ClaimAffiliatePayout":       reasonUserOwned,
	"Repository.PartnerApplication":         reasonUserOwned,
	"Repository.PartnerApplicationsForUser": reasonUserOwned,
	// 技能
}

// tenantScopeMarkers 是被视为「已限定租户」的写法。
func isTenantScopeCall(call *ast.CallExpr) bool {
	switch fun := call.Fun.(type) {
	case *ast.Ident:
		return fun.Name == "scopeTenant" || fun.Name == "TenantIDOrPlatform"
	case *ast.SelectorExpr:
		return fun.Sel.Name == "tenantScope" || fun.Sel.Name == "scopeTenant" || fun.Sel.Name == "TenantIDOrPlatform"
	}
	return false
}

type repoFunc struct {
	name       string
	refs       map[string]bool
	query      bool
	scoped     bool
	localCalls map[string]bool
}

func funcName(fn *ast.FuncDecl) string {
	if fn.Recv != nil && len(fn.Recv.List) > 0 {
		t := fn.Recv.List[0].Type
		if star, ok := t.(*ast.StarExpr); ok {
			t = star.X
		}
		if ident, ok := t.(*ast.Ident); ok {
			return ident.Name + "." + fn.Name.Name
		}
	}
	return fn.Name.Name
}

func parseRepositoryFuncs(t *testing.T) map[string]*repoFunc {
	t.Helper()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fset := token.NewFileSet()
	funcs := map[string]*repoFunc{}
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			info := &repoFunc{name: funcName(fn), refs: map[string]bool{}, localCalls: map[string]bool{}}
			ast.Inspect(fn.Body, func(node ast.Node) bool {
				switch x := node.(type) {
				case *ast.SelectorExpr:
					if ident, ok := x.X.(*ast.Ident); ok && ident.Name == "model" && tenantScopedModelNames[x.Sel.Name] {
						info.refs[x.Sel.Name] = true
					}
					if queryBuilderMethods[x.Sel.Name] {
						info.query = true
					}
					// r.tenantID 是 ForTenant 仓库自带的租户。
					if x.Sel.Name == "tenantID" {
						info.scoped = true
					}
				case *ast.CallExpr:
					if isTenantScopeCall(x) {
						info.scoped = true
					}
					switch fun := x.Fun.(type) {
					case *ast.Ident:
						info.localCalls[fun.Name] = true
					case *ast.SelectorExpr:
						if ident, ok := fun.X.(*ast.Ident); ok && ident.Name == "r" {
							info.localCalls["Repository."+fun.Sel.Name] = true
						}
					}
				case *ast.BasicLit:
					if x.Kind != token.STRING {
						return true
					}
					// 只认作为条件出现的 tenant_id（Select 里列出栏位不算限定）。
					if tenantConditionPattern.MatchString(x.Value) {
						info.scoped = true
					}
					for _, table := range tenantScopedTableNames {
						if strings.Contains(x.Value, table) {
							info.refs["table:"+table] = true
						}
					}
				}
				return true
			})
			funcs[info.name] = info
		}
	}
	return funcs
}

// directlyScoping 是自身直接限定了租户的函数；调用它们构造查询的函数也算已限定（如 applyAnalyticsFilter）。
func scopedThroughHelpers(funcs map[string]*repoFunc, name string, seen map[string]bool) bool {
	info := funcs[name]
	if info == nil || seen[name] {
		return false
	}
	seen[name] = true
	if info.scoped {
		return true
	}
	for callee := range info.localCalls {
		if callee == name {
			continue
		}
		helper := funcs[callee]
		// 只有不直接查询 B 类表的辅助函数（过滤器、条件拼装）才能把「已限定」传给调用方。
		if helper != nil && len(helper.refs) == 0 && scopedThroughHelpers(funcs, callee, seen) {
			return true
		}
	}
	return false
}

func TestRepositoryTenantScopedQueriesAreScopedOrAllowlisted(t *testing.T) {
	funcs := parseRepositoryFuncs(t)
	var missing, stale []string
	for name, info := range funcs {
		if len(info.refs) == 0 || !info.query {
			continue
		}
		if scopedThroughHelpers(funcs, name, map[string]bool{}) {
			continue
		}
		if reason, ok := tenantIsolationAllowlist[name]; ok && strings.TrimSpace(reason) != "" {
			continue
		}
		refs := make([]string, 0, len(info.refs))
		for ref := range info.refs {
			refs = append(refs, ref)
		}
		sort.Strings(refs)
		missing = append(missing, name+" ["+strings.Join(refs, ",")+"]")
	}
	for name := range tenantIsolationAllowlist {
		info := funcs[name]
		if info == nil || len(info.refs) == 0 || !info.query || scopedThroughHelpers(funcs, name, map[string]bool{}) {
			stale = append(stale, name)
		}
	}
	sort.Strings(missing)
	sort.Strings(stale)
	if os.Getenv("TENANT_STATIC_PRINT") != "" {
		t.Logf("missing:\n%s\nstale:\n%s", strings.Join(missing, "\n"), strings.Join(stale, "\n"))
	}
	if len(missing) > 0 {
		t.Errorf("这些仓库函数查询了按租户隔离的表，却没有限定租户，也没有登记在 tenantIsolationAllowlist（请加 scopeTenant，或审阅后登记理由）：\n%s", strings.Join(missing, "\n"))
	}
	if len(stale) > 0 {
		t.Errorf("tenantIsolationAllowlist 里有已不存在或不再查询 B 类表的函数，请删除：\n%s", strings.Join(stale, "\n"))
	}
}

// TestTenantStaticCheckDetectsUnscopedQuery 确认检查本身有效：去掉租户限定的查询会被报告。
func TestTenantStaticCheckDetectsUnscopedQuery(t *testing.T) {
	source := `package repository
func (r *Repository) leaky(id string) error { return r.db.Where("id = ?", id).Find(&model.ApiCallLog{}).Error }
func (r *Repository) safe(tenantID string) error { return scopeTenant(r.db, tenantID).Find(&model.ApiCallLog{}).Error }
`
	file, err := parser.ParseFile(token.NewFileSet(), "fixture.go", source, 0)
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, decl := range file.Decls {
		fn := decl.(*ast.FuncDecl)
		scoped := false
		ast.Inspect(fn.Body, func(node ast.Node) bool {
			if call, ok := node.(*ast.CallExpr); ok && isTenantScopeCall(call) {
				scoped = true
			}
			return true
		})
		found[funcName(fn)] = scoped
	}
	if found["Repository.leaky"] || !found["Repository.safe"] {
		t.Fatalf("static check classification is wrong: %v", found)
	}
}
