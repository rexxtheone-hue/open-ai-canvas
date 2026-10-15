# RunningHub 标准模型 API

调用 RunningHub 标准模型 API（`https://www.runninghub.cn/openapi/v2/...`）的视频协议插件，异步提交任务并轮询 `/openapi/v2/query` 获取结果。

- 需要 RunningHub **企业级-共享** API Key，消费级 Key 不能调用标准模型 API。
- 渠道模型的「上游模型 ID」填写接口路径中 `/openapi/v2/` 之后的部分，例如 `rhart-video/minimax-h3-rh-enhanced/ref2va`。
- 插件包含两个协议：
  - 「RunningHub 标准模型 API」：MiniMax H3 RH Enhanced，参考素材以 Base64 Data URI 发送，服务器无需公开访问地址。
  - 「RunningHub 万相 3.0 参考生视频」：上游模型 ID 填 `alibaba/wan-3.0/reference-to-video` 或 `alibaba/wan-3.0-prime/reference-to-video`，参考素材以网址发送，需在「存储服务」配置公网访问地址。
- RunningHub 的结果链接只保留 24 小时，宿主会在任务完成后转存。

完整接口见 [docs/interface.md](docs/interface.md)。
