package app

import (
	"strings"
	"testing"
)

func TestCloudAgentExpertAppendsPersonaAndRecordsPolicy(t *testing.T) {
	svc := &Service{}
	base, policy, err := compileCloudAgentPolicies(agentTestRequest(), defaultCanvasAppearance().AgentName, nil, "", cloudAgentProfileSnapshot{})
	if err != nil {
		t.Fatal(err)
	}
	unchanged, err := svc.appendCloudAgentExpert(base, &policy, "")
	if err != nil || unchanged != base || policy.ExpertID != "" {
		t.Fatalf("empty expertId must leave the policy untouched")
	}
	text, err := svc.appendCloudAgentExpert(base, &policy, "short-drama-expert")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(text, base) || !strings.Contains(text, "# 当前专家：短剧专家") || !strings.Contains(text, "## 专家共享规则") {
		t.Fatalf("expert section was not appended after the compiled policy")
	}
	if policy.ExpertID != "short-drama-expert" || len(policy.ExpertHash) != 64 {
		t.Fatalf("policy snapshot did not record the expert: %#v", policy)
	}
	if _, err := svc.appendCloudAgentExpert(base, &policy, "missing-expert"); err == nil {
		t.Fatal("unknown expert must be rejected")
	}
}
