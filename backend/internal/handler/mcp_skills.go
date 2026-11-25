package handler

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCP 工作流（slash 指令）：每个工作流是一份写好的操作手册，放在 mcpskills/ 里。
// AI 应用通过 list_skills / get_skill 取手册，或在支持 prompts 的客户端里直接从菜单选，再照着手册调用生成工具。

//go:embed mcpskills/*.md mcpskills/refs
var mcpSkillFiles embed.FS

type mcpSkill struct {
	Name     string `json:"name"`
	Title    string `json:"title"`
	Summary  string `json:"summary"`
	UseWhen  string `json:"useWhen"`
	Argument string `json:"argument,omitempty"`
	// References 是按步骤读取的提示词公式（get_skill 的 reference 参数），名字到标题。
	References map[string]string `json:"references,omitempty"`
	body       string
}

// mcpSkillRefs 是所有工作流的提示词公式，键为 "<工作流>/<公式>"。
var mcpSkillRefs = map[string]string{}

var mcpSkills, mcpSkillRules = loadMCPSkills()

func loadMCPSkills() ([]mcpSkill, string) {
	entries, err := mcpSkillFiles.ReadDir("mcpskills")
	if err != nil {
		panic(err)
	}
	rules := ""
	skills := []mcpSkill{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		data, err := mcpSkillFiles.ReadFile("mcpskills/" + entry.Name())
		if err != nil {
			panic(err)
		}
		text := strings.ReplaceAll(string(data), "\r\n", "\n")
		if entry.Name() == "_rules.md" {
			rules = strings.TrimSpace(text)
			continue
		}
		skill, err := parseMCPSkill(text)
		if err != nil {
			panic(fmt.Sprintf("mcpskills/%s: %v", entry.Name(), err))
		}
		skills = append(skills, skill)
	}
	refDirs, _ := mcpSkillFiles.ReadDir("mcpskills/refs")
	for _, dir := range refDirs {
		files, err := mcpSkillFiles.ReadDir("mcpskills/refs/" + dir.Name())
		if err != nil {
			panic(err)
		}
		for _, file := range files {
			data, err := mcpSkillFiles.ReadFile("mcpskills/refs/" + dir.Name() + "/" + file.Name())
			if err != nil {
				panic(err)
			}
			mcpSkillRefs[dir.Name()+"/"+strings.TrimSuffix(file.Name(), ".md")] = strings.TrimSpace(strings.ReplaceAll(string(data), "\r\n", "\n"))
		}
	}
	for index := range skills {
		for key, text := range mcpSkillRefs {
			owner, name, _ := strings.Cut(key, "/")
			if owner != skills[index].Name {
				continue
			}
			if skills[index].References == nil {
				skills[index].References = map[string]string{}
			}
			title, _, _ := strings.Cut(text, "\n")
			skills[index].References[name] = strings.TrimSpace(strings.TrimLeft(title, "# "))
		}
	}
	sort.SliceStable(skills, func(i, j int) bool { return mcpSkillOrder(skills[i].Name) < mcpSkillOrder(skills[j].Name) })
	return skills, rules
}

// 常用的排前面，其余按名字。
func mcpSkillOrder(name string) string {
	for index, first := range []string{"product-photoshoot", "ugc-ad", "static-ads", "adapt-ad", "hook-variants", "localize-ads", "resize-ads", "festive-campaign"} {
		if name == first {
			return fmt.Sprintf("%02d", index)
		}
	}
	return "99" + name
}

func parseMCPSkill(text string) (mcpSkill, error) {
	if !strings.HasPrefix(text, "---\n") {
		return mcpSkill{}, fmt.Errorf("missing front matter")
	}
	header, body, found := strings.Cut(strings.TrimPrefix(text, "---\n"), "\n---\n")
	if !found {
		return mcpSkill{}, fmt.Errorf("unterminated front matter")
	}
	skill := mcpSkill{body: strings.TrimSpace(body)}
	for _, line := range strings.Split(header, "\n") {
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		switch strings.TrimSpace(key) {
		case "name":
			skill.Name = value
		case "title":
			skill.Title = value
		case "summary":
			skill.Summary = value
		case "use_when":
			skill.UseWhen = value
		case "argument":
			skill.Argument = value
		}
	}
	if skill.Name == "" || skill.Title == "" || skill.Summary == "" || skill.body == "" {
		return mcpSkill{}, fmt.Errorf("name, title, summary and body are required")
	}
	return skill, nil
}

func findMCPSkill(name string) (mcpSkill, bool) {
	name = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(name), "/")))
	name = strings.TrimPrefix(name, "omnimuse:")
	for _, skill := range mcpSkills {
		if skill.Name == name {
			return skill, true
		}
	}
	return mcpSkill{}, false
}

// mcpSkillPlaybook 是交给 AI 的完整手册：工作流本身加上所有工作流共用的规则。
func mcpSkillPlaybook(skill mcpSkill, brief string) string {
	text := fmt.Sprintf("You are running the OmniMuse /%s workflow. Follow this playbook step by step.\n\n%s\n\n%s", skill.Name, skill.body, mcpSkillRules)
	if names := mcpSkillRefNames(skill.Name); len(names) > 0 {
		text += fmt.Sprintf("\n\n## Prompt formulas\n\nBefore writing the prompts of a step, load its formula with get_skill {\"name\": %q, \"reference\": \"<name>\"} and follow it exactly. Available: %s.", skill.Name, strings.Join(names, ", "))
	}
	if brief = strings.TrimSpace(brief); brief != "" {
		text += "\n\n## The user's brief\n\n" + brief
	}
	return text
}

func mcpSkillRefNames(skill string) []string {
	names := []string{}
	for key := range mcpSkillRefs {
		if owner, name, _ := strings.Cut(key, "/"); owner == skill {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}

// findMCPSkillRef 先在当前工作流里找公式，再按 "<工作流>/<公式>" 找其他工作流的公式。
func findMCPSkillRef(skill, reference string) (string, string, bool) {
	reference = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(reference), ".md")))
	for _, key := range []string{skill + "/" + reference, reference} {
		if text, ok := mcpSkillRefs[key]; ok {
			return key, text, true
		}
	}
	return "", "", false
}

func mcpSkillMenu() string {
	lines := []string{"OmniMuse workflows (slash commands). Say \"run /name\" or describe the goal:"}
	for _, skill := range mcpSkills {
		lines = append(lines, fmt.Sprintf("- /%s — %s", skill.Name, skill.Summary))
	}
	return strings.Join(lines, "\n")
}

type mcpSkillInput struct {
	Name      string `json:"name" jsonschema:"workflow name from list_skills, for example ugc-ad or /product-photoshoot"`
	Brief     string `json:"brief,omitempty" jsonschema:"what the user asked for, so the playbook can be applied to it"`
	Reference string `json:"reference,omitempty" jsonschema:"a prompt formula the playbook names, for example creator, storyboard or product-photoshoot/formulas; load it right before the step that needs it"`
}

func registerMCPSkills(server *mcp.Server) {
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true}
	mcp.AddTool(server, &mcp.Tool{Name: "list_skills", Title: "List workflows", Description: "List OmniMuse's ready-made workflows (slash commands such as /ugc-ad, /product-photoshoot, /static-ads). Call this when the user types /help, asks what OmniMuse can do, or wants a multi-step result like an ad pack, a UGC video or a festive campaign.", Annotations: readOnly},
		func(context.Context, *mcp.CallToolRequest, mcpEmpty) (*mcp.CallToolResult, any, error) {
			return mcpText(mcpSkills, mcpSkillMenu()+"\n\nCall get_skill with a name to get its step-by-step playbook before starting."), nil, nil
		})
	mcp.AddTool(server, &mcp.Tool{Name: "get_skill", Title: "Get workflow playbook", Description: "Get the step-by-step playbook for an OmniMuse workflow. Always call this when the user writes /<name> (for example \"run /ugc-ad\") or their request matches a workflow from list_skills, then follow the playbook exactly, including showing the price before generating.", Annotations: readOnly},
		func(_ context.Context, _ *mcp.CallToolRequest, in mcpSkillInput) (*mcp.CallToolResult, any, error) {
			name := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(in.Name), "/")))
			if name == "help" || name == "" {
				return mcpText(mcpSkills, mcpSkillMenu()), nil, nil
			}
			skill, ok := findMCPSkill(name)
			if !ok {
				return nil, nil, fmt.Errorf("no workflow named %q. %s", in.Name, mcpSkillMenu())
			}
			if strings.TrimSpace(in.Reference) != "" {
				key, text, found := findMCPSkillRef(skill.Name, in.Reference)
				if !found {
					return nil, nil, fmt.Errorf("no formula %q for /%s; available: %s", in.Reference, skill.Name, strings.Join(mcpSkillRefNames(skill.Name), ", "))
				}
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "Formula " + key + " (follow it exactly when writing these prompts):\n\n" + text}}}, nil, nil
			}
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: mcpSkillPlaybook(skill, in.Brief)}}}, nil, nil
		})

	server.AddPrompt(&mcp.Prompt{Name: "help", Title: "OmniMuse: all workflows", Description: "List every OmniMuse workflow"},
		func(context.Context, *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
			return &mcp.GetPromptResult{Description: "OmniMuse workflows", Messages: []*mcp.PromptMessage{{Role: "user", Content: &mcp.TextContent{Text: mcpSkillMenu() + "\n\nShow me this list and ask which one I want."}}}}, nil
		})
	for _, skill := range mcpSkills {
		skill := skill
		server.AddPrompt(&mcp.Prompt{
			Name: skill.Name, Title: "OmniMuse: " + skill.Title, Description: skill.Summary,
			Arguments: []*mcp.PromptArgument{{Name: "brief", Description: firstNonEmptyString(skill.Argument, "what you want to make")}},
		}, func(_ context.Context, req *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
			brief := ""
			if req != nil && req.Params != nil {
				brief = req.Params.Arguments["brief"]
			}
			return &mcp.GetPromptResult{Description: skill.Summary, Messages: []*mcp.PromptMessage{{Role: "user", Content: &mcp.TextContent{Text: mcpSkillPlaybook(skill, brief)}}}}, nil
		})
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
