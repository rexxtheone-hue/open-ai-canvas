# 腾讯云 Kling 视频接口字段

## 协议身份

- 插件 ID：`tencent-kling-video`。
- 能力：`video`。
- 默认 Base URL：`https://tokenhub-intl.tencentcloudmaas.com`。
- 鉴权驱动：`bearer`（`Authorization: Bearer <API Key>`）。
- 创建：没有图片和视频时 `POST /v1/wand/kling/text-to-video`，否则 `POST /v1/wand/kling/omni-video`。成功返回 `{"code":0,"data":{"id":"...","status":"submitted"}}`。
- 查询：`GET /v1/wand/kling/tasks/{id}`，返回 `data` 数组。
- 请求都使用 `originPath`，路径从域名根开始拼接。

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | 文生视频 `prompt`；全能参考 `contents[]` 中 `{"type":"prompt","text":...}` | 必填 |
| `images`（首帧角色） | `contents[]` 中 `{"type":"first_frame","url":...}` | 最多 1 张 |
| `images`（尾帧角色） | `contents[]` 中 `{"type":"last_frame","url":...}` | 最多 1 张，需同时有首帧 |
| `images`（其他角色） | `contents[]` 中 `{"type":"refer_image","url":...}` | 最多 10 张，每张 ≤30MB；提示词用 `@image_1` 引用 |
| `videos` | `contents[]` 中 `{"type":"feature_video","url":...}` | 最多 5 段，单段与合计 3–30 秒，≤300MB；提示词用 `@video_1` 引用 |
| `duration` | `settings.duration` | 整数 3–30 秒；未指定时不发送，上游默认 5 |
| `aspectRatio` | `settings.aspect_ratio` | 21:9、16:9、9:16、1:1；未指定、auto 或自适应时不发送 |
| `resolution` | `settings.resolution` | 小写发送：720p、1080p；纯数字补 p。v4-flash 只有 720p |

`audios` 不支持，提交时直接拒绝。

## Provider 扩展键

- `providerOptions.tencent-kling-video.resolution`：未从界面传入时的默认分辨率。

## 结果解析

- 状态：`submitted`、`processing`、`succeeded`、`failed`。
- 视频：`data[0].outputs[].url`（临时网址）。
- 错误：`code` 非 0 视为失败，原因取 `data[0].message` 或 `message`。

## 计费参考（腾讯官方，USD/秒）

| 模型 | 分辨率 | 无参考视频 | 有参考视频（按 2 × 输出秒数，参考视频长于输出时按 输入 + 输出） |
| --- | --- | --- | --- |
| kling-video-v4 | 720p | 0.14 | 0.084 |
| kling-video-v4 | 1080p | 0.21 | 0.126 |
| kling-video-v4-flash | 720p | 0.14 | 0.084 |

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "tencent-kling-video",
  "name": "腾讯云 Kling 视频",
  "version": "1.0.0",
  "author": "Rexx",
  "description": "腾讯云 TokenHub Kling 视频协议插件（/v1/wand/kling/text-to-video 与 omni-video，异步轮询），支持 kling-video-v4 / v4-flash 文生视频、首尾帧和全能参考（图片、参考视频）。",
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
        "id": "tencent-kling-video",
        "label": "腾讯云 Kling 视频",
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
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$coalesce": [
                      {
                        "$ref": "request.audios"
                      },
                      []
                    ]
                  }
                },
                0
              ]
            },
            "message": "该模型不支持参考音频，请移除音频后再试。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "Kling 模型 ID，例如 kling-video-v4、kling-video-v4-flash。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt / contents[type=prompt]",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "contents[type=first_frame|last_frame|refer_image]",
            "description": "首帧、尾帧各最多 1 张（不支持只有尾帧）；其他图片作为参考图，最多 10 张，每张 ≤30MB。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "contents[type=feature_video]",
            "description": "参考视频，最多 5 个，单段与合计 3–30 秒，仅公网网址。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "settings.duration",
            "description": "时长 3–30 秒，默认 5。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "settings.aspect_ratio",
            "description": "21:9、16:9、9:16、1:1；未指定或自适应时不传。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "settings.resolution",
            "description": "720p、1080p（v4-flash 只有 720p）。纯数字会补 p。"
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
          "path": "/v1/wand/kling/text-to-video",
          "pathTemplate": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$add": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.images"
                            },
                            []
                          ]
                        }
                      },
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.videos"
                            },
                            []
                          ]
                        }
                      }
                    ]
                  },
                  0
                ]
              },
              "then": "/v1/wand/kling/omni-video",
              "else": "/v1/wand/kling/text-to-video"
            }
          },
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$add": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.images"
                            },
                            []
                          ]
                        }
                      },
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.videos"
                            },
                            []
                          ]
                        }
                      }
                    ]
                  },
                  0
                ]
              },
              "then": {
                "model": {
                  "$ref": "request.model"
                },
                "contents": {
                  "$concatArrays": [
                    [
                      {
                        "type": "prompt",
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
                          "type": "first_frame",
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
                          "type": "last_frame",
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
                          "type": "refer_image",
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
                          "type": "feature_video",
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
                        }
                      }
                    }
                  ]
                },
                "settings": {
                  "resolution": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$in": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.resolution"
                                    },
                                    {
                                      "$ref": "request.providerOptions.tencent-kling-video.resolution"
                                    },
                                    ""
                                  ]
                                }
                              }
                            },
                            [
                              "720",
                              "1080"
                            ]
                          ]
                        },
                        "then": {
                          "$concat": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.resolution"
                                    },
                                    {
                                      "$ref": "request.providerOptions.tencent-kling-video.resolution"
                                    },
                                    ""
                                  ]
                                }
                              }
                            },
                            "p"
                          ]
                        },
                        "else": {
                          "$if": {
                            "condition": {
                              "$eq": [
                                {
                                  "$lower": {
                                    "$trim": {
                                      "$coalesce": [
                                        {
                                          "$ref": "request.resolution"
                                        },
                                        {
                                          "$ref": "request.providerOptions.tencent-kling-video.resolution"
                                        },
                                        ""
                                      ]
                                    }
                                  }
                                },
                                ""
                              ]
                            },
                            "then": null,
                            "else": {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.resolution"
                                    },
                                    {
                                      "$ref": "request.providerOptions.tencent-kling-video.resolution"
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
                  },
                  "aspect_ratio": {
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
                  }
                }
              },
              "else": {
                "model": {
                  "$ref": "request.model"
                },
                "prompt": {
                  "$trim": {
                    "$ref": "request.prompt"
                  }
                },
                "settings": {
                  "resolution": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$in": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.resolution"
                                    },
                                    {
                                      "$ref": "request.providerOptions.tencent-kling-video.resolution"
                                    },
                                    ""
                                  ]
                                }
                              }
                            },
                            [
                              "720",
                              "1080"
                            ]
                          ]
                        },
                        "then": {
                          "$concat": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.resolution"
                                    },
                                    {
                                      "$ref": "request.providerOptions.tencent-kling-video.resolution"
                                    },
                                    ""
                                  ]
                                }
                              }
                            },
                            "p"
                          ]
                        },
                        "else": {
                          "$if": {
                            "condition": {
                              "$eq": [
                                {
                                  "$lower": {
                                    "$trim": {
                                      "$coalesce": [
                                        {
                                          "$ref": "request.resolution"
                                        },
                                        {
                                          "$ref": "request.providerOptions.tencent-kling-video.resolution"
                                        },
                                        ""
                                      ]
                                    }
                                  }
                                },
                                ""
                              ]
                            },
                            "then": null,
                            "else": {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.resolution"
                                    },
                                    {
                                      "$ref": "request.providerOptions.tencent-kling-video.resolution"
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
                  },
                  "aspect_ratio": {
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
                  }
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/wand/kling/tasks/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.data.id"
              },
              {
                "$ref": "response.data.0.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.data.status"
              },
              {
                "$ref": "response.data.0.status"
              },
              "queued"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.data.0.message"
              },
              {
                "$ref": "response.data.message"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$ref": "response.data.0.outputs"
          },
          "errorPaths": [
            "code"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "data.0.message",
            "data.message",
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
