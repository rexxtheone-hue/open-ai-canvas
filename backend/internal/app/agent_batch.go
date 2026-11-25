package app

// MCP 工作流的批量生成（generate_image_batch / generate_video_batch / jobs_wait）：参数格式照 Higgsfield，
// 这样工作流手册可以原样使用。模型用工作流里的名字（seedance_2_5 等），对应到本站模型。

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"yingce/backend/internal/model"
)

// workflowModelKeys 是工作流手册里的模型名对应的本站模型（模型 key）。
var workflowModelKeys = map[string]string{
	"seedance_2_5":        "dreamina-seedance-2-5-260628",
	"seedance_2_5_flash":  "dreamina-seedance-2-5-flash-261115",
	"seedream_5_5":        "dola-seedream-5-5-261028",
	"seedream_v5_pro":     "doubao-seedream-5-0-pro-260628",
	"gpt_image_2_6_flare": "gpt-image-2.5-sunburst",
	"gpt_image_2_6":       "gpt-image-2.5-sunburst",
	"nano_banana_2":       "",
	"seed_audio":          "seed-audio-1.0",
}

func workflowModel(name string) string {
	name = strings.TrimSpace(name)
	if key, ok := workflowModelKeys[strings.ToLower(name)]; ok && key != "" {
		return key
	}
	return name
}

type WorkflowRefRead struct {
	Ref    string `json:"ref"`
	SHA256 string `json:"sha256"`
}

// resolveSandboxRef 读 {"ref": "sandbox:<path>[#<JSON Pointer>]"}：整个文件当文本，或 JSON 文件里的一个值。
func (s *Service) resolveSandboxRef(ctx context.Context, user *model.User, ref string) (any, *WorkflowRefRead, error) {
	ref = strings.TrimSpace(ref)
	if !strings.HasPrefix(ref, "sandbox:") {
		return nil, nil, fmt.Errorf("只支持 sandbox: 引用：%s", ref)
	}
	target := strings.TrimPrefix(ref, "sandbox:")
	pointer := ""
	if i := strings.Index(target, "#"); i >= 0 {
		target, pointer = target[:i], target[i+1:]
	}
	data, err := s.ReadSandboxFile(ctx, user, target, 4<<20)
	if err != nil {
		return nil, nil, err
	}
	if pointer == "" {
		sum := sha256.Sum256(data)
		return string(data), &WorkflowRefRead{Ref: ref, SHA256: hex.EncodeToString(sum[:])}, nil
	}
	var doc any
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, nil, fmt.Errorf("%s 不是 JSON：%w", target, err)
	}
	value, err := jsonPointer(doc, pointer)
	if err != nil {
		return nil, nil, fmt.Errorf("%s：%w", ref, err)
	}
	if text, ok := value.(string); ok {
		sum := sha256.Sum256([]byte(text))
		return text, &WorkflowRefRead{Ref: ref, SHA256: hex.EncodeToString(sum[:])}, nil
	}
	return value, &WorkflowRefRead{Ref: ref}, nil
}

func jsonPointer(doc any, pointer string) (any, error) {
	if pointer == "" || pointer == "/" {
		return doc, nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, fmt.Errorf("JSON Pointer 要以 / 开头：%s", pointer)
	}
	current := doc
	for _, part := range strings.Split(pointer[1:], "/") {
		part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		switch node := current.(type) {
		case map[string]any:
			next, ok := node[part]
			if !ok {
				return nil, fmt.Errorf("没有 %s", part)
			}
			current = next
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(node) {
				return nil, fmt.Errorf("下标 %s 超出范围", part)
			}
			current = node[index]
		default:
			return nil, fmt.Errorf("%s 不是对象或数组", part)
		}
	}
	return current, nil
}

// ResolveWorkflowRequests 展开 requests：可以是数组，也可以是 {"ref": "sandbox:<file>#/requests"}。
func (s *Service) ResolveWorkflowRequests(ctx context.Context, user *model.User, raw json.RawMessage) ([]WorkflowBatchItem, error) {
	var ref struct {
		Ref string `json:"ref"`
	}
	if json.Unmarshal(raw, &ref) == nil && ref.Ref != "" {
		value, _, err := s.resolveSandboxRef(ctx, user, ref.Ref)
		if err != nil {
			return nil, err
		}
		data, _ := json.Marshal(value)
		raw = data
	}
	var items []WorkflowBatchItem
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("requests 格式不对：%w", err)
	}
	if len(items) == 0 || len(items) > 12 {
		return nil, errors.New("requests 要 1-12 项")
	}
	return items, nil
}

type WorkflowBatchItem struct {
	Index  int            `json:"index"`
	Params map[string]any `json:"params"`
}

type WorkflowJob struct {
	Index          int               `json:"index"`
	JobID          string            `json:"job_id,omitempty"`
	Status         string            `json:"status,omitempty"`
	Error          string            `json:"error,omitempty"`
	ReferencesRead []WorkflowRefRead `json:"references_read,omitempty"`
}

// workflowRequest 把一项 Higgsfield 格式的 params 变成本站的生成请求。
func (s *Service) workflowRequest(ctx context.Context, user *model.User, kind string, params map[string]any) (OpenAPIGenerationRequest, []WorkflowRefRead, error) {
	req := OpenAPIGenerationRequest{Client: "mcp", Count: 1}
	reads := []WorkflowRefRead{}
	modelName, _ := params["model"].(string)
	if strings.TrimSpace(modelName) == "" {
		return req, nil, errors.New("params.model 必填")
	}
	req.Model = workflowModel(modelName)
	switch prompt := params["prompt"].(type) {
	case string:
		req.Prompt = prompt
	case map[string]any:
		ref, _ := prompt["ref"].(string)
		value, read, err := s.resolveSandboxRef(ctx, user, ref)
		if err != nil {
			return req, nil, err
		}
		text, ok := value.(string)
		if !ok {
			return req, nil, fmt.Errorf("%s 指向的不是文字", ref)
		}
		req.Prompt = text
		if read != nil {
			reads = append(reads, *read)
		}
	}
	req.AspectRatio = paramString(params, "aspect_ratio")
	req.Resolution = paramString(params, "resolution")
	req.Quality = paramString(params, "quality")
	if value, ok := params["duration"]; ok {
		req.Duration = int(paramNumber(value))
	}
	if value, ok := params["generate_audio"].(bool); ok {
		req.GenerateAudio = &value
	}
	mode := paramString(params, "mode")
	switch mode {
	case "omni_reference", "video_extension":
		req.Operation = "reference_to_video"
	case "":
	default:
		req.Operation = mode
	}
	medias, _ := params["medias"].([]any)
	for _, raw := range medias {
		media, _ := raw.(map[string]any)
		value := paramString(media, "value")
		role := paramString(media, "role")
		if value == "" {
			continue
		}
		mediaKind := ""
		switch role {
		case "image_references", "image", "reference_image", "start_image", "end_image":
			mediaKind = "image"
		case "video_references", "video", "reference_video":
			mediaKind = "video"
		case "audio_references", "audio", "reference_audio":
			mediaKind = "audio"
		}
		resourceID, resourceKind, err := s.workflowMediaResource(ctx, user, value)
		if err != nil {
			return req, nil, err
		}
		if mediaKind == "" {
			mediaKind = resourceKind
		}
		frameRole := ""
		switch role {
		case "start_image":
			frameRole = "first_frame"
		case "end_image":
			frameRole = "last_frame"
		}
		req.References = append(req.References, OpenAPIReference{ResourceID: resourceID, Kind: mediaKind, Role: frameRole})
	}
	if kind == "image" && len(params) > 0 {
		extra := map[string]any{}
		for key, value := range params {
			switch key {
			case "model", "prompt", "aspect_ratio", "resolution", "quality", "medias", "count", "drama_ads_id", "folder_id", "use_unlim", "use_free_gens", "preset_session_id":
			default:
				extra[key] = value
			}
		}
		if len(extra) > 0 {
			req.Parameters = extra
		}
	}
	return req, reads, nil
}

// workflowMediaResource 把 medias[].value（之前生成的 job_id，或 media_upload / media_import_url 的 media_id）换成素材。
func (s *Service) workflowMediaResource(ctx context.Context, user *model.User, value string) (string, string, error) {
	if resourceID, ok := s.MediaResourceID(user, value); ok {
		resource, err := s.repo.ResourceForUser(user.ID, resourceID)
		if err != nil {
			return "", "", err
		}
		return resource.ID, resource.Kind, nil
	}
	if resource, err := s.repo.ResourceForUser(user.ID, value); err == nil && resource != nil {
		return resource.ID, resource.Kind, nil
	}
	generation, err := s.OpenAPIGeneration(ctx, user, value)
	if err != nil {
		return "", "", fmt.Errorf("找不到素材或生成任务：%s", value)
	}
	if model.TaskStatus(generation.Status) != model.TaskStatusSucceeded {
		return "", "", fmt.Errorf("任务 %s 还没完成（%s），完成后才能当参考", value, generation.Status)
	}
	for _, output := range generation.Outputs {
		if output.ResourceID != "" {
			return output.ResourceID, output.Type, nil
		}
	}
	return "", "", fmt.Errorf("任务 %s 没有产出", value)
}

func paramString(params map[string]any, key string) string {
	if params == nil {
		return ""
	}
	switch value := params[key].(type) {
	case string:
		return strings.TrimSpace(value)
	case float64:
		return strconv.FormatFloat(value, 'f', -1, 64)
	}
	return ""
}

func paramNumber(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return f
	}
	return 0
}

// SubmitWorkflowBatch 逐项提交；一项失败不影响其他项，返回每项的 job_id 或错误。
func (s *Service) SubmitWorkflowBatch(ctx context.Context, user *model.User, kind string, items []WorkflowBatchItem) []WorkflowJob {
	jobs := make([]WorkflowJob, 0, len(items))
	for _, item := range items {
		job := WorkflowJob{Index: item.Index}
		params := item.Params
		if ref, ok := params["ref"].(string); ok && len(params) == 1 {
			value, _, err := s.resolveSandboxRef(ctx, user, ref)
			if err != nil {
				job.Status, job.Error = "rejected", err.Error()
				jobs = append(jobs, job)
				continue
			}
			params, _ = value.(map[string]any)
		}
		req, reads, err := s.workflowRequest(ctx, user, kind, params)
		job.ReferencesRead = reads
		if err != nil {
			job.Status, job.Error = "rejected", err.Error()
			jobs = append(jobs, job)
			continue
		}
		if dramaID := paramString(params, "drama_ads_id"); dramaID != "" {
			req.Metadata = map[string]any{"dramaAdsId": dramaID}
		}
		generations, err := s.CreateOpenAPIGenerations(ctx, user, req)
		if err != nil || len(generations) == 0 {
			job.Status = "rejected"
			if err != nil {
				job.Error = err.Error()
			}
			jobs = append(jobs, job)
			continue
		}
		job.JobID, job.Status = generations[0].ID, generations[0].Status
		jobs = append(jobs, job)
	}
	return jobs
}

type WorkflowJobStatus struct {
	Index    int      `json:"index"`
	JobID    string   `json:"job_id"`
	Status   string   `json:"status"`
	Results  []string `json:"results,omitempty"`
	Type     string   `json:"type,omitempty"`
	Error    string   `json:"error,omitempty"`
	Credits  float64  `json:"credits,omitempty"`
	Terminal bool     `json:"terminal"`
}

func (s *Service) WorkflowJobStatuses(ctx context.Context, user *model.User, jobs []WorkflowJob) []WorkflowJobStatus {
	out := make([]WorkflowJobStatus, 0, len(jobs))
	for _, job := range jobs {
		status := WorkflowJobStatus{Index: job.Index, JobID: job.JobID}
		generation, err := s.OpenAPIGeneration(ctx, user, job.JobID)
		if err != nil {
			status.Status, status.Error, status.Terminal = "not_found", err.Error(), true
			out = append(out, status)
			continue
		}
		status.Status = generation.Status
		status.Error = generation.Error
		status.Credits = generation.Credits
		switch model.TaskStatus(generation.Status) {
		case model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled:
			status.Terminal = true
		}
		for _, output := range generation.Outputs {
			status.Results = append(status.Results, output.URL)
			status.Type = output.Type
		}
		out = append(out, status)
	}
	return out
}
