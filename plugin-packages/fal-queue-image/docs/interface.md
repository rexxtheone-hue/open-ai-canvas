# fal.ai Queue Image 接口说明

## 渠道配置

- Base URL：`https://queue.fal.run`
- API Key：fal 控制台生成的 Key。插件以 `Authorization: Key <API Key>` 发送。
- 模型名：填写完整的 fal 模型 ID，例如 `fal-ai/nano-banana/edit`。

## 提交任务

`POST /{model}`，请求体直接是模型输入（不包 `input`）：

- `prompt`
- `image_url`
- `image_urls`
- `aspect_ratio`
- `resolution`
- `num_images`
- `seed`

空值字段不会发送。`providerOptions.fal-queue-image.input` 中的字段会合并进请求体，并覆盖同名默认字段，用于模型特有参数。参考素材需要公网 URL，宿主会先把素材转存为公网链接。

响应示例：

```json
{"request_id": "764cabcf-...", "status": "IN_QUEUE", "status_url": "...", "response_url": "..."}
```

## 查询状态

`GET /{owner}/{app}/requests/{request_id}/status`。`owner/app` 取模型 ID 的前两段，例如 `fal-ai/flux/dev` 的状态地址在 `fal-ai/flux` 下。

状态 `IN_QUEUE`、`IN_PROGRESS`、`COMPLETED` 分别对应排队、处理中、完成。响应带 `error` 字段时任务视为失败。

## 获取结果

状态为 `COMPLETED` 后请求 `GET /{owner}/{app}/requests/{request_id}`，返回 JSON，图片从 `images` 字段读取：

```json
{"images": [{"url": "https://v3.fal.media/files/...png", "content_type": "image/png"}]}
```

结果链接是临时链接，宿主会转存。

## 取消

`PUT /{owner}/{app}/requests/{request_id}/cancel`。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "fal-queue-image",
  "name": "fal.ai Queue Image",
  "version": "3.0.0",
  "author": "fal.ai / 影策",
  "description": "fal.ai 队列接口（queue.fal.run）的图片生成协议插件：提交、查询状态、获取结果、取消。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "fal-queue-image",
        "label": "fal.ai Queue Image",
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
        "baseUrl": "https://queue.fal.run",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey",
          "prefix": "Key "
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "fal 模型 ID，例如 fal-ai/nano-banana/edit、fal-ai/kling-video/v2.1/pro/image-to-video。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词，映射到 prompt。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "images",
            "description": "参考图：第一张映射 image_url，全部映射 image_urls。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "imageCount",
            "description": "生成张数，映射 num_images。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspectRatio",
            "description": "画面比例，映射 aspect_ratio。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率，映射 resolution。"
          },
          {
            "name": "quality",
            "type": "string",
            "required": false,
            "mapping": "quality",
            "description": "质量档位。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "providerOptions",
            "description": "providerOptions.fal-queue-image.input 中的字段会原样合并进请求体，可覆盖默认字段；seed 映射 seed。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/{{model}}",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "prompt": {
                  "$ref": "request.prompt"
                },
                "image_url": {
                  "$omitEmpty": {
                    "$first": {
                      "$map": {
                        "from": {
                          "$sortByOrder": {
                            "$ref": "request.images"
                          }
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  }
                },
                "image_urls": {
                  "$omitEmpty": {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "in": {
                        "$ref": "media.value"
                      }
                    }
                  }
                },
                "aspect_ratio": {
                  "$omitEmpty": {
                    "$ref": "request.aspectRatio"
                  }
                },
                "resolution": {
                  "$omitEmpty": {
                    "$ref": "request.resolution"
                  }
                },
                "num_images": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$ref": "request.imageCount"
                          },
                          0
                        ]
                      },
                      "then": {
                        "$ref": "request.imageCount"
                      },
                      "else": null
                    }
                  }
                },
                "seed": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.fal-queue-image.seed"
                  }
                }
              },
              {
                "$ref": "request.providerOptions.fal-queue-image.input"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              {
                "$concat": [
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      0
                    ]
                  },
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      1
                    ]
                  },
                  "/requests/{{taskId}}"
                ]
              },
              "/status"
            ]
          }
        },
        "result": {
          "method": "GET",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              "/",
              {
                "$at": [
                  {
                    "$split": [
                      {
                        "$ref": "request.model"
                      },
                      "/"
                    ]
                  },
                  0
                ]
              },
              "/",
              {
                "$at": [
                  {
                    "$split": [
                      {
                        "$ref": "request.model"
                      },
                      "/"
                    ]
                  },
                  1
                ]
              },
              "/requests/{{taskId}}"
            ]
          }
        },
        "cancel": {
          "method": "PUT",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              {
                "$concat": [
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      0
                    ]
                  },
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      1
                    ]
                  },
                  "/requests/{{taskId}}"
                ]
              },
              "/cancel"
            ]
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$ref": "response.error"
              },
              "then": "failed",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.status"
                  },
                  "pending"
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
                "$ref": "response.message"
              }
            ]
          },
          "images": {
            "$ref": "response.images"
          },
          "resultEphemeral": true,
          "resultJson": true
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
