# 腾讯云 WAND 视频

调用腾讯云 TokenHub WAND-Vega-Video 接口（`POST https://tokenhub-intl.tencentcloudmaas.com/v1/wand/vega-videos/tasks`）的视频协议插件，异步提交并轮询 `GET /v1/wand/vega-videos/tasks/{id}`。

- 渠道 Base URL 填 `https://tokenhub-intl.tencentcloudmaas.com`，API Key 填 TokenHub 控制台创建的 Key；并在控制台「视觉模型」里为该模型开通后付费。
- 渠道模型的「上游模型 ID」填 WAND 型号，例如 `wand-vega-video-1.5-pro`、`wand-vega-video-1.0-lite`。
- 支持文生视频、首尾帧（首帧、尾帧各 1 张）和全能参考（建议最多 9 图 / 3 视频 / 3 音频，共 12 个）。
- 只接受素材公网网址，不接受 Base64。服务器使用本地存储时，需在「存储服务」中配置服务器访问地址。
- 提交不是幂等的：每次提交都会新建任务并计费。
- 生成结果网址 12 小时内有效，宿主会在任务完成后转存。

完整接口见 [docs/interface.md](docs/interface.md)。
