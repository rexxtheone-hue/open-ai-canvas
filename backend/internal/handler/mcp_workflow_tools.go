package handler

// 工作流工具（/drama-ads 等）：名称和参数格式与工作流手册里写的一致，手册可以原样照做。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"yingce/backend/internal/service"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func mcpBaseURL(ctx context.Context) string {
	base, _ := ctx.Value(mcpBaseKey{}).(string)
	return base
}

const refSchema = `{"type":"object","properties":{"ref":{"type":"string","minLength":1,"maxLength":1200,"description":"` + "`sandbox:<path>`" + ` for a whole UTF-8 file under /home/user in the sandbox, or ` + "`sandbox:<path>#<JSON Pointer>`" + ` for one value of a JSON file, e.g. ` + "`sandbox:~/film/plan.json#/clips/3/prompt`" + `."}},"required":["ref"],"additionalProperties":false}`

const mediasSchema = `{"description":"Reference media inputs.","type":"array","items":{"type":"object","properties":{"value":{"type":"string","description":"media_id from media_upload/media_import_url or job_id from a prior generation. Do not pass https:// URLs here."},"role":{"type":"string","description":"image_references, video_references or audio_references (start_image / end_image for frames)."}},"required":["value","role"]}}`

func batchSchema(kind string) string {
	extra := ""
	if kind == "video" {
		extra = `,"duration":{"type":"integer","description":"Duration in seconds."},"resolution":{"type":"string"},"mode":{"type":"string","description":"omni_reference (references), video_extension (continue @Video1), or omit for text to video."},"generate_audio":{"type":"boolean"}`
	} else {
		extra = `,"resolution":{"type":"string"},"quality":{"type":"string"}`
	}
	params := `{"type":"object","properties":{"model":{"type":"string","description":"Model id (seedance_2_5, seedream_5_5, seedream_v5_pro, gpt_image_2_6_flare, seed_audio) or an OmniMuse model id from list_models."},"prompt":{"description":"Text, or {\"ref\": \"sandbox:<path>\"} for a checked prompt file in the sandbox.","anyOf":[{"type":"string"},` + refSchema + `]},"count":{"type":"number","const":1},"aspect_ratio":{"type":"string"},"drama_ads_id":{"description":"The drama_ads_id get_drama_ads_config returned; repeat it on every item of the drama."},"medias":` + mediasSchema + extra + `},"required":["model"],"additionalProperties":{}}`
	return `{"type":"object","properties":{"requests":{"anyOf":[{"minItems":1,"maxItems":12,"type":"array","items":{"type":"object","properties":{"index":{"type":"integer","minimum":0,"description":"Caller-provided stable index, such as the scene number."},"params":{"anyOf":[` + params + `,` + refSchema + `]}},"required":["index","params"],"additionalProperties":false},"description":"Ordered generation requests. Response jobs keep the provided indices."},` + refSchema + `],"description":"Ordered requests, or {\"ref\": \"sandbox:<path>#/requests\"} naming a sandbox JSON file that holds them."}},"required":["requests"]}`
}

const jobsSchema = `{"minItems":1,"maxItems":%d,"type":"array","items":{"type":"object","properties":{"index":{"type":"integer","minimum":0,"description":"Stable index returned by the batch generation tool."},"job_id":{"type":"string"}},"required":["index","job_id"],"additionalProperties":false}}`

func rawSchema(text string) json.RawMessage {
	return json.RawMessage(text)
}

func toolJSON(value any, summary string) *mcp.CallToolResult {
	result := mcpText(value, summary)
	result.StructuredContent = value
	return result
}

func toolError(err error) (*mcp.CallToolResult, error) {
	result := &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: err.Error()}}, IsError: true}
	return result, nil
}

func registerWorkflowTools(server *mcp.Server, svc *service.Service) {
	server.AddTool(&mcp.Tool{Name: "sandbox_exec", Title: "Run in sandbox",
		Description: "Execute a shell command in a remote OmniMuse cloud Linux sandbox — NOT your local machine or the client's own shell. Preinstalled: ffmpeg/ffprobe, ImageMagick, sox, python3 with Pillow, numpy, faster-whisper (small and medium models) and Demucs, curl, jq, zip, git. The sandbox is isolated per user. Workspace files in /home/user persist while the sandbox is paused between calls. A result with sandbox_created:true indicates a new sandbox, so files from earlier calls are not present; re-download missing inputs. It has internet access: bring files in with curl from confirmed uploads or generation result URLs. For an output created here, call media_upload BEFORE starting the producing command, then append `curl -f -X PUT -H 'Content-Type: <content_type>' --upload-file <file> '<upload_url>'` to that SAME command; call media_confirm only after HTTP 200. Commands run in /home/user and time out after timeout_seconds (default 60, max 120); for longer work set background:true and poll the returned log/status files with later sandbox_exec calls. Background commands have a 15-minute execution limit. Do not detach commands yourself with nohup, setsid or shell &. Set restart:true to discard the sandbox and start clean. For actual visual inspection, pass image_paths (up to 4 PNG/JPEG paths, <=512 KiB total) with a foreground command: images are returned natively to the model. The command limit is 128000 characters. Workflow bundle scripts are installed in every sandbox under $HF_WORKFLOWS, laid out as $HF_WORKFLOWS/<workflow>/scripts/... — run them straight from there, and never paste script contents into the command.",
		InputSchema: rawSchema(`{"type":"object","properties":{"command":{"type":"string","minLength":1,"maxLength":128000,"description":"Shell command to run (bash). Runs in the persistent per-user sandbox."},"timeout_seconds":{"type":"integer","minimum":1,"maximum":120,"description":"Seconds before the command is killed (default 60, max 120). Ignored with background:true."},"background":{"type":"boolean","description":"Run the command detached and return immediately with a pid, log_path, and status_path. Poll with a later sandbox_exec call; stop with kill <pid>."},"restart":{"type":"boolean","description":"Discard the current sandbox (all files and processes) and start a fresh one before running the command."},"image_paths":{"minItems":1,"maxItems":4,"type":"array","items":{"type":"string","minLength":1,"maxLength":1024},"description":"PNG/JPEG files to return as native images after a successful foreground command. All image files together must be <=512 KiB. Relative paths start at /home/user."}},"required":["command"]}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in struct {
				Command        string   `json:"command"`
				TimeoutSeconds int      `json:"timeout_seconds"`
				Background     bool     `json:"background"`
				Restart        bool     `json:"restart"`
				ImagePaths     []string `json:"image_paths"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			res, err := svc.SandboxExec(ctx, user, service.SandboxExecInput{Command: in.Command, TimeoutSeconds: in.TimeoutSeconds, Background: in.Background, Restart: in.Restart, ImagePaths: in.ImagePaths})
			if err != nil {
				return toolError(err)
			}
			result := toolJSON(res, "")
			for _, image := range res.Images {
				result.Content = append(result.Content, &mcp.ImageContent{Data: image.Data, MIMEType: image.MIMEType})
			}
			return result, nil
		})

	server.AddTool(&mcp.Tool{Name: "media_upload", Title: "Upload media",
		Description: "Upload media for use in generation. Returns presigned URLs: PUT the bytes to each upload_url (for files in the sandbox, append the returned curl to the command that makes the file), then call media_confirm. The media type is inferred from the filename extension (image, video or audio). Supports batch uploads via files[].",
		InputSchema: rawSchema(`{"type":"object","properties":{"filename":{"type":"string","description":"Single filename for upload"},"content_type":{"type":"string","description":"MIME type for single file upload, e.g. 'image/png' or 'video/mp4'. Inferred from filename when omitted."},"files":{"minItems":1,"maxItems":20,"type":"array","items":{"type":"object","properties":{"filename":{"type":"string"},"content_type":{"type":"string"}},"required":["filename"]},"description":"1–20 files for parallel presigned URL generation"}}}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in struct {
				Filename    string `json:"filename"`
				ContentType string `json:"content_type"`
				Files       []struct {
					Filename    string `json:"filename"`
					ContentType string `json:"content_type"`
				} `json:"files"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			if in.Filename != "" {
				in.Files = append(in.Files, struct {
					Filename    string `json:"filename"`
					ContentType string `json:"content_type"`
				}{in.Filename, in.ContentType})
			}
			if len(in.Files) == 0 {
				return toolError(errors.New("filename or files is required"))
			}
			tickets := []*service.MediaUploadTicket{}
			for _, file := range in.Files {
				ticket, err := svc.CreateMediaUpload(user, mcpBaseURL(ctx), file.Filename, file.ContentType)
				if err != nil {
					return toolError(err)
				}
				tickets = append(tickets, ticket)
			}
			if len(tickets) == 1 {
				return toolJSON(tickets[0], "PUT the file to upload_url with exactly this Content-Type, then call media_confirm with media_id."), nil
			}
			return toolJSON(map[string]any{"uploads": tickets}, "PUT each file to its upload_url, then call media_confirm with media_ids."), nil
		})

	server.AddTool(&mcp.Tool{Name: "media_confirm", Title: "Confirm upload",
		Description: "Confirm file uploads after using media_upload's upload_url. Call this only after every curl PUT returned HTTP 200. Supports confirming multiple uploads at once via media_ids.",
		InputSchema: rawSchema(`{"type":"object","properties":{"type":{"type":"string","enum":["image","video","audio"],"description":"Media type being confirmed."},"media_id":{"type":"string","description":"Single media ID to confirm"},"media_ids":{"minItems":1,"maxItems":20,"type":"array","items":{"type":"string"},"description":"1–20 media IDs to confirm"}},"required":["type"]}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in struct {
				MediaID  string   `json:"media_id"`
				MediaIDs []string `json:"media_ids"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			if in.MediaID != "" {
				in.MediaIDs = append(in.MediaIDs, in.MediaID)
			}
			if len(in.MediaIDs) == 0 {
				return toolError(errors.New("media_id or media_ids is required"))
			}
			results := svc.ConfirmMediaUploads(user, in.MediaIDs)
			if len(results) == 1 {
				return toolJSON(results[0], ""), nil
			}
			return toolJSON(map[string]any{"results": results}, ""), nil
		})

	server.AddTool(&mcp.Tool{Name: "media_import_url", Title: "Import media URL",
		Description: "Import an HTTPS image, video, or audio URL into OmniMuse storage and return a confirmed media_id. Use this before generating when you have a web media URL; generation medias should receive the returned media_id, not the original URL.",
		InputSchema: rawSchema(`{"type":"object","properties":{"url":{"type":"string","description":"HTTPS URL of the media file to import."},"type":{"type":"string","enum":["auto","image","video","audio"]}},"required":["url"]}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in struct {
				URL string `json:"url"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			res, err := svc.ImportMediaURL(user, in.URL)
			if err != nil {
				return toolError(err)
			}
			return toolJSON(res, ""), nil
		})

	for _, kind := range []string{"image", "video"} {
		kind := kind
		server.AddTool(&mcp.Tool{Name: "generate_" + kind + "_batch", Title: "Generate " + kind + " batch",
			Description: fmt.Sprintf("Submit 1-12 independent %s generations in parallel (charged in credits). Each requests[] item creates one job and keeps its caller-provided index in the response. Poll returned job IDs with jobs_wait in groups of at most 12. A partial failure does not make the whole batch safe to retry: keep returned job IDs and resend only rejected items. When the requests are already in a sandbox JSON file, pass `requests: {\"ref\": \"sandbox:<path>#/requests\"}` instead of copying them. A prompt given as {\"ref\": \"sandbox:<file>\"} is read whole from the sandbox, and the reply lists it in references_read with the sha256 of the text sent.", kind),
			InputSchema: rawSchema(batchSchema(kind))},
			func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				user, err := mcpUser(ctx)
				if err != nil {
					return nil, err
				}
				var in struct {
					Requests json.RawMessage `json:"requests"`
				}
				if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
					return toolError(err)
				}
				items, err := svc.ResolveWorkflowRequests(ctx, user, in.Requests)
				if err != nil {
					return toolError(err)
				}
				jobs := svc.SubmitWorkflowBatch(ctx, user, kind, items)
				accepted := 0
				for _, job := range jobs {
					if job.JobID != "" {
						accepted++
					}
				}
				return toolJSON(map[string]any{"jobs": jobs}, fmt.Sprintf("%d of %d submitted. Wait with jobs_wait.", accepted, len(jobs))), nil
			})
	}

	server.AddTool(&mcp.Tool{Name: "jobs_wait", Title: "Wait for jobs",
		Description: "Long-poll 1-12 generation jobs together. Waits up to timeout_seconds (default 15, max 15) for every job to reach a terminal state, then returns indexed statuses and result URLs. A failed job carries error: the reason in words to tell the user. When all_terminal is false, wait poll_after_seconds before calling again.",
		InputSchema: rawSchema(`{"type":"object","properties":{"jobs":` + fmt.Sprintf(jobsSchema, 12) + `,"timeout_seconds":{"type":"integer","minimum":0,"maximum":15,"default":15,"description":"Long-poll budget. Use 0 for an immediate snapshot."}},"required":["jobs"]}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in struct {
				Jobs           []service.WorkflowJob `json:"jobs"`
				TimeoutSeconds *int                  `json:"timeout_seconds"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			if len(in.Jobs) == 0 || len(in.Jobs) > 12 {
				return toolError(errors.New("jobs must hold 1-12 items"))
			}
			wait := 15
			if in.TimeoutSeconds != nil && *in.TimeoutSeconds >= 0 && *in.TimeoutSeconds < 15 {
				wait = *in.TimeoutSeconds
			}
			deadline := time.Now().Add(time.Duration(wait) * time.Second)
			for {
				statuses := svc.WorkflowJobStatuses(ctx, user, in.Jobs)
				all := true
				for _, status := range statuses {
					all = all && status.Terminal
				}
				if all || time.Now().After(deadline) || ctx.Err() != nil {
					out := map[string]any{"jobs": statuses, "all_terminal": all}
					if !all {
						out["poll_after_seconds"] = 20
					}
					return toolJSON(out, ""), nil
				}
				select {
				case <-ctx.Done():
				case <-time.After(3 * time.Second):
				}
			}
		})

	server.AddTool(&mcp.Tool{Name: "get_drama_ads_config", Title: "Price a drama ad",
		Description: "Starts a /drama-ads run and prices it: call it first for every drama, and again right before any credit amount is shown, every time. It answers the run's drama_ads_id, which goes in params of every generation. purpose film takes the film's style, resolutions and its items by role ({ role, count, seconds }), never a model: the tool picks the models the pipeline uses. stage and remake take the generation requests about to be sent ({ kind, model, params as the generate tool takes them, count }); with resolutions every video request is priced once per resolution. Generate each item with the model the answer's items name. Submits no generation and costs nothing; show its totals, never a number from memory or arithmetic.",
		InputSchema: rawSchema(`{"type":"object","properties":{"purpose":{"type":"string","enum":["film","stage","remake"],"description":"film: the whole film's totals; stage: one stage's batch; remake: a paid remake."},"requests":{"minItems":1,"maxItems":60,"type":"array","items":{"type":"object","properties":{"role":{"type":"string","enum":["sheet","master","plate","clip","extension","score"],"description":"purpose film only: what the item is; the tool picks its model."},"kind":{"type":"string","enum":["image","video","audio"],"description":"stage and remake: the generation's kind."},"model":{"type":"string","description":"stage and remake: the model."},"params":{"type":"object","additionalProperties":{},"description":"stage and remake: the params the matching generate tool takes, without model."},"count":{"type":"integer","minimum":1,"maximum":60,"description":"How many jobs of this item."},"seconds":{"type":"number","exclusiveMinimum":0,"description":"purpose film: the length of a clip, an extension or the score."}},"required":["count"]}},"resolutions":{"minItems":1,"maxItems":3,"type":"array","items":{"type":"string","enum":["480p","720p","1080p"]},"description":"Price every video request at each of these resolutions."},"style":{"type":"string","enum":["live-action","phone","feature-3d","hyperreal-3d","doll-3d","crochet","claymation","paper-diorama","pixel-art","paper-collage","ink-cartoon"],"description":"purpose film: the film's style id."},"narration":{"type":"boolean"},"song":{"type":"boolean"},"drama_ads_id":{"description":"The drama's drama_ads_id from an earlier call. Without it this call starts the drama."},"preset_id":{"type":"string","maxLength":200}},"required":["purpose","requests"]}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in service.DramaQuoteInput
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			quote, err := svc.QuoteDrama(ctx, user, in)
			if err != nil {
				return toolError(err)
			}
			return toolJSON(quote, ""), nil
		})

	server.AddTool(&mcp.Tool{Name: "get_workflow_instructions", Title: "Load a workflow", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		Description: "Micro drama ad directed in this chat: load 'drama-ads' when the user selected /drama-ads. Call with NO argument to list available workflows. Call with a workflow name to load that workflow's full SKILL.md plus the list of files readable via get_workflow_bundle_file.",
		InputSchema: rawSchema(`{"type":"object","properties":{"workflow":{"type":"string","minLength":1,"description":"Workflow name. Omit to list all available workflows."}}}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			var in struct {
				Workflow string `json:"workflow"`
			}
			_ = json.Unmarshal(req.Params.Arguments, &in)
			if strings.TrimSpace(in.Workflow) == "" {
				list, err := svc.ListWorkflows()
				if err != nil {
					return toolError(err)
				}
				return toolJSON(map[string]any{"workflows": list}, ""), nil
			}
			res, err := svc.WorkflowInstructions(strings.TrimSpace(in.Workflow))
			if err != nil {
				return toolError(err)
			}
			result := &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "Workflow: " + res.Workflow + ".\nLoad detailed files with get_workflow_bundle_file.\n\n---\n" + res.Content}}}
			result.StructuredContent = map[string]any{"workflow": res.Workflow, "available_paths": res.AvailablePaths}
			return result, nil
		})

	server.AddTool(&mcp.Tool{Name: "get_workflow_bundle_file", Title: "Read a workflow file", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		Description: "Read a text file or directory from a workflow's resource folder. Use this after get_workflow_instructions when the SKILL.md requires a template, reference, or script file.",
		InputSchema: rawSchema(`{"type":"object","properties":{"workflow":{"type":"string","minLength":1},"path":{"type":"string","minLength":1,"description":"Path INSIDE that workflow folder, e.g. 'references/clips.md'. Use paths listed by get_workflow_instructions."},"include_contents":{"type":"boolean","description":"For directory paths, include the content of every file under that directory."}},"required":["workflow","path"]}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			var in struct {
				Workflow        string `json:"workflow"`
				Path            string `json:"path"`
				IncludeContents bool   `json:"include_contents"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			res, err := svc.WorkflowBundleFile(in.Workflow, in.Path, in.IncludeContents)
			if err != nil {
				return toolError(err)
			}
			if res.Kind == "file" {
				result := &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf("Bundle file %s/%s (%d bytes):\n\n%s", res.Workflow, res.Path, res.Size, res.Content)}}}
				return result, nil
			}
			return toolJSON(res, ""), nil
		})

	stageOrGallery := func(name, title, description string, max int) {
		server.AddTool(&mcp.Tool{Name: name, Title: title, Meta: mcpWidgetToolMeta("Loading…", "Shown"), Description: description,
			InputSchema: rawSchema(`{"type":"object","properties":{"stage":{"type":"string","maxLength":60,"description":"The stage's name, as the approval question names it."},"jobs":` + fmt.Sprintf(jobsSchema, max) + `,"drama_ads_id":{"description":"The drama_ads_id get_drama_ads_config returned for this film."}},"required":["jobs"]}`)},
			func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				user, err := mcpUser(ctx)
				if err != nil {
					return nil, err
				}
				var in struct {
					Stage string                `json:"stage"`
					Jobs  []service.WorkflowJob `json:"jobs"`
				}
				if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
					return toolError(err)
				}
				if len(in.Jobs) == 0 || len(in.Jobs) > max {
					return toolError(fmt.Errorf("jobs must hold 1-%d items", max))
				}
				generations := []*service.OpenAPIGeneration{}
				for _, job := range in.Jobs {
					if g, err := svc.OpenAPIGeneration(ctx, user, job.JobID); err == nil {
						generations = append(generations, g)
					}
				}
				statuses := svc.WorkflowJobStatuses(ctx, user, in.Jobs)
				summary := fmt.Sprintf("%s: %d jobs shown to the user.", firstNonEmptyString(in.Stage, "Generations"), len(statuses))
				result := withPreviews(svc, user, toolJSON(map[string]any{"stage": in.Stage, "jobs": statuses}, summary), generations...)
				return result, nil
			})
	}
	stageOrGallery("ads_studio_story_stage", "Drama stage", "Show one stage of a /drama-ads film as one grid: pass the stage name and the indexed jobs the batch tools returned; call it once right after each send, as the last call before the approval question; never show_generation_by_ids for a stage.", 24)
	stageOrGallery("show_generation_by_ids", "Show generations", "Render exactly 1-60 requested generation jobs in one gallery, ordered by index. Use once every jobs_wait group is terminal. Pass the complete indexed set collected from the batch tools.", 60)

	server.AddTool(&mcp.Tool{Name: "show_result", Title: "Show final video", Meta: mcpWidgetToolMeta("Loading…", "Shown"),
		Description: "Display a final completed video with preview and download. Call after verifying the final export. Include a nonempty action string, optionally meta as any JSON object, and media_id (a confirmed owned video). Never pass a job ID, local path or unfinished render.",
		InputSchema: rawSchema(`{"type":"object","properties":{"media_id":{"type":"string","description":"Confirmed owned video media_id."},"action":{"type":"string","minLength":1,"description":"Required action label, such as microdrama_film."},"meta":{"type":"object","additionalProperties":{}}},"required":["action","media_id"],"additionalProperties":false}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			var in struct {
				MediaID string `json:"media_id"`
				Action  string `json:"action"`
			}
			if err := json.Unmarshal(req.Params.Arguments, &in); err != nil {
				return toolError(err)
			}
			results := svc.ConfirmMediaUploads(user, []string{in.MediaID})
			if len(results) == 0 || results[0].Status != "confirmed" {
				return toolError(errors.New("media_id is not a confirmed upload"))
			}
			return toolJSON(map[string]any{"action": in.Action, "media_id": in.MediaID, "type": results[0].Type, "url": results[0].URL}, "The film is shown to the user. Its link: "+results[0].URL), nil
		})

	server.AddTool(&mcp.Tool{Name: "balance", Title: "Balance", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		Description: "Get the user's available credits.", InputSchema: rawSchema(`{"type":"object","properties":{}}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			user, err := mcpUser(ctx)
			if err != nil {
				return nil, err
			}
			account, err := svc.OpenAPIAccount(ctx, user)
			if err != nil {
				return toolError(err)
			}
			return toolJSON(account, ""), nil
		})
}
