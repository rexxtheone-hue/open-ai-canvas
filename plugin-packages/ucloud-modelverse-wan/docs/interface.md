# UCloud ModelVerse Wan 接口说明

## 渠道配置

- Base URL：`https://api.modelverse.cn`（填 `https://api.modelverse.cn/v1` 也可以，插件使用根路径）
- API Key：ModelVerse 控制台生成的 Key，以 `Authorization: Bearer <API Key>` 发送。
- 支持模型：wan3.0-video、wan3.0-video-prime、wan2.7-t2v、wan2.7-i2v、wan2.7-r2v、wan2.7-videoedit、wan2.6-r2v、wan2.6-r2v-flash、Wan-AI/Wan2.6-T2V、Wan-AI/Wan2.6-I2V、Wan-AI/Wan2.5-T2V、Wan-AI/Wan2.5-I2V、Wan-AI/Wan2.2-T2V、Wan-AI/Wan2.2-I2V。

## 提交任务

`POST /v1/tasks/submit`

```json
{"model": "<模型名>", "input": {...}, "parameters": {...}}
```

- `wan3.0-video*`、`wan2.7-*` 使用 `input.media` 数组：首尾帧为 `first_frame` / `last_frame`，参考图 / 视频 / 音频为 `reference_*`；`wan2.7-i2v` 的视频为 `first_clip`、音频为 `driving_audio`；`wan2.7-videoedit` 的视频为 `video`。
- `wan2.6-r2v*` 把全部图片和视频放进 `reference_urls`。
- `Wan-AI/Wan2.2-I2V`、`Wan2.5-I2V` 用 `first_frame_url`（2.2 另有 `last_frame_url`），`Wan2.6-I2V` 用 `img_url`；2.5 / 2.6 的第一条音频映射 `audio_url`。
- 文生视频旧型号与 `wan2.6-r2v*` 用 `size`（由分辨率与比例换算，如 720p + 16:9 → `1280x720`），其他型号用 `resolution`。
- `wan2.7-*`、`wan3.0-*` 发送 `ratio`；`watermark` 显式发送以覆盖 `wan2.7-i2v` 默认开水印。

空值字段不会发送。`providerOptions.modelverse-wan-video.input` / `.parameters` 会合并进 `input` / `parameters`，用于补充模型特有字段或覆盖默认值。

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
  "id": "ucloud-modelverse-wan",
  "name": "UCloud ModelVerse Wan",
  "version": "1.0.0",
  "author": "UCloud ModelVerse / 影策",
  "description": "UCloud ModelVerse（AstraFlow）异步任务接口上的 Wan 视频生成协议插件。",
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
        "id": "modelverse-wan-video",
        "label": "UCloud ModelVerse Wan",
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
            "description": "ModelVerse 模型名：wan3.0-video、wan3.0-video-prime、wan2.7-t2v、wan2.7-i2v、wan2.7-r2v、wan2.7-videoedit、wan2.6-r2v、wan2.6-r2v-flash、Wan-AI/Wan2.6-T2V、Wan-AI/Wan2.6-I2V、Wan-AI/Wan2.5-T2V、Wan-AI/Wan2.5-I2V、Wan-AI/Wan2.2-T2V、Wan-AI/Wan2.2-I2V。"
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
            "description": "providerOptions.modelverse-wan-video.input 与 .parameters 会合并进对应对象，可补充或覆盖字段。"
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
                      "$ref": "request.providerOptions.modelverse-wan-video.negative_prompt"
                    }
                  },
                  "first_frame_url": {
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
                                  "wan-ai/wan2.2-i2v"
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
                                  "wan-ai/wan2.5-i2v"
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
                  "last_frame_url": {
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
                              "wan-ai/wan2.2-i2v"
                            ]
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
                  "img_url": {
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
                              "wan-ai/wan2.6-i2v"
                            ]
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
                  "audio_url": {
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
                                  "wan-ai/wan2.5-i2v"
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
                                  "wan-ai/wan2.5-t2v"
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
                                  "wan-ai/wan2.6-i2v"
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
                                  "wan-ai/wan2.6-t2v"
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
                                  "wan2.7-t2v"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$first": {
                            "$map": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.audios"
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
                  },
                  "reference_urls": {
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
                              "wan2.6-r2v",
                              "wan2.6-r2v-flash"
                            ]
                          ]
                        },
                        "then": {
                          "$concatArrays": [
                            {
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
                                  "$ref": "media.value"
                                }
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "media": {
                    "$omitEmpty": {
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
                                  "wan2.7-i2v"
                                ]
                              ]
                            },
                            "then": {
                              "$concatArrays": [
                                {
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
                                            "type": "first_frame",
                                            "url": {
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
                                            "type": "last_frame",
                                            "url": {
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
                                            }
                                          }
                                        ],
                                        "else": []
                                      }
                                    }
                                  ]
                                },
                                {
                                  "$if": {
                                    "condition": {
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
                                    "then": [
                                      {
                                        "type": "first_clip",
                                        "url": {
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
                                        }
                                      }
                                    ],
                                    "else": []
                                  }
                                },
                                {
                                  "$if": {
                                    "condition": {
                                      "$first": {
                                        "$map": {
                                          "from": {
                                            "$sortByOrder": {
                                              "$ref": "request.audios"
                                            }
                                          },
                                          "as": "media",
                                          "in": {
                                            "$ref": "media.value"
                                          }
                                        }
                                      }
                                    },
                                    "then": [
                                      {
                                        "type": "driving_audio",
                                        "url": {
                                          "$first": {
                                            "$map": {
                                              "from": {
                                                "$sortByOrder": {
                                                  "$ref": "request.audios"
                                                }
                                              },
                                              "as": "media",
                                              "in": {
                                                "$ref": "media.value"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    ],
                                    "else": []
                                  }
                                }
                              ]
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
                                  "wan2.7-r2v"
                                ]
                              ]
                            },
                            "then": {
                              "$concatArrays": [
                                {
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
                                      "type": "first_frame",
                                      "url": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                },
                                {
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
                                          "$not": {
                                            "$in": [
                                              {
                                                "$ref": "media.role"
                                              },
                                              [
                                                "first_frame",
                                                "last_frame",
                                                "end_frame",
                                                "tail_frame"
                                              ]
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    "as": "media",
                                    "in": {
                                      "type": "reference_image",
                                      "url": {
                                        "$ref": "media.value"
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
                                      "type": "reference_video",
                                      "url": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                }
                              ]
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
                                  "wan2.7-videoedit"
                                ]
                              ]
                            },
                            "then": {
                              "$concatArrays": [
                                {
                                  "$if": {
                                    "condition": {
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
                                    "then": [
                                      {
                                        "type": "video",
                                        "url": {
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
                                        }
                                      }
                                    ],
                                    "else": []
                                  }
                                },
                                {
                                  "$map": {
                                    "from": {
                                      "$sortByOrder": {
                                        "$ref": "request.images"
                                      }
                                    },
                                    "as": "media",
                                    "in": {
                                      "type": "reference_image",
                                      "url": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                }
                              ]
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
                                  "wan3.0-video",
                                  "wan3.0-video-prime"
                                ]
                              ]
                            },
                            "then": {
                              "$concatArrays": [
                                {
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
                                            "type": "first_frame",
                                            "url": {
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
                                            "type": "last_frame",
                                            "url": {
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
                                            }
                                          }
                                        ],
                                        "else": []
                                      }
                                    }
                                  ]
                                },
                                {
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
                                      "type": "reference_image",
                                      "url": {
                                        "$ref": "media.value"
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
                                      "type": "reference_video",
                                      "url": {
                                        "$ref": "media.value"
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
                                      "type": "reference_audio",
                                      "url": {
                                        "$ref": "media.value"
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          }
                        ],
                        "default": null
                      }
                    }
                  }
                },
                {
                  "$ref": "request.providerOptions.modelverse-wan-video.input"
                }
              ]
            },
            "parameters": {
              "$merge": [
                {
                  "resolution": {
                    "$omitEmpty": {
                      "$switch": {
                        "cases": [
                          {
                            "when": {
                              "$or": [
                                {
                                  "$in": [
                                    {
                                      "$lower": {
                                        "$ref": "request.model"
                                      }
                                    },
                                    [
                                      "wan-ai/wan2.2-t2v"
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
                                      "wan-ai/wan2.5-t2v"
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
                                      "wan-ai/wan2.6-t2v"
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
                                      "wan2.6-r2v",
                                      "wan2.6-r2v-flash"
                                    ]
                                  ]
                                }
                              ]
                            },
                            "then": null
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
                                  "wan-ai/wan2.5-i2v"
                                ]
                              ]
                            },
                            "then": {
                              "$omitEmpty": {
                                "$lower": {
                                  "$ref": "request.resolution"
                                }
                              }
                            }
                          }
                        ],
                        "default": {
                          "$omitEmpty": {
                            "$upper": {
                              "$ref": "request.resolution"
                            }
                          }
                        }
                      }
                    }
                  },
                  "size": {
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
                                  "wan-ai/wan2.2-t2v"
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
                                  "wan-ai/wan2.5-t2v"
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
                                  "wan-ai/wan2.6-t2v"
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
                                  "wan2.6-r2v",
                                  "wan2.6-r2v-flash"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$coalesce": [
                            {
                              "$ref": "request.providerOptions.modelverse-wan-video.size"
                            },
                            {
                              "$switch": {
                                "cases": [
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$concat": [
                                            {
                                              "$lower": {
                                                "$ref": "request.resolution"
                                              }
                                            },
                                            "|",
                                            {
                                              "$ref": "request.aspectRatio"
                                            }
                                          ]
                                        },
                                        "480p|16:9"
                                      ]
                                    },
                                    "then": "832x480"
                                  },
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$concat": [
                                            {
                                              "$lower": {
                                                "$ref": "request.resolution"
                                              }
                                            },
                                            "|",
                                            {
                                              "$ref": "request.aspectRatio"
                                            }
                                          ]
                                        },
                                        "480p|9:16"
                                      ]
                                    },
                                    "then": "480x832"
                                  },
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$concat": [
                                            {
                                              "$lower": {
                                                "$ref": "request.resolution"
                                              }
                                            },
                                            "|",
                                            {
                                              "$ref": "request.aspectRatio"
                                            }
                                          ]
                                        },
                                        "720p|16:9"
                                      ]
                                    },
                                    "then": "1280x720"
                                  },
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$concat": [
                                            {
                                              "$lower": {
                                                "$ref": "request.resolution"
                                              }
                                            },
                                            "|",
                                            {
                                              "$ref": "request.aspectRatio"
                                            }
                                          ]
                                        },
                                        "720p|9:16"
                                      ]
                                    },
                                    "then": "720x1280"
                                  },
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$concat": [
                                            {
                                              "$lower": {
                                                "$ref": "request.resolution"
                                              }
                                            },
                                            "|",
                                            {
                                              "$ref": "request.aspectRatio"
                                            }
                                          ]
                                        },
                                        "1080p|16:9"
                                      ]
                                    },
                                    "then": "1920x1080"
                                  },
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$concat": [
                                            {
                                              "$lower": {
                                                "$ref": "request.resolution"
                                              }
                                            },
                                            "|",
                                            {
                                              "$ref": "request.aspectRatio"
                                            }
                                          ]
                                        },
                                        "1080p|9:16"
                                      ]
                                    },
                                    "then": "1080x1920"
                                  },
                                  {
                                    "when": {
                                      "$eq": [
                                        {
                                          "$ref": "request.aspectRatio"
                                        },
                                        "9:16"
                                      ]
                                    },
                                    "then": "720x1280"
                                  }
                                ],
                                "default": "1280x720"
                              }
                            }
                          ]
                        },
                        "else": null
                      }
                    }
                  },
                  "ratio": {
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
                                  "wan2.7-t2v"
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
                                  "wan2.7-r2v"
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
                                  "wan2.7-videoedit"
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
                                  "wan3.0-video",
                                  "wan3.0-video-prime"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$omitEmpty": {
                            "$ref": "request.aspectRatio"
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
                  "seed": {
                    "$omitEmpty": {
                      "$ref": "request.providerOptions.modelverse-wan-video.seed"
                    }
                  },
                  "watermark": {
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
                                  "wan2.7-i2v"
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
                                  "wan2.7-r2v"
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
                                  "wan2.7-t2v"
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
                                  "wan2.7-videoedit"
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
                                  "wan3.0-video",
                                  "wan3.0-video-prime"
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
                                  "wan2.6-r2v",
                                  "wan2.6-r2v-flash"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$toBool": {
                            "$ref": "request.watermark"
                          }
                        },
                        "else": null
                      }
                    }
                  },
                  "audio": {
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
                                  "wan3.0-video",
                                  "wan3.0-video-prime"
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
                                  "wan2.6-r2v-flash"
                                ]
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$toBool": {
                            "$ref": "request.generateAudio"
                          }
                        },
                        "else": null
                      }
                    }
                  }
                },
                {
                  "$ref": "request.providerOptions.modelverse-wan-video.parameters"
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
