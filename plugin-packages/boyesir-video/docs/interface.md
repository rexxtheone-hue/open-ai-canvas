# Boyesir 视频接口字段

## 协议身份

- 插件 ID：`boyesir-video`。
- 能力：`video`。
- 默认 Base URL：`https://boyesir.com`。
- 鉴权驱动：`bearer`（`Authorization: Bearer sk-...`）。
- 创建：`POST /v1/videos/generations`（JSON），响应 `{"task_id": "...", "status": "queued"}`。
- 查询：`GET /v1/tasks/{task_id}`。
- 两个请求都使用 `originPath`，路径从域名根开始拼接。
- 素材必须是公网可访问的 http/https 网址（`requiresPublicMediaUrls`）。

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | 必填；可用 @图片1、@视频1、@音频1 指明素材角色 |
| `duration` | `duration` | 整数秒；未指定时不发送，由型号默认（固定时长型号要求不传或传对应值） |
| `aspectRatio` | `ratio` | 未指定、auto 或自适应时默认 16:9 |
| `resolution` | `resolution` | 小写发送：480p、720p、1080p、2k、4k，以型号支持为准 |
| `images`（首帧角色） | `first_frame_url` | 固定首帧 |
| `images`（尾帧角色） | `last_frame_url` | 固定尾帧 |
| `images`（其他角色） | `images` | 参考图网址数组 |
| `videos` | `videos` | 参考视频网址数组 |
| `audios` | `audios` | 参考音频网址数组 |

单次请求素材上限 9 图 / 3 视频 / 10 音频，全能参考型号最多 30 图 / 10 视频 / 10 音频；超出部分由 Boyesir 截断。

## Provider 扩展键

- `providerOptions.boyesir-video.ratio`、`duration`、`resolution`：未从界面传入时的默认值。

## 结果解析

- 状态：`queued`、`processing`、`succeeded`、`failed`。
- 视频：`result.videos`（网址数组）。
- 错误：`error`（字符串）；HTTP 400 参数错误、401 Key 无效、402 余额不足、502/504 生成失败（已自动退款）。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "boyesir-video",
  "name": "Boyesir 视频",
  "version": "1.0.0",
  "author": "Rexx",
  "description": "Boyesir AI 视频协议插件（POST /v1/videos/generations，异步轮询 /v1/tasks），支持其全部视频型号。",
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
        "required": true,
        "description": "Boyesir 控制台令牌（sk- 开头）。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "boyesir-video",
        "label": "Boyesir 视频",
        "capabilities": [
          "video"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://boyesir.com",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": true,
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "Boyesir 模型 ID，例如 bh-sd2-5-720p、lec-gt-seedance-2-5-720p。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "视频提示词；可用 @图片1、@视频1、@音频1 指明素材角色。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "images / first_frame_url / last_frame_url",
            "description": "参考图；角色为首帧、尾帧的图片放入 first_frame_url、last_frame_url。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "videos",
            "description": "参考视频，最多 10 个，以型号上限为准。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audios",
            "description": "参考音频，最多 10 个，以型号上限为准。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长秒数；固定时长型号可不传。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画幅，如 16:9、9:16、1:1；未指定或自适应时默认 16:9。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率：480p、720p、1080p、2k、4k，以型号支持为准。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "扩展字段：ratio、duration、resolution 默认值。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/videos/generations",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "duration": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "request.duration"
                          },
                          0
                        ]
                      },
                      0
                    ]
                  },
                  "then": {
                    "$toInt": {
                      "$ref": "request.duration"
                    }
                  },
                  "else": {
                    "$ref": "request.providerOptions.boyesir-video.duration"
                  }
                }
              }
            },
            "ratio": {
              "$if": {
                "condition": {
                  "$in": [
                    {
                      "$lower": {
                        "$coalesce": [
                          {
                            "$ref": "request.aspectRatio"
                          },
                          ""
                        ]
                      }
                    },
                    [
                      "",
                      "auto",
                      "adaptive",
                      "自适应",
                      "智能"
                    ]
                  ]
                },
                "then": {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.boyesir-video.ratio"
                    },
                    "16:9"
                  ]
                },
                "else": {
                  "$ref": "request.aspectRatio"
                }
              }
            },
            "resolution": {
              "$omitEmpty": {
                "$lower": {
                  "$coalesce": [
                    {
                      "$ref": "request.resolution"
                    },
                    {
                      "$ref": "request.providerOptions.boyesir-video.resolution"
                    }
                  ]
                }
              }
            },
            "images": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$filter": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "where": {
                        "$not": {
                          "$in": [
                            {
                              "$ref": "media.role"
                            },
                            [
                              "first_frame",
                              "last_frame"
                            ]
                          ]
                        }
                      }
                    }
                  },
                  "as": "media",
                  "in": {
                    "$coalesce": [
                      {
                        "$ref": "media.url"
                      },
                      {
                        "$ref": "media.dataUrl"
                      }
                    ]
                  }
                }
              }
            },
            "videos": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$ref": "request.videos"
                  },
                  "as": "media",
                  "in": {
                    "$coalesce": [
                      {
                        "$ref": "media.url"
                      },
                      {
                        "$ref": "media.dataUrl"
                      }
                    ]
                  }
                }
              }
            },
            "audios": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$ref": "request.audios"
                  },
                  "as": "media",
                  "in": {
                    "$coalesce": [
                      {
                        "$ref": "media.url"
                      },
                      {
                        "$ref": "media.dataUrl"
                      }
                    ]
                  }
                }
              }
            },
            "first_frame_url": {
              "$omitEmpty": {
                "$first": {
                  "$map": {
                    "from": {
                      "$filter": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "where": {
                          "$eq": [
                            {
                              "$ref": "media.role"
                            },
                            "first_frame"
                          ]
                        }
                      }
                    },
                    "as": "media",
                    "in": {
                      "$coalesce": [
                        {
                          "$ref": "media.url"
                        },
                        {
                          "$ref": "media.dataUrl"
                        }
                      ]
                    }
                  }
                }
              }
            },
            "last_frame_url": {
              "$omitEmpty": {
                "$first": {
                  "$map": {
                    "from": {
                      "$filter": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "where": {
                          "$eq": [
                            {
                              "$ref": "media.role"
                            },
                            "last_frame"
                          ]
                        }
                      }
                    },
                    "as": "media",
                    "in": {
                      "$coalesce": [
                        {
                          "$ref": "media.url"
                        },
                        {
                          "$ref": "media.dataUrl"
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/tasks/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.status"
              },
              "queued"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.detail"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.result.videos"
              },
              {
                "$ref": "response.result.video"
              },
              {
                "$ref": "response.result.url"
              }
            ]
          },
          "errorPaths": [
            "error"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "error",
            "message",
            "detail"
          ]
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
