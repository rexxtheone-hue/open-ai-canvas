package app

// E2B 沙盒：MCP 工作流（/drama-ads 等）的 sandbox_exec 在这里跑。每个用户一个沙盒，空闲时暂停，
// /home/user 的文件跨调用保留；命令通过沙盒里的 envd（Connect 协议，JSON 编码）执行。

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	e2bEnvdPort        = 49983
	e2bDefaultTemplate = "omnimuse-drama"
	e2bIdleSeconds     = 15 * 60
	e2bUser            = "user"
)

var errE2BNotConfigured = errors.New("沙盒服务没有配置（E2B_API_KEY）")

type e2bClient struct {
	apiKey   string
	apiURL   string
	domain   string
	template string
	http     *http.Client
}

type e2bSandbox struct {
	ID          string
	Domain      string
	AccessToken string
	client      *e2bClient
}

func newE2BClient() (*e2bClient, error) {
	key := strings.TrimSpace(os.Getenv("E2B_API_KEY"))
	if key == "" {
		return nil, errE2BNotConfigured
	}
	domain := firstNonEmpty(strings.TrimSpace(os.Getenv("E2B_DOMAIN")), "e2b.app")
	return &e2bClient{
		apiKey:   key,
		apiURL:   "https://api." + domain,
		domain:   domain,
		template: firstNonEmpty(strings.TrimSpace(os.Getenv("E2B_TEMPLATE")), e2bDefaultTemplate),
		http:     &http.Client{Timeout: 0},
	}, nil
}

type e2bSandboxResponse struct {
	SandboxID       string `json:"sandboxID"`
	Domain          string `json:"domain"`
	EnvdAccessToken string `json:"envdAccessToken"`
}

func (c *e2bClient) api(ctx context.Context, method, path string, body any, target any) (int, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		reader = bytes.NewReader(data)
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, c.apiURL+path, reader)
	if err != nil {
		return 0, err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return resp.StatusCode, fmt.Errorf("沙盒服务返回 %d：%s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if target != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, target); err != nil {
			return resp.StatusCode, err
		}
	}
	return resp.StatusCode, nil
}

func (c *e2bClient) sandbox(resp e2bSandboxResponse) *e2bSandbox {
	return &e2bSandbox{ID: resp.SandboxID, Domain: firstNonEmpty(resp.Domain, c.domain), AccessToken: resp.EnvdAccessToken, client: c}
}

// create 开一个新沙盒：空闲超时后暂停（保留文件），下次 connect 时恢复。
func (c *e2bClient) create(ctx context.Context, metadata map[string]string) (*e2bSandbox, error) {
	body := map[string]any{"templateID": c.template, "timeout": e2bIdleSeconds, "autoPause": true, "metadata": metadata}
	var resp e2bSandboxResponse
	if _, err := c.api(ctx, http.MethodPost, "/v2/sandboxes", body, &resp); err != nil {
		return nil, err
	}
	return c.sandbox(resp), nil
}

// connect 连上（必要时恢复）已有沙盒，并把空闲超时重新算起。找不到时返回 ok=false。
func (c *e2bClient) connect(ctx context.Context, sandboxID string) (*e2bSandbox, bool, error) {
	var resp e2bSandboxResponse
	status, err := c.api(ctx, http.MethodPost, "/v2/sandboxes/"+url.PathEscape(sandboxID)+"/connect", map[string]any{"timeout": e2bIdleSeconds}, &resp)
	if status == http.StatusNotFound {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if resp.SandboxID == "" {
		resp.SandboxID = sandboxID
	}
	return c.sandbox(resp), true, nil
}

// setTimeout 把沙盒的空闲暂停时间从现在起改成 seconds 秒（后台命令跑的时候要撑住）。
func (c *e2bClient) setTimeout(ctx context.Context, sandboxID string, seconds int) error {
	_, err := c.api(ctx, http.MethodPost, "/sandboxes/"+url.PathEscape(sandboxID)+"/timeout", map[string]any{"timeout": seconds}, nil)
	return err
}

func (c *e2bClient) kill(ctx context.Context, sandboxID string) error {
	status, err := c.api(ctx, http.MethodDelete, "/sandboxes/"+url.PathEscape(sandboxID), nil, nil)
	if status == http.StatusNotFound {
		return nil
	}
	return err
}

func (s *e2bSandbox) envdURL(path string) string {
	return fmt.Sprintf("https://%d-%s.%s%s", e2bEnvdPort, s.ID, s.Domain, path)
}

func (s *e2bSandbox) envdHeaders(req *http.Request) {
	if s.AccessToken != "" {
		req.Header.Set("X-Access-Token", s.AccessToken)
	}
	req.Header.Set("E2b-Sandbox-Id", s.ID)
	req.Header.Set("E2b-Sandbox-Port", fmt.Sprint(e2bEnvdPort))
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(e2bUser+":")))
}

type e2bExecResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
	TimedOut bool
}

type e2bProcessEvent struct {
	Event struct {
		Start *struct {
			PID int `json:"pid"`
		} `json:"start"`
		Data *struct {
			Stdout string `json:"stdout"`
			Stderr string `json:"stderr"`
		} `json:"data"`
		End *struct {
			ExitCode int    `json:"exitCode"`
			Exited   bool   `json:"exited"`
			Status   string `json:"status"`
			Error    string `json:"error"`
		} `json:"end"`
	} `json:"event"`
}

// exec 用 bash 在 /home/user 里跑一条命令，等它结束或超时，返回输出和退出码。
func (s *e2bSandbox) exec(ctx context.Context, command string, timeout time.Duration, envs map[string]string) (e2bExecResult, error) {
	payload, err := json.Marshal(map[string]any{
		"process": map[string]any{"cmd": "/bin/bash", "args": []string{"-l", "-c", command}, "cwd": "/home/user", "envs": envs},
		"stdin":   false,
	})
	if err != nil {
		return e2bExecResult{}, err
	}
	frame := make([]byte, 5+len(payload))
	binary.BigEndian.PutUint32(frame[1:5], uint32(len(payload)))
	copy(frame[5:], payload)
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(runCtx, http.MethodPost, s.envdURL("/process.Process/Start"), bytes.NewReader(frame))
	if err != nil {
		return e2bExecResult{}, err
	}
	s.envdHeaders(req)
	req.Header.Set("Content-Type", "application/connect+json")
	req.Header.Set("Connect-Protocol-Version", "1")
	req.Header.Set("Connect-Timeout-Ms", fmt.Sprint(timeout.Milliseconds()))
	resp, err := s.client.http.Do(req)
	if err != nil {
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			return e2bExecResult{TimedOut: true, ExitCode: -1}, nil
		}
		return e2bExecResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return e2bExecResult{}, fmt.Errorf("沙盒执行失败 %d：%s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var stdout, stderr strings.Builder
	result := e2bExecResult{ExitCode: -1}
	header := make([]byte, 5)
	for {
		if _, err := io.ReadFull(resp.Body, header); err != nil {
			if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
				result.TimedOut = true
			} else if !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
				return result, err
			}
			break
		}
		size := binary.BigEndian.Uint32(header[1:5])
		body := make([]byte, size)
		if _, err := io.ReadFull(resp.Body, body); err != nil {
			if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
				result.TimedOut = true
			}
			break
		}
		if header[0]&0x02 != 0 {
			var end struct {
				Error *struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if json.Unmarshal(body, &end) == nil && end.Error != nil && end.Error.Code != "" {
				if end.Error.Code == "deadline_exceeded" || end.Error.Code == "canceled" {
					result.TimedOut = true
					break
				}
				return result, fmt.Errorf("沙盒执行出错：%s %s", end.Error.Code, end.Error.Message)
			}
			break
		}
		var event e2bProcessEvent
		if err := json.Unmarshal(body, &event); err != nil {
			continue
		}
		if data := event.Event.Data; data != nil {
			if data.Stdout != "" {
				if raw, err := base64.StdEncoding.DecodeString(data.Stdout); err == nil {
					stdout.Write(raw)
				}
			}
			if data.Stderr != "" {
				if raw, err := base64.StdEncoding.DecodeString(data.Stderr); err == nil {
					stderr.Write(raw)
				}
			}
		}
		if end := event.Event.End; end != nil {
			result.ExitCode = end.ExitCode
		}
	}
	result.Stdout = stdout.String()
	result.Stderr = stderr.String()
	return result, nil
}

// readFile 读沙盒里的一个文件（路径相对 /home/user）。
func (s *e2bSandbox) readFile(ctx context.Context, path string, limit int64) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	query := url.Values{"path": {path}, "username": {e2bUser}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.envdURL("/files?"+query.Encode()), nil)
	if err != nil {
		return nil, err
	}
	s.envdHeaders(req)
	resp, err := s.client.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("沙盒里没有这个文件：%s", path)
	}
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("读取沙盒文件失败 %d：%s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("沙盒文件超过 %d 字节：%s", limit, path)
	}
	return data, nil
}

// writeFile 把内容写进沙盒（路径相对 /home/user）。
func (s *e2bSandbox) writeFile(ctx context.Context, path string, data []byte) error {
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", path)
	if err != nil {
		return err
	}
	if _, err := part.Write(data); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	query := url.Values{"path": {path}, "username": {e2bUser}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.envdURL("/files?"+query.Encode()), body)
	if err != nil {
		return err
	}
	s.envdHeaders(req)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := s.client.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("写入沙盒文件失败 %d：%s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	return nil
}
