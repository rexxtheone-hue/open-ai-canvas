package app

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// 工作流批量生成遇到「同时任务上限」时不拒绝：先排队，给一个 wq_ 编号，后台有空位再送出。
// 队列只在内存里：服务重启时还在排队的请求会丢，jobs_wait 会报 failed，由客户端按手册重发。

const workflowQueuePrefix = "wq_"

type workflowQueued struct {
	ID       string
	User     model.User
	Req      OpenAPIGenerationRequest
	Created  time.Time
	JobID    string
	Error    string
	resolved bool
}

var workflowQueue = struct {
	sync.Mutex
	items   map[string]*workflowQueued
	order   []string
	started bool
}{items: map[string]*workflowQueued{}}

func isActiveTaskLimit(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, repository.ErrActiveTaskLimit) {
		return true
	}
	var appErr *AppError
	if errors.As(err, &appErr) && appErr.Details != nil {
		if _, ok := appErr.Details["activeTaskLimit"]; ok {
			return true
		}
	}
	return false
}

func (s *Service) enqueueWorkflowRequest(user *model.User, req OpenAPIGenerationRequest) string {
	workflowQueue.Lock()
	defer workflowQueue.Unlock()
	id := workflowQueuePrefix + newID()
	workflowQueue.items[id] = &workflowQueued{ID: id, User: *user, Req: req, Created: time.Now()}
	workflowQueue.order = append(workflowQueue.order, id)
	if !workflowQueue.started {
		workflowQueue.started = true
		go s.runWorkflowQueue()
	}
	return id
}

func (s *Service) runWorkflowQueue() {
	for {
		time.Sleep(5 * time.Second)
		workflowQueue.Lock()
		pending := []*workflowQueued{}
		for _, id := range workflowQueue.order {
			if item := workflowQueue.items[id]; item != nil && !item.resolved {
				pending = append(pending, item)
			}
		}
		workflowQueue.Unlock()
		blocked := map[string]bool{}
		for _, item := range pending {
			if blocked[item.User.ID] {
				continue
			}
			user := item.User
			generations, err := s.CreateOpenAPIGenerations(context.Background(), &user, item.Req)
			workflowQueue.Lock()
			switch {
			case isActiveTaskLimit(err):
				blocked[item.User.ID] = true
			case err != nil:
				item.Error, item.resolved = err.Error(), true
			case len(generations) == 0:
				item.Error, item.resolved = "submission failed", true
			default:
				item.JobID, item.resolved = generations[0].ID, true
			}
			workflowQueue.Unlock()
		}
		workflowQueue.Lock()
		keep := workflowQueue.order[:0]
		for _, id := range workflowQueue.order {
			item := workflowQueue.items[id]
			if item == nil {
				continue
			}
			if item.resolved && time.Since(item.Created) > 48*time.Hour {
				delete(workflowQueue.items, id)
				continue
			}
			keep = append(keep, id)
		}
		workflowQueue.order = keep
		workflowQueue.Unlock()
	}
}

// workflowQueuedJob 查一个 wq_ 编号：已送出时返回真正的任务编号。
func workflowQueuedJob(userID, id string) (jobID string, queued bool, errText string, found bool) {
	if !strings.HasPrefix(id, workflowQueuePrefix) {
		return id, false, "", false
	}
	workflowQueue.Lock()
	defer workflowQueue.Unlock()
	item := workflowQueue.items[id]
	if item == nil || item.User.ID != userID {
		return "", false, "this queued request was lost (the server restarted before it was sent); send it again", true
	}
	if item.Error != "" {
		return "", false, item.Error, true
	}
	if item.JobID == "" {
		return "", true, "", true
	}
	return item.JobID, false, "", true
}

// ResolveWorkflowJobID 把 wq_ 编号换成真正的任务编号；还在排队时返回错误。
func (s *Service) ResolveWorkflowJobID(user *model.User, id string) (string, error) {
	jobID, queued, errText, found := workflowQueuedJob(user.ID, id)
	if !found {
		return id, nil
	}
	if errText != "" {
		return "", errors.New(errText)
	}
	if queued {
		return "", errors.New("任务 " + id + " 还在排队，送出并完成后才能用")
	}
	return jobID, nil
}
