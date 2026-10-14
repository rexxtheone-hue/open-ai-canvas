# Replicate 官方模型（图片）

调用 Replicate 官方模型（`POST /v1/models/{owner}/{name}/predictions`）的图片协议插件，异步提交并轮询 `GET /v1/predictions/{id}`。

- 渠道 Base URL 填 `https://api.replicate.com`，API Key 填 Replicate API Token（`r8_` 开头）。
- 渠道模型的「上游模型 ID」填 `owner/name`，例如 `openai/gpt-image-2.5-sunburst`。
- 参考图以 Base64 Data URI 发送，服务器无需公开访问地址；单张参考图建议不超过 5 MB。
- Replicate 结果链接约 1 小时后失效，宿主会在任务完成后转存。

完整接口见 [docs/interface.md](docs/interface.md)。
