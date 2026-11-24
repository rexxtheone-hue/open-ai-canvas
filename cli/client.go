package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type config struct {
	Host         string    `json:"host"`
	APIKey       string    `json:"apiKey,omitempty"`
	ClientID     string    `json:"clientId,omitempty"`
	AccessToken  string    `json:"accessToken,omitempty"`
	RefreshToken string    `json:"refreshToken,omitempty"`
	ExpiresAt    time.Time `json:"expiresAt,omitempty"`
}

const defaultHost = "https://omnimuse.io"

func configPath() (string, error) {
	if path := os.Getenv("OMNIMUSE_CONFIG"); path != "" {
		return path, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".omnimuse", "config.json"), nil
}

func loadConfig() (*config, error) {
	cfg := &config{Host: defaultHost}
	path, err := configPath()
	if err != nil {
		return nil, err
	}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("config file %s is invalid: %w", path, err)
		}
	}
	if host := os.Getenv("OMNIMUSE_HOST"); host != "" {
		cfg.Host = host
	}
	if key := os.Getenv("OMNIMUSE_API_KEY"); key != "" {
		cfg.APIKey, cfg.AccessToken, cfg.RefreshToken = key, "", ""
	}
	cfg.Host = strings.TrimRight(strings.TrimSpace(cfg.Host), "/")
	if cfg.Host == "" {
		cfg.Host = defaultHost
	}
	return cfg, nil
}

func saveConfig(cfg *config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

type apiError struct {
	Status  int
	Message string
}

func (e *apiError) Error() string { return e.Message }

type client struct {
	cfg  *config
	http *http.Client
}

func newClient(cfg *config) *client {
	return &client{cfg: cfg, http: &http.Client{Timeout: 10 * time.Minute}}
}

func (c *client) loggedIn() bool {
	return c.cfg.APIKey != "" || c.cfg.RefreshToken != "" || c.cfg.AccessToken != ""
}

// token 返回可用的 Bearer 令牌；浏览器登录的访问令牌快过期时先用刷新令牌换新。
func (c *client) token(forceRefresh bool) (string, error) {
	if c.cfg.APIKey != "" {
		return c.cfg.APIKey, nil
	}
	if c.cfg.RefreshToken == "" {
		return "", errors.New("not logged in. Run: omnimuse login")
	}
	if !forceRefresh && c.cfg.AccessToken != "" && time.Until(c.cfg.ExpiresAt) > time.Minute {
		return c.cfg.AccessToken, nil
	}
	tokens, err := refreshTokens(c.http, c.cfg.Host, c.cfg.ClientID, c.cfg.RefreshToken)
	if err != nil {
		return "", fmt.Errorf("session expired, run `omnimuse login` again (%w)", err)
	}
	c.cfg.AccessToken, c.cfg.RefreshToken = tokens.AccessToken, tokens.RefreshToken
	c.cfg.ExpiresAt = time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)
	if err := saveConfig(c.cfg); err != nil {
		return "", err
	}
	return c.cfg.AccessToken, nil
}

func (c *client) do(method, path string, body io.Reader, contentType string, out any) error {
	var payload []byte
	if body != nil {
		data, err := io.ReadAll(body)
		if err != nil {
			return err
		}
		payload = data
	}
	for attempt := 0; ; attempt++ {
		token, err := c.token(attempt > 0)
		if err != nil {
			return err
		}
		req, err := http.NewRequest(method, c.cfg.Host+"/api"+path, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-OmniMuse-Client", "cli")
		req.Header.Set("User-Agent", "omnimuse-cli/"+version)
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			return err
		}
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return err
		}
		// 浏览器登录的访问令牌可能在服务端被提前作废，刷新一次再试。
		if resp.StatusCode == http.StatusUnauthorized && attempt == 0 && c.cfg.APIKey == "" {
			continue
		}
		var envelope struct {
			Code int             `json:"code"`
			Msg  string          `json:"msg"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			return &apiError{Status: resp.StatusCode, Message: fmt.Sprintf("unexpected response (HTTP %d) from %s", resp.StatusCode, c.cfg.Host)}
		}
		if resp.StatusCode >= 400 || envelope.Code != 0 {
			message := envelope.Msg
			if message == "" {
				message = fmt.Sprintf("HTTP %d", resp.StatusCode)
			}
			return &apiError{Status: resp.StatusCode, Message: message}
		}
		if out == nil {
			return nil
		}
		return json.Unmarshal(envelope.Data, out)
	}
}

func (c *client) getJSON(path string, out any) error {
	return c.do(http.MethodGet, path, nil, "", out)
}

func (c *client) postJSON(path string, in any, out any) error {
	data, err := json.Marshal(in)
	if err != nil {
		return err
	}
	return c.do(http.MethodPost, path, bytes.NewReader(data), "application/json", out)
}

type uploadResult struct {
	ResourceID string `json:"resourceId"`
	Kind       string `json:"kind"`
}

func (c *client) upload(path string) (*uploadResult, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, err
	}
	if kind := kindFromExtension(path); kind != "" {
		_ = writer.WriteField("kind", kind)
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	var result uploadResult
	if err := c.do(http.MethodPost, "/v1/uploads", &body, writer.FormDataContentType(), &result); err != nil {
		return nil, fmt.Errorf("upload %s: %w", path, err)
	}
	return &result, nil
}

func kindFromExtension(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic":
		return "image"
	case ".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv":
		return "video"
	case ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac":
		return "audio"
	}
	return ""
}

func (c *client) download(rawURL, dest string) error {
	resp, err := c.http.Get(rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}
	tmp := dest + ".part"
	file, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(file, resp.Body); err != nil {
		file.Close()
		os.Remove(tmp)
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dest)
}

func extensionFor(mime, rawURL, kind string) string {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0])) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav", "audio/x-wav":
		return ".wav"
	}
	if parsed, err := url.Parse(rawURL); err == nil {
		if ext := filepath.Ext(parsed.Path); ext != "" && len(ext) <= 5 {
			return ext
		}
	}
	switch kind {
	case "video":
		return ".mp4"
	case "audio":
		return ".mp3"
	}
	return ".png"
}
