# Boyesir 视频

调用 Boyesir AI 视频接口（`POST https://boyesir.com/v1/videos/generations`）的视频协议插件，异步提交并轮询 `GET /v1/tasks/{task_id}`。

- 渠道 Base URL 填 `https://boyesir.com`（老地址 `http://8.134.130.120` 也可用），API Key 填控制台令牌（`sk-` 开头）。
- 渠道模型的「上游模型 ID」填 Boyesir 模型表里的型号，例如 `bh-sd2-5-720p`。很多型号已固定分辨率或时长，请按型号说明配置可选项。
- Boyesir 只接受素材公网网址，不接受 Base64。服务器使用本地存储时，需在「存储服务」中配置服务器访问地址。
- 生成结果保留 24 小时，宿主会在任务完成后转存。
- 实时售价可查询 `GET https://boyesir.com/api/model-pricing`（无需鉴权，人民币）。

完整接口见 [docs/interface.md](docs/interface.md)。
