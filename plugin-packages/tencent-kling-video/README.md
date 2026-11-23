# 腾讯云 Kling 视频

调用腾讯云 TokenHub Kling 视频接口的视频协议插件：纯文本提交到 `POST /v1/wand/kling/text-to-video`，带图片、参考视频或音色时提交到 `POST /v1/wand/kling/omni-video`，再轮询 `GET /v1/wand/kling/tasks/{id}`。

- 渠道 Base URL 填 `https://tokenhub-intl.tencentcloudmaas.com`，API Key 填 TokenHub 控制台创建的 Key；并在控制台「在线推理 - 视觉模型」里为该模型开通后付费。
- 渠道模型的「上游模型 ID」填 `kling-video-v4` 或 `kling-video-v4-flash`。
- 支持文生视频、首尾帧（只有尾帧不行）和全能参考（最多 10 张图、5 段参考视频、3 个音色，素材合计不超过 15 个）。
- 参考音频由宿主先调用 `POST /v1/wand/kling/custom-voices` 登记为自定义音色，等就绪后以 `kling-voice://<voice_id>` 交给插件，插件转成 `{"type":"voice","voice_id":...,"id":"1"}`；提示词用 `@1` 指定说话音色，没写时宿主自动补上。同一音频在同一渠道只登记一次。
- 不支持视频编辑（base_video）和 `settings.audio`。
- 素材必须是公网网址；参考视频只接受网址。
- 提交不是幂等的：每次提交都会新建任务并计费。
- 生成结果网址是临时的，宿主会在任务完成后转存。

完整接口见 [docs/interface.md](docs/interface.md)。
