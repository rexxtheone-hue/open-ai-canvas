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
| `minimax-h3`（别名 `minimax_h3`） | 768p（默认）、1080p、2k | 4–15 秒 | 16:9、9:16、1:1、4:3、3:4、21:9 | 9 / 3 / 3 | 成片自带音轨，不发送 `generate_audio` |
| `kling-3.0-turbo` | 720p（默认）、1080p、2k、4k | 4–15 秒 | 16:9、9:16、1:1 | 30（含首尾帧）/ 10 / 0 | 支持 `generate_audio` |

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
| `images`（其他角色） | `images`，MiniMax H3 为 `metadata.referenceImages` | 参考图网址数组。H3 收到 2 张顶层图片会当成首尾帧，所以普通参考图必须放 metadata |
| `videos` | `metadata.referenceVideos`，Gemini/Veo 为顶层 `videos` | 参考视频网址数组 |
| `audios` | `metadata.referenceAudios` | 参考音频网址数组 |

## MiniMax H3 规则

发送前校验，不符合时不调用上游、不扣费：

- 参考视频放 `metadata.referenceVideos`（88API 确认支持）。
- 首尾帧不能和参考图、参考视频、参考音频一起用。
- 参考音频至少需要搭配一张参考图。
- 分辨率只支持 768p、1080p、2k。
- 不支持视频续写和视频编辑。

生成耗时：16:9、9:16 的文生或参考图请求，768P 约 2–3 分钟，1080P、2K 约 5–8 分钟；其他比例、只给首帧或高分辨率首尾帧可能需要 10–60 分钟。

## 可灵 Kling 规则

参考图放顶层 `images`，参考视频放 `metadata.referenceVideos`，首尾帧放 `metadata.firstFrame`、`metadata.lastFrame`，首尾帧可以和参考图一起提交。发送前校验：

- 不支持参考音频。
- 提示词必填，最长 2000 字符。
- 比例只支持 16:9、9:16、1:1。
- 分辨率只支持 720p、1080p、2k、4k。
- 不支持视频续写和视频编辑。

## 视频续写与视频编辑

按宿主传入的操作类型切换：

| 操作 | 发送 | 不发送 |
| --- | --- | --- |
| `extend`（视频续写） | `task: "extend"`，第一段视频放顶层 `video` | `duration`、`ratio`、`videos`、`metadata.referenceVideos`；Veo 不发 `resolution`，Gemini 只发 720p/1080p（其他档位回落 720p） |
| `inpaint`、`replace_element`、`style_transfer`、`camera_motion`（视频编辑） | `task: "edit"`，第一段视频放顶层 `video`，`resolution` 照常 | `duration`、`ratio`、`videos`、`metadata.referenceVideos` |

- `gemini-omni-flash-1.1` 续写每次新增约 10 秒，输入视频 1–30 秒，按新增秒数计费；输出为重新生成的完整视频。
- `veo-3.1` 续写每次新增 7 秒。
- 编辑保持原视频比例。

## Grok 与 Veo 规则

- `grok-imagine-video`、`grok-imagine-video-1.5` 只从顶层 `images` 读图片（最多 1 张，作为首帧），不读 `metadata.firstFrame`，所以首帧也放顶层 `images`，不再写 `metadata.firstFrame`。
- `veo-3.1`、`veo-3.1-fast` 收到 1–2 张普通图片时默认当首尾帧；有非首尾帧角色的参考图时发送 `metadata.video_mode: "reference"`。参考图模式固定 8 秒：1–2 张图且时长不是 8 秒时不发送 `video_mode`，88API 按首帧或首尾帧处理（4/6/8 秒）；3 张参考图且时长不是 8 秒时发送前拒绝。

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
  "version": "1.0.7",
  "author": "Rexx",
  "description": "88API 统一视频协议插件（POST /v1/videos，异步轮询），适配 SD2.5、SD2.0 云厂商版、MiniMax H3、可灵 Kling 与 Gemini Omni、Veo，支持视频续写与视频编辑。",
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
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$or": [
                      {
                        "$eq": [
                          {
                            "$ref": "request.operation"
                          },
                          "extend"
                        ]
                      },
                      {
                        "$in": [
                          {
                            "$ref": "request.operation"
                          },
                          [
                            "inpaint",
                            "replace_element",
                            "style_transfer",
                            "camera_motion",
                            "edit"
                          ]
                        ]
                      }
                    ]
                  }
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
            "message": "视频续写和局部修改需要先放入一段原视频（1–30 秒）。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$eq": [
                      {
                        "$ref": "request.operation"
                      },
                      "extend"
                    ]
                  }
                },
                {
                  "$eq": [
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
                    "gemini-omni-flash-1.1"
                  ]
                },
                {
                  "$eq": [
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
                    "veo"
                  ]
                }
              ]
            },
            "message": "该模型不支持视频续写，请改用 gemini-omni-flash-1.1 或 Veo。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$in": [
                      {
                        "$ref": "request.operation"
                      },
                      [
                        "inpaint",
                        "replace_element",
                        "style_transfer",
                        "camera_motion",
                        "edit"
                      ]
                    ]
                  }
                },
                {
                  "$eq": [
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
                    "gemini-omni-flash-1.1"
                  ]
                }
              ]
            },
            "message": "该模型不支持视频局部修改，请改用 gemini-omni-flash-1.1。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$or": [
                      {
                        "$eq": [
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
                          "minimax"
                        ]
                      },
                      {
                        "$eq": [
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
                          "minimax_h3"
                        ]
                      }
                    ]
                  }
                },
                {
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
                    0
                  ]
                },
                {
                  "$and": [
                    {
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
                          }
                        },
                        0
                      ]
                    },
                    {
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
                    {
                      "$eq": [
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
              ]
            },
            "message": "MiniMax H3 的首尾帧不能和参考图、参考视频、参考音频一起用，请只保留首尾帧两张图。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$or": [
                      {
                        "$eq": [
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
                          "minimax"
                        ]
                      },
                      {
                        "$eq": [
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
                          "minimax_h3"
                        ]
                      }
                    ]
                  }
                },
                {
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
                {
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
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "MiniMax H3 使用参考音频时，至少需要一张参考图。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$or": [
                      {
                        "$eq": [
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
                          "minimax"
                        ]
                      },
                      {
                        "$eq": [
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
                          "minimax_h3"
                        ]
                      }
                    ]
                  }
                },
                {
                  "$in": [
                    {
                      "$lower": {
                        "$coalesce": [
                          {
                            "$ref": "request.resolution"
                          },
                          {
                            "$ref": "request.providerOptions.api88-video.resolution"
                          },
                          ""
                        ]
                      }
                    },
                    [
                      "",
                      "768p",
                      "1080p",
                      "2k"
                    ]
                  ]
                }
              ]
            },
            "message": "MiniMax H3 只支持 768P、1080P、2K 分辨率。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$eq": [
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
                      "kling"
                    ]
                  }
                },
                {
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
                }
              ]
            },
            "message": "可灵 Kling 不支持参考音频，请移除音频。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$eq": [
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
                      "kling"
                    ]
                  }
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$coalesce": [
                          {
                            "$ref": "request.prompt"
                          },
                          ""
                        ]
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "可灵 Kling 必须填写提示词。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$eq": [
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
                      "kling"
                    ]
                  }
                },
                {
                  "$or": [
                    {
                      "$in": [
                        {
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
                        [
                          "16:9",
                          "9:16",
                          "1:1"
                        ]
                      ]
                    },
                    {
                      "$and": [
                        {
                          "$eq": [
                            {
                              "$at": [
                                {
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
                                },
                                1
                              ]
                            },
                            "4.0"
                          ]
                        },
                        {
                          "$eq": [
                            {
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
                            "21:9"
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "可灵 Kling 只支持 16:9、9:16、1:1 比例（Kling 4.0 另支持 21:9）。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$eq": [
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
                      "kling"
                    ]
                  }
                },
                {
                  "$in": [
                    {
                      "$lower": {
                        "$coalesce": [
                          {
                            "$ref": "request.resolution"
                          },
                          {
                            "$ref": "request.providerOptions.api88-video.resolution"
                          },
                          ""
                        ]
                      }
                    },
                    [
                      "",
                      "720p",
                      "1080p",
                      "2k",
                      "4k"
                    ]
                  ]
                }
              ]
            },
            "message": "可灵 Kling 只支持 720P、1080P、2K、4K 分辨率。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$and": [
                      {
                        "$eq": [
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
                          "veo"
                        ]
                      },
                      {
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
                            }
                          },
                          2
                        ]
                      }
                    ]
                  }
                },
                {
                  "$or": [
                    {
                      "$not": {
                        "$ref": "request.duration"
                      }
                    },
                    {
                      "$eq": [
                        {
                          "$ref": "request.duration"
                        },
                        8
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "Veo 用 3 张参考图时固定 8 秒，请把时长改成 8 秒，或减少到 1–2 张图。"
          }
        ],
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
            "mapping": "images / metadata.referenceImages / metadata.firstFrame / metadata.lastFrame",
            "description": "参考图；角色为首帧、尾帧的图片放入 metadata.firstFrame、metadata.lastFrame；MiniMax H3 的普通参考图放 metadata.referenceImages。"
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
            "description": "分辨率：480p、720p、768p、1080p、2k、4k，按模型支持选择。"
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
            "task": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.operation"
                      },
                      "extend"
                    ]
                  },
                  "then": "extend",
                  "else": {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$ref": "request.operation"
                          },
                          [
                            "inpaint",
                            "replace_element",
                            "style_transfer",
                            "camera_motion",
                            "edit"
                          ]
                        ]
                      },
                      "then": "edit",
                      "else": null
                    }
                  }
                }
              }
            },
            "video": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$or": [
                      {
                        "$eq": [
                          {
                            "$ref": "request.operation"
                          },
                          "extend"
                        ]
                      },
                      {
                        "$in": [
                          {
                            "$ref": "request.operation"
                          },
                          [
                            "inpaint",
                            "replace_element",
                            "style_transfer",
                            "camera_motion",
                            "edit"
                          ]
                        ]
                      }
                    ]
                  },
                  "then": {
                    "$first": {
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
                  "else": null
                }
              }
            },
            "duration": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$or": [
                      {
                        "$eq": [
                          {
                            "$ref": "request.operation"
                          },
                          "extend"
                        ]
                      },
                      {
                        "$in": [
                          {
                            "$ref": "request.operation"
                          },
                          [
                            "inpaint",
                            "replace_element",
                            "style_transfer",
                            "camera_motion",
                            "edit"
                          ]
                        ]
                      }
                    ]
                  },
                  "then": null,
                  "else": {
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
                  }
                }
              }
            },
            "ratio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$or": [
                      {
                        "$eq": [
                          {
                            "$ref": "request.operation"
                          },
                          "extend"
                        ]
                      },
                      {
                        "$in": [
                          {
                            "$ref": "request.operation"
                          },
                          [
                            "inpaint",
                            "replace_element",
                            "style_transfer",
                            "camera_motion",
                            "edit"
                          ]
                        ]
                      }
                    ]
                  },
                  "then": null,
                  "else": {
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
                  }
                }
              }
            },
            "resolution": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.operation"
                      },
                      "extend"
                    ]
                  },
                  "then": {
                    "$if": {
                      "condition": {
                        "$eq": [
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
                          "veo"
                        ]
                      },
                      "then": null,
                      "else": {
                        "$if": {
                          "condition": {
                            "$in": [
                              {
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
                              },
                              [
                                "720p",
                                "1080p"
                              ]
                            ]
                          },
                          "then": {
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
                          },
                          "else": "720p"
                        }
                      }
                    }
                  },
                  "else": {
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
                }
              }
            },
            "generate_audio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$and": [
                      {
                        "$ref": "request.generateAudio"
                      },
                      {
                        "$not": {
                          "$or": [
                            {
                              "$eq": [
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
                                "minimax"
                              ]
                            },
                            {
                              "$eq": [
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
                                "minimax_h3"
                              ]
                            }
                          ]
                        }
                      }
                    ]
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
                "$if": {
                  "condition": {
                    "$eq": [
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
                      "grok"
                    ]
                  },
                  "then": {
                    "$map": {
                      "from": {
                        "$ref": "request.images"
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
                  "else": {
                    "$if": {
                      "condition": {
                        "$or": [
                          {
                            "$eq": [
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
                              "minimax"
                            ]
                          },
                          {
                            "$eq": [
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
                              "minimax_h3"
                            ]
                          }
                        ]
                      },
                      "then": null,
                      "else": {
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
                    }
                  }
                }
              }
            },
            "videos": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$or": [
                      {
                        "$eq": [
                          {
                            "$ref": "request.operation"
                          },
                          "extend"
                        ]
                      },
                      {
                        "$in": [
                          {
                            "$ref": "request.operation"
                          },
                          [
                            "inpaint",
                            "replace_element",
                            "style_transfer",
                            "camera_motion",
                            "edit"
                          ]
                        ]
                      }
                    ]
                  },
                  "then": null,
                  "else": {
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
                }
              }
            },
            "metadata": {
              "$omitEmpty": {
                "firstFrame": {
                  "$if": {
                    "condition": {
                      "$eq": [
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
                        "grok"
                      ]
                    },
                    "then": null,
                    "else": {
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
                "referenceImages": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$or": [
                          {
                            "$eq": [
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
                              "minimax"
                            ]
                          },
                          {
                            "$eq": [
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
                              "minimax_h3"
                            ]
                          }
                        ]
                      },
                      "then": {
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
                      },
                      "else": null
                    }
                  }
                },
                "referenceVideos": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$or": [
                          {
                            "$eq": [
                              {
                                "$ref": "request.operation"
                              },
                              "extend"
                            ]
                          },
                          {
                            "$in": [
                              {
                                "$ref": "request.operation"
                              },
                              [
                                "inpaint",
                                "replace_element",
                                "style_transfer",
                                "camera_motion",
                                "edit"
                              ]
                            ]
                          }
                        ]
                      },
                      "then": null,
                      "else": {
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
                },
                "video_mode": {
                  "$if": {
                    "condition": {
                      "$and": [
                        {
                          "$eq": [
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
                            "veo"
                          ]
                        },
                        {
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
                              }
                            },
                            0
                          ]
                        },
                        {
                          "$or": [
                            {
                              "$or": [
                                {
                                  "$not": {
                                    "$ref": "request.duration"
                                  }
                                },
                                {
                                  "$eq": [
                                    {
                                      "$ref": "request.duration"
                                    },
                                    8
                                  ]
                                }
                              ]
                            },
                            {
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
                                  }
                                },
                                2
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    "then": "reference",
                    "else": null
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
