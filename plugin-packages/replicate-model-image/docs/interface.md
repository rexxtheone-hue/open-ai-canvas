# Replicate 官方模型（图片）接口字段

## 协议身份

- 插件 ID：`replicate-model-image`。
- 能力：`image`。
- 默认 Base URL：`https://api.replicate.com`。
- 鉴权驱动：`bearer`（`Authorization: Bearer <API Token>`）。
- 创建：`POST /v1/models/{model}/predictions`，请求体 `{"input": {...}}`。
- 查询：`GET /v1/predictions/{taskId}`。
- 两个请求都使用 `originPath`，路径从域名根开始拼接。

## 已适配模型

| 上游模型 ID | 说明 |
| --- | --- |
| `openai/gpt-image-2.5-sunburst` | OpenAI GPT Image 2.5 Sunburst：文生图与多图编辑 |

其他输入字段相同（`prompt`、`aspect_ratio`、`input_images`、`number_of_images`、`quality`）的 Replicate 官方模型也可直接使用，例如 OpenAI 系列图片模型。

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `input.prompt` | 提示词或编辑指令 |
| `aspectRatio` | `input.aspect_ratio` | auto、1:1、3:2、2:3、4:3、3:4、16:9、9:16，或 1024x1024 这类尺寸，默认 auto |
| `images` | `input.input_images` | 参考图或待编辑图片 |
| `imageCount` | `input.number_of_images` | 1–10，默认 1 |
| `quality` | `input.quality` | auto、low、medium、high、xhigh、max |

## Provider 扩展键

- `providerOptions.replicate-model-image.background`：auto、transparent、opaque。
- `providerOptions.replicate-model-image.output_format`：png（默认）、jpeg、webp。
- `providerOptions.replicate-model-image.output_compression`：0–100。
- `providerOptions.replicate-model-image.moderation`：auto、low。
- `providerOptions.replicate-model-image.openai_api_key`：自带 OpenAI Key 时直接向 OpenAI 付费。
- `providerOptions.replicate-model-image.user_id`：终端用户标识。

## 结果解析

- 状态：`starting` 视为排队，`processing`、`succeeded`、`failed`、`canceled` 直接映射。
- 图片：`output` 中的 URL 数组。链接约 1 小时后失效，标记为临时结果由宿主转存。
- 错误：`error` 字段；HTTP 4xx 时读取 `detail`、`title`。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "replicate-model-image",
  "name": "Replicate 官方模型（图片）",
  "version": "1.0.1",
  "author": "Rexx",
  "description": "Replicate 官方模型图片协议插件（异步任务），按 owner/name 调用，首个适配 OpenAI GPT Image 2.5 Sunburst。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Token",
        "required": true,
        "description": "Replicate API Token（r8_ 开头）。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "replicate-model-image",
        "label": "Replicate 官方模型（图片）",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.replicate.com",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": false,
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$coalesce": [
                          {
                            "$ref": "request.images"
                          },
                          []
                        ]
                      },
                      "as": "media",
                      "where": {
                        "$eq": [
                          {
                            "$ref": "media.role"
                          },
                          "mask"
                        ]
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "该模型不支持蒙版局部重绘，请直接用文字描述要修改的地方，或改用支持蒙版的模型。"
          }
        ],
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅 / 尺寸",
            "type": "string",
            "binding": "aspectRatio",
            "values": [
              "auto",
              "1:1",
              "3:2",
              "2:3",
              "4:3",
              "3:4",
              "16:9",
              "9:16"
            ],
            "default": "auto"
          },
          {
            "name": "quality",
            "label": "图片质量",
            "type": "string",
            "binding": "quality",
            "values": [
              "auto",
              "low",
              "medium",
              "high",
              "xhigh",
              "max"
            ],
            "default": "auto",
            "pricing": true
          },
          {
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 1
          },
          {
            "name": "background",
            "label": "背景",
            "type": "string",
            "binding": "providerOptions.replicate-model-image.background",
            "values": [
              "auto",
              "transparent",
              "opaque"
            ],
            "default": "auto",
            "enabled": false
          },
          {
            "name": "outputFormat",
            "label": "输出格式",
            "type": "string",
            "binding": "providerOptions.replicate-model-image.output_format",
            "values": [
              "png",
              "jpeg",
              "webp"
            ],
            "default": "png",
            "enabled": false
          },
          {
            "name": "moderation",
            "label": "内容审核",
            "type": "string",
            "binding": "providerOptions.replicate-model-image.moderation",
            "values": [
              "auto",
              "low"
            ],
            "default": "auto",
            "enabled": false
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model path",
            "description": "Replicate 官方模型 ID（owner/name），例如 openai/gpt-image-2.5-sunburst。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input.prompt",
            "description": "图片提示词或编辑指令。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "input.input_images",
            "description": "参考图或待编辑图片，可传多张。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "input.number_of_images",
            "description": "生成数量，1 到 10。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "input.aspect_ratio",
            "description": "比例：auto、1:1、3:2、2:3、4:3、3:4、16:9、9:16，或 1024x1024 这类尺寸。"
          },
          {
            "name": "quality",
            "type": "string",
            "required": false,
            "mapping": "input.quality",
            "description": "质量：auto、low、medium、high、xhigh、max。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "扩展字段：background、output_format、output_compression、moderation、openai_api_key、user_id。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/models/{{model}}/predictions",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "input": {
              "prompt": {
                "$ref": "request.prompt"
              },
              "aspect_ratio": {
                "$coalesce": [
                  {
                    "$ref": "request.aspectRatio"
                  },
                  {
                    "$ref": "request.providerOptions.replicate-model-image.aspect_ratio"
                  },
                  "auto"
                ]
              },
              "input_images": {
                "$omitEmpty": {
                  "$map": {
                    "from": {
                      "$ref": "request.images"
                    },
                    "as": "media",
                    "in": {
                      "$coalesce": [
                        {
                          "$ref": "media.dataUrl"
                        },
                        {
                          "$ref": "media.url"
                        }
                      ]
                    }
                  }
                }
              },
              "number_of_images": {
                "$toInt": {
                  "$if": {
                    "condition": {
                      "$gt": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.imageCount"
                            },
                            0
                          ]
                        },
                        0
                      ]
                    },
                    "then": {
                      "$ref": "request.imageCount"
                    },
                    "else": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.replicate-model-image.number_of_images"
                        },
                        1
                      ]
                    }
                  }
                }
              },
              "quality": {
                "$omitEmpty": {
                  "$lower": {
                    "$coalesce": [
                      {
                        "$ref": "request.quality"
                      },
                      {
                        "$ref": "request.providerOptions.replicate-model-image.quality"
                      }
                    ]
                  }
                }
              },
              "background": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.replicate-model-image.background"
                }
              },
              "output_format": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.replicate-model-image.output_format"
                  },
                  "png"
                ]
              },
              "output_compression": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.replicate-model-image.output_compression"
                }
              },
              "moderation": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.replicate-model-image.moderation"
                }
              },
              "openai_api_key": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.replicate-model-image.openai_api_key"
                }
              },
              "user_id": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.replicate-model-image.user_id"
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/predictions/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$eq": [
                  {
                    "$ref": "response.status"
                  },
                  "starting"
                ]
              },
              "then": "queued",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.status"
                  },
                  "queued"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error"
              },
              {
                "$ref": "response.detail"
              },
              {
                "$ref": "response.title"
              }
            ]
          },
          "images": {
            "$ref": "response.output"
          },
          "usage": {
            "$ref": "response.metrics"
          },
          "errorPaths": [
            "error"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "error",
            "detail",
            "title"
          ]
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
