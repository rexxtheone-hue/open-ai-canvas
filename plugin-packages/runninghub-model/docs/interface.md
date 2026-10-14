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

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | 提示词，0–20000 字 |
| `aspectRatio` | `aspectRatio` | 1:1、2:3、3:2、3:4、4:3、9:16、16:9、21:9 |
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

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "runninghub-model",
  "name": "RunningHub 标准模型 API",
  "version": "1.0.1",
  "author": "Rexx",
  "description": "RunningHub 标准模型 API 视频协议插件（异步任务），首个适配 MiniMax H3 RH Enhanced 多参考生视频。",
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
                    "$ref": "request.aspectRatio"
                  },
                  {
                    "$ref": "request.providerOptions.runninghub-model.aspectRatio"
                  }
                ]
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
                "$coalesce": [
                  {
                    "$ref": "request.duration"
                  },
                  {
                    "$ref": "request.providerOptions.runninghub-model.duration"
                  },
                  5
                ]
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
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
