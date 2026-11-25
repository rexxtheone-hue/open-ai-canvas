package app

// 渠道模型按分辨率路由：用户选的是一个模型（例如 Cloudwise 的 Seedance 2.5），按它的价格档计费；
// 实际按分辨率交给主用渠道模型生成，主用出错时切到备用，用户不会重复付费。
// 路由只改执行时的渠道、模型和协议，任务计费订单的售价保持不变，成本快照跟随实际执行的供应商。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"yingce/backend/internal/model"
)

const channelRouteSelf = "self"

// normalizeRouteResolution 把 720、720P、4k、2160 等写法统一成 720p、2160p。
func normalizeRouteResolution(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "", "<nil>":
		return ""
	case "4k", "2160", "2160p", "uhd":
		return "2160p"
	case "2k", "1440", "1440p":
		return "1440p"
	}
	if !strings.HasSuffix(value, "p") {
		if _, err := strconv.Atoi(value); err == nil {
			return value + "p"
		}
	}
	return value
}

func (s *Service) normalizeChannelModelRouteRules(item *model.ChannelModel, rules []model.ChannelModelRouteRule) ([]model.ChannelModelRouteRule, error) {
	if len(rules) > 0 && normalizeCapability(item.Capability) != "video" {
		return nil, BadAuthRequest("只有视频模型支持按分辨率路由")
	}
	if len(rules) > 10 {
		return nil, BadAuthRequest("路由规则最多 10 条")
	}
	seen := map[string]bool{}
	normalized := make([]model.ChannelModelRouteRule, 0, len(rules))
	for _, rule := range rules {
		next := model.ChannelModelRouteRule{}
		for _, resolution := range rule.Resolutions {
			value := normalizeRouteResolution(resolution)
			if value == "" {
				continue
			}
			if seen[value] {
				return nil, BadAuthRequest("分辨率 " + value + " 出现在多条路由规则里")
			}
			seen[value] = true
			next.Resolutions = append(next.Resolutions, value)
		}
		if len(next.Resolutions) == 0 {
			return nil, BadAuthRequest("每条路由规则至少要有一个分辨率")
		}
		if len(rule.Targets) == 0 || len(rule.Targets) > 4 {
			return nil, BadAuthRequest("每条路由规则需要 1 到 4 个执行模型")
		}
		used := map[string]bool{}
		for _, target := range rule.Targets {
			target = strings.TrimSpace(target)
			if target == item.ID {
				target = channelRouteSelf
			}
			if used[target] {
				return nil, BadAuthRequest("同一条路由规则里不能重复填写执行模型")
			}
			used[target] = true
			if target != channelRouteSelf {
				targetModel, err := s.repo.ChannelModel(target)
				if err != nil {
					return nil, BadAuthRequest("路由执行模型不存在：" + target)
				}
				if normalizeCapability(targetModel.Capability) != "video" {
					return nil, BadAuthRequest("路由执行模型必须是视频模型：" + target)
				}
				if len(targetModel.RouteRules) > 0 {
					return nil, BadAuthRequest("路由执行模型自己不能再设置路由：" + target)
				}
			}
			next.Targets = append(next.Targets, target)
		}
		normalized = append(normalized, next)
	}
	return normalized, nil
}

// channelRouteTargets 返回某个分辨率的执行顺序（第一个是主用），用渠道模型 ID 表示；没有规则时为空。
func channelRouteTargets(item *model.ChannelModel, resolution string) []string {
	resolution = normalizeRouteResolution(resolution)
	if item == nil || resolution == "" {
		return nil
	}
	for _, rule := range item.RouteRules {
		for _, value := range rule.Resolutions {
			if normalizeRouteResolution(value) != resolution {
				continue
			}
			targets := make([]string, 0, len(rule.Targets))
			for _, target := range rule.Targets {
				if target == channelRouteSelf {
					target = item.ID
				}
				targets = append(targets, target)
			}
			return targets
		}
	}
	return nil
}

func channelRouteState(config map[string]any) ([]string, int) {
	raw, _ := config["routeTargets"].([]any)
	targets := make([]string, 0, len(raw))
	for _, value := range raw {
		if id := strings.TrimSpace(fmt.Sprint(value)); id != "" {
			targets = append(targets, id)
		}
	}
	index, _ := strconv.Atoi(strings.TrimSpace(fmt.Sprint(config["routeIndex"])))
	if index < 0 {
		index = 0
	}
	return targets, index
}

// applyChannelRouteExecution 在执行前把任务换成当前线路的渠道模型；计费字段不受影响。
func (s *Service) applyChannelRouteExecution(rawInput string) (string, error) {
	if !strings.Contains(rawInput, "routeTargets") {
		return rawInput, nil
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(rawInput), &input); err != nil {
		return rawInput, nil
	}
	config, _ := input["config"].(map[string]any)
	if config == nil {
		return rawInput, nil
	}
	targets, index := channelRouteState(config)
	if len(targets) == 0 || index >= len(targets) {
		return rawInput, nil
	}
	target, err := s.repo.ChannelModel(targets[index])
	if err != nil {
		return "", fmt.Errorf("路由执行模型不存在：%w", err)
	}
	if !target.Enabled {
		return "", errors.New("路由执行模型已停用")
	}
	if target.ChannelID == strings.TrimSpace(fmt.Sprint(config["channelId"])) && target.ModelKey == strings.TrimSpace(fmt.Sprint(config["model"])) {
		return rawInput, nil
	}
	channel, err := s.repo.SystemChannel(target.ChannelID)
	if err != nil || !channel.Enabled {
		return "", errors.New("路由执行渠道不可用")
	}
	// 售价档属于用户选的模型；执行端按目标模型自身的上游 ID 调用。
	delete(config, "priceTierId")
	config["channelId"] = target.ChannelID
	config["model"] = target.ModelKey
	config["channelModelKey"] = target.ModelKey
	config["providerModelKey"] = firstNonEmpty(target.ProviderModelKey, target.ModelKey)
	config["interfaceType"] = string(target.Protocol)
	config["apiFormat"] = channelAPIFormatForProtocol(channel.APIFormat, target.Protocol)
	encoded, err := json.Marshal(input)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// channelRouteCost 计算某个执行模型在本次请求规格下的成本快照。
func (s *Service) channelRouteCost(input map[string]any, taskType, operation, targetID string) (*model.BillingOrder, *model.ChannelModel, bool) {
	target, err := s.repo.ChannelModel(targetID)
	if err != nil {
		return nil, nil, false
	}
	capabilityConfig, err := normalizedChannelModelCapability(target, s.protocolRegistry())
	if err != nil || capabilityConfig == nil {
		return nil, target, false
	}
	spec, err := CapabilitySpecFromModelCapabilityConfig(capabilityConfig, target.Capability)
	if err != nil {
		return nil, target, false
	}
	intent := ModelRequestIntentFromTaskInput(input, taskType, operation)
	tier := channelModelPriceTierForIntent(*target, intent, spec)
	if tier == nil {
		return nil, target, false
	}
	config, _ := input["config"].(map[string]any)
	var order model.BillingOrder
	snapshotCreditCost(&order, tier, requestedBillingQuantity(target.Capability, config), estimateTaskBillingTokens(input, target.Capability))
	return &order, target, true
}

// applyChannelRouteCreationCost 让新订单的成本快照和渠道记录对应主用执行模型。
func (s *Service) applyChannelRouteCreationCost(order *model.BillingOrder, input map[string]any, taskType, operation string) {
	if order == nil {
		return
	}
	config, _ := input["config"].(map[string]any)
	targets, index := channelRouteState(config)
	if len(targets) == 0 || index >= len(targets) {
		return
	}
	cost, target, ok := s.channelRouteCost(input, taskType, operation, targets[index])
	if !ok || target.ID == order.ChannelModelID {
		return
	}
	order.ChannelID, order.ChannelModelID = target.ChannelID, target.ID
	order.CostPricing = cost.CostPricing
	order.CostBillingMode = cost.CostBillingMode
	order.CostQuantity = cost.CostQuantity
	order.CostVideoFormulaTokens = cost.CostVideoFormulaTokens
}

// channelRouteFailureIsFinal 判断失败是否换供应商也没用：内容审核、真人素材、用户取消等。
func channelRouteFailureIsFinal(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) || isContentModerationFailure(err.Error()) {
		return true
	}
	message := strings.ToLower(err.Error())
	for _, marker := range []string{
		"sensitive", "real person", "may contain", "inappropriate", "policy", "copyright", "moderation", "safety",
		"敏感", "违规", "审核", "版权", "真人", "人脸", "不合规", "取消",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func resetChannelRouteConfig(input map[string]any) bool {
	config, _ := input["config"].(map[string]any)
	if config == nil || config["routeTargets"] == nil {
		return false
	}
	config["routeIndex"] = "0"
	return true
}

func resetChannelRouteIndex(raw string) string {
	if !strings.Contains(raw, "routeTargets") {
		return raw
	}
	var input map[string]any
	if json.Unmarshal([]byte(raw), &input) != nil || !resetChannelRouteConfig(input) {
		return raw
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return raw
	}
	return string(encoded)
}

// tryChannelRouteFallback 在主用失败后切到下一条线路并重新排队；返回 true 表示已接管，不再走失败退款。
func (s *Service) tryChannelRouteFallback(task *model.Task, cause error) (bool, error) {
	if task == nil || channelRouteFailureIsFinal(cause) || !strings.Contains(task.InputJSON, "routeTargets") {
		return false, nil
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		return false, nil
	}
	config, _ := input["config"].(map[string]any)
	if config == nil {
		return false, nil
	}
	targets, index := channelRouteState(config)
	next := index + 1
	if len(targets) == 0 || next >= len(targets) {
		return false, nil
	}
	config["routeIndex"] = strconv.Itoa(next)
	encoded, err := json.Marshal(input)
	if err != nil {
		return false, nil
	}
	plainInput := input
	if decrypted, decryptErr := s.decryptTaskInputJSON(string(encoded)); decryptErr == nil {
		_ = json.Unmarshal([]byte(decrypted), &plainInput)
	}
	cost, target, ok := s.channelRouteCost(plainInput, task.Type, task.Operation, targets[next])
	if target == nil {
		return false, nil
	}
	var snapshot *model.BillingCostSnapshot
	if ok {
		snapshot = &cost.BillingCostSnapshot
	}
	if err := s.repo.SwitchTaskChannelRoute(task.ID, task.LeaseOwner, string(encoded), task.BillingOrderID, target.ChannelID, target.ID, snapshot); err != nil {
		return true, err
	}
	reason := strings.TrimSpace(cause.Error())
	if len([]rune(reason)) > 300 {
		reason = string([]rune(reason)[:300])
	}
	// 切换只记在管理员可见的接口日志里，顾客的任务日志不出现失败字样。
	_ = s.LogAPICall(model.ApiCallLog{
		UserID: task.UserID, TaskID: task.ID, BillingOrderID: task.BillingOrderID, ChannelID: target.ChannelID,
		Source: "backend-task", Capability: "video", Model: task.Model, RequestKind: "route_switch", Method: "INTERNAL",
		Path: "task/route-switch", Status: model.ApiCallStatusFailed, ErrorCode: "route_switched",
		Error: "主线路失败，已切到备用线路 " + target.ID + "（不重复扣费）：" + reason,
	})
	return true, nil
}
