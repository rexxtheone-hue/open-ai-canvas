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
