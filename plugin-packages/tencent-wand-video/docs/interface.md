# 腾讯云 WAND 视频接口字段

## 协议身份

- 插件 ID：`tencent-wand-video`。
- 能力：`video`。
- 默认 Base URL：`https://tokenhub-intl.tencentcloudmaas.com`。
- 鉴权驱动：`bearer`（`Authorization: Bearer <API Key>`）。
- 创建：`POST /v1/wand/vega-videos/tasks`（JSON），成功返回 HTTP 201 `{"id": "...", "model": "...", "status": "queued"}`。
- 查询：`GET /v1/wand/vega-videos/tasks/{id}`。
- 两个请求都使用 `originPath`，路径从域名根开始拼接。
- 素材必须是公网可访问的 http/https 网址（`requiresPublicMediaUrls`）。

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `content[]` 中 `{"type":"text","text":...}` | 必填 |
| `images`（首帧角色） | `content[]` 中 `{"type":"image_url","image_url":{"url":...},"role":"first_frame"}` | 最多 1 张 |
| `images`（尾帧角色） | `content[]` 中 `role: "last_frame"` | 最多 1 张 |
| `images`（其他角色） | `content[]` 中 `role: "reference_image"` | 建议最多 9 张 |
| `videos` | `content[]` 中 `{"type":"video_url",...,"role":"reference_video"}` | 建议最多 3 个 |
| `audios` | `content[]` 中 `{"type":"audio_url",...,"role":"reference_audio"}` | 建议最多 3 个 |
| `duration` | `duration` | 整数 4–15 秒；未指定时不发送，上游默认 5 |
| `aspectRatio` | `ratio` | 21:9、16:9、4:3、1:1、3:4、9:16；未指定、auto 或自适应时不发送（上游默认 adaptive） |
| `resolution` | `resolution` | 转大写发送；纯数字补 P（720 → 720P），2160P → 4K，1440P → 2K。超出型号档位时上游返回 400 |

## Provider 扩展键

- `providerOptions.tencent-wand-video.resolution`：未从界面传入时的默认分辨率。

## 结果解析

- 状态：`queued`、`running`、`succeeded`、`failed`。
- 视频：`content.video_url`（12 小时有效的临时网址）。
- 错误：`error.code`、`error.message`；例如 `InternalError`、`TaskTimeout`。HTTP 400 参数错误、401 Key 无效、404 任务不存在、500 服务错误、503 过载。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "tencent-wand-video",
  "name": "腾讯云 WAND 视频",
  "version": "1.0.0",
  "author": "Rexx",
  "description": "腾讯云 TokenHub WAND-Vega-Video 视频协议插件（POST /v1/wand/vega-videos/tasks，异步轮询），支持文生视频、首尾帧和全能参考。",
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
        "description": "腾讯云 TokenHub 控制台创建的 API Key。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "tencent-wand-video",
        "label": "腾讯云 WAND 视频",
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
        "baseUrl": "https://tokenhub-intl.tencentcloudmaas.com",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": true,
        "validations": [
          {
            "assert": {
              "$not": {
                "$in": [
                  {
                    "$ref": "request.operation"
                  },
                  [
                    "extend",
                    "inpaint",
                    "replace_element",
                    "style_transfer",
                    "camera_motion",
                    "edit"
                  ]
                ]
              }
            },
            "message": "该模型不支持视频续写或局部修改，请改用支持这些功能的模型。"
          },
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.prompt"
                        },
                        ""
                      ]
                    }
                  }
                },
                0
              ]
            },
            "message": "请填写视频提示词。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "WAND 模型 ID，例如 wand-vega-video-1.5-pro、wand-vega-video-1.0-lite。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "content[type=text]",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=image_url]",
            "description": "首帧（first_frame）、尾帧（last_frame）各最多 1 张；其他图片作为参考图（reference_image），建议最多 9 张。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=video_url, role=reference_video]",
            "description": "参考视频，建议最多 3 个。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=audio_url, role=reference_audio]",
            "description": "参考音频，建议最多 3 个；不建议只给音频。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长 4–15 秒，默认 5。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "21:9、16:9、4:3、1:1、3:4、9:16；未指定或自适应时不传，由上游按输入图决定。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "大写发送：720P、768P、1080P、2K、4K，以型号支持为准。纯数字会补 P。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "扩展字段：resolution 默认值。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/wand/vega-videos/tasks",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "content": {
              "$concatArrays": [
                [
                  {
                    "type": "text",
                    "text": {
                      "$trim": {
                        "$ref": "request.prompt"
                      }
                    }
                  }
                ],
                {
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
                      "type": "image_url",
                      "image_url": {
                        "url": {
                          "$coalesce": [
                            {
                              "$ref": "media.url"
                            },
                            {
                              "$ref": "media.dataUrl"
                            }
                          ]
                        }
                      },
                      "role": "first_frame"
                    }
                  }
                },
                {
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
                      "type": "image_url",
                      "image_url": {
                        "url": {
                          "$coalesce": [
                            {
                              "$ref": "media.url"
                            },
                            {
                              "$ref": "media.dataUrl"
                            }
                          ]
                        }
                      },
                      "role": "last_frame"
                    }
                  }
                },
                {
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
                      "type": "image_url",
                      "image_url": {
                        "url": {
                          "$coalesce": [
                            {
                              "$ref": "media.url"
                            },
                            {
                              "$ref": "media.dataUrl"
                            }
                          ]
                        }
                      },
                      "role": "reference_image"
                    }
                  }
                },
                {
                  "$map": {
                    "from": {
                      "$ref": "request.videos"
                    },
                    "as": "media",
                    "in": {
                      "type": "video_url",
                      "video_url": {
                        "url": {
                          "$coalesce": [
                            {
                              "$ref": "media.url"
                            },
                            {
                              "$ref": "media.dataUrl"
                            }
                          ]
                        }
                      },
                      "role": "reference_video"
                    }
                  }
                },
                {
                  "$map": {
                    "from": {
                      "$ref": "request.audios"
                    },
                    "as": "media",
                    "in": {
                      "type": "audio_url",
                      "audio_url": {
                        "url": {
                          "$coalesce": [
                            {
                              "$ref": "media.url"
                            },
                            {
                              "$ref": "media.dataUrl"
                            }
                          ]
                        }
                      },
                      "role": "reference_audio"
                    }
                  }
                }
              ]
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
                  "else": null
                }
              }
            },
            "ratio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              ""
                            ]
                          }
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
                  "then": null,
                  "else": {
                    "$trim": {
                      "$ref": "request.aspectRatio"
                    }
                  }
                }
              }
            },
            "resolution": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$upper": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.resolution"
                              },
                              {
                                "$ref": "request.providerOptions.tencent-wand-video.resolution"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      [
                        "480",
                        "540",
                        "720",
                        "768",
                        "1080",
                        "1440",
                        "2160"
                      ]
                    ]
                  },
                  "then": {
                    "$concat": [
                      {
                        "$upper": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.resolution"
                              },
                              {
                                "$ref": "request.providerOptions.tencent-wand-video.resolution"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "P"
                    ]
                  },
                  "else": {
                    "$switch": {
                      "cases": [
                        {
                          "when": {
                            "$eq": [
                              {
                                "$upper": {
                                  "$trim": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.resolution"
                                      },
                                      {
                                        "$ref": "request.providerOptions.tencent-wand-video.resolution"
                                      },
                                      ""
                                    ]
                                  }
                                }
                              },
                              "2160P"
                            ]
                          },
                          "then": "4K"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$upper": {
                                  "$trim": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.resolution"
                                      },
                                      {
                                        "$ref": "request.providerOptions.tencent-wand-video.resolution"
                                      },
                                      ""
                                    ]
                                  }
                                }
                              },
                              "1440P"
                            ]
                          },
                          "then": "2K"
                        }
                      ],
                      "default": {
                        "$upper": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.resolution"
                              },
                              {
                                "$ref": "request.providerOptions.tencent-wand-video.resolution"
                              },
                              ""
                            ]
                          }
                        }
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
          "path": "/v1/wand/vega-videos/tasks/{{taskId}}",
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
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.error.code"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.content.video_url"
              }
            ]
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "error.message",
            "error.code",
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
