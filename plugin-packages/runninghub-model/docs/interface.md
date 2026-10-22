# RunningHub 标准模型 API 接口字段

## 协议身份

- 插件 ID：`runninghub-model`。
- Provider ID：`runninghub-model`。
- 能力：`video`。
- 默认 Base URL：`https://www.runninghub.cn`（海外站可改为 `https://www.runninghub.ai`）。
- 鉴权驱动：`bearer`（`Authorization: Bearer <API Key>`）。
- 创建：`POST /openapi/v2/{model}`。
- 查询：`POST /openapi/v2/query`，请求体 `{"taskId": "..."}`。
- 两个请求都使用 `originPath`：路径从 Base URL 的域名根开始拼接，渠道 Base URL 只填域名，宿主不会补 `/v1`。

## 已适配模型

| 上游模型 ID | 说明 |
| --- | --- |
| `rhart-video/minimax-h3-rh-enhanced/ref2va` | MiniMax H3 RH Enhanced 多参考生视频：最多 9 张参考图、3 段参考视频、驱动音频与音色参考 |
| `alibaba/wan-3.0/reference-to-video`、`alibaba/wan-3.0-prime/reference-to-video` | 万相 3.0 参考生视频（另一个 Provider，见下文） |

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | 提示词，0–20000 字 |
| `aspectRatio` | `aspectRatio`、`ratio` | 1:1、3:4、4:3、9:16、16:9、21:9。有参考素材时发送 `aspectRatio`，留空表示跟随参考。纯文本（无参考图和参考视频）时 RunningHub 转入 t2va 流程，只认 `ratio` 且不接受自适应，因此同时发送 `ratio`；未指定或为 auto/adaptive 时默认 16:9 |
| `resolution` | `resolution` | 480p、768p、1080p，默认 768p |
| `duration` | `duration` | 4–15 秒，默认 5 |
| `images[0..8]` | `refImage1`–`refImage9` | 按顺序填入 |
| `videos[0..2]` | `refVideo1`–`refVideo3` | 按顺序填入 |
| `audios` | `driveAudio`、`refAudio1`–`refAudio3` | `audioMode` 为 `lock_source` 或 `remix_source` 时，第一段音频作为驱动音频，其余作为音色参考；否则全部作为音色参考 |

## Provider 扩展键

- `providerOptions.runninghub-model.audioMode`：`native`（默认）、`lock_source`、`remix_source`、`reference_only`。
- `providerOptions.runninghub-model.driveAudio`：直接指定驱动音频 URL。
- `providerOptions.runninghub-model.refVideoAudio1`、`refVideoAudio2`：参考视频伴音 URL。
- `providerOptions.runninghub-model.aspectRatio`、`resolution`、`duration`：未从界面传入时的默认值。

## 结果解析

- 状态：`QUEUED`、`RUNNING`、`SUCCESS`、`FAILED`。`status` 为空但 `errorCode` 非空时按失败处理。
- 视频：`results[]` 中 `outputType` 为 mp4、mov、webm、mkv、avi 的 `url`。链接 24 小时后失效，标记为临时结果由宿主转存。
- 错误：`errorCode`、`errorMessage`。

## 万相 3.0 参考生视频（Provider `runninghub-wan`）

- 创建：`POST /openapi/v2/{model}`，`model` 为 `alibaba/wan-3.0/reference-to-video` 或 `alibaba/wan-3.0-prime/reference-to-video`（高速版）。
- 查询与结果解析与 MiniMax H3 相同。
- 参考素材以公网网址发送（`requiresPublicMediaUrls`）。

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | 必填，可用「视频1 / 图1 / 音频1」按上传顺序指代参考素材 |
| `images` | `imageUrls` | 最多 10 张，不支持首尾帧角色 |
| `videos` | `videoUrls` | 最多 5 段，单段 1–15 秒且总时长不超过 15 秒 |
| `audios` | `audioUrls` | 最多 5 段，单段 1–15 秒且总时长不超过 15 秒 |
| `resolution` | `resolution` | 480P、720P、1080P，大写发送，默认 1080P |
| `aspectRatio` | `aspectRatio` | adaptive、16:9、4:3、1:1、3:4、9:16；未指定或自适应时发送 adaptive |
| `duration` | `duration` | 2–30 秒，以字符串发送；未指定时为 "5"；有参考视频时输入与输出总时长不超过 30 秒 |
| `generateAudio` | `audio` | 布尔值，有声与无声同价 |

扩展键：`providerOptions.runninghub-wan.seed`、`duration`（可填 `auto` 智能时长）、`aspectRatio`、`resolution`。



## RunningHub 视频超分（Provider `runninghub-upscale`）

- 模型 ID 填 `rhart-video/rh-upscale/enhance-frame`。
- 请求体：`fileUrl`（第一段参考视频）、`model`（增强档位，默认 `max`，可用 `providerOptions.runninghub-upscale.tier` 改为 high / medium / low）、`resolution`、`outputFps`。
- 分辨率和帧率读取 Studio 专项工具选项 `extra.specialtyOptions`：分辨率 720 / 1080 / 1440 / 2160 对应 `720p` / `1080p` / `2k` / `4k`，默认 `1080p`；帧率 30 / 60 / 120 原样发送，未选时为 `1x`（不插帧）。
- 查询与结果解析与 `runninghub-model` 相同：`POST /openapi/v2/query`，结果在 `results[].url`（24 小时有效）。
- 官方价格按秒计：max ¥0.08、high ¥0.07、medium ¥0.06、low ¥0.05，与分辨率无关。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "runninghub-model",
  "name": "RunningHub 标准模型 API",
  "version": "1.0.7",
  "author": "Rexx",
  "description": "RunningHub 标准模型 API 视频协议插件（异步任务），适配 MiniMax H3 RH Enhanced 多参考生视频与万相 3.0 参考生视频。",
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
        "description": "RunningHub 企业级-共享 API Key。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "runninghub-model",
        "label": "RunningHub 标准模型 API",
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
        "baseUrl": "https://www.runninghub.cn",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": false,
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
            "message": "该模型不支持首尾帧，请改用全能参考，或换一个支持首尾帧的模型。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "endpoint path",
            "description": "RunningHub 标准模型接口路径（/openapi/v2/ 之后的部分），例如 rhart-video/minimax-h3-rh-enhanced/ref2va。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "prompt",
            "description": "视频提示词，最长 20000 字。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "refImage1-9",
            "description": "参考图，按顺序填入 refImage1 到 refImage9。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "refVideo1-3",
            "description": "参考视频，按顺序填入 refVideo1 到 refVideo3。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "driveAudio/refAudio1-3",
            "description": "音频。audioMode 为 lock_source 或 remix_source 时第一段作为驱动音频，其余作为音色参考。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长秒数，4 到 15。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspectRatio",
            "description": "画面比例：1:1、2:3、3:2、3:4、4:3、9:16、16:9、21:9。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率：480p、768p、1080p。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "扩展字段：audioMode、driveAudio、refVideoAudio1、refVideoAudio2。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/openapi/v2/{{model}}",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "prompt": {
              "$omitEmpty": {
                "$ref": "request.prompt"
              }
            },
            "aspectRatio": {
              "$omitEmpty": {
                "$coalesce": [
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
                        "$ref": "request.providerOptions.runninghub-model.aspectRatio"
                      },
                      "else": {
                        "$ref": "request.aspectRatio"
                      }
                    }
                  },
                  {
                    "$if": {
                      "condition": {
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
                          }
                        ]
                      },
                      "then": null,
                      "else": "16:9"
                    }
                  }
                ]
              }
            },
            "ratio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
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
                      }
                    ]
                  },
                  "then": null,
                  "else": {
                    "$coalesce": [
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
                            "$ref": "request.providerOptions.runninghub-model.aspectRatio"
                          },
                          "else": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      },
                      "16:9"
                    ]
                  }
                }
              }
            },
            "resolution": {
              "$lower": {
                "$coalesce": [
                  {
                    "$ref": "request.resolution"
                  },
                  {
                    "$ref": "request.providerOptions.runninghub-model.resolution"
                  },
                  "768p"
                ]
              }
            },
            "duration": {
              "$toFloat": {
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
                        "$ref": "request.providerOptions.runninghub-model.duration"
                      },
                      5
                    ]
                  }
                }
              }
            },
            "audioMode": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.runninghub-model.audioMode"
                },
                "native"
              ]
            },
            "driveAudio": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.runninghub-model.driveAudio"
                  },
                  {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$coalesce": [
                              {
                                "$ref": "request.providerOptions.runninghub-model.audioMode"
                              },
                              "native"
                            ]
                          },
                          [
                            "lock_source",
                            "remix_source"
                          ]
                        ]
                      },
                      "then": {
                        "$at": [
                          {
                            "$map": {
                              "from": {
                                "$ref": "request.audios"
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
                          },
                          0
                        ]
                      },
                      "else": null
                    }
                  }
                ]
              }
            },
            "refImage1": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  0
                ]
              }
            },
            "refImage2": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  1
                ]
              }
            },
            "refImage3": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  2
                ]
              }
            },
            "refImage4": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  3
                ]
              }
            },
            "refImage5": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  4
                ]
              }
            },
            "refImage6": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  5
                ]
              }
            },
            "refImage7": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  6
                ]
              }
            },
            "refImage8": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  7
                ]
              }
            },
            "refImage9": {
              "$omitEmpty": {
                "$at": [
                  {
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
                  },
                  8
                ]
              }
            },
            "refVideo1": {
              "$omitEmpty": {
                "$at": [
                  {
                    "$map": {
                      "from": {
                        "$ref": "request.videos"
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
                  },
                  0
                ]
              }
            },
            "refVideo2": {
              "$omitEmpty": {
                "$at": [
                  {
                    "$map": {
                      "from": {
                        "$ref": "request.videos"
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
                  },
                  1
                ]
              }
            },
            "refVideo3": {
              "$omitEmpty": {
                "$at": [
                  {
                    "$map": {
                      "from": {
                        "$ref": "request.videos"
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
                  },
                  2
                ]
              }
            },
            "refAudio1": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "request.providerOptions.runninghub-model.audioMode"
                          },
                          "native"
                        ]
                      },
                      [
                        "lock_source",
                        "remix_source"
                      ]
                    ]
                  },
                  "then": {
                    "$at": [
                      {
                        "$map": {
                          "from": {
                            "$ref": "request.audios"
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
                      },
                      1
                    ]
                  },
                  "else": {
                    "$at": [
                      {
                        "$map": {
                          "from": {
                            "$ref": "request.audios"
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
                      },
                      0
                    ]
                  }
                }
              }
            },
            "refAudio2": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "request.providerOptions.runninghub-model.audioMode"
                          },
                          "native"
                        ]
                      },
                      [
                        "lock_source",
                        "remix_source"
                      ]
                    ]
                  },
                  "then": {
                    "$at": [
                      {
                        "$map": {
                          "from": {
                            "$ref": "request.audios"
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
                      },
                      2
                    ]
                  },
                  "else": {
                    "$at": [
                      {
                        "$map": {
                          "from": {
                            "$ref": "request.audios"
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
                      },
                      1
                    ]
                  }
                }
              }
            },
            "refAudio3": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "request.providerOptions.runninghub-model.audioMode"
                          },
                          "native"
                        ]
                      },
                      [
                        "lock_source",
                        "remix_source"
                      ]
                    ]
                  },
                  "then": {
                    "$at": [
                      {
                        "$map": {
                          "from": {
                            "$ref": "request.audios"
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
                      },
                      3
                    ]
                  },
                  "else": {
                    "$at": [
                      {
                        "$map": {
                          "from": {
                            "$ref": "request.audios"
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
                      },
                      2
                    ]
                  }
                }
              }
            },
            "refVideoAudio1": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.runninghub-model.refVideoAudio1"
              }
            },
            "refVideoAudio2": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.runninghub-model.refVideoAudio2"
              }
            }
          }
        },
        "poll": {
          "method": "POST",
          "path": "/openapi/v2/query",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "taskId": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.taskId"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "response.status"
                            },
                            ""
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
                              "$ref": "response.errorCode"
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
              "then": "FAILED",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.status"
                  },
                  "QUEUED"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.errorMessage"
              },
              {
                "$ref": "response.msg"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$filter": {
              "from": {
                "$ref": "response.results"
              },
              "as": "item",
              "where": {
                "$in": [
                  {
                    "$lower": {
                      "$coalesce": [
                        {
                          "$ref": "item.outputType"
                        },
                        "mp4"
                      ]
                    }
                  },
                  [
                    "mp4",
                    "mov",
                    "webm",
                    "mkv",
                    "avi"
                  ]
                ]
              }
            }
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "errorCode",
            "code"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "errorMessage",
            "msg",
            "message"
          ]
        }
      },
      {
        "id": "runninghub-wan",
        "label": "RunningHub 万相 3.0 参考生视频",
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
        "baseUrl": "https://www.runninghub.cn",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": true,
        "validations": [
          {
            "assert": {
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
            },
            "message": "万相 3.0 必须填写提示词。"
          },
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
            "message": "万相 3.0 参考生视频不支持视频续写或局部修改。"
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
            "message": "万相 3.0 参考生视频不支持首尾帧，请改用全能参考。"
          },
          {
            "assert": {
              "$lte": [
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
                10
              ]
            },
            "message": "万相 3.0 最多 10 张参考图。"
          },
          {
            "assert": {
              "$lte": [
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
                5
              ]
            },
            "message": "万相 3.0 最多 5 段参考视频，总时长不超过 15 秒。"
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
                5
              ]
            },
            "message": "万相 3.0 最多 5 段参考音频，总时长不超过 15 秒。"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.duration"
                    },
                    0
                  ]
                },
                30
              ]
            },
            "message": "万相 3.0 输出时长最长 30 秒。"
          },
          {
            "assert": {
              "$in": [
                {
                  "$upper": {
                    "$coalesce": [
                      {
                        "$ref": "request.resolution"
                      },
                      {
                        "$ref": "request.providerOptions.runninghub-wan.resolution"
                      },
                      "1080P"
                    ]
                  }
                },
                [
                  "480P",
                  "720P",
                  "1080P"
                ]
              ]
            },
            "message": "万相 3.0 只支持 480P、720P、1080P 分辨率。"
          },
          {
            "assert": {
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
                          "$ref": "request.providerOptions.runninghub-wan.aspectRatio"
                        },
                        "adaptive"
                      ]
                    },
                    "else": {
                      "$ref": "request.aspectRatio"
                    }
                  }
                },
                [
                  "adaptive",
                  "16:9",
                  "4:3",
                  "1:1",
                  "3:4",
                  "9:16"
                ]
              ]
            },
            "message": "万相 3.0 只支持自适应、16:9、4:3、1:1、3:4、9:16 比例。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "endpoint path",
            "description": "接口路径（/openapi/v2/ 之后的部分）：alibaba/wan-3.0/reference-to-video 或 alibaba/wan-3.0-prime/reference-to-video。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词，可用「视频1 / 图1 / 音频1」按上传顺序指代参考素材。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "imageUrls",
            "description": "参考图，最多 10 张。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "videoUrls",
            "description": "参考视频，最多 5 段，单段 1–15 秒且总时长不超过 15 秒。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audioUrls",
            "description": "参考音频，最多 5 段，单段 1–15 秒且总时长不超过 15 秒。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "输出时长 2–30 秒，以字符串发送；有参考视频时输入与输出总时长不超过 30 秒。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspectRatio",
            "description": "比例：adaptive、16:9、4:3、1:1、3:4、9:16。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率：480P、720P、1080P，默认 1080P。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "audio",
            "description": "是否有声，有声与无声同价。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "扩展字段：seed、duration（可填 auto 智能时长）、aspectRatio、resolution。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/openapi/v2/{{model}}",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "prompt": {
              "$ref": "request.prompt"
            },
            "imageUrls": {
              "$omitEmpty": {
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
              }
            },
            "videoUrls": {
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
            "audioUrls": {
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
            "resolution": {
              "$upper": {
                "$coalesce": [
                  {
                    "$ref": "request.resolution"
                  },
                  {
                    "$ref": "request.providerOptions.runninghub-wan.resolution"
                  },
                  "1080P"
                ]
              }
            },
            "aspectRatio": {
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
                      "$ref": "request.providerOptions.runninghub-wan.aspectRatio"
                    },
                    "adaptive"
                  ]
                },
                "else": {
                  "$ref": "request.aspectRatio"
                }
              }
            },
            "duration": {
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
                  "$toString": {
                    "$toInt": {
                      "$ref": "request.duration"
                    }
                  }
                },
                "else": {
                  "$toString": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.runninghub-wan.duration"
                      },
                      "5"
                    ]
                  }
                }
              }
            },
            "audio": {
              "$toBool": {
                "$coalesce": [
                  {
                    "$ref": "request.generateAudio"
                  },
                  false
                ]
              }
            },
            "seed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.runninghub-wan.seed"
              }
            }
          }
        },
        "poll": {
          "method": "POST",
          "path": "/openapi/v2/query",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "taskId": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.taskId"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "response.status"
                            },
                            ""
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
                              "$ref": "response.errorCode"
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
              "then": "FAILED",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.status"
                  },
                  "QUEUED"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.errorMessage"
              },
              {
                "$ref": "response.msg"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$filter": {
              "from": {
                "$ref": "response.results"
              },
              "as": "item",
              "where": {
                "$in": [
                  {
                    "$lower": {
                      "$coalesce": [
                        {
                          "$ref": "item.outputType"
                        },
                        "mp4"
                      ]
                    }
                  },
                  [
                    "mp4",
                    "mov",
                    "webm",
                    "mkv",
                    "avi"
                  ]
                ]
              }
            }
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "errorCode",
            "code"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "errorMessage",
            "msg",
            "message"
          ]
        }
      },
      {
        "id": "runninghub-upscale",
        "label": "RunningHub 视频超分",
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
        "baseUrl": "https://www.runninghub.cn",
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
            "mapping": "path",
            "description": "上游接口：rhart-video/rh-upscale/enhance-frame。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": true,
            "mapping": "fileUrl",
            "description": "要超分的视频，1 段，100MB 以内。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "model",
            "description": "providerOptions.runninghub-upscale.tier 选增强档位 max / high / medium / low，默认 max。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                1
              ]
            },
            "message": "视频超分需要 1 段视频"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/openapi/v2/{{model}}",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "fileUrl": {
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
            "model": {
              "$coalesce": [
                {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.runninghub-upscale.tier"
                  }
                },
                "max"
              ]
            },
            "resolution": {
              "$switch": {
                "cases": [
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.resolution"
                              }
                            },
                            ""
                          ]
                        },
                        "720"
                      ]
                    },
                    "then": "720p"
                  },
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.resolution"
                              }
                            },
                            ""
                          ]
                        },
                        "1080"
                      ]
                    },
                    "then": "1080p"
                  },
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.resolution"
                              }
                            },
                            ""
                          ]
                        },
                        "1440"
                      ]
                    },
                    "then": "2k"
                  },
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.resolution"
                              }
                            },
                            ""
                          ]
                        },
                        "2160"
                      ]
                    },
                    "then": "4k"
                  }
                ],
                "default": "1080p"
              }
            },
            "outputFps": {
              "$switch": {
                "cases": [
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.fps"
                              }
                            },
                            ""
                          ]
                        },
                        "30"
                      ]
                    },
                    "then": "30"
                  },
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.fps"
                              }
                            },
                            ""
                          ]
                        },
                        "60"
                      ]
                    },
                    "then": "60"
                  },
                  {
                    "when": {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.extra.specialtyOptions.fps"
                              }
                            },
                            ""
                          ]
                        },
                        "120"
                      ]
                    },
                    "then": "120"
                  }
                ],
                "default": "1x"
              }
            }
          }
        },
        "poll": {
          "method": "POST",
          "path": "/openapi/v2/query",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "taskId": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.taskId"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "response.status"
                            },
                            ""
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
                              "$ref": "response.errorCode"
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
              "then": "FAILED",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.status"
                  },
                  "QUEUED"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.errorMessage"
              },
              {
                "$ref": "response.msg"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$filter": {
              "from": {
                "$ref": "response.results"
              },
              "as": "item",
              "where": {
                "$in": [
                  {
                    "$lower": {
                      "$coalesce": [
                        {
                          "$ref": "item.outputType"
                        },
                        "mp4"
                      ]
                    }
                  },
                  [
                    "mp4",
                    "mov",
                    "webm",
                    "mkv",
                    "avi"
                  ]
                ]
              }
            }
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "errorCode",
            "code"
          ],
          "resultEphemeral": true,
          "messagePaths": [
            "errorMessage",
            "msg",
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
