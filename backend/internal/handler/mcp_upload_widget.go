package handler

// media_upload_widget：照 Higgsfield，在支持 MCP Apps 的客户端里显示上传面板。
// 用户在面板里选文件，面板经客户端调用 media_upload 拿上传网址、直接 PUT 到本站、再调用 media_confirm，
// 最后把确认好的 media_id 发回对话。改动 HTML 时换一个新的 URI，客户端按 URI 缓存。

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const mcpUploadWidgetURI = "ui://omnimuse/media-upload-v1.html"

func registerUploadWidget(server *mcp.Server) {
	server.AddResource(&mcp.Resource{URI: mcpUploadWidgetURI, Name: "omnimuse-media-upload", Title: "Upload media", MIMEType: mcpWidgetMIME},
		func(ctx context.Context, _ *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
			connect := []string{}
			if base := mcpBaseURL(ctx); strings.HasPrefix(base, "https://") {
				connect = append(connect, base)
			}
			meta := mcp.Meta{
				"ui":               map[string]any{"prefersBorder": true, "csp": map[string]any{"connectDomains": connect, "resourceDomains": []string{}}},
				"openai/widgetCSP": map[string]any{"connect_domains": connect, "resource_domains": []string{}},
			}
			return &mcp.ReadResourceResult{Contents: []*mcp.ResourceContents{{URI: mcpUploadWidgetURI, MIMEType: mcpWidgetMIME, Text: mcpUploadWidgetHTML, Meta: meta}}}, nil
		})

	server.AddTool(&mcp.Tool{Name: "media_upload_widget", Title: "Upload local media",
		Meta: mcp.Meta{
			"ui":                             map[string]any{"resourceUri": mcpUploadWidgetURI},
			"openai/outputTemplate":          mcpUploadWidgetURI,
			"openai/widgetAccessible":        true,
			"openai/toolInvocation/invoking": "Opening upload…",
			"openai/toolInvocation/invoked":  "Upload ready",
		},
		Annotations: &mcp.ToolAnnotations{OpenWorldHint: ptrBool(true)},
		Description: "Fallback local-media intake for OmniMuse in Apps UI-capable clients. When the user refers to an attached/local photo, image, video, or audio with no confirmed media_id, first upload it yourself if your code environment can read the file (e.g. /mnt/user-data/uploads): media_upload, curl PUT, media_confirm. Call this widget as the only tool in the turn only when the file is unreadable there or the PUT fails. Do not ask the user to attach the file in Claude chat; remote MCP tools cannot read chat attachments. This widget is the upload surface: the user re-selects one or more files in the browser, the browser uploads them directly to OmniMuse storage, the widget confirms them, then sends the confirmed media_id/media_ids back to the chat for the next generation or analysis tool call. Use type auto with multiple enabled when one request needs mixed media, such as reference images plus a driving video. The widget accepts media only.",
		InputSchema: rawSchema(`{"type":"object","properties":{"type":{"type":"string","enum":["auto","image","video","audio"],"description":"Expected media type. Use auto when the user has not specified image, video, or audio."},"label":{"type":"string","description":"Optional short label shown in the widget header."},"multiple":{"type":"boolean","description":"Allow selecting multiple files. Defaults to true for image/auto and false for video/audio."},"min_files":{"type":"integer","minimum":1,"maximum":20,"description":"Minimum confirmed uploads before Continue is enabled."},"max_files":{"type":"integer","minimum":1,"maximum":20,"description":"Maximum files accepted by the widget."}}}`)},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			var in struct {
				Type     string `json:"type"`
				Label    string `json:"label"`
				Multiple *bool  `json:"multiple"`
				MinFiles int    `json:"min_files"`
				MaxFiles int    `json:"max_files"`
			}
			_ = json.Unmarshal(req.Params.Arguments, &in)
			switch in.Type {
			case "image", "video", "audio":
			default:
				in.Type = "auto"
			}
			multiple := in.Type == "image" || in.Type == "auto"
			if in.Multiple != nil {
				multiple = *in.Multiple
			}
			if in.MaxFiles <= 0 || in.MaxFiles > 20 {
				in.MaxFiles = map[bool]int{true: 20, false: 1}[multiple]
			}
			if in.MinFiles <= 0 || in.MinFiles > in.MaxFiles {
				in.MinFiles = 1
			}
			studio := strings.TrimRight(mcpBaseURL(ctx), "/") + "/studio"
			out := map[string]any{
				"mode": "media_upload", "type": in.Type, "label": in.Label, "multiple": multiple, "min_files": in.MinFiles, "max_files": in.MaxFiles,
				"resource_uri": mcpUploadWidgetURI,
				"fallback":     map[string]any{"message": "If no upload panel is shown, ask the user to upload the files in OmniMuse Studio (" + studio + ") and tell you their file names, then find them with list_assets and use the returned asset ids as media values."},
			}
			return toolJSON(out, "The upload panel is shown to the user. Wait for the message with the confirmed media_ids; call no other tool in this turn."), nil
		})
}

func ptrBool(value bool) *bool { return &value }

const mcpUploadWidgetHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --fg: #16181b; --muted: #6b7078; --line: rgba(0,0,0,.12); --chip: rgba(0,0,0,.05); --accent: #b23fe0; --ok: #138a43; --bad: #c0392b; }
  @media (prefers-color-scheme: dark) { :root { --fg: #f2f3f5; --muted: #9aa0a8; --line: rgba(255,255,255,.14); --chip: rgba(255,255,255,.07); --accent: #d98cff; --ok: #4cc47f; --bad: #ff7b6b; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; background: transparent; color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .brand { font-weight: 650; }
  .label { color: var(--muted); }
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 120px; padding: 16px; border: 1.5px dashed var(--line); border-radius: 12px; text-align: center; cursor: pointer; }
  .drop.over { border-color: var(--accent); background: var(--chip); }
  .drop strong { font-weight: 600; }
  .hint { color: var(--muted); font-size: 12px; }
  ul { list-style: none; margin: 10px 0 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  li .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li .st { flex: none; color: var(--muted); }
  li .st.ok { color: var(--ok); } li .st.bad { color: var(--bad); }
  .actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
  button { height: 34px; padding: 0 16px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .45; cursor: default; }
  .note { color: var(--muted); font-size: 13px; }
  input[type=file] { display: none; }
</style>
</head>
<body>
<div class="head"><span class="brand">OmniMuse</span><span class="label" id="label">Upload media</span></div>
<label class="drop" id="drop"><strong id="pick">Choose files or drop them here</strong><span class="hint" id="accept">Images, videos or audio</span><input type="file" id="file"></label>
<ul id="list"></ul>
<div class="actions"><button id="go" disabled>Continue</button><span class="note" id="note"></span></div>
<script>
(function () {
  var opts = { type: "auto", multiple: true, min_files: 1, max_files: 20 };
  var items = [], sent = false, nextId = 1, pending = {};
  var $ = function (id) { return document.getElementById(id); };
  var input = $("file"), list = $("list"), go = $("go"), note = $("note"), drop = $("drop");
  var accept = { image: "image/*", video: "video/*", audio: "audio/*", auto: "image/*,video/*,audio/*" };
  var hints = { image: "Images", video: "A video", audio: "An audio file", auto: "Images, videos or audio" };
  function post(msg) { try { window.parent.postMessage(msg, "*"); } catch (e) {} }
  function notifySize() { post({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } }); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; post({ jsonrpc: "2.0", id: id, method: method, params: params }); });
  }
  function callTool(name, args) {
    if (window.openai && window.openai.callTool) return window.openai.callTool(name, args).then(function (r) { return r && (r.structuredContent || r); });
    return request("tools/call", { name: name, arguments: args }).then(function (r) {
      if (r && r.isError) throw new Error((r.content && r.content[0] && r.content[0].text) || "Upload failed");
      return r && r.structuredContent;
    });
  }
  function applyOptions(data) {
    if (!data || data.mode !== "media_upload") return;
    opts = data;
    if (data.label) $("label").textContent = data.label;
    input.accept = accept[data.type] || accept.auto;
    input.multiple = !!data.multiple;
    $("accept").textContent = (hints[data.type] || hints.auto) + (data.multiple ? " · up to " + data.max_files + " files" : " · one file");
    $("pick").textContent = data.multiple ? "Choose files or drop them here" : "Choose a file or drop it here";
    refresh();
  }
  function kindOf(file) {
    var t = file.type || "", ext = (file.name.split(".").pop() || "").toLowerCase();
    if (t.indexOf("image/") === 0 || /^(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/.test(ext)) return "image";
    if (t.indexOf("video/") === 0 || /^(mp4|mov|webm|m4v|mkv|avi)$/.test(ext)) return "video";
    if (t.indexOf("audio/") === 0 || /^(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(ext)) return "audio";
    return "";
  }
  function refresh() {
    list.textContent = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      var n = document.createElement("span"); n.className = "name"; n.textContent = it.file.name; li.appendChild(n);
      var st = document.createElement("span"); st.className = "st" + (it.state === "done" ? " ok" : it.state === "error" ? " bad" : "");
      st.textContent = it.state === "done" ? "Uploaded" : it.state === "error" ? (it.error || "Failed") : "Uploading…";
      li.appendChild(st); list.appendChild(li);
    });
    var done = items.filter(function (it) { return it.state === "done"; }).length;
    var busy = items.some(function (it) { return it.state === "uploading"; });
    go.disabled = sent || busy || done < (opts.min_files || 1);
    note.textContent = sent ? "Sent to the chat." : busy ? "Uploading…" : done ? done + " uploaded" : "";
    notifySize();
  }
  function upload(it) {
    var kind = kindOf(it.file);
    if (!kind || (opts.type !== "auto" && kind !== opts.type)) { it.state = "error"; it.error = "Not a supported " + (opts.type === "auto" ? "media" : opts.type) + " file"; refresh(); return; }
    callTool("media_upload", it.file.type ? { filename: it.file.name, content_type: it.file.type } : { filename: it.file.name }).then(function (ticket) {
      if (!ticket || !ticket.upload_url) throw new Error("No upload URL");
      it.ticket = ticket;
      return fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": ticket.content_type }, body: it.file });
    }).then(function (res) {
      if (!res.ok) throw new Error("Upload failed (" + res.status + ")");
      return callTool("media_confirm", { type: it.ticket.type, media_id: it.ticket.media_id });
    }).then(function (confirmed) {
      if (confirmed && confirmed.status && confirmed.status !== "confirmed") throw new Error(confirmed.error || "Not confirmed");
      it.state = "done"; refresh();
    }).catch(function (err) { it.state = "error"; it.error = err && err.message ? err.message : "Failed"; refresh(); });
  }
  function add(files) {
    if (sent) return;
    var room = (opts.max_files || 20) - items.filter(function (it) { return it.state !== "error"; }).length;
    if (!opts.multiple) { items = []; room = 1; }
    Array.prototype.slice.call(files, 0, Math.max(0, room)).forEach(function (file) { var it = { file: file, state: "uploading" }; items.push(it); upload(it); });
    refresh();
  }
  input.addEventListener("change", function () { add(input.files); input.value = ""; });
  drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
  drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); add(e.dataTransfer.files); });
  go.addEventListener("click", function () {
    var done = items.filter(function (it) { return it.state === "done"; });
    var lines = done.map(function (it) { return "- " + it.file.name + " (" + it.ticket.type + "): media_id " + it.ticket.media_id; });
    var text = "I uploaded " + done.length + " file" + (done.length > 1 ? "s" : "") + " with the OmniMuse upload panel. Confirmed media_ids:\n" + lines.join("\n") + "\nContinue with these.";
    sent = true; refresh();
    if (window.openai && window.openai.sendFollowUpMessage) { window.openai.sendFollowUpMessage({ prompt: text }); return; }
    request("ui/message", { role: "user", content: [{ type: "text", text: text }] }).catch(function () { sent = false; note.textContent = "Could not send. Tell the chat these media_ids: " + done.map(function (it) { return it.ticket.media_id; }).join(", "); });
  });
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; if (m.error) p.reject(new Error(m.error.message || "Request failed")); else p.resolve(m.result); return; }
    if (m.method === "ui/notifications/tool-result") applyOptions(m.params && (m.params.structuredContent || m.params));
  });
  request("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "omnimuse-media-upload", version: "1" }, appCapabilities: {} }).then(function () { post({ jsonrpc: "2.0", method: "ui/notifications/initialized" }); }).catch(function () {});
  function tryOpenAI() { if (window.openai && window.openai.toolOutput) applyOptions(window.openai.toolOutput); }
  tryOpenAI();
  window.addEventListener("openai:set_globals", tryOpenAI);
  window.addEventListener("load", notifySize);
  refresh();
})();
</script>
</body>
</html>`
