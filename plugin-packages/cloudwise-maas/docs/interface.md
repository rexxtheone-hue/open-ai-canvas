# Cloudwise MaaS 接口说明

## 渠道配置

- Base URL：`https://api.cloudwise.ai/api`
- API Key：Cloudwise 控制台生成的 Key，以 `Authorization: Bearer <API Key>` 发送。
- 本插件的协议都使用根路径（`/api/...`），与 Base URL 的路径部分无关；同一渠道下的聊天、GPT Image 等现有协议需要 Base URL 带 `/api`。

## 协议一览

| 协议 | 接口 | 模型 |
| --- | --- | --- |
| Cloudwise Seedance | `POST /api/v1/aiproducts/video/seedance`，查询 `GET /api/v1/aiproducts/video/seedance/tasks/{id}` | dreamina / doubao-seedance-2-0-*、2-5-* |
| Cloudwise Kling 视频 | `POST /api/v1/videos/omni-video`，查询 `GET /api/v1/videos/omni-video/{id}` | kling-v3-omni、kling-video-o1 |
| Cloudwise Kling 图片 | `POST /api/v1/images/omni-image`，查询 `GET /api/v1/images/omni-image/{id}` | kling-image-o1、kling-v3-omni |
| Cloudwise MiniMax H3 | `POST /api/v2/video_generation`，查询 `GET /api/v2/query/video_generation/{id}` | MiniMax-H3、MiniMax-H3-Max |
| Cloudwise 统一视频 | `POST /api/v1/video-generation/submit`，查询 `GET /api/v1/video-generation/video-content/{id}` | wan2.5/2.6、seedance-1.x、veo-3.1、sora-2 |
| Cloudwise 统一图片 | `POST /api/v1/image-generation`（同步返回 `image_url`） | seedream-4.0/4.5、gemini 图片模型 |

## 字段映射要点

- Seedance：请求体与火山方舟相同（`content` 数组 + `ratio`/`resolution`/`duration`/`generate_audio`/`watermark`），结果在 `content.video_url`。
- Kling：首尾帧与参考图进入 `image_list`（`type` 为 `first_frame`/`end_frame`），参考视频进入 `video_list`（`refer_type` 默认 `feature`，role 为 `base` 时为编辑）；`mode` 由分辨率推导（720p→std，1080p→pro，4k→4k）；`duration` 以字符串发送；状态 `succeed` 视为成功。
- MiniMax H3：`content` 数组（text + image_url/video_url/audio_url，role 原样传递）；分辨率 1080p 及以上→`2K`，其余→`768P`（H3-Max 为 `768P`/`480P`）；结果在 `task.content.url`。
- 统一视频：`content.prompt/image_url/image_url_last/video_url/audio_url`；万相文生视频的 `resolution` 按分辨率与比例换算成 `1280*720` 这类尺寸，Sora 换算成 `1280x720`；状态在 `taskStatus`，视频在 `video_url`。
- 统一图片：一张参考图发字符串、多张发数组；Seedream 的 `size` 为 `1K/2K/4K`。
- 每个协议的 `providerOptions.<协议 ID>.body` 会合并进请求体，用于补充或覆盖字段。

## 同一渠道可直接使用的现有协议

- 聊天：OpenAI Chat Completions（Claude、DeepSeek、Kimi、MiniMax-M、GLM、Grok、GPT、Gemini 等）。
- 图片：OpenAI Images（GPT Image、xAI Imagine）、Google Gemini 图片（Nano Banana，`/v1beta/models/{model}:generateContent`）。
- 视频：万相 3.0（DashScope 万相 3 协议）、xAI 视频。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "cloudwise-maas",
  "name": "Cloudwise MaaS",
  "version": "1.0.0",
  "author": "Cloudwise / 影策",
  "description": "Cloudwise MaaS（api.cloudwise.ai）的视频与图片协议：Seedance 2.x、Kling、MiniMax H3、统一视频与统一图片接口。",
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
        "id": "cloudwise-seedance",
        "label": "Cloudwise Seedance",
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
        "baseUrl": "https://api.cloudwise.ai",
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
            "description": "Cloudwise 模型名：dreamina-seedance-2-0-260128、doubao-seedance-2-0-260128、dreamina-seedance-2-0-fast-260128、dreamina-seedance-2-5-260628、doubao-seedance-2-5-260628 等。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 / 首尾帧（role first_frame / last_frame / reference_image）。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "video",
            "description": "参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audio",
            "description": "参考音频。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画面比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长（秒）。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio / sound",
            "description": "是否生成音频。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                9
              ]
            },
            "message": "Seedance 最多支持 9 张参考图片"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                3
              ]
            },
            "message": "Seedance 最多支持 3 个参考视频"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.audios"
                  }
                },
                3
              ]
            },
            "message": "Seedance 最多支持 3 个参考音频"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
                    {
                      "$add": [
                        {
                          "$len": {
                            "$ref": "request.images"
                          }
                        },
                        {
                          "$len": {
                            "$ref": "request.videos"
                          }
                        }
                      ]
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Seedance 不支持纯音频或文本+音频，请同时添加参考图片或参考视频"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v1/aiproducts/video/seedance",
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
                        "$coalesce": [
                          {
                            "$ref": "media.role"
                          },
                          "reference_image"
                        ]
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
                      "type": "video_url",
                      "video_url": {
                        "url": {
                          "$ref": "media.value"
                        }
                      },
                      "role": {
                        "$coalesce": [
                          {
                            "$ref": "media.role"
                          },
                          "reference_video"
                        ]
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
                      "type": "audio_url",
                      "audio_url": {
                        "url": {
                          "$ref": "media.value"
                        }
                      },
                      "role": {
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
              ]
            },
            "ratio": {
              "$coalesce": [
                {
                  "$ref": "request.aspectRatio"
                },
                "16:9"
              ]
            },
            "resolution": {
              "$coalesce": [
                {
                  "$ref": "request.resolution"
                },
                "720p"
              ]
            },
            "duration": {
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
                "else": 5
              }
            },
            "generate_audio": {
              "$ref": "request.generateAudio"
            },
            "watermark": {
              "$ref": "request.watermark"
            },
            "seed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.cloudwise-seedance.seed"
              }
            },
            "camera_fixed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.cloudwise-seedance.camera_fixed"
              }
            },
            "output_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.cloudwise-seedance.output_format"
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v1/aiproducts/video/seedance/tasks/{{taskId}}",
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
                "$ref": "response.data.id"
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
              {
                "$ref": "response.data.status"
              },
              "pending"
            ]
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
                "$ref": "response.content.video_url"
              },
              {
                "$ref": "response.video_url"
              },
              {
                "$ref": "response.output.video_url"
              },
              {
                "$ref": "response.data.video_url"
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
      },
      {
        "id": "cloudwise-kling-video",
        "label": "Cloudwise Kling 视频",
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
        "baseUrl": "https://api.cloudwise.ai",
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
            "description": "Cloudwise 模型名：kling-v3-omni、kling-video-o1。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 / 首尾帧（role first_frame / last_frame / reference_image）。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "video",
            "description": "参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audio",
            "description": "参考音频。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画面比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长（秒）。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio / sound",
            "description": "是否生成音频。"
          }
        ],
        "validations": [],
        "create": {
          "method": "POST",
          "path": "/api/v1/videos/omni-video",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model_name": {
                  "$ref": "request.model"
                },
                "prompt": {
                  "$ref": "request.prompt"
                },
                "negative_prompt": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.cloudwise-kling-video.negative_prompt"
                  }
                },
                "mode": {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.cloudwise-kling-video.mode"
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
                        "$toString": {
                          "$ref": "request.duration"
                        }
                      },
                      "else": null
                    }
                  }
                },
                "sound": {
                  "$if": {
                    "condition": {
                      "$gt": [
                        {
                          "$len": {
                            "$ref": "request.videos"
                          }
                        },
                        0
                      ]
                    },
                    "then": "off",
                    "else": {
                      "$if": {
                        "condition": {
                          "$ref": "request.generateAudio"
                        },
                        "then": "on",
                        "else": "off"
                      }
                    }
                  }
                },
                "image_list": {
                  "$omitEmpty": {
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
                      }
                    ]
                  }
                },
                "video_list": {
                  "$omitEmpty": {
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
                              "$ref": "request.providerOptions.cloudwise-kling-video.refer_type"
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
                              "$ref": "request.providerOptions.cloudwise-kling-video.keep_original_sound"
                            },
                            "yes"
                          ]
                        }
                      }
                    }
                  }
                }
              },
              {
                "$ref": "request.providerOptions.cloudwise-kling-video.body"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v1/videos/omni-video/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.data.task_id"
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
                    "$ref": "response.code"
                  },
                  {
                    "$ne": [
                      {
                        "$ref": "response.code"
                      },
                      0
                    ]
                  }
                ]
              },
              "then": "failed",
              "else": {
                "$switch": {
                  "cases": [
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "succeed",
                            "success",
                            "succeeded"
                          ]
                        ]
                      },
                      "then": "succeeded"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "submitted",
                            "queued"
                          ]
                        ]
                      },
                      "then": "pending"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "processing",
                            "running"
                          ]
                        ]
                      },
                      "then": "running"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "failed",
                            "fail"
                          ]
                        ]
                      },
                      "then": "failed"
                    }
                  ],
                  "default": {
                    "$coalesce": [
                      {
                        "$ref": "response.data.task_status"
                      },
                      "pending"
                    ]
                  }
                }
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.data.task_status_msg"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$ref": "response.data.task_result.videos"
          },
          "resultEphemeral": true
        }
      },
      {
        "id": "cloudwise-kling-image",
        "label": "Cloudwise Kling 图片",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.cloudwise.ai",
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
            "description": "Cloudwise 模型名：kling-image-o1、kling-v3-omni。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 / 首尾帧（role first_frame / last_frame / reference_image）。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画面比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "1k / 2k / 4k。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "n",
            "description": "生成张数 1–9。"
          }
        ],
        "validations": [],
        "create": {
          "method": "POST",
          "path": "/api/v1/images/omni-image",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model_name": {
                  "$ref": "request.model"
                },
                "prompt": {
                  "$ref": "request.prompt"
                },
                "resolution": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "request.resolution"
                            }
                          },
                          [
                            "1k",
                            "2k",
                            "4k"
                          ]
                        ]
                      },
                      "then": {
                        "$lower": {
                          "$ref": "request.resolution"
                        }
                      },
                      "else": null
                    }
                  }
                },
                "aspect_ratio": {
                  "$omitEmpty": {
                    "$ref": "request.aspectRatio"
                  }
                },
                "image_list": {
                  "$omitEmpty": {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "in": {
                        "image": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  }
                },
                "n": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$ref": "request.imageCount"
                          },
                          1
                        ]
                      },
                      "then": {
                        "$ref": "request.imageCount"
                      },
                      "else": null
                    }
                  }
                }
              },
              {
                "$ref": "request.providerOptions.cloudwise-kling-image.body"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v1/images/omni-image/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.data.task_id"
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
                    "$ref": "response.code"
                  },
                  {
                    "$ne": [
                      {
                        "$ref": "response.code"
                      },
                      0
                    ]
                  }
                ]
              },
              "then": "failed",
              "else": {
                "$switch": {
                  "cases": [
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "succeed",
                            "success",
                            "succeeded"
                          ]
                        ]
                      },
                      "then": "succeeded"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "submitted",
                            "queued"
                          ]
                        ]
                      },
                      "then": "pending"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "processing",
                            "running"
                          ]
                        ]
                      },
                      "then": "running"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.data.task_status"
                            }
                          },
                          [
                            "failed",
                            "fail"
                          ]
                        ]
                      },
                      "then": "failed"
                    }
                  ],
                  "default": {
                    "$coalesce": [
                      {
                        "$ref": "response.data.task_status"
                      },
                      "pending"
                    ]
                  }
                }
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.data.task_status_msg"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "images": {
            "$concatArrays": [
              {
                "$coalesce": [
                  {
                    "$ref": "response.data.task_result.images"
                  },
                  []
                ]
              },
              {
                "$coalesce": [
                  {
                    "$ref": "response.data.task_result.series_images"
                  },
                  []
                ]
              }
            ]
          },
          "resultEphemeral": true
        }
      },
      {
        "id": "cloudwise-minimax-video",
        "label": "Cloudwise MiniMax H3",
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
        "baseUrl": "https://api.cloudwise.ai",
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
            "description": "Cloudwise 模型名：MiniMax-H3、MiniMax-H3-Max。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 / 首尾帧（role first_frame / last_frame / reference_image）。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "video",
            "description": "参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audio",
            "description": "参考音频。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画面比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长（秒）。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio / sound",
            "description": "是否生成音频。"
          }
        ],
        "validations": [],
        "create": {
          "method": "POST",
          "path": "/api/v2/video_generation",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "content": {
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
                          "$eq": [
                            {
                              "$lower": {
                                "$ref": "request.model"
                              }
                            },
                            "minimax-h3-max"
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
                          "$eq": [
                            {
                              "$lower": {
                                "$ref": "request.model"
                              }
                            },
                            "minimax-h3-max"
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
                "resolution": {
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$lower": {
                                "$ref": "request.model"
                              }
                            },
                            "minimax-h3-max"
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
                      }
                    ],
                    "default": {
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
                    5
                  ]
                },
                "ratio": {
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
                }
              },
              {
                "$ref": "request.providerOptions.cloudwise-minimax-video.body"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v2/query/video_generation/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.task.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.task.status"
              },
              "pending"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.task.error.message"
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
            "$ref": "response.task.content.url"
          },
          "usage": {
            "$ref": "response.task.usage"
          },
          "resultEphemeral": true
        }
      },
      {
        "id": "cloudwise-unified-video",
        "label": "Cloudwise 统一视频",
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
        "baseUrl": "https://api.cloudwise.ai",
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
            "description": "Cloudwise 模型名：wan2.5-t2v-preview、wan2.5-i2v-preview、wan2.6-t2v、wan2.6-i2v、seedance-1.5-pro、seedance-1.0-pro、seedance-1.0-pro-fast、veo-3.1-generate-preview、veo-3.1-fast-generate-preview、sora-2、sora-2-pro、flashvsr。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 / 首尾帧（role first_frame / last_frame / reference_image）。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "video",
            "description": "参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audio",
            "description": "参考音频。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画面比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长（秒）。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio / sound",
            "description": "是否生成音频。"
          }
        ],
        "validations": [],
        "create": {
          "method": "POST",
          "path": "/api/v1/video-generation/submit",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "content": {
                  "prompt": {
                    "$ref": "request.prompt"
                  },
                  "image_url": {
                    "$omitEmpty": {
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
                  },
                  "image_url_last": {
                    "$omitEmpty": {
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
                  "video_url": {
                    "$omitEmpty": {
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
                  },
                  "audio_url": {
                    "$omitEmpty": {
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
                "resolution": {
                  "$omitEmpty": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.cloudwise-unified-video.resolution"
                      },
                      {
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
                                    "wan2.5-t2v-preview",
                                    "wan2.6-t2v"
                                  ]
                                ]
                              },
                              "then": {
                                "$switch": {
                                  "cases": [
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "480p|16:9"
                                        ]
                                      },
                                      "then": "832*480"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "480p|9:16"
                                        ]
                                      },
                                      "then": "480*832"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "480p|1:1"
                                        ]
                                      },
                                      "then": "624*624"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "720p|16:9"
                                        ]
                                      },
                                      "then": "1280*720"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "720p|9:16"
                                        ]
                                      },
                                      "then": "720*1280"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "720p|1:1"
                                        ]
                                      },
                                      "then": "960*960"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "720p|4:3"
                                        ]
                                      },
                                      "then": "1088*832"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "720p|3:4"
                                        ]
                                      },
                                      "then": "832*1088"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "1080p|16:9"
                                        ]
                                      },
                                      "then": "1920*1080"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "1080p|9:16"
                                        ]
                                      },
                                      "then": "1080*1920"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "1080p|1:1"
                                        ]
                                      },
                                      "then": "1440*1440"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "1080p|4:3"
                                        ]
                                      },
                                      "then": "1632*1248"
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$concat": [
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$lower": {
                                                      "$ref": "request.resolution"
                                                    }
                                                  },
                                                  "720p"
                                                ]
                                              },
                                              "|",
                                              {
                                                "$coalesce": [
                                                  {
                                                    "$ref": "request.aspectRatio"
                                                  },
                                                  "16:9"
                                                ]
                                              }
                                            ]
                                          },
                                          "1080p|3:4"
                                        ]
                                      },
                                      "then": "1248*1632"
                                    }
                                  ],
                                  "default": "1280*720"
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
                                    "sora-2",
                                    "sora-2-pro"
                                  ]
                                ]
                              },
                              "then": {
                                "$if": {
                                  "condition": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "9:16"
                                    ]
                                  },
                                  "then": "720x1280",
                                  "else": "1280x720"
                                }
                              }
                            }
                          ],
                          "default": {
                            "$omitEmpty": {
                              "$lower": {
                                "$ref": "request.resolution"
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                },
                "generate_audio": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$eq": [
                          {
                            "$lower": {
                              "$ref": "request.model"
                            }
                          },
                          "seedance-1.5-pro"
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
                },
                "prompt_extend": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.cloudwise-unified-video.prompt_extend"
                  }
                },
                "shot_type": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.cloudwise-unified-video.shot_type"
                  }
                },
                "camera_fixed": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.cloudwise-unified-video.camera_fixed"
                  }
                }
              },
              {
                "$ref": "request.providerOptions.cloudwise-unified-video.body"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v1/video-generation/video-content/{{taskId}}",
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
                    "$ref": "response.success"
                  },
                  false
                ]
              },
              "then": "failed",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.taskStatus"
                  },
                  {
                    "$ref": "response.status"
                  },
                  "pending"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.error"
              },
              {
                "$ref": "response.msg"
              }
            ]
          },
          "videos": {
            "$ref": "response.video_url"
          },
          "usage": {
            "$ref": "response.usage"
          },
          "resultEphemeral": true
        }
      },
      {
        "id": "cloudwise-unified-image",
        "label": "Cloudwise 统一图片",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.cloudwise.ai",
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
            "description": "Cloudwise 模型名：seedream-4.0、seedream-4.5、gemini-2.5-flash-image、gemini-3-pro-image-preview、gemini-3.1-flash-image-preview。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 / 首尾帧（role first_frame / last_frame / reference_image）。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "size",
            "description": "Seedream：1K / 2K / 4K。"
          }
        ],
        "validations": [],
        "create": {
          "method": "POST",
          "path": "/api/v1/image-generation",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "prompt": {
                  "$ref": "request.prompt"
                },
                "image": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          1
                        ]
                      },
                      "then": {
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
                      "else": {
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
                    }
                  }
                },
                "size": {
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
                            "seedream-4.0",
                            "seedream-4.5"
                          ]
                        ]
                      },
                      "then": {
                        "$omitEmpty": {
                          "$upper": {
                            "$ref": "request.resolution"
                          }
                        }
                      },
                      "else": null
                    }
                  }
                }
              },
              {
                "$ref": "request.providerOptions.cloudwise-unified-image.body"
              }
            ]
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
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
                    "$ref": "response.success"
                  },
                  false
                ]
              },
              "then": "failed",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.status"
                  },
                  "pending"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.error"
              },
              {
                "$ref": "response.msg"
              }
            ]
          },
          "images": {
            "$coalesce": [
              {
                "$ref": "response.image_url"
              },
              {
                "$ref": "response.image_urls"
              },
              {
                "$ref": "response.images"
              }
            ]
          },
          "usage": {
            "$ref": "response.usage"
          },
          "resultEphemeral": true
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
