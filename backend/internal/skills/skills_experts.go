package skills

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

//go:embed seed/experts.json
var builtinSkillExpertsJSON []byte

// 专家（Experts）：预设之上再加一层「角色」。预设只挂技能；专家 = 固定技能组 + 一段
// 编进本轮 system prompt 的工作方法（目标契约、路由、产出规范、边界）。
// 共享规则写一次放 sharedPolicy，每个专家只写自己的专长，避免多份 persona 漂移。
type SkillExpert struct {
	ExpertID string   `json:"expertId"`
	Name     string   `json:"name"`
	Scene    string   `json:"scene"`
	Tagline  string   `json:"tagline"`
	Persona  string   `json:"persona"`
	SkillIDs []string `json:"skillIds"`
	Cases    []string `json:"cases"`
}

type SkillExpertCatalog struct {
	SharedPolicy string        `json:"sharedPolicy"`
	Experts      []SkillExpert `json:"experts"`
}

type skillExpertsFile struct {
	Version      int           `json:"version"`
	Updated      string        `json:"updated"`
	SharedPolicy string        `json:"sharedPolicy"`
	Experts      []SkillExpert `json:"experts"`
}

const (
	skillExpertMaxPersonaRunes = 3000
	skillExpertMaxSharedRunes  = 3000
)

// SkillExperts 返回校验合格的专家目录；约束与场景预设一致（ID 格式、场景、1-8 个已上架种子技能）。
func (s *Service) SkillExperts() (SkillExpertCatalog, error) {
	var file skillExpertsFile
	if err := json.Unmarshal(builtinSkillExpertsJSON, &file); err != nil {
		return SkillExpertCatalog{}, fmt.Errorf("解析专家目录失败: %w", err)
	}
	if file.Version != 1 {
		return SkillExpertCatalog{}, fmt.Errorf("专家目录版本必须为 1，当前 %d", file.Version)
	}
	shared := strings.TrimSpace(file.SharedPolicy)
	if shared == "" || utf8.RuneCountInString(shared) > skillExpertMaxSharedRunes {
		return SkillExpertCatalog{}, fmt.Errorf("专家共享规则为空或超过 %d 字", skillExpertMaxSharedRunes)
	}
	if len(file.Experts) == 0 {
		return SkillExpertCatalog{}, fmt.Errorf("专家目录不能为空")
	}
	seedIDs, err := builtinSeedSkillIDs()
	if err != nil {
		return SkillExpertCatalog{}, fmt.Errorf("校验专家技能引用失败: %w", err)
	}
	seeded := make(map[string]struct{}, len(seedIDs))
	for _, id := range seedIDs {
		seeded[id] = struct{}{}
	}
	seen := make(map[string]struct{}, len(file.Experts))
	for _, expert := range file.Experts {
		id := strings.TrimSpace(expert.ExpertID)
		if !skillPresetIDPattern.MatchString(id) {
			return SkillExpertCatalog{}, fmt.Errorf("专家 ID 非法: %q", expert.ExpertID)
		}
		if _, dup := seen[id]; dup {
			return SkillExpertCatalog{}, fmt.Errorf("专家 ID 重复: %s", id)
		}
		seen[id] = struct{}{}
		if strings.TrimSpace(expert.Name) == "" || strings.TrimSpace(expert.Tagline) == "" {
			return SkillExpertCatalog{}, fmt.Errorf("专家 %s 缺名称或简介", id)
		}
		if _, ok := skillPresetScenes[expert.Scene]; !ok {
			return SkillExpertCatalog{}, fmt.Errorf("专家 %s 的分类非法: %q", id, expert.Scene)
		}
		if persona := strings.TrimSpace(expert.Persona); persona == "" || utf8.RuneCountInString(persona) > skillExpertMaxPersonaRunes {
			return SkillExpertCatalog{}, fmt.Errorf("专家 %s 的工作方法为空或超过 %d 字", id, skillExpertMaxPersonaRunes)
		}
		if len(expert.SkillIDs) == 0 || len(expert.SkillIDs) > 8 {
			return SkillExpertCatalog{}, fmt.Errorf("专家 %s 的技能数 %d 超出 1-8（每轮激活上限）", id, len(expert.SkillIDs))
		}
		expertSeen := make(map[string]struct{}, len(expert.SkillIDs))
		for _, skillID := range expert.SkillIDs {
			if _, dup := expertSeen[skillID]; dup {
				return SkillExpertCatalog{}, fmt.Errorf("专家 %s 的技能重复: %s", id, skillID)
			}
			expertSeen[skillID] = struct{}{}
			if _, ok := seeded[skillID]; !ok {
				return SkillExpertCatalog{}, fmt.Errorf("专家 %s 引用了未上架技能: %s", id, skillID)
			}
		}
	}
	return SkillExpertCatalog{SharedPolicy: shared, Experts: file.Experts}, nil
}

// Instruction 生成编进 system prompt 的专家段落；未知 ID 返回 false。
func (c SkillExpertCatalog) Instruction(expertID string) (SkillExpert, string, bool) {
	for _, expert := range c.Experts {
		if expert.ExpertID != expertID {
			continue
		}
		var b strings.Builder
		b.WriteString("# 当前专家：")
		b.WriteString(expert.Name)
		b.WriteString("\n\n")
		b.WriteString(strings.TrimSpace(expert.Persona))
		b.WriteString("\n\n## 专家共享规则\n\n")
		b.WriteString(c.SharedPolicy)
		return expert, b.String(), true
	}
	return SkillExpert{}, "", false
}
