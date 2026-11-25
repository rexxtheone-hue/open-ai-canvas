package handler

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPSkillsParseAndOnlyReferenceRealTools(t *testing.T) {
	if len(mcpSkills) < 10 || mcpSkillRules == "" {
		t.Fatalf("skills=%d rules=%d", len(mcpSkills), len(mcpSkillRules))
	}
	if mcpSkills[0].Name != "product-photoshoot" {
		t.Fatalf("popular workflows must come first, got %s", mcpSkills[0].Name)
	}
	tools := map[string]bool{"list_models": true, "list_assets": true, "estimate_cost": true, "generate_image": true, "generate_video": true, "get_generation": true, "list_generations": true, "get_account": true, "list_skills": true, "get_skill": true, "cancel_generation": true}
	toolRef := regexp.MustCompile("`([a-z]+_[a-z_]+)`")
	operations := map[string]bool{"inpaint": true, "replace_element": true, "style_transfer": true, "camera_motion": true, "extend": true, "lip_sync": true, "motion_transfer": true, "video_upscale": true, "video_sfx": true}
	operationRef := regexp.MustCompile("operation: ([a-z_]+)")
	seen := map[string]bool{}
	for _, skill := range mcpSkills {
		if seen[skill.Name] {
			t.Fatalf("duplicate skill %s", skill.Name)
		}
		seen[skill.Name] = true
		text := skill.body + "\n" + mcpSkillRules
		for _, match := range toolRef.FindAllStringSubmatch(text, -1) {
			if !tools[match[1]] && !operations[match[1]] {
				t.Fatalf("%s mentions unknown tool %q", skill.Name, match[1])
			}
		}
		for _, match := range operationRef.FindAllStringSubmatch(text, -1) {
			if !operations[match[1]] {
				t.Fatalf("%s uses unknown operation %q", skill.Name, match[1])
			}
		}
		for _, linked := range regexp.MustCompile("`/([a-z-]+)`").FindAllStringSubmatch(text, -1) {
			if _, ok := findMCPSkill(linked[1]); !ok {
				t.Fatalf("%s links to missing workflow /%s", skill.Name, linked[1])
			}
		}
	}
	if skill, ok := findMCPSkill(" /OmniMuse:UGC-Ad "); !ok || skill.Name != "ugc-ad" {
		t.Fatal("lookup must accept slash, prefix and case variations")
	}
}

func TestMCPSkillFormulasExistForEveryStepThatNamesOne(t *testing.T) {
	for skill, names := range map[string][]string{
		"ugc-ad":             {"creator", "storyboard", "clip", "script"},
		"drama-ad":           {"script", "characters", "places", "clip"},
		"product-photoshoot": {"formulas", "vocabulary"},
	} {
		for _, name := range names {
			key, text, ok := findMCPSkillRef(skill, name)
			if !ok || len(text) < 1500 || !strings.HasPrefix(text, "# ") {
				t.Fatalf("%s formula %s missing or too short (key=%s len=%d)", skill, name, key, len(text))
			}
			if found, _ := findMCPSkill(skill); !strings.Contains(found.body, "`"+name+"`") {
				t.Fatalf("/%s never tells the AI to load its %s formula", skill, name)
			}
		}
	}
	// 其他工作流借用产品图公式时用 "<工作流>/<公式>"。
	for _, skill := range []string{"static-ads", "festive-campaign"} {
		body := func() string { s, _ := findMCPSkill(skill); return s.body }()
		for _, ref := range regexp.MustCompile("`(product-photoshoot/[a-z]+)`").FindAllStringSubmatch(body, -1) {
			if _, _, ok := findMCPSkillRef(skill, ref[1]); !ok {
				t.Fatalf("/%s names missing formula %s", skill, ref[1])
			}
		}
	}
	if _, _, ok := findMCPSkillRef("ugc-ad", "nope"); ok {
		t.Fatal("unknown formulas must not resolve")
	}
}

func TestMCPSkillsAreServedAsToolsAndPrompts(t *testing.T) {
	ctx := context.Background()
	server := mcp.NewServer(&mcp.Implementation{Name: "test"}, nil)
	registerMCPSkills(server)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	if _, err := server.Connect(ctx, serverTransport, nil); err != nil {
		t.Fatal(err)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "client"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	prompts, err := session.ListPrompts(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(prompts.Prompts) != len(mcpSkills)+1 {
		t.Fatalf("prompts = %d, want every workflow plus help", len(prompts.Prompts))
	}
	prompt, err := session.GetPrompt(ctx, &mcp.GetPromptParams{Name: "static-ads", Arguments: map[string]string{"brief": "Durian cake, RM39 promo"}})
	if err != nil {
		t.Fatal(err)
	}
	text := prompt.Messages[0].Content.(*mcp.TextContent).Text
	if !strings.Contains(text, "/static-ads workflow") || !strings.Contains(text, "Price before work") || !strings.Contains(text, "Durian cake, RM39 promo") {
		t.Fatalf("prompt text = %.300s", text)
	}

	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "/ugc-ad"}})
	if err != nil || result.IsError {
		t.Fatalf("get_skill err=%v result=%+v", err, result)
	}
	if body := result.Content[0].(*mcp.TextContent).Text; !strings.Contains(body, "UGC product video") {
		t.Fatalf("get_skill body = %.200s", body)
	}
	if !strings.Contains(prompt.Messages[0].Content.(*mcp.TextContent).Text, "Prompt formulas") {
		// static-ads 自己没有公式文件，借用产品图的公式；有公式的工作流才列「Prompt formulas」。
		ugc, _ := session.GetPrompt(ctx, &mcp.GetPromptParams{Name: "ugc-ad"})
		if !strings.Contains(ugc.Messages[0].Content.(*mcp.TextContent).Text, "Available: clip, creator, script, storyboard.") {
			t.Fatalf("ugc-ad playbook must list its formulas")
		}
	}
	formula, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "drama-ad", "reference": "characters"}})
	if err != nil || formula.IsError || !strings.Contains(formula.Content[0].(*mcp.TextContent).Text, "Character picture formula") {
		t.Fatalf("formula = %+v err=%v", formula, err)
	}
	borrowed, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "static-ads", "reference": "product-photoshoot/formulas"}})
	if err != nil || borrowed.IsError || !strings.Contains(borrowed.Content[0].(*mcp.TextContent).Text, "Ad pack") {
		t.Fatalf("borrowed formula = %+v err=%v", borrowed, err)
	}
	help, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "help"}})
	if err != nil || !strings.Contains(help.Content[0].(*mcp.TextContent).Text, "/festive-campaign") {
		t.Fatalf("help = %+v err=%v", help, err)
	}
	missing, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "nope"}})
	if err == nil && (missing == nil || !missing.IsError) {
		t.Fatal("unknown workflows must be an error")
	}
}
