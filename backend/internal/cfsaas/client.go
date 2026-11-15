// Package cfsaas 封装 Cloudflare for SaaS 的自定义主机名接口：代理商把自己的网址 CNAME 到中性接入域名，
// 平台在这里登记主机名并由 Cloudflare 自动签发 DV 证书（HTTP 验证）。
package cfsaas

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ErrNotConfigured 表示没有配置 CF_SAAS_ZONE_ID / CF_SAAS_API_TOKEN。
var ErrNotConfigured = errors.New("cloudflare for saas is not configured")

// ErrNotFound 表示 Cloudflare 上已经没有这个主机名（例如被手动删除）。
var ErrNotFound = errors.New("custom hostname not found")

// Hostname 是自定义主机名的状态快照。Status 是主机名本身的状态，SSLStatus 是证书状态（active 才能用 https 访问）。
type Hostname struct {
	ID        string `json:"id"`
	Hostname  string `json:"hostname"`
	Status    string `json:"status"`
	SSLStatus string `json:"sslStatus"`
	// VerificationErrors 是 Cloudflare 返回的待处理原因，例如 CNAME 还没生效。
	VerificationErrors []string `json:"verificationErrors,omitempty"`
}

// Client 是平台用到的三个操作；测试里用假实现替换。
type Client interface {
	Create(ctx context.Context, hostname string) (Hostname, error)
	Get(ctx context.Context, id string) (Hostname, error)
	Delete(ctx context.Context, id string) error
	// FallbackOrigin 是代理商需要 CNAME 指向的中性接入主机名（CF_SAAS_FALLBACK_ORIGIN）。
	FallbackOrigin() string
}

type Config struct {
	ZoneID         string
	APIToken       string
	FallbackOrigin string
	BaseURL        string
	HTTPClient     *http.Client
}

// ConfigFromEnv 读取环境变量；ZoneID 或 Token 缺失时返回 ok=false。
func ConfigFromEnv() (Config, bool) {
	cfg := Config{
		ZoneID:         strings.TrimSpace(os.Getenv("CF_SAAS_ZONE_ID")),
		APIToken:       strings.TrimSpace(os.Getenv("CF_SAAS_API_TOKEN")),
		FallbackOrigin: strings.TrimSpace(os.Getenv("CF_SAAS_FALLBACK_ORIGIN")),
	}
	return cfg, cfg.ZoneID != "" && cfg.APIToken != ""
}

type httpClient struct {
	cfg Config
}

func New(cfg Config) Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.cloudflare.com/client/v4"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 20 * time.Second}
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	return &httpClient{cfg: cfg}
}

func (c *httpClient) FallbackOrigin() string { return c.cfg.FallbackOrigin }

type apiHostname struct {
	ID       string `json:"id"`
	Hostname string `json:"hostname"`
	Status   string `json:"status"`
	SSL      struct {
		Status           string `json:"status"`
		ValidationErrors []struct {
			Message string `json:"message"`
		} `json:"validation_errors"`
	} `json:"ssl"`
	VerificationErrors []string `json:"verification_errors"`
}

type apiResponse struct {
	Success bool            `json:"success"`
	Errors  []apiError      `json:"errors"`
	Result  json.RawMessage `json:"result"`
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (c *httpClient) Create(ctx context.Context, hostname string) (Hostname, error) {
	body := map[string]any{
		"hostname": hostname,
		"ssl":      map[string]any{"method": "http", "type": "dv"},
	}
	var result apiHostname
	if err := c.do(ctx, http.MethodPost, "", body, &result); err != nil {
		return Hostname{}, err
	}
	return result.toHostname(), nil
}

func (c *httpClient) Get(ctx context.Context, id string) (Hostname, error) {
	var result apiHostname
	if err := c.do(ctx, http.MethodGet, "/"+url.PathEscape(id), nil, &result); err != nil {
		return Hostname{}, err
	}
	return result.toHostname(), nil
}

func (c *httpClient) Delete(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/"+url.PathEscape(id), nil, nil)
}

func (c *httpClient) do(ctx context.Context, method, suffix string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	endpoint := c.cfg.BaseURL + "/zones/" + url.PathEscape(c.cfg.ZoneID) + "/custom_hostnames" + suffix
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("cloudflare custom hostnames: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	var decoded apiResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return fmt.Errorf("cloudflare custom hostnames: unexpected response (HTTP %d)", resp.StatusCode)
	}
	if !decoded.Success || resp.StatusCode >= 300 {
		messages := make([]string, 0, len(decoded.Errors))
		for _, item := range decoded.Errors {
			messages = append(messages, fmt.Sprintf("%d %s", item.Code, item.Message))
		}
		return fmt.Errorf("cloudflare custom hostnames: HTTP %d: %s", resp.StatusCode, strings.Join(messages, "; "))
	}
	if out == nil || len(decoded.Result) == 0 {
		return nil
	}
	return json.Unmarshal(decoded.Result, out)
}

func (h apiHostname) toHostname() Hostname {
	result := Hostname{ID: h.ID, Hostname: h.Hostname, Status: h.Status, SSLStatus: h.SSL.Status}
	result.VerificationErrors = append(result.VerificationErrors, h.VerificationErrors...)
	for _, item := range h.SSL.ValidationErrors {
		if item.Message != "" {
			result.VerificationErrors = append(result.VerificationErrors, item.Message)
		}
	}
	return result
}
