# UCloud ModelVerse Kling 接口说明

## 渠道配置

- Base URL：`https://api.modelverse.cn`（填 `https://api.modelverse.cn/v1` 也可以，插件使用根路径）
- API Key：ModelVerse 控制台生成的 Key，以 `Authorization: Bearer <API Key>` 发送。
- 支持模型：kling-v3、kling-v3-omni、kling-video-o1、kling-v2-6。

## 提交任务

`POST /v1/tasks/submit`

```json
{"model": "<模型名>", "input": {...}, "parameters": {...}}
```

- `kling-v3`：有参考视频时走运动控制（`img_url` + `video_url`，`character_orientation` 默认 `image`）；有首帧走 `i2v`（`image` / `image_tail`）；否则 `t2v`。
- `kling-v3-omni` / `kling-video-o1`：首尾帧和参考图进入 `image_list`，参考视频进入 `video_list`（`refer_type` 默认 `feature`，素材 role 为 `base` 时为视频编辑）。
- `kling-v2-6`：首帧 `image`、尾帧 `image_tail`，`mode` 固定 `pro`。
- `mode` 由分辨率推导：720p→`std`，1080p→`pro`，4k→`4k`；`providerOptions.mode` 可覆盖。
- `sound` 由“生成音频”开关决定（有参考视频时不发送）。

空值字段不会发送。`providerOptions.modelverse-kling-video.input` / `.parameters` 会合并进 `input` / `parameters`，用于补充模型特有字段或覆盖默认值。

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
  "id": "ucloud-modelverse-kling",
  "name": "UCloud ModelVerse Kling",
  "version": "1.0.0",
  "author": "UCloud ModelVerse / 影策",
  "description": "UCloud ModelVerse（AstraFlow）异步任务接口上的 Kling 视频生成协议插件。",
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
        "id": "modelverse-kling-video",
        "label": "UCloud ModelVerse Kling",
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
            "description": "ModelVerse 模型名：kling-v3、kling-v3-omni、kling-video-o1、kling-v2-6。"
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
            "description": "providerOptions.modelverse-kling-video.input 与 .parameters 会合并进对应对象，可补充或覆盖字段。"
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
                  "prompt": {
                    "$omitEmpty": {
                      "$ref": "request.prompt"
                    }
                  },
                  "negative_prompt": {
                    "$omitEmpty": {
                      "$ref": "request.providerOptions.modelverse-kling-video.negative_prompt"
                    }
                  },
                  "img_url": {
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
                                  "kling-v3"
                                ]
                              ]
                            },
                            {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "request.videos"
                                  }
                                },
                                0
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$coalesce": [
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
                            },
                            {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$sortByOrder": {
                                      "$ref": "request.images"
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
                  "video_url": {
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
                                  "kling-v3"
                                ]
                              ]
                            },
                            {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "request.videos"
                                  }
                                },
                                0
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$first": {
                            "$map": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.videos"
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
                  }
                },
                {
                  "$ref": "request.providerOptions.modelverse-kling-video.input"
                }
              ]
            },
            "parameters": {
              "$merge": [
                {
                  "kling_v3_type": {
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
                              "kling-v3"
                            ]
                          ]
                        },
                        "then": {
                          "$switch": {
                            "cases": [
                              {
                                "when": {
                                  "$gt": [
                                    {
                                      "$len": {
                                        "$ref": "request.videos"
                                      }
                                    },
                                    0
                                  ]
                                },
                                "then": "motion_control"
                              },
                              {
                                "when": {
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
                                "then": "i2v"
                              }
                            ],
                            "default": "t2v"
                          }
                        },
                        "else": null
                      }
                    }
                  },
                  "mode": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.modelverse-kling-video.mode"
                      },
                      {
                        "$if": {
                          "condition": {
                            "$or": [
                              {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.model"
                                    }
                                  },
                                  [
                                    "kling-v2-6"
                                  ]
                                ]
                              },
                              {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.model"
                                    }
                                  },
                                  [
                                    "kling-video-o1"
                                  ]
                                ]
                              }
                            ]
                          },
                          "then": "pro",
                          "else": null
                        }
                      },
                      {
                        "$switch": {
                          "cases": [
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  [
                                    "720p",
                                    "480p",
                                    "std"
                                  ]
                                ]
                              },
                              "then": "std"
                            },
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  [
                                    "4k",
                                    "2160p"
                                  ]
                                ]
                              },
                              "then": "4k"
                            }
                          ],
                          "default": "pro"
                        }
                      }
                    ]
                  },
                  "aspect_ratio": {
                    "$omitEmpty": {
                      "$ref": "request.aspectRatio"
                    }
                  },
                  "duration": {
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
                  "sound": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$and": [
                            {
                              "$or": [
                                {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "kling-v3"
                                    ]
                                  ]
                                },
                                {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "kling-v3-omni"
                                    ]
                                  ]
                                }
                              ]
                            },
                            {
                              "$not": {
                                "$gt": [
                                  {
                                    "$len": {
                                      "$ref": "request.videos"
                                    }
                                  },
                                  0
                                ]
                              }
                            }
                          ]
                        },
                        "then": {
                          "$if": {
                            "condition": {
                              "$ref": "request.generateAudio"
                            },
                            "then": "on",
                            "else": "off"
                          }
                        },
                        "else": null
                      }
                    }
                  },
                  "image": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$or": [
                            {
                              "$and": [
                                {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "kling-v3"
                                    ]
                                  ]
                                },
                                {
                                  "$not": {
                                    "$gt": [
                                      {
                                        "$len": {
                                          "$ref": "request.videos"
                                        }
                                      },
                                      0
                                    ]
                                  }
                                }
                              ]
                            },
                            {
                              "$in": [
                                {
                                  "$lower": {
                                    "$ref": "request.model"
                                  }
                                },
                                [
                                  "kling-v2-6"
                                ]
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
                  "image_tail": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$and": [
                            {
                              "$or": [
                                {
                                  "$and": [
                                    {
                                      "$in": [
                                        {
                                          "$lower": {
                                            "$ref": "request.model"
                                          }
                                        },
                                        [
                                          "kling-v3"
                                        ]
                                      ]
                                    },
                                    {
                                      "$not": {
                                        "$gt": [
                                          {
                                            "$len": {
                                              "$ref": "request.videos"
                                            }
                                          },
                                          0
                                        ]
                                      }
                                    }
                                  ]
                                },
                                {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "kling-v2-6"
                                    ]
                                  ]
                                }
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
                  },
                  "character_orientation": {
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
                                  "kling-v3"
                                ]
                              ]
                            },
                            {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "request.videos"
                                  }
                                },
                                0
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$coalesce": [
                            {
                              "$ref": "request.providerOptions.modelverse-kling-video.character_orientation"
                            },
                            "image"
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "image_list": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$or": [
                            {
                              "$in": [
                                {
                                  "$lower": {
                                    "$ref": "request.model"
                                  }
                                },
                                [
                                  "kling-v3-omni"
                                ]
                              ]
                            },
                            {
                              "$in": [
                                {
                                  "$lower": {
                                    "$ref": "request.model"
                                  }
                                },
                                [
                                  "kling-video-o1"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$concatArrays": [
                            {
                              "$if": {
                                "condition": {
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
                                "then": [
                                  {
                                    "image_url": {
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
                                    "type": "first_frame"
                                  }
                                ],
                                "else": []
                              }
                            },
                            {
                              "$if": {
                                "condition": {
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
                                "then": [
                                  {
                                    "image_url": {
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
                                    "type": "end_frame"
                                  }
                                ],
                                "else": []
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
                                      "kling-v3-omni"
                                    ]
                                  ]
                                },
                                "then": {
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
                                              "reference_image"
                                            ]
                                          ]
                                        }
                                      }
                                    },
                                    "as": "media",
                                    "in": {
                                      "image_url": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                },
                                "else": []
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "video_list": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$or": [
                            {
                              "$in": [
                                {
                                  "$lower": {
                                    "$ref": "request.model"
                                  }
                                },
                                [
                                  "kling-v3-omni"
                                ]
                              ]
                            },
                            {
                              "$in": [
                                {
                                  "$lower": {
                                    "$ref": "request.model"
                                  }
                                },
                                [
                                  "kling-video-o1"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$map": {
                            "from": {
                              "$sortByOrder": {
                                "$ref": "request.videos"
                              }
                            },
                            "as": "media",
                            "in": {
                              "video_url": {
                                "$ref": "media.value"
                              },
                              "refer_type": {
                                "$coalesce": [
                                  {
                                    "$ref": "request.providerOptions.modelverse-kling-video.refer_type"
                                  },
                                  {
                                    "$if": {
                                      "condition": {
                                        "$in": [
                                          {
                                            "$ref": "media.role"
                                          },
                                          [
                                            "base",
                                            "video_edit",
                                            "source_video"
                                          ]
                                        ]
                                      },
                                      "then": "base",
                                      "else": "feature"
                                    }
                                  }
                                ]
                              },
                              "keep_original_sound": {
                                "$coalesce": [
                                  {
                                    "$ref": "request.providerOptions.modelverse-kling-video.keep_original_sound"
                                  },
                                  "yes"
                                ]
                              }
                            }
                          }
                        },
                        "else": null
                      }
                    }
                  },
                  "watermark_enabled": {
                    "$omitEmpty": {
                      "$if": {
                        "condition": {
                          "$ref": "request.watermark"
                        },
                        "then": true,
                        "else": null
                      }
                    }
                  }
                },
                {
                  "$ref": "request.providerOptions.modelverse-kling-video.parameters"
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
