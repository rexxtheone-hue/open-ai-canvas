package handler

// 跨租户端到端扫描：经由真实路由（TenantMiddleware + RegisterCanvasAPI），
// 让代理商 A 的各种身份去读写代理商 B 与平台的数据（猜 ID、在请求体里塞别家的 ID），
// 断言响应里看不到别家的标记文字，且别家的数据行在扫描前后没有任何变化。

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	sweepShareTokenB = "zbsharetokenzbsharetokenzbsharetoken0001"
	sweepShareTokenP = "zpsharetokenzpsharetokenzpsharetoken0001"
)

// sweepKinds 是每家各种下一份的数据；ID 为 zb-<kind>（代理商 B）与 zp-<kind>（平台）。
var sweepKinds = []struct {
	kind      string
	prototype any
}{
	{"project", model.Project{}}, {"task", model.Task{}}, {"asset", model.Asset{}}, {"asset_folder", model.AssetFolder{}},
	{"canvas_project", model.CanvasProject{}}, {"canvas_share", model.CanvasShare{}}, {"creation_run", model.CreationRun{}},
	{"agent_lesson", model.AgentLesson{}}, {"cloud_agent_execution", model.CloudAgentExecution{}}, {"resource", model.Resource{}},
	{"skill", model.Skill{}}, {"skill_library_category", model.SkillLibraryCategory{}}, {"studio_brand_kit", model.StudioBrandKit{}},
	{"studio_character", model.StudioCharacter{}}, {"studio_chat_session", model.StudioChatSession{}}, {"studio_chat_message", model.StudioChatMessage{}},
	{"studio_post", model.StudioPost{}}, {"studio_folder", model.StudioFolder{}}, {"studio_label", model.StudioLabel{}},
	{"studio_portrait", model.StudioPortrait{}}, {"studio_portrait_photo", model.StudioPortraitPhoto{}}, {"studio_story", model.StudioStory{}},
	{"studio_upload", model.StudioUpload{}}, {"studio_voice", model.StudioVoice{}}, {"style_profile", model.StyleProfile{}},
	{"tool", model.Tool{}}, {"payment_order", model.PaymentOrder{}}, {"announcement", model.Announcement{}},
	{"banner_announcement", model.BannerAnnouncement{}}, {"affiliate_account", model.AffiliateAccount{}}, {"affiliate_commission", model.AffiliateCommission{}},
	{"affiliate_payout", model.AffiliatePayout{}}, {"api_call_log", model.ApiCallLog{}}, {"billing_order", model.BillingOrder{}},
	{"login_log", model.LoginLog{}}, {"partner_application", model.PartnerApplication{}}, {"topup_product", model.TopupProduct{}},
	{"redeem_batch", model.RedeemBatch{}}, {"redeem_code", model.RedeemCode{}}, {"studio_feedback", model.StudioFeedback{}},
	{"admin_audit_event", model.AdminAuditEvent{}}, {"project_unit", model.ProjectUnit{}}, {"shot", model.Shot{}},
	{"voice_profile", model.VoiceProfile{}}, {"credit_ledger_entry", model.CreditLedgerEntry{}},
}

// 名称类栏位写入标记文字，响应里出现即视为泄漏。
var sweepMarkerFields = map[string]bool{
	"Name": true, "Title": true, "DisplayName": true, "Description": true, "Content": true, "Prompt": true, "Summary": true,
	"Note": true, "Remark": true, "Body": true, "Message": true, "Bio": true, "Topic": true, "Lesson": true, "Situation": true,
	"Caption": true, "Text": true, "OriginalName": true, "FileName": true, "Filename": true, "Label": true, "Subject": true,
	"Comment": true, "Instruction": true, "Account": true, "Username": true, "ContactName": true, "Contact": true, "RequestBody": true,
	"ResponseBody": true, "ErrorMessage": true, "Detail": true, "Location": true, "Code": false,
}

// sweepUserFields 指向数据所有者的栏位。
var sweepUserFields = map[string]bool{"UserID": true, "OwnerID": true, "AuthorUserID": true, "AffiliateUserID": true, "ActorUserID": true, "CreatedBy": true, "TargetUserID": true}

type sweepSide struct {
	prefix   string // zb / zp
	marker   string // ZZB / ZZP
	tenantID string
	userID   string
}

func sweepSetField(v reflect.Value, name string, value any) {
	field := v.FieldByName(name)
	if !field.IsValid() || !field.CanSet() {
		return
	}
	val := reflect.ValueOf(value)
	if field.Kind() == reflect.Pointer && val.Kind() != reflect.Pointer {
		ptr := reflect.New(field.Type().Elem())
		if val.Type().ConvertibleTo(field.Type().Elem()) {
			ptr.Elem().Set(val.Convert(field.Type().Elem()))
			field.Set(ptr)
		}
		return
	}
	if val.Type().ConvertibleTo(field.Type()) {
		field.Set(val.Convert(field.Type()))
	}
}

func sweepRow(prototype any, kind string, side sweepSide) any {
	value := reflect.New(reflect.TypeOf(prototype))
	elem := value.Elem()
	now := time.Now().UTC()
	for i := 0; i < elem.NumField(); i++ {
		field := elem.Type().Field(i)
		if !field.IsExported() || strings.Contains(field.Tag.Get("gorm"), "-") && field.Tag.Get("gorm") == "-" {
			continue
		}
		name := field.Name
		switch {
		case name == "ID":
			sweepSetField(elem, name, side.prefix+"-"+kind)
		case name == "TenantID":
			sweepSetField(elem, name, side.tenantID)
		case sweepUserFields[name]:
			sweepSetField(elem, name, side.userID)
		case name == "ProjectID":
			sweepSetField(elem, name, side.prefix+"-project")
		case name == "TaskID":
			sweepSetField(elem, name, side.prefix+"-task")
		case name == "ResourceID":
			sweepSetField(elem, name, side.prefix+"-resource")
		case name == "SessionID" || name == "ChatSessionID":
			sweepSetField(elem, name, side.prefix+"-studio_chat_session")
		case name == "BatchID":
			sweepSetField(elem, name, side.prefix+"-redeem_batch")
		case name == "PortraitID":
			sweepSetField(elem, name, side.prefix+"-studio_portrait")
		case name == "AssetID":
			sweepSetField(elem, name, side.prefix+"-asset")
		case name == "BillingOrderID":
			sweepSetField(elem, name, side.prefix+"-billing_order")
		case name == "CreatedAt" || name == "UpdatedAt" || name == "PublishedAt":
			sweepSetField(elem, name, now)
		case sweepMarkerFields[name] && field.Type.Kind() == reflect.String:
			sweepSetField(elem, name, side.marker+"-"+kind+"-"+strings.ToLower(name))
		}
		if f := elem.Field(i); f.Kind() == reflect.String && f.String() == "" && strings.Contains(field.Tag.Get("gorm"), "unique") {
			f.SetString(side.prefix + "-" + kind + "-" + strings.ToLower(name))
		}
	}
	switch kind {
	case "skill":
		sweepSetField(elem, "Status", 1)
		sweepSetField(elem, "IsPrivate", false)
		sweepSetField(elem, "SourceType", "upload")
	case "studio_post":
		sweepSetField(elem, "Status", string(model.StudioPostPublished))
		sweepSetField(elem, "AllowRemix", true)
		sweepSetField(elem, "IsTemplate", true)
		sweepSetField(elem, "Featured", true)
	case "announcement":
		sweepSetField(elem, "Status", string(model.AnnouncementStatusActive))
	case "banner_announcement":
		sweepSetField(elem, "Status", "active")
	case "topup_product":
		sweepSetField(elem, "Enabled", true)
		sweepSetField(elem, "AmountFen", int64(100))
		sweepSetField(elem, "CreditsMicrocredits", int64(1_000_000))
	case "canvas_share":
		token := sweepShareTokenB
		if side.prefix == "zp" {
			token = sweepShareTokenP
		}
		sum := sha256.Sum256([]byte(token))
		sweepSetField(elem, "TokenHash", hex.EncodeToString(sum[:]))
		sweepSetField(elem, "Enabled", true)
		sweepSetField(elem, "ProjectID", side.prefix+"-canvas_project")
	case "canvas_project":
		sweepSetField(elem, "PayloadJSON", `{"id":"`+side.prefix+`-canvas_project","title":"`+side.marker+`-canvas-title","nodes":[]}`)
	case "redeem_code":
		sweepSetField(elem, "CodeHash", side.prefix+"-code-hash")
	case "affiliate_account":
		sweepSetField(elem, "Code", strings.ToUpper(side.prefix)+"CODE")
		sweepSetField(elem, "Status", string(model.AffiliateStatusActive))
	}
	return value.Interface()
}

type sweepFixture struct {
	t      *testing.T
	db     *gorm.DB
	router *gin.Engine
	ids    map[string]map[string]string // side prefix -> kind -> id
	roles  map[string]model.UserRole
}

func newSweepFixture(t *testing.T) *sweepFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	expires := time.Now().Add(24 * time.Hour)
	base := []any{
		&model.Tenant{ID: "agency-a", Slug: "agency-a", Name: "Agency A", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "da", TenantID: "agency-a", Host: agencyAHost},
		&model.Tenant{ID: "agency-b", Slug: "agency-b", Name: "ZZB-tenant-name", Status: model.TenantStatusActive},
		&model.TenantDomain{ID: "db", TenantID: "agency-b", Host: agencyBHost},
		&model.User{ID: "platform-admin", Username: "platform-admin", DisplayName: "ZZP-admin-name", Email: "zzp-admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive},
		&model.User{ID: "platform-user", Username: "zzp-user", DisplayName: "ZZP-user-name", Email: "zzp-user@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.User{ID: "user-a", TenantID: "agency-a", Username: "user-a", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.User{ID: "tadmin-a", TenantID: "agency-a", Username: "tadmin-a", Role: model.UserRoleTenantAdmin, Status: model.UserStatusActive},
		// 代理商租户里的 admin 角色账号：用来验证即使代理商拿到后台权限，也只能看到自己租户的数据。
		&model.User{ID: "sadmin-a", TenantID: "agency-a", Username: "sadmin-a", Role: model.UserRoleAdmin, Status: model.UserStatusActive},
		&model.User{ID: "user-b", TenantID: "agency-b", Username: "zzb-user", DisplayName: "ZZB-user-name", Email: "zzb-user@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.User{ID: "admin-b", TenantID: "agency-b", Username: "zzb-admin", DisplayName: "ZZB-admin-name", Role: model.UserRoleTenantAdmin, Status: model.UserStatusActive},
		&model.StudioProfile{UserID: "user-b", Handle: "zzbhandle", Name: "ZZB-profile-name", Bio: "ZZB-profile-bio"},
		&model.StudioProfile{UserID: "platform-user", Handle: "zzphandle", Name: "ZZP-profile-name", Bio: "ZZP-profile-bio"},
		&model.StudioFollow{FollowerID: "platform-user", FolloweeID: "user-b"},
		&model.StudioSiteContent{TenantID: "agency-b", Key: "help", Content: `{"title":"ZZB-help"}`},
		&model.StudioSiteContent{TenantID: model.PlatformTenantID, Key: "help", Content: `{"title":"ZZP-help"}`},
		&model.TenantModelPrice{ID: "zb-tenant_model_price", TenantID: "agency-b", ChannelModelID: func() *string { v := "zb-channel-model"; return &v }()},
		&model.TenantSetting{ID: "zb-tenant_setting", TenantID: "agency-b", Key: "appearance", ValueJSON: `{"brandName":"ZZB-brand"}`},
	}
	for _, id := range []string{"platform-admin", "platform-user", "user-a", "tadmin-a", "sadmin-a", "user-b", "admin-b"} {
		base = append(base, &model.AuthSession{ID: "s-" + id, UserID: id, TokenHash: auth.HashToken("t"), ExpiresAt: expires})
	}
	for _, record := range base {
		if err := db.Create(record).Error; err != nil {
			t.Fatalf("seed %T: %v", record, err)
		}
	}
	f := &sweepFixture{t: t, db: db, ids: map[string]map[string]string{"zb": {}, "zp": {}}, roles: map[string]model.UserRole{}}
	for _, record := range base {
		if user, ok := record.(*model.User); ok {
			f.roles[user.ID] = user.Role
		}
	}
	for _, side := range []sweepSide{{"zb", "ZZB", "agency-b", "user-b"}, {"zp", "ZZP", model.PlatformTenantID, "platform-user"}} {
		for _, entry := range sweepKinds {
			row := sweepRow(entry.prototype, entry.kind, side)
			// 跳过钩子：数据按上面填好的 tenant_id 落库。
			if err := db.Session(&gorm.Session{SkipHooks: true}).Create(row).Error; err != nil {
				t.Fatalf("seed %s/%s: %v", side.prefix, entry.kind, err)
			}
			f.ids[side.prefix][entry.kind] = side.prefix + "-" + entry.kind
		}
	}
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, ".settings-key"), []byte(strings.Repeat("k", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), dataDir)
	previous := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { runtimeService = previous })
	router := gin.New()
	router.Use(TenantMiddleware(svc))
	RegisterCanvasAPI(router.Group("/api"), svc)
	f.router = router
	return f
}

// sweepIDKind 按路由前缀推断 :id 对应的数据类型；推断不出时用全部类型。
var sweepIDKind = []struct{ prefix, kind string }{
	{"/api/admin/users/", "@user"}, {"/api/admin/affiliates/", "@user"}, {"/api/auth/profile/avatar/", "@user"},
	{"/api/admin/tenants/", "@tenant"}, {"/api/admin/tenant-billing/tenants/", "@tenant"},
	{"/api/tenant-admin/billing/prices/", "@tenant_model_price"},
	{"/api/projects/", "project"}, {"/api/tasks/", "task"}, {"/api/assets/", "asset"}, {"/api/asset-folders/", "asset_folder"},
	{"/api/canvas-projects/", "canvas_project"}, {"/api/creation-runs/", "creation_run"}, {"/api/agent/memories/", "agent_lesson"},
	{"/api/agent/runs/", "cloud_agent_execution"}, {"/api/resources/", "resource"}, {"/api/public/resources/", "resource"},
	{"/api/skills/library-categories/", "skill_library_category"}, {"/api/skills/", "skill"},
	{"/api/studio/brand-kits/", "studio_brand_kit"}, {"/api/studio/characters/", "studio_character"},
	{"/api/studio/chats/", "studio_chat_session"}, {"/api/studio/community/", "studio_post"}, {"/api/studio/folders/", "studio_folder"},
	{"/api/studio/labels/", "studio_label"}, {"/api/studio/portrait-photos/", "studio_portrait_photo"}, {"/api/studio/portraits/", "studio_portrait"},
	{"/api/studio/stories/", "studio_story"}, {"/api/studio/uploads/", "studio_upload"}, {"/api/studio/voices/", "studio_voice"},
	{"/api/studio/works/", "task"}, {"/api/style-profiles/", "style_profile"}, {"/api/tools/", "tool"},
	{"/api/payments/orders/", "payment_order"}, {"/api/announcements/", "announcement"}, {"/api/admin/announcements/", "announcement"},
	{"/api/admin/banner-announcements/", "banner_announcement"}, {"/api/admin/affiliate-payouts/", "affiliate_payout"},
	{"/api/admin/agent-lessons/", "agent_lesson"}, {"/api/admin/api-logs/", "api_call_log"}, {"/api/admin/billing-orders/", "billing_order"},
	{"/api/admin/login-logs/", "login_log"}, {"/api/admin/partner-applications/", "partner_application"},
	{"/api/admin/payments/orders/", "payment_order"}, {"/api/admin/payments/products/", "topup_product"},
	{"/api/admin/redeem-batches/", "redeem_batch"}, {"/api/admin/resources/", "resource"}, {"/api/admin/studio/community/", "studio_post"},
	{"/api/admin/studio/feedback/", "studio_feedback"}, {"/api/admin/announcement-images/", "resource"},
}

var sweepParamKind = map[string]string{
	"assetId": "asset", "canvasId": "canvas_project", "unitId": "project_unit", "shotId": "shot", "folderId": "asset_folder",
	"userId": "@user", "resourceId": "resource", "messageId": "studio_chat_message", "codeId": "redeem_code",
	"referenceId": "asset", "domainId": "@domain", "handle": "@handle", "token": "@token", "candidateId": "asset",
}

func (f *sweepFixture) values(side, kind string) []string {
	switch kind {
	case "@user":
		if side == "zb" {
			return []string{"user-b", "admin-b"}
		}
		return []string{"platform-user", "platform-admin"}
	case "@tenant":
		if side == "zb" {
			return []string{"agency-b"}
		}
		return []string{model.PlatformTenantID}
	case "@domain":
		return []string{"db"}
	case "@handle":
		if side == "zb" {
			return []string{"zzbhandle"}
		}
		return []string{"zzphandle"}
	case "@token":
		if side == "zb" {
			return []string{sweepShareTokenB}
		}
		return []string{sweepShareTokenP}
	case "@tenant_model_price":
		if side == "zb" {
			return []string{"zb-tenant_model_price"}
		}
		return nil
	case "":
		ids := make([]string, 0, len(f.ids[side]))
		for _, id := range f.ids[side] {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		return ids
	}
	if id := f.ids[side][kind]; id != "" {
		return []string{id}
	}
	return []string{side + "-" + kind}
}

var sweepParamPattern = regexp.MustCompile(`[:*][A-Za-z]+`)

// expand 把路由模板换成具体路径：:id 遍历推断出的别家 ID，其余参数各取一个。
func (f *sweepFixture) expand(route, side string) []string {
	idKind := ""
	for _, entry := range sweepIDKind {
		if strings.HasPrefix(route, entry.prefix) {
			idKind = entry.kind
			break
		}
	}
	var paths []string
	ids := f.values(side, idKind)
	if !strings.Contains(route, ":id") {
		ids = []string{""}
	}
	for _, id := range ids {
		path := sweepParamPattern.ReplaceAllStringFunc(route, func(param string) string {
			name := param[1:]
			switch {
			case name == "id":
				return id
			case param[0] == '*':
				return "x"
			case name == "index":
				return "0"
			case name == "filename":
				return "file.png"
			case name == "key":
				return "help"
			case name == "operation":
				return "image"
			}
			if kind, ok := sweepParamKind[name]; ok {
				if values := f.values(side, kind); len(values) > 0 {
					return values[0]
				}
			}
			return side + "-" + name
		})
		paths = append(paths, path)
	}
	return paths
}

// body 是塞满别家 ID 的通用请求体；处理函数只会读取自己认识的字段。
func (f *sweepFixture) body(side string) []byte {
	one := func(kind string) string { return f.values(side, kind)[0] }
	all := f.values(side, "")
	users := f.values(side, "@user")
	payload := map[string]any{
		"id": all[0], "ids": all, "userId": users[0], "userIds": users, "user_ids": users,
		"taskId": one("task"), "taskIds": []string{one("task")}, "projectId": one("project"), "resourceId": one("resource"),
		"resourceIds": []string{one("resource")}, "assetId": one("asset"), "assetIds": []string{one("asset")},
		"canvasId": one("canvas_project"), "folderId": one("asset_folder"), "folderIds": []string{one("studio_folder")},
		"labelIds": []string{one("studio_label")}, "skillId": one("skill"), "skillIds": []string{one("skill")},
		"sessionId": one("studio_chat_session"), "messageId": one("studio_chat_message"), "orderId": one("payment_order"),
		"productId": one("topup_product"), "announcementIds": []string{one("announcement")}, "logId": one("api_call_log"),
		"unitId": one("project_unit"), "unitIds": []string{one("project_unit")}, "shotId": one("shot"), "handle": f.values(side, "@handle")[0],
		"imageResourceId": one("resource"), "imageResourceIds": []string{one("resource")}, "coverResourceId": one("resource"),
		"avatarResourceId": one("resource"), "voiceProfileId": one("voice_profile"), "parentId": one("asset_folder"),
		"runId": one("cloud_agent_execution"), "agentRunId": one("cloud_agent_execution"), "characterAssetId": one("asset"),
		"code": strings.ToUpper(side) + "CODE", "submittedTaskIds": []string{one("task")}, "objectIds": all,
	}
	encoded, _ := json.Marshal(payload)
	return encoded
}

func (f *sweepFixture) query(side string) string {
	return "?userId=" + f.values(side, "@user")[0] + "&user=" + f.values(side, "@user")[0] + "&taskId=" + f.values(side, "task")[0] +
		"&projectId=" + f.values(side, "project")[0] + "&tenantId=" + f.values(side, "@tenant")[0] + "&limit=50"
}

type sweepResult struct {
	code    int
	body    string
	timeout bool
}

func (f *sweepFixture) do(method, host, session, path string, body []byte) sweepResult {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var reader *strings.Reader
	if body != nil {
		reader = strings.NewReader(string(body))
	} else {
		reader = strings.NewReader("")
	}
	r := httptest.NewRequest(method, path, reader).WithContext(ctx)
	r.Host = host
	r.RemoteAddr = "203.0.113.9:1234"
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	if session != "" {
		r.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session + ".t"})
	}
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer func() { _ = recover() }()
		f.router.ServeHTTP(w, r)
	}()
	select {
	case <-done:
		return sweepResult{code: w.Code, body: w.Body.String()}
	case <-time.After(8 * time.Second):
		return sweepResult{timeout: true}
	}
}

// snapshotFiltered 记下所有含别家标记或 ID 的数据行，扫描后逐行比对。
func (f *sweepFixture) snapshotFiltered(foreign func(string) bool) map[string]string {
	var tables []string
	f.db.Raw("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").Scan(&tables)
	rows := map[string]string{}
	for _, table := range tables {
		var records []map[string]any
		if err := f.db.Table(table).Find(&records).Error; err != nil {
			continue
		}
		for index, record := range records {
			encoded, _ := json.Marshal(record)
			text := string(encoded)
			if !foreign(text) {
				continue
			}
			key := table + "#" + fmt.Sprint(record["id"])
			if record["id"] == nil {
				key = table + "#" + fmt.Sprint(index) + "#" + text
			}
			rows[key] = text
		}
	}
	return rows
}

func sweepForeign(text string) bool {
	return strings.Contains(text, "ZZB") || strings.Contains(text, "ZZP") || strings.Contains(text, `"zb-`) || strings.Contains(text, `"zp-`) ||
		strings.Contains(text, `"user-b"`) || strings.Contains(text, `"platform-user"`) || strings.Contains(text, `"agency-b"`)
}

// sweepSkipRoutes 不在扫描中执行的路由及原因。
var sweepSkipRoutes = map[string]string{
	"POST /api/admin/system-update/start":    "会启动宿主机更新；平台专属（requireSuperAdmin），代理商被 AgencyAdminCanAccess 拒绝，由 TestAgencyAdminRouteGuard 覆盖",
	"POST /api/admin/system-update/rollback": "同上，会回滚宿主机版本",
	"POST /api/admin/system-update/check":    "同上，会访问更新服务器",
}

// sweepNoiseTables 记录尝试本身（审计、限流、登录日志）的表：新行里带别家 ID 是正常的。
var sweepNoiseTables = map[string]bool{"admin_audit_events": true, "login_logs": true, "rate_limit_buckets": true}

// restoreSession 让登出、改密码之类的请求不影响后续扫描：每次请求前把会话和账号恢复原样。
func (f *sweepFixture) restoreSession(session string) {
	if session == "" {
		return
	}
	userID := strings.TrimPrefix(session, "s-")
	f.db.Session(&gorm.Session{SkipHooks: true}).Save(&model.AuthSession{ID: session, UserID: userID, TokenHash: auth.HashToken("t"), ExpiresAt: time.Now().Add(24 * time.Hour), CreatedAt: time.Now()})
	f.db.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{"status": model.UserStatusActive, "role": f.roles[userID]})
}

type sweepActor struct {
	name, host, session string
}

type sweepPass struct {
	actors  []sweepActor
	sides   []string // 用哪几家的 ID 去猜
	markers []string // 响应里不能出现的标记
	foreign func(string) bool
	// platformOnly 为真时跳过 sweepPlatformCrossTenantRoutes：这些是平台刻意跨租户管理的接口。
	platformOnly bool
}

// sweepPlatformCrossTenantRoutes 是平台管理员刻意跨租户使用的后台接口（按前缀），平台管理员那一轮不扫描。
// 代理商身份那一轮照常扫描，确认代理商进不去。
var sweepPlatformCrossTenantRoutes = map[string]string{
	"/api/admin/tenants":        "开设、管理代理商与网址（requirePlatformAdmin）",
	"/api/admin/tenant-billing": "代理商批发积分池、折扣与结算（requirePlatformAdmin）",
	"/api/admin/resources":      "全站对象存储管理，平台运维职责（requirePlatformOperator）",
	"/api/admin/storage":        "全站存储统计（requirePlatformOperator）",
	"/api/admin/agent-lessons":  "全站 Agent 经验库审核（requirePlatformOperator）",
}

func sweepPlatformCrossTenant(path string) bool {
	for prefix := range sweepPlatformCrossTenantRoutes {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

// run 执行一轮扫描，返回发现的问题与覆盖到的路由数。
func (f *sweepFixture) run(t *testing.T, pass sweepPass) ([]string, int, int) {
	before := f.snapshotFiltered(pass.foreign)
	if len(before) == 0 {
		t.Fatal("seed snapshot is empty")
	}
	routes := f.router.Routes()
	sort.Slice(routes, func(i, j int) bool { return routes[i].Path+routes[i].Method < routes[j].Path+routes[j].Method })
	var findings []string
	covered, requests := 0, 0
	for _, route := range routes {
		if _, skip := sweepSkipRoutes[route.Method+" "+route.Path]; skip {
			continue
		}
		if pass.platformOnly && sweepPlatformCrossTenant(route.Path) {
			continue
		}
		switch route.Method {
		case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		default:
			continue
		}
		covered++
		for _, actor := range pass.actors {
			for _, side := range pass.sides {
				var body []byte
				if route.Method != http.MethodGet {
					body = f.body(side)
				}
				for _, path := range f.expand(route.Path, side) {
					requests++
					f.restoreSession(actor.session)
					result := f.do(route.Method, actor.host, actor.session, path+f.query(side), body)
					if result.timeout {
						findings = append(findings, fmt.Sprintf("%s %s as %s: timeout", route.Method, path, actor.name))
						continue
					}
					for _, marker := range pass.markers {
						index := strings.Index(result.body, marker)
						if index < 0 {
							continue
						}
						start, end := index-80, index+80
						if start < 0 {
							start = 0
						}
						if end > len(result.body) {
							end = len(result.body)
						}
						findings = append(findings, fmt.Sprintf("%s %s as %s: %d leaks foreign data: %s", route.Method, path, actor.name, result.code, result.body[start:end]))
						break
					}
				}
			}
		}
	}
	after := f.snapshotFiltered(pass.foreign)
	for key, row := range before {
		if after[key] != row {
			findings = append(findings, fmt.Sprintf("foreign row changed: %s\n  before %s\n  after  %s", key, row, after[key]))
		}
	}
	for key, row := range after {
		if _, ok := before[key]; ok || sweepNoiseTables[strings.SplitN(key, "#", 2)[0]] {
			continue
		}
		findings = append(findings, fmt.Sprintf("new row references foreign data: %s %s", key, row))
	}
	return findings, covered, requests
}

func sweepForeignB(text string) bool {
	return strings.Contains(text, "ZZB") || strings.Contains(text, `"zb-`) || strings.Contains(text, `"user-b"`) || strings.Contains(text, `"admin-b"`) || strings.Contains(text, `"agency-b"`)
}

// TestCrossTenantRouteSweep 用代理商 A 的匿名访客、普通用户、代理商管理员、以及（假设存在的）admin 角色账号，
// 在 A 的网址上猜 B 和平台的 ID；再用平台管理员在平台网址上猜 B 的 ID。
func TestCrossTenantRouteSweep(t *testing.T) {
	if testing.Short() {
		t.Skip("跨租户扫描较慢")
	}
	f := newSweepFixture(t)
	f.assertOwnersSeeSeeds(t)
	agencyFindings, covered, agencyRequests := f.run(t, sweepPass{
		actors: []sweepActor{
			{"anonymous@A", agencyAHost, ""},
			{"user-a@A", agencyAHost, "s-user-a"},
			{"tenant-admin-a@A", agencyAHost, "s-tadmin-a"},
			{"agency-admin-role-a@A", agencyAHost, "s-sadmin-a"},
		},
		sides: []string{"zb", "zp"}, markers: []string{"ZZB", "ZZP"}, foreign: sweepForeign,
	})
	platformFindings, _, platformRequests := f.run(t, sweepPass{
		actors: []sweepActor{{"platform-admin@P", platformHost, "s-platform-admin"}, {"anonymous@P", platformHost, ""}, {"platform-user@P", platformHost, "s-platform-user"}},
		sides:  []string{"zb"}, markers: []string{"ZZB"}, foreign: sweepForeignB, platformOnly: true,
	})
	findings := append(agencyFindings, platformFindings...)
	t.Logf("cross-tenant sweep: %d routes registered, %d swept, %d skipped (%v), %d requests", len(f.router.Routes()), covered, len(sweepSkipRoutes), keysOf(sweepSkipRoutes), agencyRequests+platformRequests)
	if len(findings) > 0 {
		sort.Strings(findings)
		t.Fatalf("%d cross-tenant findings:\n%s", len(findings), strings.Join(findings, "\n"))
	}
}

func keysOf(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// assertOwnersSeeSeeds 是对照组：数据的主人自己能看到这些标记，证明扫描不是因为种子数据不可见才「通过」。
func (f *sweepFixture) assertOwnersSeeSeeds(t *testing.T) {
	for _, check := range []struct{ host, session, path, marker string }{
		{agencyBHost, "s-user-b", "/api/projects", "ZZB"},
		{agencyBHost, "s-user-b", "/api/tasks/zb-task", "ZZB"},
		{agencyBHost, "s-user-b", "/api/skills", "ZZB"},
		{agencyBHost, "s-user-b", "/api/studio/chats/zb-studio_chat_session", "ZZB"},
		{agencyBHost, "", "/api/studio/community", "ZZB"},
		{agencyBHost, "", "/api/studio/profiles/zzbhandle", "ZZB"},
		{agencyBHost, "", "/api/public/canvas-shares/" + sweepShareTokenB, "ZZB"},
		{platformHost, "s-platform-admin", "/api/admin/users", "ZZP"},
		{platformHost, "s-platform-admin", "/api/admin/api-logs/zp-api_call_log", "ZZP"},
		{platformHost, "s-platform-admin", "/api/admin/payments/orders", "ZZP"},
		{platformHost, "s-platform-admin", "/api/admin/login-logs", "ZZP"},
	} {
		f.restoreSession(check.session)
		result := f.do(http.MethodGet, check.host, check.session, check.path, nil)
		if !strings.Contains(result.body, check.marker) {
			t.Fatalf("control: owner should see %s at %s on %s: %d %s", check.marker, check.path, check.host, result.code, result.body)
		}
	}
}
