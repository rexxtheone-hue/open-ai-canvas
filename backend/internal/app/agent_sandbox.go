package app

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"path"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

const (
	sandboxExecDefaultSeconds = 60
	sandboxExecMaxSeconds     = 120
	sandboxBackgroundSeconds  = 15 * 60
	sandboxImageBytesLimit    = 512 * 1024
	sandboxOutputLimit        = 60000
)

type SandboxExecInput struct {
	Command        string
	TimeoutSeconds int
	Background     bool
	Restart        bool
	ImagePaths     []string
}

type SandboxImage struct {
	Path     string
	MIMEType string
	Data     []byte
}

type SandboxExecResult struct {
	SandboxID      string         `json:"sandbox_id"`
	SandboxCreated bool           `json:"sandbox_created"`
	ExitCode       *int           `json:"exit_code,omitempty"`
	Stdout         string         `json:"stdout,omitempty"`
	Stderr         string         `json:"stderr,omitempty"`
	TimedOut       bool           `json:"timed_out,omitempty"`
	PID            string         `json:"pid,omitempty"`
	LogPath        string         `json:"log_path,omitempty"`
	StatusPath     string         `json:"status_path,omitempty"`
	Images         []SandboxImage `json:"-"`
	ImageNotes     []string       `json:"image_notes,omitempty"`
}

// userSandbox 取用户的沙盒：有就恢复，没有、找不到或要求重开就新开一个。
func (s *Service) userSandbox(ctx context.Context, user *model.User, restart bool) (*e2bSandbox, bool, error) {
	client, err := newE2BClient()
	if err != nil {
		return nil, false, err
	}
	saved, err := s.repo.AgentSandbox(user.ID)
	if err != nil {
		return nil, false, err
	}
	if saved != nil && saved.SandboxID != "" {
		if restart || saved.Template != client.template {
			_ = client.kill(ctx, saved.SandboxID)
		} else {
			sbx, ok, err := client.connect(ctx, saved.SandboxID)
			if err != nil {
				return nil, false, err
			}
			if ok {
				return sbx, false, nil
			}
		}
	}
	sbx, err := client.create(ctx, map[string]string{"userId": user.ID})
	if err != nil {
		return nil, false, err
	}
	if err := s.repo.SaveAgentSandbox(&model.AgentSandbox{UserID: user.ID, SandboxID: sbx.ID, Domain: sbx.Domain, AccessToken: sbx.AccessToken, Template: client.template}); err != nil {
		return nil, false, err
	}
	return sbx, true, nil
}

// SandboxExec 是 MCP 的 sandbox_exec：前台命令最多 120 秒；background 立即返回 pid、日志和状态文件，最多跑 15 分钟。
func (s *Service) SandboxExec(ctx context.Context, user *model.User, input SandboxExecInput) (*SandboxExecResult, error) {
	command := input.Command
	if strings.TrimSpace(command) == "" {
		return nil, errors.New("command 不能为空")
	}
	if len(command) > 128000 {
		return nil, errors.New("command 超过 128000 个字符")
	}
	if len(input.ImagePaths) > 4 {
		return nil, errors.New("image_paths 最多 4 个")
	}
	if input.Background && len(input.ImagePaths) > 0 {
		return nil, errors.New("image_paths 只能配前台命令")
	}
	sbx, created, err := s.userSandbox(ctx, user, input.Restart)
	if err != nil {
		return nil, err
	}
	result := &SandboxExecResult{SandboxID: sbx.ID, SandboxCreated: created}
	if input.Background {
		id := newID()[:12]
		logPath := "/home/user/.jobs/" + id + ".log"
		statusPath := "/home/user/.jobs/" + id + ".status"
		wrapper := fmt.Sprintf(`mkdir -p /home/user/.jobs && cd /home/user && (timeout %d bash -lc "$OM_BG_COMMAND" > %s 2>&1; echo $? > %s) > /dev/null 2>&1 < /dev/null & echo $!`, sandboxBackgroundSeconds, logPath, statusPath)
		_ = sbx.client.setTimeout(ctx, sbx.ID, sandboxBackgroundSeconds+e2bIdleSeconds)
		res, err := sbx.exec(ctx, wrapper, 30*time.Second, map[string]string{"OM_BG_COMMAND": command})
		if err != nil {
			return nil, err
		}
		if res.ExitCode != 0 {
			return nil, fmt.Errorf("后台命令没有启动：%s", strings.TrimSpace(res.Stderr))
		}
		result.PID = strings.TrimSpace(res.Stdout)
		result.LogPath = logPath
		result.StatusPath = statusPath
		return result, nil
	}
	seconds := input.TimeoutSeconds
	if seconds <= 0 {
		seconds = sandboxExecDefaultSeconds
	}
	if seconds > sandboxExecMaxSeconds {
		seconds = sandboxExecMaxSeconds
	}
	res, err := sbx.exec(ctx, command, time.Duration(seconds)*time.Second, nil)
	if err != nil {
		return nil, err
	}
	exit := res.ExitCode
	result.ExitCode = &exit
	result.TimedOut = res.TimedOut
	result.Stdout = clipOutput(res.Stdout)
	result.Stderr = clipOutput(res.Stderr)
	if res.TimedOut || res.ExitCode != 0 || len(input.ImagePaths) == 0 {
		return result, nil
	}
	total := 0
	for _, raw := range input.ImagePaths {
		full := raw
		if !strings.HasPrefix(full, "/") {
			full = path.Join("/home/user", full)
		}
		mimeType := mime.TypeByExtension(strings.ToLower(path.Ext(full)))
		if mimeType != "image/png" && mimeType != "image/jpeg" {
			result.ImageNotes = append(result.ImageNotes, raw+": 只支持 PNG 和 JPEG")
			continue
		}
		data, err := sbx.readFile(ctx, full, sandboxImageBytesLimit)
		if err != nil {
			result.ImageNotes = append(result.ImageNotes, raw+": "+err.Error())
			continue
		}
		if total+len(data) > sandboxImageBytesLimit {
			result.ImageNotes = append(result.ImageNotes, raw+": 图片合计超过 512 KiB，分开调用")
			continue
		}
		total += len(data)
		result.Images = append(result.Images, SandboxImage{Path: raw, MIMEType: mimeType, Data: data})
	}
	return result, nil
}

// ReadSandboxFile 读用户沙盒里 /home/user 下的一个文件，给 {"ref": "sandbox:..."} 用。
func (s *Service) ReadSandboxFile(ctx context.Context, user *model.User, filePath string, limit int64) ([]byte, error) {
	full := strings.TrimSpace(filePath)
	if strings.HasPrefix(full, "~/") {
		full = "/home/user/" + strings.TrimPrefix(full, "~/")
	}
	if !strings.HasPrefix(full, "/") {
		full = path.Join("/home/user", full)
	}
	full = path.Clean(full)
	if full != "/home/user" && !strings.HasPrefix(full, "/home/user/") {
		return nil, fmt.Errorf("只能读 /home/user 下的文件：%s", filePath)
	}
	sbx, created, err := s.userSandbox(ctx, user, false)
	if err != nil {
		return nil, err
	}
	if created {
		return nil, fmt.Errorf("沙盒是新开的，%s 不在了：请重新写入并检查后再发", filePath)
	}
	return sbx.readFile(ctx, full, limit)
}

func clipOutput(text string) string {
	if len(text) <= sandboxOutputLimit {
		return text
	}
	return "…（前面省略 " + fmt.Sprint(len(text)-sandboxOutputLimit) + " 字节）\n" + text[len(text)-sandboxOutputLimit:]
}
