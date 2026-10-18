# UCloud ModelVerse MiniMax 接口说明

## 渠道配置

- Base URL：`https://api.modelverse.cn`（填 `https://api.modelverse.cn/v1` 也可以，插件使用根路径）
- API Key：ModelVerse 控制台生成的 Key，以 `Authorization: Bearer <API Key>` 发送。
- 支持模型：MiniMax-H3、MiniMax-H3-Max、minimax-h3-lite、MiniMax-Hailuo-2.3、MiniMax-Hailuo-2.3-Fast、MiniMax-Hailuo-02。

## 提交任务

`POST /v1/tasks/submit`

```json
{"model": "<模型名>", "input": {...}, "parameters": {...}}
```

- `MiniMax-H3*`：`input.content` 与方舟同构（text + image_url / video_url / audio_url，role 原样传递；无 role 的单张图按首帧处理），`MiniMax-H3-Max` 只发送图片。分辨率 1080p 及以上→`2K`，其余→`768P`（H3-Max 为 `768P` / `480P`）。未选比例时有图发 `adaptive`、无图发 `16:9`，时长默认 5 秒。
- `MiniMax-Hailuo-*`：`prompt` + `first_frame_image`（Hailuo-02 另有 `last_frame_image`），分辨率 1080p→`1080P`，其余→`768P`。
- `prompt_optimizer`、`fast_pretreatment` 等可通过 `providerOptions.modelverse-minimax-video.parameters` 传入。

空值字段不会发送。`providerOptions.modelverse-minimax-video.input` / `.parameters` 会合并进 `input` / `parameters`，用于补充模型特有字段或覆盖默认值。

响应：`{"output": {"task_id": "..."}, "request_id": "..."}`。

## 查询任务

`GET /v1/tasks/status?task_id=<task_id>`

`output.task_status` 为 `Pending` / `Running` / `Success` / `Failure`（部分型号返回 `PENDING` / `RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELLED`）。成功时视频链接在 `output.urls`，失败原因在 `output.error_message` 或 `output.message`。结果链接是临时链接，宿主会转存。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "ucloud-modelverse-minimax",
  "name": "UCloud ModelVerse MiniMax",
  "version": "1.0.0",
  "author": "UCloud ModelVerse / 影策",
  "description": "UCloud ModelVerse（AstraFlow）异步任务接口上的 MiniMax 视频生成协议插件。",
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
        "id": "modelverse-minimax-video",
        "label": "UCloud ModelVerse MiniMax",
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
            "description": "ModelVerse 模型名：MiniMax-H3、MiniMax-H3-Max、minimax-h3-lite、MiniMax-Hailuo-2.3、MiniMax-Hailuo-2.3-Fast、MiniMax-Hailuo-02。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "input / parameters",
            "description": "首帧、尾帧（role first_frame / last_frame）与参考图（reference_image）。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "input / parameters",
            "description": "参考视频或待编辑视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "input",
            "description": "参考音频或驱动音频。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "parameters",
            "description": "画面比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "parameters",
            "description": "分辨率档位。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "parameters.duration",
            "description": "时长（秒）。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "parameters",
            "description": "是否生成音频。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "input / parameters",
            "description": "providerOptions.modelverse-minimax-video.input 与 .parameters 会合并进对应对象，可补充或覆盖字段。"
          }
        ],
        "validations": [],
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
              "$merge": [
                {
                  "content": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$in": [
                            {
                              "$lower": {
                                "$ref": "request.model"
                              }
                            },
                            [
                              "minimax-h3",
                              "minimax-h3-max",
                              "minimax-h3-lite"
                            ]
                          ]
                        },
                        "then": {
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
                                    "$omitEmpty": {
                                      "$ref": "media.role"
                                    }
                                  }
                                }
                              }
                            },
                            {
                              "$if": {
                                "condition": {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "minimax-h3-max"
                                    ]
                                  ]
                                },
                                "then": [],
                                "else": {
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
                                        "$omitEmpty": {
                                          "$coalesce": [
                                            {
                                              "$ref": "media.role"
                                            },
                                            "reference_video"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            {
                              "$if": {
                                "condition": {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "minimax-h3-max"
                                    ]
                                  ]
                                },
                                "then": [],
                                "else": {
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
                                        "$omitEmpty": {
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
                                }
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "prompt": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$not": {
                            "$in": [
                              {
                                "$lower": {
                                  "$ref": "request.model"
                                }
                              },
                              [
                                "minimax-h3",
                                "minimax-h3-max",
                                "minimax-h3-lite"
                              ]
                            ]
                          }
                        },
                        "then": {
                          "$ref": "request.prompt"
                        },
                        "else": null
                      }
                    }
                  },
                  "first_frame_image": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$not": {
                            "$in": [
                              {
                                "$lower": {
                                  "$ref": "request.model"
                                }
                              },
                              [
                                "minimax-h3",
                                "minimax-h3-max",
                                "minimax-h3-lite"
                              ]
                            ]
                          }
                        },
                        "then": {
                          "$coalesce": [
                            {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$sortByOrder": {
                                          "$ref": "request.images"
                                        }
                                      },
                                      "as": "media",
                                      "where": {
                                        "$in": [
                                          {
                                            "$ref": "media.role"
                                          },
                                          [
                                            "first_frame"
                                          ]
                                        ]
                                      }
                                    }
                                  },
                                  "as": "media",
                                  "in": {
                                    "$ref": "media.value"
                                  }
                                }
                              }
                            },
                            {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$sortByOrder": {
                                          "$ref": "request.images"
                                        }
                                      },
                                      "as": "media",
                                      "where": {
                                        "$in": [
                                          {
                                            "$ref": "media.role"
                                          },
                                          [
                                            ""
                                          ]
                                        ]
                                      }
                                    }
                                  },
                                  "as": "media",
                                  "in": {
                                    "$ref": "media.value"
                                  }
                                }
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "last_frame_image": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$and": [
                            {
                              "$in": [
                                {
                                  "$lower": {
                                    "$ref": "request.model"
                                  }
                                },
                                [
                                  "minimax-hailuo-02"
                                ]
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$first": {
                                    "$map": {
                                      "from": {
                                        "$filter": {
                                          "from": {
                                            "$sortByOrder": {
                                              "$ref": "request.images"
                                            }
                                          },
                                          "as": "media",
                                          "where": {
                                            "$in": [
                                              {
                                                "$ref": "media.role"
                                              },
                                              [
                                                "first_frame"
                                              ]
                                            ]
                                          }
                                        }
                                      },
                                      "as": "media",
                                      "in": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                },
                                {
                                  "$first": {
                                    "$map": {
                                      "from": {
                                        "$filter": {
                                          "from": {
                                            "$sortByOrder": {
                                              "$ref": "request.images"
                                            }
                                          },
                                          "as": "media",
                                          "where": {
                                            "$in": [
                                              {
                                                "$ref": "media.role"
                                              },
                                              [
                                                ""
                                              ]
                                            ]
                                          }
                                        }
                                      },
                                      "as": "media",
                                      "in": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$coalesce": [
                            {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$sortByOrder": {
                                          "$ref": "request.images"
                                        }
                                      },
                                      "as": "media",
                                      "where": {
                                        "$in": [
                                          {
                                            "$ref": "media.role"
                                          },
                                          [
                                            "last_frame",
                                            "end_frame",
                                            "tail_frame"
                                          ]
                                        ]
                                      }
                                    }
                                  },
                                  "as": "media",
                                  "in": {
                                    "$ref": "media.value"
                                  }
                                }
                              }
                            },
                            {
                              "$if": {
                                "condition": {
                                  "$gt": [
                                    {
                                      "$len": {
                                        "$filter": {
                                          "from": {
                                            "$sortByOrder": {
                                              "$ref": "request.images"
                                            }
                                          },
                                          "as": "media",
                                          "where": {
                                            "$in": [
                                              {
                                                "$ref": "media.role"
                                              },
                                              [
                                                ""
                                              ]
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    1
                                  ]
                                },
                                "then": {
                                  "$last": {
                                    "$map": {
                                      "from": {
                                        "$filter": {
                                          "from": {
                                            "$sortByOrder": {
                                              "$ref": "request.images"
                                            }
                                          },
                                          "as": "media",
                                          "where": {
                                            "$in": [
                                              {
                                                "$ref": "media.role"
                                              },
                                              [
                                                ""
                                              ]
                                            ]
                                          }
                                        }
                                      },
                                      "as": "media",
                                      "in": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                },
                                "else": null
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  }
                },
                {
                  "$ref": "request.providerOptions.modelverse-minimax-video.input"
                }
              ]
            },
            "parameters": {
              "$merge": [
                {
                  "resolution": {
                    "$switch": {
                      "cases": [
                        {
                          "when": {
                            "$in": [
                              {
                                "$lower": {
                                  "$ref": "request.model"
                                }
                              },
                              [
                                "minimax-h3-max"
                              ]
                            ]
                          },
                          "then": {
                            "$if": {
                              "condition": {
                                "$eq": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  "480p"
                                ]
                              },
                              "then": "480P",
                              "else": "768P"
                            }
                          }
                        },
                        {
                          "when": {
                            "$in": [
                              {
                                "$lower": {
                                  "$ref": "request.model"
                                }
                              },
                              [
                                "minimax-h3",
                                "minimax-h3-max",
                                "minimax-h3-lite"
                              ]
                            ]
                          },
                          "then": {
                            "$if": {
                              "condition": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  [
                                    "1080p",
                                    "2k",
                                    "1440p",
                                    "4k",
                                    "2160p"
                                  ]
                                ]
                              },
                              "then": "2K",
                              "else": "768P"
                            }
                          }
                        }
                      ],
                      "default": {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$ref": "request.resolution"
                                }
                              },
                              "1080p"
                            ]
                          },
                          "then": "1080P",
                          "else": "768P"
                        }
                      }
                    }
                  },
                  "duration": {
                    "$coalesce": [
                      {
                        "$omitEmpty": {
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
                            "else": null
                          }
                        }
                      },
                      {
                        "$if": {
                          "condition": {
                            "$in": [
                              {
                                "$lower": {
                                  "$ref": "request.model"
                                }
                              },
                              [
                                "minimax-h3",
                                "minimax-h3-max",
                                "minimax-h3-lite"
                              ]
                            ]
                          },
                          "then": 5,
                          "else": null
                        }
                      }
                    ]
                  },
                  "ratio": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$in": [
                            {
                              "$lower": {
                                "$ref": "request.model"
                              }
                            },
                            [
                              "minimax-h3",
                              "minimax-h3-max",
                              "minimax-h3-lite"
                            ]
                          ]
                        },
                        "then": {
                          "$coalesce": [
                            {
                              "$ref": "request.aspectRatio"
                            },
                            {
                              "$if": {
                                "condition": {
                                  "$gt": [
                                    {
                                      "$len": {
                                        "$ref": "request.images"
                                      }
                                    },
                                    0
                                  ]
                                },
                                "then": "adaptive",
                                "else": "16:9"
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "aigc_watermark": {
                    "$toBool": {
                      "$ref": "request.watermark"
                    }
                  }
                },
                {
                  "$ref": "request.providerOptions.modelverse-minimax-video.parameters"
                }
              ]
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
