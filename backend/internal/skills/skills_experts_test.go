package skills

import (
	"strings"
	"testing"
)

func TestSkillExpertsCatalogIsValid(t *testing.T) {
	catalog, err := New(nil, "", nil).SkillExperts()
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog.Experts) == 0 {
		t.Fatal("专家目录不能为空")
	}
	for _, expert := range catalog.Experts {
		_, text, ok := catalog.Instruction(expert.ExpertID)
		if !ok {
			t.Fatalf("%s 无法生成专家段落", expert.ExpertID)
		}
		if !strings.Contains(text, expert.Name) || !strings.Contains(text, catalog.SharedPolicy) {
			t.Fatalf("%s 专家段落缺少名称或共享规则", expert.ExpertID)
		}
	}
	if _, _, ok := catalog.Instruction("missing-expert"); ok {
		t.Fatal("未知专家不应命中")
	}
}
