package handler

import (
	"encoding/json"
	"net/http"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// RegisterStudioAgentRoutes 注册 AI Studio 自有的角色库、对话模式和导演模式接口，与画布数据互不相通。
func RegisterStudioAgentRoutes(r *gin.RouterGroup, svc *service.Service) {
	withUser := func(handle func(c *gin.Context, user *model.User)) gin.HandlerFunc {
		return func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			handle(c, user)
		}
	}
	bind := func(c *gin.Context, target any) bool {
		if err := c.ShouldBindJSON(target); err != nil {
			fail(c, http.StatusBadRequest, err)
			return false
		}
		return true
	}
	respond := func(c *gin.Context, value any, err error) {
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, value)
	}

	r.POST("/studio/works/lookup", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			IDs []string `json:"ids"`
		}
		if !bind(c, &req) {
			return
		}
		works, err := svc.StudioWorksByIDs(user.ID, req.IDs)
		respond(c, gin.H{"works": works}, err)
	}))

	r.GET("/studio/organize", withUser(func(c *gin.Context, user *model.User) {
		data, err := svc.StudioOrganizeData(user.ID)
		respond(c, data, err)
	}))
	r.POST("/studio/folders", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name string `json:"name"`
		}
		if !bind(c, &req) {
			return
		}
		item, err := svc.CreateStudioFolder(user.ID, req.Name)
		respond(c, item, err)
	}))
	r.PATCH("/studio/folders/:id", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name string `json:"name"`
		}
		if !bind(c, &req) {
			return
		}
		respond(c, gin.H{"updated": true}, svc.RenameStudioFolder(user.ID, c.Param("id"), req.Name))
	}))
	r.DELETE("/studio/folders/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioFolder(user.ID, c.Param("id")))
	}))
	r.POST("/studio/labels", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if !bind(c, &req) {
			return
		}
		item, err := svc.CreateStudioLabel(user.ID, req.Name, req.Color)
		respond(c, item, err)
	}))
	r.PATCH("/studio/labels/:id", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if !bind(c, &req) {
			return
		}
		respond(c, gin.H{"updated": true}, svc.UpdateStudioLabel(user.ID, c.Param("id"), req.Name, req.Color))
	}))
	r.DELETE("/studio/labels/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioLabel(user.ID, c.Param("id")))
	}))
	r.POST("/studio/works/folder", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			TaskIDs  []string `json:"taskIds"`
			FolderID string   `json:"folderId"`
		}
		if !bind(c, &req) {
			return
		}
		moved, err := svc.MoveStudioWorks(user.ID, req.TaskIDs, req.FolderID)
		respond(c, gin.H{"moved": moved}, err)
	}))
	r.POST("/studio/works/labels", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			TaskIDs []string `json:"taskIds"`
			LabelID string   `json:"labelId"`
			Add     bool     `json:"add"`
		}
		if !bind(c, &req) {
			return
		}
		updated, err := svc.LabelStudioWorks(user.ID, req.TaskIDs, req.LabelID, req.Add)
		respond(c, gin.H{"updated": updated}, err)
	}))

	r.POST("/studio/feedback", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Category string `json:"category"`
			Content  string `json:"content"`
			Contact  string `json:"contact"`
			Page     string `json:"page"`
		}
		if !bind(c, &req) {
			return
		}
		item, err := svc.SubmitStudioFeedback(user.ID, req.Category, req.Content, req.Contact, req.Page)
		respond(c, gin.H{"id": item.ID}, err)
	}))
	r.GET("/studio/site-content", withUser(func(c *gin.Context, _ *model.User) {
		content, err := svc.StudioSiteContent()
		respond(c, content, err)
	}))
	r.GET("/admin/studio/feedback", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.AdminStudioFeedback(user, c.Query("status"))
		respond(c, gin.H{"items": items}, err)
	}))
	r.PATCH("/admin/studio/feedback/:id", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Status string `json:"status"`
		}
		if !bind(c, &req) {
			return
		}
		respond(c, gin.H{"updated": true}, svc.SetStudioFeedbackStatus(user, c.Param("id"), req.Status))
	}))
	r.PUT("/admin/studio/site-content/:key", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Content string `json:"content"`
		}
		if !bind(c, &req) {
			return
		}
		respond(c, gin.H{"saved": true}, svc.SaveStudioSiteContent(user, c.Param("key"), req.Content))
	}))

	r.GET("/studio/voices", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.StudioVoices(user.ID)
		respond(c, gin.H{"items": items}, err)
	}))
	r.POST("/studio/voices", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name        string `json:"name"`
			Source      string `json:"source"`
			ResourceID  string `json:"resourceId"`
			Description string `json:"description"`
		}
		if !bind(c, &req) {
			return
		}
		item, err := svc.CreateStudioVoice(user.ID, req.Name, req.Source, req.ResourceID, req.Description)
		respond(c, item, err)
	}))
	r.PATCH("/studio/voices/:id", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Name string `json:"name"`
		}
		if !bind(c, &req) {
			return
		}
		respond(c, gin.H{"updated": true}, svc.RenameStudioVoice(user.ID, c.Param("id"), req.Name))
	}))
	r.POST("/studio/voices/:id/use", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"updated": true}, svc.TouchStudioVoice(user.ID, c.Param("id")))
	}))
	r.DELETE("/studio/voices/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioVoice(user.ID, c.Param("id")))
	}))

	r.GET("/studio/uploads", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.StudioUploads(user.ID, c.Query("kind"))
		respond(c, gin.H{"items": items}, err)
	}))
	r.POST("/studio/uploads", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			ResourceID string `json:"resourceId"`
			Name       string `json:"name"`
		}
		if !bind(c, &req) {
			return
		}
		item, err := svc.RegisterStudioUpload(user.ID, req.ResourceID, req.Name)
		respond(c, item, err)
	}))
	r.DELETE("/studio/uploads/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioUpload(user.ID, c.Param("id")))
	}))

	r.GET("/studio/characters", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.StudioCharacters(user.ID)
		respond(c, gin.H{"items": items}, err)
	}))
	saveCharacter := func(c *gin.Context, user *model.User, id string) {
		var req service.StudioCharacterInput
		if !bind(c, &req) {
			return
		}
		item, err := svc.SaveStudioCharacter(user.ID, id, req)
		respond(c, item, err)
	}
	r.POST("/studio/characters", withUser(func(c *gin.Context, user *model.User) { saveCharacter(c, user, "") }))
	r.PUT("/studio/characters/:id", withUser(func(c *gin.Context, user *model.User) { saveCharacter(c, user, c.Param("id")) }))
	r.DELETE("/studio/characters/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioCharacter(user.ID, c.Param("id")))
	}))

	r.GET("/studio/chats", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.StudioChatSessions(user.ID, c.Query("mode"))
		respond(c, gin.H{"items": items}, err)
	}))
	r.POST("/studio/chats", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Title string `json:"title"`
		}
		if !bind(c, &req) {
			return
		}
		session, err := svc.CreateStudioChatSession(user.ID, service.StudioChatModeChat, req.Title)
		respond(c, session, err)
	}))
	r.GET("/studio/chats/:id", withUser(func(c *gin.Context, user *model.User) {
		view, err := svc.StudioChat(user.ID, c.Param("id"))
		respond(c, view, err)
	}))
	r.PATCH("/studio/chats/:id", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Title string `json:"title"`
		}
		if !bind(c, &req) {
			return
		}
		session, err := svc.RenameStudioChat(user.ID, c.Param("id"), req.Title)
		respond(c, session, err)
	}))
	r.DELETE("/studio/chats/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioChat(user.ID, c.Param("id")))
	}))
	r.POST("/studio/chats/:id/messages", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioChatMessageInput
		if !bind(c, &req) {
			return
		}
		message, err := svc.AppendStudioChatMessage(user.ID, c.Param("id"), req)
		respond(c, message, err)
	}))
	r.PUT("/studio/chats/:id/messages/:messageId/actions", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Actions json.RawMessage `json:"actions"`
		}
		if !bind(c, &req) {
			return
		}
		message, err := svc.UpdateStudioChatActions(user.ID, c.Param("id"), c.Param("messageId"), req.Actions)
		respond(c, message, err)
	}))

	r.GET("/studio/stories", withUser(func(c *gin.Context, user *model.User) {
		items, err := svc.StudioStories(user.ID)
		respond(c, gin.H{"items": items}, err)
	}))
	r.POST("/studio/stories", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioStoryInput
		if !bind(c, &req) {
			return
		}
		story, err := svc.CreateStudioStory(user.ID, req)
		respond(c, story, err)
	}))
	r.GET("/studio/stories/:id", withUser(func(c *gin.Context, user *model.User) {
		story, err := svc.StudioStory(user.ID, c.Param("id"))
		respond(c, story, err)
	}))
	r.PUT("/studio/stories/:id", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioStoryInput
		if !bind(c, &req) {
			return
		}
		story, err := svc.UpdateStudioStory(user.ID, c.Param("id"), req)
		respond(c, story, err)
	}))
	r.DELETE("/studio/stories/:id", withUser(func(c *gin.Context, user *model.User) {
		respond(c, gin.H{"deleted": true}, svc.DeleteStudioStory(user.ID, c.Param("id")))
	}))
	r.PUT("/studio/stories/:id/plan", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Scenes []service.StudioScenePlan `json:"scenes"`
		}
		if !bind(c, &req) {
			return
		}
		story, err := svc.ReplaceStudioStoryPlan(user.ID, c.Param("id"), req.Scenes)
		respond(c, story, err)
	}))
	r.PATCH("/studio/stories/:id/shots/:shotId", withUser(func(c *gin.Context, user *model.User) {
		var req service.StudioShotPatch
		if !bind(c, &req) {
			return
		}
		story, err := svc.PatchStudioShot(user.ID, c.Param("id"), c.Param("shotId"), req)
		respond(c, story, err)
	}))
	r.POST("/studio/stories/:id/shots/:shotId/versions", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			Kind   string `json:"kind"`
			TaskID string `json:"taskId"`
		}
		if !bind(c, &req) {
			return
		}
		story, err := svc.AddStudioShotVersion(user.ID, c.Param("id"), c.Param("shotId"), req.Kind, req.TaskID)
		respond(c, story, err)
	}))
	r.PUT("/studio/stories/:id/render", withUser(func(c *gin.Context, user *model.User) {
		var req struct {
			TaskID string `json:"taskId"`
		}
		if !bind(c, &req) {
			return
		}
		story, err := svc.SetStudioStoryRender(user.ID, c.Param("id"), req.TaskID)
		respond(c, story, err)
	}))
}
