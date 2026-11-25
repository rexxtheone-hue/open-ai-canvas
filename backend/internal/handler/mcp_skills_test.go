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
	help, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "help"}})
	if err != nil || !strings.Contains(help.Content[0].(*mcp.TextContent).Text, "/festive-campaign") {
		t.Fatalf("help = %+v err=%v", help, err)
	}
	missing, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_skill", Arguments: map[string]any{"name": "nope"}})
	if err == nil && (missing == nil || !missing.IsError) {
		t.Fatal("unknown workflows must be an error")
	}
}
