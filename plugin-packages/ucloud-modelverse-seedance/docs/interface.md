# UCloud ModelVerse Seedance 接口字段

## 协议身份

- 插件 ID：`ucloud-modelverse-seedance`。
- Provider ID：`modelverse-seedance-video`。
- 能力：`video`。
- 默认 Base URL：`https://api.modelverse.cn`。
- 鉴权驱动：`bearer`（`Authorization: Bearer <API Key>`）。
- 创建：`POST /v1/tasks/submit`。
- 查询：`GET /v1/tasks/status?task_id={{taskId}}`。
- 官方文档：<https://astraflow.ucloud-global.com/reference/modelverse-api-protocol/video/byte-dance/doubao-seedance-2-0-260128/submit-doubao-seedance20260128-task>。

ModelVerse（UCloud AstraFlow 模型服务平台）的异步任务接口。所有视频模型共用 `/v1/tasks/submit` 与 `/v1/tasks/status`，但 `input` 的结构按模型不同；本插件只覆盖 Seedance 系列（`doubao-seedance-2-0-260128`、`doubao-seedance-2-5-260628`、`doubao-seedance-1-5-pro-251215` 等），素材数组与火山方舟 Seedance 的 `content` 结构一致，外面包一层 `input`，生成参数放在 `parameters`。

对话模型直接用 `chat-completion` 协议（`POST /v1/chat/completions`），图片模型用 `openai-image` 协议（`POST /v1/images/generations`），不需要本插件。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | ModelVerse API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | ModelVerse 模型名，例如 `doubao-seedance-2-0-260128`。 |
| `prompt` | string | 是 | `input.content[type=text].text` | 视频提示词。 |
| `images` | media[] | 否 | `input.content[type=image_url]` | first_frame、last_frame、reference_image 等 role 原样映射。 |
| `videos` | media[] | 否 | `input.content[type=video_url]` | reference_video。 |
| `audios` | media[] | 否 | `input.content[type=audio_url]` | reference_audio。 |
| `aspectRatio` | string | 否 | `parameters.ratio` | 输出画幅。 |
| `resolution` | string | 否 | `parameters.resolution` | 输出分辨率档位。 |
| `duration` | integer | 否 | `parameters.duration` | 输出时长秒数。 |
| `generateAudio` | boolean | 否 | `parameters.generate_audio` | 是否生成音频。 |
| `watermark` | boolean | 否 | `parameters.watermark` | 是否带水印。 |
| `seed` | integer | 否 | `parameters.seed` | providerOptions seed。 |
| `camera_fixed` | boolean | 否 | `parameters.camera_fixed` | providerOptions camera_fixed。 |

## 响应

- 提交成功返回 `output.task_id`。
- 查询返回 `output.task_status`（例如 `Success`），成功时视频地址在 `output.urls`（数组）。状态按不区分大小写的 pending / running / success / failure 归一。
- 结果地址是临时链接，标记为 ephemeral，由宿主立即下载持久化。

## 兼容边界

只覆盖 Seedance 系列。ModelVerse 上的 Kling、Wan、MiniMax、Veo 等视频模型的 `input` 结构不同，需要各自的协议插件。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "ucloud-modelverse-seedance",
  "name": "UCloud ModelVerse Seedance",
  "version": "1.0.0",
  "author": "UCloud ModelVerse / 影策",
  "description": "UCloud ModelVerse（AstraFlow）异步任务接口上的 Seedance 视频生成协议插件。",
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
        "id": "modelverse-seedance-video",
        "label": "UCloud ModelVerse Seedance",
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
        "baseUrl": "https://api.modelverse.cn",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "ModelVerse 模型名，例如 doubao-seedance-2-0-260128。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input.content[type=text].text",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "input.content[type=image_url]",
            "description": "first_frame、last_frame、reference_image 等 role 原样映射。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "input.content[type=video_url]",
            "description": "reference_video。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "input.content[type=audio_url]",
            "description": "reference_audio/reference_voice。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "parameters.ratio",
            "description": "输出画幅。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "parameters.resolution",
            "description": "输出分辨率档位。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "parameters.duration",
            "description": "输出时长秒数。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.generate_audio",
            "description": "是否生成音频。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.watermark",
            "description": "是否带水印。"
          },
          {
            "name": "seed",
            "type": "integer",
            "required": false,
            "mapping": "parameters.seed",
            "description": "providerOptions seed。"
          },
          {
            "name": "camera_fixed",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.camera_fixed",
            "description": "providerOptions camera_fixed。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                9
              ]
            },
            "message": "Seedance 最多支持 9 张参考图片"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                3
              ]
            },
            "message": "Seedance 最多支持 3 个参考视频"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.audios"
                  }
                },
                3
              ]
            },
            "message": "Seedance 最多支持 3 个参考音频"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
                    {
                      "$add": [
                        {
                          "$len": {
                            "$ref": "request.images"
                          }
                        },
                        {
                          "$len": {
                            "$ref": "request.videos"
                          }
                        }
                      ]
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Seedance 不支持纯音频或文本+音频，请同时添加参考图片或参考视频"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/tasks/submit",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "input": {
              "content": {
                "$concatArrays": [
                  [
                    {
                      "type": "text",
                      "text": {
                        "$ref": "request.prompt"
                      }
                    }
                  ],
                  {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "in": {
                        "type": "image_url",
                        "image_url": {
                          "url": {
                            "$ref": "media.value"
                          }
                        },
                        "role": {
                          "$coalesce": [
                            {
                              "$ref": "media.role"
                            },
                            "reference_image"
                          ]
                        }
                      }
                    }
                  },
                  {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.videos"
                        }
                      },
                      "as": "media",
                      "in": {
                        "type": "video_url",
                        "video_url": {
                          "url": {
                            "$ref": "media.value"
                          }
                        },
                        "role": {
                          "$coalesce": [
                            {
                              "$ref": "media.role"
                            },
                            "reference_video"
                          ]
                        }
                      }
                    }
                  },
                  {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.audios"
                        }
                      },
                      "as": "media",
                      "in": {
                        "type": "audio_url",
                        "audio_url": {
                          "url": {
                            "$ref": "media.value"
                          }
                        },
                        "role": {
                          "$coalesce": [
                            {
                              "$ref": "media.role"
                            },
                            "reference_audio"
                          ]
                        }
                      }
                    }
                  }
                ]
              }
            },
            "parameters": {
              "ratio": {
                "$coalesce": [
                  {
                    "$ref": "request.aspectRatio"
                  },
                  "16:9"
                ]
              },
              "resolution": {
                "$coalesce": [
                  {
                    "$ref": "request.resolution"
                  },
                  "720p"
                ]
              },
              "duration": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$ref": "request.duration"
                      },
                      0
                    ]
                  },
                  "then": {
                    "$ref": "request.duration"
                  },
                  "else": 5
                }
              },
              "generate_audio": {
                "$ref": "request.generateAudio"
              },
              "watermark": {
                "$ref": "request.watermark"
              },
              "seed": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.modelverse-seedance-video.seed"
                }
              },
              "camera_fixed": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.modelverse-seedance-video.camera_fixed"
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/tasks/status",
          "originPath": true,
          "query": {
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.output.task_id"
              },
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.output.task_status"
              },
              {
                "$ref": "response.status"
              },
              "pending"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.output.error_message"
              },
              {
                "$ref": "response.output.message"
              },
              {
                "$ref": "response.output.error"
              },
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.output.urls"
              },
              {
                "$ref": "response.output.video_url"
              },
              {
                "$ref": "response.output.url"
              }
            ]
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
