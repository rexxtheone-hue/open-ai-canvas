package handler

import (
	"context"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"yingce/backend/internal/service"
)

// MCP Apps 结果卡片：ChatGPT（以及支持 MCP Apps 的客户端）用它在对话里直接显示生成的图片和视频，
// 不再由模型自己找图。改动 HTML 时换一个新的 URI，客户端按 URI 缓存。
const (
	mcpWidgetURI  = "ui://omnimuse/result-v1.html"
	mcpWidgetMIME = "text/html;profile=mcp-app"
)

type mcpBaseKey struct{}

func mcpWidgetToolMeta(invoking, invoked string) mcp.Meta {
	return mcp.Meta{
		"ui":                             map[string]any{"resourceUri": mcpWidgetURI},
		"openai/outputTemplate":          mcpWidgetURI,
		"openai/toolInvocation/invoking": invoking,
		"openai/toolInvocation/invoked":  invoked,
	}
}

// mcpWidgetData 是卡片读取的结构化结果：只放展示需要的字段。
func mcpWidgetData(generations ...*service.OpenAPIGeneration) map[string]any {
	items := make([]map[string]any, 0, len(generations))
	for _, g := range generations {
		if g == nil {
			continue
		}
		outputs := make([]map[string]any, 0, len(g.Outputs))
		for _, output := range g.Outputs {
			outputs = append(outputs, map[string]any{"type": output.Type, "url": output.URL, "previewUrl": output.PreviewURL, "width": output.Width, "height": output.Height, "durationMs": output.DurationMs})
		}
		items = append(items, map[string]any{"id": g.ID, "kind": g.Kind, "status": g.Status, "progress": g.Progress, "model": g.Model, "prompt": g.Prompt, "credits": g.Credits, "error": g.Error, "outputs": outputs, "webUrl": g.WebURL})
	}
	return map[string]any{"generations": items}
}

func registerMCPWidget(server *mcp.Server) {
	server.AddResource(&mcp.Resource{URI: mcpWidgetURI, Name: "omnimuse-result", Title: "OmniMuse result", MIMEType: mcpWidgetMIME},
		func(ctx context.Context, _ *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
			domains := []string{"https://*.r2.cloudflarestorage.com"}
			if base, _ := ctx.Value(mcpBaseKey{}).(string); strings.HasPrefix(base, "https://") {
				domains = append([]string{base}, domains...)
			}
			meta := mcp.Meta{"ui": map[string]any{"prefersBorder": true, "csp": map[string]any{"connectDomains": []string{}, "resourceDomains": domains}}}
			return &mcp.ReadResourceResult{Contents: []*mcp.ResourceContents{{URI: mcpWidgetURI, MIMEType: mcpWidgetMIME, Text: mcpWidgetHTML, Meta: meta}}}, nil
		})
}

const mcpWidgetHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --fg: #16181b; --muted: #6b7078; --line: rgba(0,0,0,.1); --chip: rgba(0,0,0,.05); --bg: transparent; --accent: #b23fe0; }
  @media (prefers-color-scheme: dark) { :root { --fg: #f2f3f5; --muted: #9aa0a8; --line: rgba(255,255,255,.12); --chip: rgba(255,255,255,.07); --accent: #d98cff; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; background: var(--bg); color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .gen + .gen { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 10px; }
  .brand { font-weight: 650; letter-spacing: -.01em; }
  .chip { padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--muted); font-size: 12px; }
  .chip.ok { color: #138a43; } .chip.bad { color: #c0392b; }
  .grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .grid.single { grid-template-columns: minmax(0, 1fr); max-width: 520px; }
  .media { position: relative; border-radius: 12px; overflow: hidden; background: var(--chip); }
  .media img, .media video { display: block; width: 100%; height: auto; max-height: 520px; object-fit: contain; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  a.btn { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); color: var(--fg); text-decoration: none; font-size: 13px; font-weight: 600; }
  a.btn:hover { background: var(--chip); }
  .note { color: var(--muted); font-size: 13px; }
  .bar { height: 6px; border-radius: 99px; background: var(--chip); overflow: hidden; margin: 8px 0 4px; max-width: 360px; }
  .bar span { display: block; height: 100%; background: var(--accent); }
</style>
</head>
<body>
<div id="root"><p class="note">Loading…</p></div>
<script>
(function () {
  var root = document.getElementById("root");
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function safeUrl(u) { return typeof u === "string" && /^https:\/\//i.test(u) ? u : ""; }
  function render(data) {
    var gens = data && Array.isArray(data.generations) ? data.generations : null;
    if (!gens) return;
    root.textContent = "";
    gens.forEach(function (g) {
      var box = el("section", "gen");
      var head = el("div", "head");
      head.appendChild(el("span", "brand", "OmniMuse"));
      var label = g.status === "succeeded" ? "Done" : g.status === "failed" ? "Failed" : g.status === "cancelled" ? "Cancelled" : "In progress";
      head.appendChild(el("span", "chip" + (g.status === "succeeded" ? " ok" : g.status === "failed" ? " bad" : ""), label));
      if (g.credits) head.appendChild(el("span", "chip", g.credits + " credits"));
      box.appendChild(head);
      var outs = Array.isArray(g.outputs) ? g.outputs : [];
      if (g.status === "succeeded" && outs.length) {
        var grid = el("div", "grid" + (outs.length === 1 ? " single" : ""));
        outs.forEach(function (o) {
          var url = safeUrl(o.url), preview = safeUrl(o.previewUrl) || url;
          if (!url) return;
          var media = el("div", "media");
          if (o.type === "video") {
            var v = el("video"); v.controls = true; v.playsInline = true; v.preload = "metadata"; v.src = url; media.appendChild(v);
          } else {
            var a = el("a"); a.href = url; a.target = "_blank"; a.rel = "noopener";
            var img = el("img"); img.src = preview; img.alt = g.prompt || "Generated image"; img.loading = "lazy"; a.appendChild(img); media.appendChild(a);
          }
          grid.appendChild(media);
        });
        box.appendChild(grid);
        var actions = el("div", "actions");
        outs.forEach(function (o, i) { var u = safeUrl(o.url); if (!u) return; var a = el("a", "btn", outs.length > 1 ? "Download " + (i + 1) : "Download original"); a.href = u; a.target = "_blank"; a.rel = "noopener"; actions.appendChild(a); });
        var web = safeUrl(g.webUrl); if (web) { var w = el("a", "btn", "Open in Studio"); w.href = web; w.target = "_blank"; w.rel = "noopener"; actions.appendChild(w); }
        box.appendChild(actions);
      } else if (g.status === "failed" || g.status === "cancelled") {
        box.appendChild(el("p", "note", (g.error || "The generation did not finish.") + " Credits are refunded automatically."));
      } else {
        var bar = el("div", "bar"); var fill = el("span"); fill.style.width = Math.max(4, Math.min(100, g.progress || 0)) + "%"; bar.appendChild(fill); box.appendChild(bar);
        box.appendChild(el("p", "note", "Still generating. Videos take a few minutes; ask to check the progress again."));
      }
      root.appendChild(box);
    });
    notifySize();
  }
  var nextId = 1;
  function post(msg) { try { window.parent.postMessage(msg, "*"); } catch (e) {} }
  function notifySize() { post({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } }); }
  function fromResult(r) { return r && (r.structuredContent || r); }
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id === 1 && (m.result || m.error)) { post({ jsonrpc: "2.0", method: "ui/notifications/initialized" }); return; }
    if (m.method === "ui/notifications/tool-result") render(fromResult(m.params));
  });
  post({ jsonrpc: "2.0", id: nextId++, method: "ui/initialize", params: { protocolVersion: "2026-01-26", appInfo: { name: "omnimuse-result", version: "1" }, appCapabilities: {} } });
  function tryOpenAI() { if (window.openai && window.openai.toolOutput) render(fromResult(window.openai.toolOutput)); }
  tryOpenAI();
  window.addEventListener("openai:set_globals", tryOpenAI);
  window.addEventListener("load", notifySize);
})();
</script>
</body>
</html>`
