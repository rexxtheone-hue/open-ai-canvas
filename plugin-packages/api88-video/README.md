# 88API 统一视频

调用 88API 统一视频接口（`POST https://api.88api.ai/v1/videos`）的视频协议插件，异步提交并轮询 `GET /v1/videos/{id}`。

- 渠道 Base URL 填 `https://api.88api.ai`，API Key 填 88API 令牌（`sk-` 开头）。
- 渠道模型的「上游模型 ID」必须与 `GET /v1/models` 返回的 id 完全一致，例如 `SD2.5`、`SD2.0`。
- 88API 只接受素材网址，不接受 Base64。服务器使用本地存储时，需在「存储服务」中配置公网访问地址，让 88API 能下载参考素材。
- 88API 结果链接为临时地址，宿主会在任务完成后转存。

完整接口见 [docs/interface.md](docs/interface.md)。
