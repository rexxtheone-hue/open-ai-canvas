package app

// MCP 工作流手册（get_workflow_instructions / get_workflow_bundle_file）：每个工作流是数据目录下 workflows/<名字>/ 的一个文件夹，
// 里面有 SKILL.md、references/ 和 scripts/。手册不放在代码仓库里，部署时放到服务器的数据目录。

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type WorkflowSummary struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type WorkflowInstructions struct {
	Workflow       string   `json:"workflow"`
	Content        string   `json:"content"`
	AvailablePaths []string `json:"available_paths"`
}

type WorkflowFile struct {
	Kind     string         `json:"kind"`
	Workflow string         `json:"workflow"`
	Path     string         `json:"path"`
	Content  string         `json:"content,omitempty"`
	Entries  []WorkflowFile `json:"entries,omitempty"`
	Size     int64          `json:"size_bytes,omitempty"`
}

func (s *Service) workflowsRoot() string {
	if dir := strings.TrimSpace(os.Getenv("CANVAS_WORKFLOWS_DIR")); dir != "" {
		return dir
	}
	return filepath.Join(s.dataDir, "workflows")
}

func validWorkflowName(name string) bool {
	if name == "" || len(name) > 80 {
		return false
	}
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			return false
		}
	}
	return true
}

func (s *Service) ListWorkflows() ([]WorkflowSummary, error) {
	entries, err := os.ReadDir(s.workflowsRoot())
	if errors.Is(err, fs.ErrNotExist) {
		return []WorkflowSummary{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []WorkflowSummary{}
	for _, entry := range entries {
		if !entry.IsDir() || !validWorkflowName(entry.Name()) {
			continue
		}
		skill, err := os.ReadFile(filepath.Join(s.workflowsRoot(), entry.Name(), "SKILL.md"))
		if err != nil {
			continue
		}
		out = append(out, WorkflowSummary{Name: entry.Name(), Description: skillDescription(string(skill))})
	}
	return out, nil
}

// skillDescription 取 SKILL.md 开头 YAML 里的 description。
func skillDescription(skill string) string {
	lines := strings.Split(skill, "\n")
	for i, line := range lines {
		if !strings.HasPrefix(line, "description:") {
			continue
		}
		value := strings.TrimSpace(strings.TrimPrefix(line, "description:"))
		if value == "" || !strings.ContainsAny(value[:1], "|>") {
			return value
		}
		parts := []string{}
		for _, next := range lines[i+1:] {
			if !strings.HasPrefix(next, " ") {
				break
			}
			parts = append(parts, strings.TrimSpace(next))
		}
		return strings.Join(parts, " ")
	}
	return ""
}

func (s *Service) WorkflowInstructions(name string) (*WorkflowInstructions, error) {
	if !validWorkflowName(name) {
		return nil, fmt.Errorf("没有这个工作流：%s", name)
	}
	dir := filepath.Join(s.workflowsRoot(), name)
	skill, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		return nil, fmt.Errorf("没有这个工作流：%s", name)
	}
	paths := []string{}
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		paths = append(paths, filepath.ToSlash(rel))
		return nil
	})
	sort.Strings(paths)
	return &WorkflowInstructions{Workflow: name, Content: string(skill), AvailablePaths: paths}, nil
}

func (s *Service) WorkflowBundleFile(name, filePath string, includeContents bool) (*WorkflowFile, error) {
	if !validWorkflowName(name) {
		return nil, fmt.Errorf("没有这个工作流：%s", name)
	}
	clean := path.Clean("/" + strings.TrimSpace(filePath))
	if clean == "/" || strings.Contains(filePath, "..") {
		return nil, fmt.Errorf("路径不对：%s", filePath)
	}
	dir := filepath.Join(s.workflowsRoot(), name)
	full := filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(clean, "/")))
	info, err := os.Stat(full)
	if err != nil {
		return nil, fmt.Errorf("%s 里没有 %s", name, filePath)
	}
	rel := strings.TrimPrefix(clean, "/")
	if !info.IsDir() {
		data, err := os.ReadFile(full)
		if err != nil {
			return nil, err
		}
		return &WorkflowFile{Kind: "file", Workflow: name, Path: rel, Content: string(data), Size: info.Size()}, nil
	}
	out := &WorkflowFile{Kind: "directory", Workflow: name, Path: rel}
	_ = filepath.WalkDir(full, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		r, _ := filepath.Rel(dir, p)
		entry := WorkflowFile{Kind: "file", Workflow: name, Path: filepath.ToSlash(r)}
		if fi, err := d.Info(); err == nil {
			entry.Size = fi.Size()
		}
		if includeContents {
			if data, err := os.ReadFile(p); err == nil {
				entry.Content = string(data)
			}
		}
		out.Entries = append(out.Entries, entry)
		return nil
	})
	return out, nil
}
