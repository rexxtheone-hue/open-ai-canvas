# 88API 统一视频接口字段

## 协议身份

- 插件 ID：`api88-video`。
- 能力：`video`。
- 默认 Base URL：`https://api.88api.ai`。
- 鉴权驱动：`bearer`（`Authorization: Bearer sk-...`）。
- 创建：`POST /v1/videos`（JSON）。
- 查询：`GET /v1/videos/{taskId}`，只支持轮询，不发送 `callback_url`。
- 两个请求都使用 `originPath`，路径从域名根开始拼接。
- 素材必须是公网可访问的网址（`requiresPublicMediaUrls`）。

## 已适配模型

| 上游模型 ID | 分辨率 | 时长 | 比例 | 图/视频/音频 | 音频生成 |
| --- | --- | --- | --- | --- | --- |
| `SD2.5` | 480p（默认）、720p、1080p | 4–30 秒 | 必须显式指定 | 30 / 10 / 10 | 支持 `generate_audio` |
| `SD2.0` | 480p（默认）、720p、1080p、4k | 4–15 秒 | 默认 1:1 | 9 / 3 / 3，合计最多 12 | 不支持，开启会报 400 |

| `gemini-omni-flash-1.1` | 720p、1080p、4k | 3–10 秒 | 16:9、9:16 | 10 / 3 / 0 | 不支持参考音频 |

其他走 88API 统一 `/v1/videos` 规范的模型也可使用。模型 ID 以 `gemini-`、`veo-` 开头时，参考视频放顶层 `videos`；其他模型放 `metadata.referenceVideos`，两处不会同时发送。

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | SD2.5 必填 |
| `duration` | `duration` | 整数秒，未指定时默认 5 |
| `aspectRatio` | `ratio` | 16:9、9:16、1:1、4:3、3:4、21:9；未指定、auto 或自适应时默认 16:9 |
| `resolution` | `resolution` | 小写发送，例如 720p |
| `generateAudio` | `generate_audio` | 仅开启时发送 `true` |
| `images`（首帧角色） | `metadata.firstFrame` | 与普通参考素材互斥 |
| `images`（尾帧角色） | `metadata.lastFrame` | 必须同时有首帧 |
| `images`（其他角色） | `images` | 参考图网址数组 |
| `videos` | `metadata.referenceVideos`，Gemini/Veo 为顶层 `videos` | 参考视频网址数组 |
| `audios` | `metadata.referenceAudios` | 参考音频网址数组 |

## Provider 扩展键

- `providerOptions.api88-video.negative_prompt`、`seed`。
- `providerOptions.api88-video.ratio`、`duration`、`resolution`：未从界面传入时的默认值。

## 结果解析

- 状态：`queued`、`in_progress`、`completed`、`failed`；`unknown` 按排队继续轮询。
- 视频：`url`，兼容 `video_url`、`result_url`。
- 错误：`error.code`、`error.message`。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "api88-video",
  "name": "88API 统一视频",
  "version": "1.0.1",
  "author": "Rexx",
  "description": "88API 统一视频协议插件（POST /v1/videos，异步轮询），适配 SD2.5、SD2.0 云厂商版与 Gemini Omni、Veo。",
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
        "description": "88API 令牌（sk- 开头）。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "api88-video",
        "label": "88API 统一视频",
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
        "baseUrl": "https://api.88api.ai",
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
            "description": "88API 模型 ID，必须与 GET /v1/models 返回的 id 完全一致，例如 SD2.5、SD2.0。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "prompt",
            "description": "视频提示词。SD2.5 必填。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "images / metadata.firstFrame / metadata.lastFrame",
            "description": "参考图；角色为首帧、尾帧的图片放入 metadata.firstFrame、metadata.lastFrame。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "metadata.referenceVideos / videos",
            "description": "参考视频；Gemini、Veo 系列放顶层 videos，其他模型放 metadata.referenceVideos。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "metadata.referenceAudios",
            "description": "参考音频。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长秒数，默认 5。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "比例：16:9、9:16、1:1、4:3、3:4、21:9；未指定或自适应时默认 16:9。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率：480p、720p、1080p、4k，按模型支持选择。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio",
            "description": "生成音频，仅 SD2.5 等支持的模型可开启。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "扩展字段：negative_prompt、seed、ratio、duration、resolution。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/videos",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$omitEmpty": {
                "$ref": "request.prompt"
              }
            },
            "duration": {
              "$toInt": {
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
                    "$ref": "request.duration"
                  },
                  "else": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.api88-video.duration"
                      },
                      5
                    ]
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
                      "$ref": "request.providerOptions.api88-video.ratio"
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
                      "$ref": "request.providerOptions.api88-video.resolution"
                    }
                  ]
                }
              }
            },
            "generate_audio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$ref": "request.generateAudio"
                  },
                  "then": true,
                  "else": null
                }
              }
            },
            "negative_prompt": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.api88-video.negative_prompt"
              }
            },
            "seed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.api88-video.seed"
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
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$first": {
                          "$split": [
                            {
                              "$lower": {
                                "$coalesce": [
                                  {
                                    "$ref": "request.model"
                                  },
                                  ""
                                ]
                              }
                            },
                            "-"
                          ]
                        }
                      },
                      [
                        "gemini",
                        "veo"
                      ]
                    ]
                  },
                  "then": {
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
                  },
                  "else": null
                }
              }
            },
            "metadata": {
              "$omitEmpty": {
                "firstFrame": {
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
                "lastFrame": {
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
                },
                "referenceVideos": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$first": {
                              "$split": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.model"
                                      },
                                      ""
                                    ]
                                  }
                                },
                                "-"
                              ]
                            }
                          },
                          [
                            "gemini",
                            "veo"
                          ]
                        ]
                      },
                      "then": null,
                      "else": {
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
                    }
                  }
                },
                "referenceAudios": {
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
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/videos/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
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
            "$if": {
              "condition": {
                "$eq": [
                  {
                    "$ref": "response.status"
                  },
                  "unknown"
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
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.fail_reason"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.url"
              },
              {
                "$ref": "response.video_url"
              },
              {
                "$ref": "response.result_url"
              }
            ]
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "error.message",
            "message"
          ]
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
