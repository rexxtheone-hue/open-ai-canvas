# 腾讯云 Kling 视频接口字段

## 协议身份

- 插件 ID：`tencent-kling-video`。
- 能力：`video`。
- 默认 Base URL：`https://tokenhub-intl.tencentcloudmaas.com`。
- 鉴权驱动：`bearer`（`Authorization: Bearer <API Key>`）。
- 创建（按模型分流）：
  - `kling-video-v3-omni`：一律 `POST /v1/wand/kling/omni-video`。
  - `kling-video-v3`、`kling-video-v3-turbo`：有图片时 `POST /v1/wand/kling/image-to-video`，否则 `POST /v1/wand/kling/text-to-video`。
  - `kling-video-v4`、`kling-video-v4-flash`：没有图片、视频和音色时 `POST /v1/wand/kling/text-to-video`，否则 `POST /v1/wand/kling/omni-video`。
  - 成功返回 `{"code":0,"data":{"id":"...","status":"submitted"}}`。
- 查询：`GET /v1/wand/kling/tasks/{id}`，返回 `data` 数组。
- 请求都使用 `originPath`，路径从域名根开始拼接。

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | 文生视频 `prompt`；图生视频和全能参考 `contents[]` 中 `{"type":"prompt","text":...}` | 必填 |
| `images`（首帧角色） | `contents[]` 中 `{"type":"first_frame","url":...}` | 最多 1 张 |
| `images`（尾帧角色） | `contents[]` 中 `{"type":"last_frame","url":...}` | 最多 1 张，需同时有首帧；v3 Turbo 不支持 |
| `images`（其他角色） | v4 / v3 Omni：`{"type":"refer_image","url":...}`；v3 / v3 Turbo：按顺序当首帧、尾帧 | v4 最多 10 张（≤30MB）；v3 Omni 最多 7 张，带参考视频时最多 4 张 |
| `videos` | `contents[]` 中 `{"type":"feature_video","url":...}` | v4 最多 5 段，单段与合计 3–30 秒；v3 Omni 最多 1 段，3–15 秒；v3 / v3 Turbo 不支持 |
| `audios` | `contents[]` 中 `{"type":"voice","voice_id":...,"id":"1"}` | 网址必须是宿主登记后的 `kling-voice://<voice_id>`。v4 最多 3 个；v3 Omni 最多 2 个，必须生成音频且不能带参考视频；v3 / v3 Turbo 不支持 |
| `generateAudio` | `settings.audio` | 仅 v3 / v3 Omni：true → `native`，false → `off`；v3 Omni 带参考视频时固定 `off`，带音色时固定 `native` |
| `duration` | `settings.duration` | v4 整数 3–30 秒，v3 系列 3–15 秒；未指定时不发送，上游默认 5 |
| `aspectRatio` | `settings.aspect_ratio` | 16:9、9:16、1:1（v4 另有 21:9）；未指定或自适应时不发送，v3 Omni 无首帧和参考视频时补 16:9；图生视频不发送 |
| `resolution` | `settings.resolution` | 小写发送：720p、1080p；v3 / v3 Omni 另有 4k（2160p 转为 4k）；纯数字补 p。v4-flash 只有 720p |

## 音色登记（宿主完成）

1. `POST /v1/wand/kling/custom-voices` `{"voice_name":...,"voice_url":<参考音频公网网址>}`，返回 `data.task_id`。
2. 轮询 `GET /v1/wand/kling/custom-voices/{task_id}`，`data.task_status = succeed` 时取 `data.task_result.voices[0].voice_id`；`failed` 时原因在 `data.task_status_msg`。

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

| 模型 | 分辨率 | 有音频 | 无音频 | 有参考视频（无音频） |
| --- | --- | --- | --- | --- |
| kling-video-v3 | 720p | 0.126 | 0.084 | — |
| kling-video-v3 | 1080p | 0.168 | 0.112 | — |
| kling-video-v3 | 4k | 0.42 | 0.42 | — |
| kling-video-v3-turbo | 720p | 0.112 | 0.112 | — |
| kling-video-v3-turbo | 1080p | 0.14 | 0.14 | — |
| kling-video-v3-omni | 720p | 0.112 | 0.084 | 0.126 |
| kling-video-v3-omni | 1080p | 0.14 | 0.112 | 0.168 |
| kling-video-v3-omni | 4k | 0.42 | 0.42 | 0.42 |

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "tencent-kling-video",
  "name": "腾讯云 Kling 视频",
  "version": "1.1.0",
  "author": "Rexx",
  "description": "腾讯云 TokenHub Kling 视频协议插件（/v1/wand/kling/text-to-video、image-to-video 与 omni-video，异步轮询），支持 kling-video-v4 / v4-flash、kling-video-v3 / v3-turbo / v3-omni 文生视频、首尾帧和全能参考（图片、参考视频、音色）。",
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
              "$lte": [
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
                3
              ]
            },
            "message": "该模型最多使用 3 段参考音频（音色）。"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$coalesce": [
                          {
                            "$ref": "request.audios"
                          },
                          []
                        ]
                      },
                      "as": "media",
                      "where": {
                        "$not": {
                          "$eq": [
                            {
                              "$len": {
                                "$split": [
                                  {
                                    "$coalesce": [
                                      {
                                        "$ref": "media.url"
                                      },
                                      ""
                                    ]
                                  },
                                  "kling-voice://"
                                ]
                              }
                            },
                            2
                          ]
                        }
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "参考音频需要先创建为可灵音色，请上传音频文件后重试。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      [
                        "kling-video-v3",
                        "kling-video-v3-turbo"
                      ]
                    ]
                  },
                  {
                    "$or": [
                      {
                        "$gt": [
                          {
                            "$len": {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos"
                                },
                                []
                              ]
                            }
                          },
                          0
                        ]
                      },
                      {
                        "$gt": [
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
                      }
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 / v3 Turbo 不支持参考视频和参考音频，请改用 Kling v3 Omni 或 v4。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-turbo"
                    ]
                  },
                  {
                    "$gt": [
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
                      1
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 Turbo 只支持 1 张首帧图片。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      [
                        "kling-video-v3",
                        "kling-video-v3-turbo"
                      ]
                    ]
                  },
                  {
                    "$gt": [
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
                      2
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 最多 2 张图片（首帧和尾帧）。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
                    ]
                  },
                  {
                    "$gt": [
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
                      2
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 Omni 最多使用 2 个音色。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
                    ]
                  },
                  {
                    "$gt": [
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
                  {
                    "$gt": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.videos"
                            },
                            []
                          ]
                        }
                      },
                      0
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 Omni 带参考视频时不能同时使用音色。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
                    ]
                  },
                  {
                    "$gt": [
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
                  {
                    "$not": {
                      "$toBool": {
                        "$coalesce": [
                          {
                            "$ref": "request.generateAudio"
                          },
                          false
                        ]
                      }
                    }
                  }
                ]
              }
            },
            "message": "Kling v3 Omni 使用音色时需要打开「生成音频」。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
                    ]
                  },
                  {
                    "$gt": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.videos"
                            },
                            []
                          ]
                        }
                      },
                      1
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 Omni 最多 1 段参考视频。"
          },
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
                    ]
                  },
                  {
                    "$gt": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "request.videos"
                            },
                            []
                          ]
                        }
                      },
                      0
                    ]
                  },
                  {
                    "$gt": [
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
                      4
                    ]
                  }
                ]
              }
            },
            "message": "Kling v3 Omni 带参考视频时最多 4 张参考图片。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "Kling 模型 ID：kling-video-v4、kling-video-v4-flash、kling-video-v3、kling-video-v3-turbo、kling-video-v3-omni。"
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
            "description": "v4 / v3 Omni：首帧、尾帧各最多 1 张，其他图片作为参考图（v4 最多 10 张，v3 Omni 最多 7 张）。v3：首帧 + 可选尾帧；v3 Turbo：只有首帧。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "contents[type=feature_video]",
            "description": "参考视频，仅公网网址。v4 最多 5 段，单段与合计 3–30 秒；v3 Omni 最多 1 段，3–15 秒；v3 / v3 Turbo 不支持。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "contents[type=voice]",
            "description": "参考音频由宿主先登记为可灵音色（kling-voice://<voice_id>）。v4 最多 3 个，v3 Omni 最多 2 个且必须生成音频；提示词用 @1、@2、@3 指定说话音色。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "settings.audio",
            "description": "v3 / v3 Omni：true 发 native（原生音效），false 发 off。v3 Omni 带参考视频时固定 off，带音色时固定 native。v4、v3 Turbo 不发送。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "settings.duration",
            "description": "时长：v4 3–30 秒，v3 系列 3–15 秒，默认 5。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "settings.aspect_ratio",
            "description": "16:9、9:16、1:1（v4 另有 21:9）；未指定或自适应时不传，v3 Omni 无首帧和参考视频时默认 16:9。图生视频不传。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "settings.resolution",
            "description": "720p、1080p；v3 / v3 Omni 另有 4k（2160p 转为 4k）。纯数字会补 p。"
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
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
                    ]
                  },
                  "then": "/v1/wand/kling/omni-video"
                },
                {
                  "when": {
                    "$and": [
                      {
                        "$in": [
                          {
                            "$lower": {
                              "$trim": {
                                "$coalesce": [
                                  {
                                    "$ref": "request.model"
                                  },
                                  ""
                                ]
                              }
                            }
                          },
                          [
                            "kling-video-v3",
                            "kling-video-v3-turbo"
                          ]
                        ]
                      },
                      {
                        "$gt": [
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
                          0
                        ]
                      }
                    ]
                  },
                  "then": "/v1/wand/kling/image-to-video"
                },
                {
                  "when": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      [
                        "kling-video-v3",
                        "kling-video-v3-turbo"
                      ]
                    ]
                  },
                  "then": "/v1/wand/kling/text-to-video"
                },
                {
                  "when": {
                    "$or": [
                      {
                        "$gt": [
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
                          0
                        ]
                      },
                      {
                        "$gt": [
                          {
                            "$len": {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos"
                                },
                                []
                              ]
                            }
                          },
                          0
                        ]
                      },
                      {
                        "$gt": [
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
                      }
                    ]
                  },
                  "then": "/v1/wand/kling/omni-video"
                }
              ],
              "default": "/v1/wand/kling/text-to-video"
            }
          },
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      "kling-video-v3-omni"
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
                                  "$coalesce": [
                                    {
                                      "$ref": "request.images"
                                    },
                                    []
                                  ]
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
                              "$coalesce": [
                                {
                                  "$ref": "request.videos"
                                },
                                []
                              ]
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
                        },
                        {
                          "$map": {
                            "from": {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios"
                                },
                                []
                              ]
                            },
                            "as": "media",
                            "in": {
                              "type": "voice",
                              "voice_id": {
                                "$at": [
                                  {
                                    "$split": [
                                      {
                                        "$coalesce": [
                                          {
                                            "$ref": "media.url"
                                          },
                                          ""
                                        ]
                                      },
                                      "kling-voice://"
                                    ]
                                  },
                                  1
                                ]
                              },
                              "id": {
                                "$toString": {
                                  "$add": [
                                    {
                                      "$ref": "mediaIndex"
                                    },
                                    1
                                  ]
                                }
                              }
                            }
                          }
                        }
                      ]
                    },
                    "settings": {
                      "resolution": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
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
                                }
                              },
                              {
                                "when": {
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
                                      "2160",
                                      "2160p",
                                      "4k",
                                      "uhd"
                                    ]
                                  ]
                                },
                                "then": "4k"
                              },
                              {
                                "when": {
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
                                "then": null
                              }
                            ],
                            "default": {
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
                      },
                      "aspect_ratio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$not": {
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
                                  }
                                },
                                "then": {
                                  "$trim": {
                                    "$ref": "request.aspectRatio"
                                  }
                                }
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
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
                                                    "first_frame"
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
                                          {
                                            "$len": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.videos"
                                                },
                                                []
                                              ]
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    }
                                  ]
                                },
                                "then": "16:9"
                              }
                            ],
                            "default": null
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
                      },
                      "audio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
                                        {
                                          "$len": {
                                            "$coalesce": [
                                              {
                                                "$ref": "request.videos"
                                              },
                                              []
                                            ]
                                          }
                                        },
                                        0
                                      ]
                                    }
                                  ]
                                },
                                "then": "off"
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
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
                                    }
                                  ]
                                },
                                "then": "native"
                              },
                              {
                                "when": {
                                  "$or": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$and": [
                                        {
                                          "$in": [
                                            {
                                              "$lower": {
                                                "$trim": {
                                                  "$coalesce": [
                                                    {
                                                      "$ref": "request.model"
                                                    },
                                                    ""
                                                  ]
                                                }
                                              }
                                            },
                                            [
                                              "kling-video-v3",
                                              "kling-video-v3-turbo"
                                            ]
                                          ]
                                        },
                                        {
                                          "$not": {
                                            "$eq": [
                                              {
                                                "$lower": {
                                                  "$trim": {
                                                    "$coalesce": [
                                                      {
                                                        "$ref": "request.model"
                                                      },
                                                      ""
                                                    ]
                                                  }
                                                }
                                              },
                                              "kling-video-v3-turbo"
                                            ]
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                },
                                "then": {
                                  "$if": {
                                    "condition": {
                                      "$toBool": {
                                        "$coalesce": [
                                          {
                                            "$ref": "request.generateAudio"
                                          },
                                          false
                                        ]
                                      }
                                    },
                                    "then": "native",
                                    "else": "off"
                                  }
                                }
                              }
                            ],
                            "default": null
                          }
                        }
                      }
                    }
                  }
                },
                {
                  "when": {
                    "$and": [
                      {
                        "$in": [
                          {
                            "$lower": {
                              "$trim": {
                                "$coalesce": [
                                  {
                                    "$ref": "request.model"
                                  },
                                  ""
                                ]
                              }
                            }
                          },
                          [
                            "kling-video-v3",
                            "kling-video-v3-turbo"
                          ]
                        ]
                      },
                      {
                        "$gt": [
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
                          0
                        ]
                      }
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
                              "$coalesce": [
                                {
                                  "$ref": "request.images"
                                },
                                []
                              ]
                            },
                            "as": "media",
                            "in": {
                              "type": {
                                "$if": {
                                  "condition": {
                                    "$or": [
                                      {
                                        "$eq": [
                                          {
                                            "$ref": "media.role"
                                          },
                                          "last_frame"
                                        ]
                                      },
                                      {
                                        "$and": [
                                          {
                                            "$ne": [
                                              {
                                                "$ref": "media.role"
                                              },
                                              "first_frame"
                                            ]
                                          },
                                          {
                                            "$gt": [
                                              {
                                                "$ref": "mediaIndex"
                                              },
                                              0
                                            ]
                                          }
                                        ]
                                      }
                                    ]
                                  },
                                  "then": "last_frame",
                                  "else": "first_frame"
                                }
                              },
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
                          "$switch": {
                            "cases": [
                              {
                                "when": {
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
                                }
                              },
                              {
                                "when": {
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
                                      "2160",
                                      "2160p",
                                      "4k",
                                      "uhd"
                                    ]
                                  ]
                                },
                                "then": "4k"
                              },
                              {
                                "when": {
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
                                "then": null
                              }
                            ],
                            "default": {
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
                      "audio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
                                        {
                                          "$len": {
                                            "$coalesce": [
                                              {
                                                "$ref": "request.videos"
                                              },
                                              []
                                            ]
                                          }
                                        },
                                        0
                                      ]
                                    }
                                  ]
                                },
                                "then": "off"
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
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
                                    }
                                  ]
                                },
                                "then": "native"
                              },
                              {
                                "when": {
                                  "$or": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$and": [
                                        {
                                          "$in": [
                                            {
                                              "$lower": {
                                                "$trim": {
                                                  "$coalesce": [
                                                    {
                                                      "$ref": "request.model"
                                                    },
                                                    ""
                                                  ]
                                                }
                                              }
                                            },
                                            [
                                              "kling-video-v3",
                                              "kling-video-v3-turbo"
                                            ]
                                          ]
                                        },
                                        {
                                          "$not": {
                                            "$eq": [
                                              {
                                                "$lower": {
                                                  "$trim": {
                                                    "$coalesce": [
                                                      {
                                                        "$ref": "request.model"
                                                      },
                                                      ""
                                                    ]
                                                  }
                                                }
                                              },
                                              "kling-video-v3-turbo"
                                            ]
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                },
                                "then": {
                                  "$if": {
                                    "condition": {
                                      "$toBool": {
                                        "$coalesce": [
                                          {
                                            "$ref": "request.generateAudio"
                                          },
                                          false
                                        ]
                                      }
                                    },
                                    "then": "native",
                                    "else": "off"
                                  }
                                }
                              }
                            ],
                            "default": null
                          }
                        }
                      }
                    }
                  }
                },
                {
                  "when": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.model"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      [
                        "kling-video-v3",
                        "kling-video-v3-turbo"
                      ]
                    ]
                  },
                  "then": {
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
                          "$switch": {
                            "cases": [
                              {
                                "when": {
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
                                }
                              },
                              {
                                "when": {
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
                                      "2160",
                                      "2160p",
                                      "4k",
                                      "uhd"
                                    ]
                                  ]
                                },
                                "then": "4k"
                              },
                              {
                                "when": {
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
                                "then": null
                              }
                            ],
                            "default": {
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
                      },
                      "aspect_ratio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$not": {
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
                                  }
                                },
                                "then": {
                                  "$trim": {
                                    "$ref": "request.aspectRatio"
                                  }
                                }
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
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
                                                    "first_frame"
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
                                          {
                                            "$len": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.videos"
                                                },
                                                []
                                              ]
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    }
                                  ]
                                },
                                "then": "16:9"
                              }
                            ],
                            "default": null
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
                      },
                      "audio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
                                        {
                                          "$len": {
                                            "$coalesce": [
                                              {
                                                "$ref": "request.videos"
                                              },
                                              []
                                            ]
                                          }
                                        },
                                        0
                                      ]
                                    }
                                  ]
                                },
                                "then": "off"
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
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
                                    }
                                  ]
                                },
                                "then": "native"
                              },
                              {
                                "when": {
                                  "$or": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$and": [
                                        {
                                          "$in": [
                                            {
                                              "$lower": {
                                                "$trim": {
                                                  "$coalesce": [
                                                    {
                                                      "$ref": "request.model"
                                                    },
                                                    ""
                                                  ]
                                                }
                                              }
                                            },
                                            [
                                              "kling-video-v3",
                                              "kling-video-v3-turbo"
                                            ]
                                          ]
                                        },
                                        {
                                          "$not": {
                                            "$eq": [
                                              {
                                                "$lower": {
                                                  "$trim": {
                                                    "$coalesce": [
                                                      {
                                                        "$ref": "request.model"
                                                      },
                                                      ""
                                                    ]
                                                  }
                                                }
                                              },
                                              "kling-video-v3-turbo"
                                            ]
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                },
                                "then": {
                                  "$if": {
                                    "condition": {
                                      "$toBool": {
                                        "$coalesce": [
                                          {
                                            "$ref": "request.generateAudio"
                                          },
                                          false
                                        ]
                                      }
                                    },
                                    "then": "native",
                                    "else": "off"
                                  }
                                }
                              }
                            ],
                            "default": null
                          }
                        }
                      }
                    }
                  }
                },
                {
                  "when": {
                    "$or": [
                      {
                        "$gt": [
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
                          0
                        ]
                      },
                      {
                        "$gt": [
                          {
                            "$len": {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos"
                                },
                                []
                              ]
                            }
                          },
                          0
                        ]
                      },
                      {
                        "$gt": [
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
                      }
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
                                  "$coalesce": [
                                    {
                                      "$ref": "request.images"
                                    },
                                    []
                                  ]
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
                              "$coalesce": [
                                {
                                  "$ref": "request.videos"
                                },
                                []
                              ]
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
                        },
                        {
                          "$map": {
                            "from": {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios"
                                },
                                []
                              ]
                            },
                            "as": "media",
                            "in": {
                              "type": "voice",
                              "voice_id": {
                                "$at": [
                                  {
                                    "$split": [
                                      {
                                        "$coalesce": [
                                          {
                                            "$ref": "media.url"
                                          },
                                          ""
                                        ]
                                      },
                                      "kling-voice://"
                                    ]
                                  },
                                  1
                                ]
                              },
                              "id": {
                                "$toString": {
                                  "$add": [
                                    {
                                      "$ref": "mediaIndex"
                                    },
                                    1
                                  ]
                                }
                              }
                            }
                          }
                        }
                      ]
                    },
                    "settings": {
                      "resolution": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
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
                                }
                              },
                              {
                                "when": {
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
                                      "2160",
                                      "2160p",
                                      "4k",
                                      "uhd"
                                    ]
                                  ]
                                },
                                "then": "4k"
                              },
                              {
                                "when": {
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
                                "then": null
                              }
                            ],
                            "default": {
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
                      },
                      "aspect_ratio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$not": {
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
                                  }
                                },
                                "then": {
                                  "$trim": {
                                    "$ref": "request.aspectRatio"
                                  }
                                }
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
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
                                                    "first_frame"
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
                                          {
                                            "$len": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.videos"
                                                },
                                                []
                                              ]
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    }
                                  ]
                                },
                                "then": "16:9"
                              }
                            ],
                            "default": null
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
                      },
                      "audio": {
                        "$omitEmpty": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
                                        {
                                          "$len": {
                                            "$coalesce": [
                                              {
                                                "$ref": "request.videos"
                                              },
                                              []
                                            ]
                                          }
                                        },
                                        0
                                      ]
                                    }
                                  ]
                                },
                                "then": "off"
                              },
                              {
                                "when": {
                                  "$and": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$gt": [
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
                                    }
                                  ]
                                },
                                "then": "native"
                              },
                              {
                                "when": {
                                  "$or": [
                                    {
                                      "$eq": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        "kling-video-v3-omni"
                                      ]
                                    },
                                    {
                                      "$and": [
                                        {
                                          "$in": [
                                            {
                                              "$lower": {
                                                "$trim": {
                                                  "$coalesce": [
                                                    {
                                                      "$ref": "request.model"
                                                    },
                                                    ""
                                                  ]
                                                }
                                              }
                                            },
                                            [
                                              "kling-video-v3",
                                              "kling-video-v3-turbo"
                                            ]
                                          ]
                                        },
                                        {
                                          "$not": {
                                            "$eq": [
                                              {
                                                "$lower": {
                                                  "$trim": {
                                                    "$coalesce": [
                                                      {
                                                        "$ref": "request.model"
                                                      },
                                                      ""
                                                    ]
                                                  }
                                                }
                                              },
                                              "kling-video-v3-turbo"
                                            ]
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                },
                                "then": {
                                  "$if": {
                                    "condition": {
                                      "$toBool": {
                                        "$coalesce": [
                                          {
                                            "$ref": "request.generateAudio"
                                          },
                                          false
                                        ]
                                      }
                                    },
                                    "then": "native",
                                    "else": "off"
                                  }
                                }
                              }
                            ],
                            "default": null
                          }
                        }
                      }
                    }
                  }
                }
              ],
              "default": {
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
                      "$switch": {
                        "cases": [
                          {
                            "when": {
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
                            }
                          },
                          {
                            "when": {
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
                                  "2160",
                                  "2160p",
                                  "4k",
                                  "uhd"
                                ]
                              ]
                            },
                            "then": "4k"
                          },
                          {
                            "when": {
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
                            "then": null
                          }
                        ],
                        "default": {
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
                  },
                  "aspect_ratio": {
                    "$omitEmpty": {
                      "$switch": {
                        "cases": [
                          {
                            "when": {
                              "$not": {
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
                              }
                            },
                            "then": {
                              "$trim": {
                                "$ref": "request.aspectRatio"
                              }
                            }
                          },
                          {
                            "when": {
                              "$and": [
                                {
                                  "$eq": [
                                    {
                                      "$lower": {
                                        "$trim": {
                                          "$coalesce": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            ""
                                          ]
                                        }
                                      }
                                    },
                                    "kling-video-v3-omni"
                                  ]
                                },
                                {
                                  "$not": {
                                    "$gt": [
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
                                                "first_frame"
                                              ]
                                            }
                                          }
                                        }
                                      },
                                      0
                                    ]
                                  }
                                },
                                {
                                  "$not": {
                                    "$gt": [
                                      {
                                        "$len": {
                                          "$coalesce": [
                                            {
                                              "$ref": "request.videos"
                                            },
                                            []
                                          ]
                                        }
                                      },
                                      0
                                    ]
                                  }
                                }
                              ]
                            },
                            "then": "16:9"
                          }
                        ],
                        "default": null
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
                  },
                  "audio": {
                    "$omitEmpty": {
                      "$switch": {
                        "cases": [
                          {
                            "when": {
                              "$and": [
                                {
                                  "$eq": [
                                    {
                                      "$lower": {
                                        "$trim": {
                                          "$coalesce": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            ""
                                          ]
                                        }
                                      }
                                    },
                                    "kling-video-v3-omni"
                                  ]
                                },
                                {
                                  "$gt": [
                                    {
                                      "$len": {
                                        "$coalesce": [
                                          {
                                            "$ref": "request.videos"
                                          },
                                          []
                                        ]
                                      }
                                    },
                                    0
                                  ]
                                }
                              ]
                            },
                            "then": "off"
                          },
                          {
                            "when": {
                              "$and": [
                                {
                                  "$eq": [
                                    {
                                      "$lower": {
                                        "$trim": {
                                          "$coalesce": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            ""
                                          ]
                                        }
                                      }
                                    },
                                    "kling-video-v3-omni"
                                  ]
                                },
                                {
                                  "$gt": [
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
                                }
                              ]
                            },
                            "then": "native"
                          },
                          {
                            "when": {
                              "$or": [
                                {
                                  "$eq": [
                                    {
                                      "$lower": {
                                        "$trim": {
                                          "$coalesce": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            ""
                                          ]
                                        }
                                      }
                                    },
                                    "kling-video-v3-omni"
                                  ]
                                },
                                {
                                  "$and": [
                                    {
                                      "$in": [
                                        {
                                          "$lower": {
                                            "$trim": {
                                              "$coalesce": [
                                                {
                                                  "$ref": "request.model"
                                                },
                                                ""
                                              ]
                                            }
                                          }
                                        },
                                        [
                                          "kling-video-v3",
                                          "kling-video-v3-turbo"
                                        ]
                                      ]
                                    },
                                    {
                                      "$not": {
                                        "$eq": [
                                          {
                                            "$lower": {
                                              "$trim": {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.model"
                                                  },
                                                  ""
                                                ]
                                              }
                                            }
                                          },
                                          "kling-video-v3-turbo"
                                        ]
                                      }
                                    }
                                  ]
                                }
                              ]
                            },
                            "then": {
                              "$if": {
                                "condition": {
                                  "$toBool": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.generateAudio"
                                      },
                                      false
                                    ]
                                  }
                                },
                                "then": "native",
                                "else": "off"
                              }
                            }
                          }
                        ],
                        "default": null
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
