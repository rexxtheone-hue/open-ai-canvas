# 88API Midjourney

调用 88API 的 Midjourney V8.2 文生图接口（`POST https://api.88api.ai/v1/images/generations`）的图片协议插件，同步返回结果。

- 渠道 Base URL 填 `https://api.88api.ai`，API Key 填 88API 令牌（`sk-` 开头），令牌分组需要开通 Midjourney。
- 上游模型 ID：`midjourney-v8.2`、`midjourney-v8.2-fast`、`midjourney-v8.2-turbo`，只是速度档位不同。
- 每次请求固定返回 4 张图，按请求次数计费。
- 画幅由界面选择后自动追加为提示词末尾的 `--ar`；其他 Midjourney 参数（`--s`、`--c`、`--seed`、`--no` 等）直接写在提示词里。

完整接口见 [docs/interface.md](docs/interface.md)。
