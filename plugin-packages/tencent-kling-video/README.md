# 腾讯云 Kling 视频

调用腾讯云 TokenHub Kling 视频接口的视频协议插件：按模型提交到 `text-to-video`、`image-to-video` 或 `omni-video`（见 docs/interface.md），再轮询 `GET /v1/wand/kling/tasks/{id}`。

- 渠道 Base URL 填 `https://tokenhub-intl.tencentcloudmaas.com`，API Key 填 TokenHub 控制台创建的 Key；并在控制台「在线推理 - 视觉模型」里为该模型开通后付费。
- 渠道模型的「上游模型 ID」填 `kling-video-v4`、`kling-video-v4-flash`、`kling-video-v3`、`kling-video-v3-turbo` 或 `kling-video-v3-omni`。
- v4 / v4 Flash：文生视频、首尾帧（只有尾帧不行）和全能参考（最多 10 张图、5 段参考视频、3 个音色，素材合计不超过 15 个），3–30 秒。
- v3：文生视频、首尾帧，可生成原生音频，720p / 1080p / 4k，3–15 秒；v3 Turbo：文生视频、首帧，720p / 1080p，无音频。
- v3 Omni：文生视频、首尾帧和全能参考（最多 7 张图、1 段参考视频、2 个音色），可生成原生音频，720p / 1080p / 4k，3–15 秒。
- 参考音频由宿主先调用 `POST /v1/wand/kling/custom-voices` 登记为自定义音色，等就绪后以 `kling-voice://<voice_id>` 交给插件，插件转成 `{"type":"voice","voice_id":...,"id":"1"}`；提示词用 `@1` 指定说话音色，没写时宿主自动补上。同一音频在同一渠道只登记一次。
- 不支持视频编辑（base_video）。`settings.audio` 只发给 v3 / v3 Omni。
- 素材必须是公网网址；参考视频只接受网址。
- 提交不是幂等的：每次提交都会新建任务并计费。
- 生成结果网址是临时的，宿主会在任务完成后转存。

完整接口见 [docs/interface.md](docs/interface.md)。
