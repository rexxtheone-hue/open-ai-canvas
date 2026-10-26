# 88API 生图

调用 88API 生图接口的图片协议插件，含两个协议，都同步返回结果。

- 渠道 Base URL 填 `https://api.88api.ai`，API Key 填 88API 令牌（`sk-` 开头）。
- `api88-midjourney`：Midjourney V8.2（`midjourney-v8.2`、`-fast`、`-turbo`），令牌分组需开通 Midjourney；每次请求固定返回 4 张图，按请求次数计费；画幅自动追加为提示词末尾的 `--ar`，其他 Midjourney 参数直接写在提示词里。
- `api88-grok-image`：Grok Imagine（`grok-imagine-image-2.0` 等），令牌分组需开通「生图模型」；文生图走 `/v1/images/generations`，带 1–3 张参考图时走 `/v1/images/edits`；画幅发 `aspect_ratio`，分辨率 1k / 2k；每次固定 1 张，按张计费。

完整接口见 [docs/interface.md](docs/interface.md)。
