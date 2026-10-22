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
| Cloudwise 统一视频 | `POST /api/v1/video-generation/submit`，查询 `GET /api/v1/video-generation/video-content/{id}` | wan2.5/2.6（不含万相 3.0）、seedance-1.x、veo-3.1、sora-2 |
| Cloudwise 万相 3.0 | `POST /api/v1/services/aigc/video-generation/video-synthesis`（`X-DashScope-Async: enable`），查询 `GET /api/v1/tasks/{id}` | wan3.0-video、wan3.0-video-prime |
| Cloudwise Vidu | 图生视频 `POST /api/ent/v2/img2video`，参考生视频 `POST /api/ent/v2/reference2video`，查询 `GET /api/ent/v2/tasks/{id}/creations` | viduq4 |
| Cloudwise Seedream 图片 | 同步 `POST /api/v1/aiproducts/image/seedream` | doubao-seedream-5-0-pro-260628 |
| Cloudwise 统一图片 | `POST /api/v1/image-generation`（同步返回 `image_url`） | seedream-4.0/4.5、gemini 图片模型 |

## 字段映射要点

- Seedance：请求体与火山方舟相同（`content` 数组 + `ratio`/`resolution`/`duration`/`generate_audio`/`watermark`），结果在 `content.video_url`。
- Kling：首尾帧与参考图进入 `image_list`（`type` 为 `first_frame`/`end_frame`），参考视频进入 `video_list`（`refer_type` 默认 `feature`，role 为 `base` 时为编辑）；`mode` 由分辨率推导（720p→std，1080p→pro，4k→4k）；`duration` 以字符串发送；状态 `succeed` 视为成功。
- MiniMax H3：`content` 数组（text + image_url/video_url/audio_url，role 原样传递）；分辨率 1080p 及以上→`2K`，其余→`768P`（H3-Max 为 `768P`/`480P`）；结果在 `task.content.url`。
- 统一视频：`content.prompt/image_url/image_url_last/video_url/audio_url`；万相文生视频的 `resolution` 按分辨率与比例换算成 `1280*720` 这类尺寸，Sora 换算成 `1280x720`；状态在 `taskStatus`，视频在 `video_url`。
- 万相 3.0：请求体与 DashScope 官方相同（`input.prompt` + `input.media[{type,url}]`，`parameters.resolution/ratio/duration/audio/prompt_extend`）；查询结果读 `data.output.task_status` / `data.output.video_url`。
- Vidu Q4：只有一张图且没有参考音频时走图生视频（首帧），其它组合走参考生视频（1–12 张图、0–3 段音频）；不支持纯文字和参考视频。分辨率 2K、4K 按大写发送；结果在 `data.creations[0].url`，`data.state` 为 success 时完成。
- Seedream 5.0 Pro：同步返回，结果在 `data[0].url`（24 小时有效）。只有 1K、2K 两档；按官方表把「档位 + 比例」换成像素尺寸发送，传入的已是 WxH 时原样发送。参考图 0–10 张，一张发字符串、多张发数组。不支持组图、联网搜索和流式。
- 统一图片：一张参考图发字符串、多张发数组；Seedream 的 `size` 为 `1K/2K/4K`。
- 每个协议的 `providerOptions.<协议 ID>.body` 会合并进请求体，用于补充或覆盖字段。

## 同一渠道可直接使用的现有协议

- 聊天：OpenAI Chat Completions（Claude、DeepSeek、Kimi、MiniMax-M、GLM、Grok、GPT、Gemini 等）。
- 图片：OpenAI Images（GPT Image、xAI Imagine）、Google Gemini 图片（Nano Banana，`/v1beta/models/{model}:generateContent`）。
- 视频：xAI 视频。万相 3.0 请用本插件的「Cloudwise 万相 3.0」：Cloudwise 的查询结果包在 `data.output` 里，成功时 `code` 为 `10000`，DashScope 原协议会误判。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "cloudwise-maas",
  "name": "Cloudwise MaaS",
  "version": "1.3.0",
  "author": "Cloudwise / 影策",
  "description": "Cloudwise MaaS（api.cloudwise.ai）的视频与图片协议：Seedance 2.x、Kling、MiniMax H3、万相 3.0、Vidu Q4、Seedream 5.0 Pro、统一视频与统一图片接口。",
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
        "validations": [
          {
            "assert": {
              "$not": {
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
            },
            "message": "万相 3.0 不支持 Cloudwise 统一视频接口，请把该模型的调用协议改成「Cloudwise 万相 3.0」"
          }
        ],
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
      },
      {
        "id": "cloudwise-wan",
        "label": "Cloudwise 万相 3.0",
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
            "description": "视频模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt/content/input",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "first/last/reference image",
            "description": "显式 role 图片输入。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "reference video",
            "description": "参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "reference audio/voice",
            "description": "参考音频或音色。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration/seconds",
            "description": "时长秒数。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio/aspect_ratio/size",
            "description": "画幅比例或尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率档位。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio",
            "description": "是否生成音频。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "watermark",
            "description": "水印开关。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$ref": "request.model"
                  }
                },
                [
                  "wan3.0-video-prime",
                  "wan3.0-video"
                ]
              ]
            },
            "message": "Wan 3.0 Video 仅支持 wan3.0-video-prime 或 wan3.0-video"
          },
          {
            "assert": {
              "$lte": [
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
                            "first_frame"
                          ]
                        ]
                      }
                    }
                  }
                },
                1
              ]
            },
            "message": "Wan 3.0 Video 最多只能有一个 first_frame"
          },
          {
            "assert": {
              "$lte": [
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
                            "last_frame"
                          ]
                        ]
                      }
                    }
                  }
                },
                1
              ]
            },
            "message": "Wan 3.0 Video 最多只能有一个 last_frame"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v1/services/aigc/video-generation/video-synthesis",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "input": {
              "prompt": {
                "$omitEmpty": {
                  "$ref": "request.prompt"
                }
              },
              "media": {
                "$omitEmpty": {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.cloudwise-wan.media"
                    },
                    {
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
                              "type": {
                                "$coalesce": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "reference_image"
                                ]
                              },
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
                              "type": {
                                "$coalesce": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "reference_video"
                                ]
                              },
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
                              "type": {
                                "$coalesce": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "reference_audio"
                                ]
                              },
                              "url": {
                                "$ref": "media.value"
                              }
                            }
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            },
            "parameters": {
              "resolution": {
                "$omitEmpty": {
                  "$upper": {
                    "$ref": "request.resolution"
                  }
                }
              },
              "ratio": {
                "$omitEmpty": {
                  "$ref": "request.aspectRatio"
                }
              },
              "duration": {
                "$omitEmpty": {
                  "$ref": "request.duration"
                }
              },
              "audio": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.cloudwise-wan.audio"
                  },
                  {
                    "$ref": "request.generateAudio"
                  }
                ]
              },
              "seed": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.cloudwise-wan.seed"
                }
              },
              "prompt_extend": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.cloudwise-wan.prompt_extend"
                  },
                  true
                ]
              },
              "watermark": {
                "$ref": "request.watermark"
              }
            }
          },
          "headers": {
            "X-DashScope-Async": "enable"
          },
          "originPath": true
        },
        "poll": {
          "method": "GET",
          "path": "/api/v1/tasks/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$coalesce": [
                  {
                    "$ref": "response.data.output.task_id"
                  },
                  {
                    "$ref": "response.output.task_id"
                  }
                ]
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$coalesce": [
                  {
                    "$ref": "response.data.output.code"
                  },
                  {
                    "$ref": "response.output.code"
                  },
                  {
                    "$if": {
                      "condition": {
                        "$and": [
                          {
                            "$ref": "response.code"
                          },
                          {
                            "$ne": [
                              {
                                "$toString": {
                                  "$ref": "response.code"
                                }
                              },
                              "10000"
                            ]
                          },
                          {
                            "$not": {
                              "$coalesce": [
                                {
                                  "$ref": "response.data.output.task_id"
                                },
                                {
                                  "$ref": "response.output.task_id"
                                }
                              ]
                            }
                          }
                        ]
                      },
                      "then": {
                        "$ref": "response.code"
                      },
                      "else": null
                    }
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
                              "$coalesce": [
                                {
                                  "$ref": "response.data.output.task_status"
                                },
                                {
                                  "$ref": "response.output.task_status"
                                }
                              ]
                            }
                          },
                          [
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
                              "$coalesce": [
                                {
                                  "$ref": "response.data.output.task_status"
                                },
                                {
                                  "$ref": "response.output.task_status"
                                }
                              ]
                            }
                          },
                          [
                            "failed",
                            "unknown"
                          ]
                        ]
                      },
                      "then": "failed"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$coalesce": [
                                {
                                  "$ref": "response.data.output.task_status"
                                },
                                {
                                  "$ref": "response.output.task_status"
                                }
                              ]
                            }
                          },
                          [
                            "canceled",
                            "cancelled"
                          ]
                        ]
                      },
                      "then": "cancelled"
                    },
                    {
                      "when": {
                        "$in": [
                          {
                            "$lower": {
                              "$coalesce": [
                                {
                                  "$ref": "response.data.output.task_status"
                                },
                                {
                                  "$ref": "response.output.task_status"
                                }
                              ]
                            }
                          },
                          [
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
                              "$coalesce": [
                                {
                                  "$ref": "response.data.output.task_status"
                                },
                                {
                                  "$ref": "response.output.task_status"
                                }
                              ]
                            }
                          },
                          [
                            "pending"
                          ]
                        ]
                      },
                      "then": "pending"
                    }
                  ],
                  "default": {
                    "$coalesce": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.data.output.task_status"
                          },
                          {
                            "$ref": "response.output.task_status"
                          }
                        ]
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
                "$coalesce": [
                  {
                    "$ref": "response.data.output.message"
                  },
                  {
                    "$ref": "response.output.message"
                  }
                ]
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.msg"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.data.output.video_url"
              },
              {
                "$ref": "response.output.video_url"
              }
            ]
          },
          "usage": {
            "$coalesce": [
              {
                "$ref": "response.data.usage"
              },
              {
                "$ref": "response.usage"
              }
            ]
          },
          "resultEphemeral": true
        }
      },
      {
        "id": "cloudwise-vidu",
        "label": "Cloudwise Vidu",
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
            "description": "Cloudwise 模型名：viduq4。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词，最多 5000 字。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "images",
            "description": "一张首帧图（图生视频），或 1–12 张参考图（参考生视频）。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "sounds",
            "description": "参考音频 0–3 段，每段 3–12 秒 mp3，仅参考生视频。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspect_ratio",
            "description": "画面比例：16:9、9:16、1:1、3:4、4:3。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "540p、720p、1080p、2K、4K。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长 3–16 秒。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "audio",
            "description": "是否同步生成声音（Q4 默认开启）。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                0
              ]
            },
            "message": "Vidu Q4 需要至少一张图片，不支持纯文字生成视频"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                12
              ]
            },
            "message": "Vidu Q4 最多支持 12 张参考图"
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
            "message": "Vidu Q4 最多支持 3 段参考音频"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                0
              ]
            },
            "message": "Vidu Q4 不支持参考视频"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/ent/v2/reference2video",
          "pathTemplate": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$ref": "request.images"
                        }
                      },
                      1
                    ]
                  },
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
                    "$not": {
                      "$in": [
                        {
                          "$first": {
                            "$map": {
                              "from": {
                                "$ref": "request.images"
                              },
                              "as": "media",
                              "in": {
                                "$ref": "media.role"
                              }
                            }
                          }
                        },
                        [
                          "reference_image",
                          "subject_reference",
                          "style_reference"
                        ]
                      ]
                    }
                  }
                ]
              },
              "then": "/api/ent/v2/img2video",
              "else": "/api/ent/v2/reference2video"
            }
          },
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
                "images": {
                  "$if": {
                    "condition": {
                      "$and": [
                        {
                          "$eq": [
                            {
                              "$len": {
                                "$ref": "request.images"
                              }
                            },
                            1
                          ]
                        },
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
                          "$not": {
                            "$in": [
                              {
                                "$first": {
                                  "$map": {
                                    "from": {
                                      "$ref": "request.images"
                                    },
                                    "as": "media",
                                    "in": {
                                      "$ref": "media.role"
                                    }
                                  }
                                }
                              },
                              [
                                "reference_image",
                                "subject_reference",
                                "style_reference"
                              ]
                            ]
                          }
                        }
                      ]
                    },
                    "then": [
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
                    ],
                    "else": {
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
                },
                "sounds": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$len": {
                                  "$ref": "request.images"
                                }
                              },
                              1
                            ]
                          },
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
                            "$not": {
                              "$in": [
                                {
                                  "$first": {
                                    "$map": {
                                      "from": {
                                        "$ref": "request.images"
                                      },
                                      "as": "media",
                                      "in": {
                                        "$ref": "media.role"
                                      }
                                    }
                                  }
                                },
                                [
                                  "reference_image",
                                  "subject_reference",
                                  "style_reference"
                                ]
                              ]
                            }
                          }
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
                      }
                    }
                  }
                },
                "aspect_ratio": {
                  "$omitEmpty": {
                    "$ref": "request.aspectRatio"
                  }
                },
                "resolution": {
                  "$omitEmpty": {
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
                                "2k",
                                "1440p"
                              ]
                            ]
                          },
                          "then": "2K"
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
                          "then": "4K"
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
                },
                "audio": {
                  "$toBool": {
                    "$ref": "request.generateAudio"
                  }
                }
              },
              {
                "$ref": "request.providerOptions.cloudwise-vidu.body"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/ent/v2/tasks/{{taskId}}/creations",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.data.task_id"
              },
              {
                "$ref": "response.id"
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
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "response.success"
                      },
                      false
                    ]
                  },
                  "then": "failed"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$lower": {
                          "$coalesce": [
                            {
                              "$ref": "response.data.state"
                            },
                            {
                              "$ref": "response.state"
                            },
                            "created"
                          ]
                        }
                      },
                      "success"
                    ]
                  },
                  "then": "succeeded"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$lower": {
                          "$coalesce": [
                            {
                              "$ref": "response.data.state"
                            },
                            {
                              "$ref": "response.state"
                            },
                            "created"
                          ]
                        }
                      },
                      "failed"
                    ]
                  },
                  "then": "failed"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$lower": {
                          "$coalesce": [
                            {
                              "$ref": "response.data.state"
                            },
                            {
                              "$ref": "response.state"
                            },
                            "created"
                          ]
                        }
                      },
                      "processing"
                    ]
                  },
                  "then": "running"
                }
              ],
              "default": "pending"
            }
          },
          "message": {
            "$coalesce": [
              {
                "$omitEmpty": {
                  "$ref": "response.data.err_msg"
                }
              },
              {
                "$ref": "response.errorMessage"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$first": {
              "$map": {
                "from": {
                  "$coalesce": [
                    {
                      "$ref": "response.data.creations"
                    },
                    []
                  ]
                },
                "as": "item",
                "in": {
                  "$ref": "item.url"
                }
              }
            }
          },
          "resultEphemeral": true
        }
      },
      {
        "id": "cloudwise-seedream-image",
        "label": "Cloudwise Seedream 图片",
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
            "description": "Cloudwise 模型名：doubao-seedream-5-0-pro-260628。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词，建议不超过 600 个英文单词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image",
            "description": "参考图 0–10 张；一张时发字符串，多张时发数组。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "size",
            "description": "比例 1:1、4:3、3:4、16:9、9:16、3:2、2:3、21:9，按分辨率换算成像素尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "size",
            "description": "1K 或 2K。"
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
                10
              ]
            },
            "message": "Seedream 5.0 Pro 最多支持 10 张参考图"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v1/aiproducts/image/seedream",
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
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|1:1"
                          ]
                        },
                        "then": "1024x1024"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|4:3"
                          ]
                        },
                        "then": "1152x864"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|3:4"
                          ]
                        },
                        "then": "864x1152"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|16:9"
                          ]
                        },
                        "then": "1312x736"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|9:16"
                          ]
                        },
                        "then": "736x1312"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|3:2"
                          ]
                        },
                        "then": "1248x832"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|2:3"
                          ]
                        },
                        "then": "832x1248"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "1k|21:9"
                          ]
                        },
                        "then": "1568x672"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|1:1"
                          ]
                        },
                        "then": "2048x2048"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|4:3"
                          ]
                        },
                        "then": "2304x1728"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|3:4"
                          ]
                        },
                        "then": "1728x2304"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|16:9"
                          ]
                        },
                        "then": "2848x1600"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|9:16"
                          ]
                        },
                        "then": "1600x2848"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|3:2"
                          ]
                        },
                        "then": "2496x1664"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|2:3"
                          ]
                        },
                        "then": "1664x2496"
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$concat": [
                                {
                                  "$lower": {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.resolution"
                                        }
                                      },
                                      "2k"
                                    ]
                                  }
                                },
                                "|",
                                {
                                  "$coalesce": [
                                    {
                                      "$omitEmpty": {
                                        "$ref": "request.aspectRatio"
                                      }
                                    },
                                    "1:1"
                                  ]
                                }
                              ]
                            },
                            "2k|21:9"
                          ]
                        },
                        "then": "3136x1344"
                      }
                    ],
                    "default": {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$len": {
                                "$split": [
                                  {
                                    "$coalesce": [
                                      {
                                        "$omitEmpty": {
                                          "$ref": "request.aspectRatio"
                                        }
                                      },
                                      "1:1"
                                    ]
                                  },
                                  "x"
                                ]
                              }
                            },
                            2
                          ]
                        },
                        "then": {
                          "$coalesce": [
                            {
                              "$omitEmpty": {
                                "$ref": "request.aspectRatio"
                              }
                            },
                            "1:1"
                          ]
                        },
                        "else": {
                          "$upper": {
                            "$lower": {
                              "$coalesce": [
                                {
                                  "$omitEmpty": {
                                    "$ref": "request.resolution"
                                  }
                                },
                                "2k"
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "response_format": "url",
                "watermark": false,
                "output_format": "png"
              },
              {
                "$ref": "request.providerOptions.cloudwise-seedream-image.body"
              }
            ]
          }
        },
        "response": {
          "status": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$len": {
                      "$coalesce": [
                        {
                          "$ref": "response.data.0.url"
                        },
                        ""
                      ]
                    }
                  },
                  0
                ]
              },
              "then": "succeeded",
              "else": "failed"
            }
          },
          "message": {
            "$coalesce": [
              {
                "$omitEmpty": {
                  "$ref": "response.error.message"
                }
              },
              {
                "$omitEmpty": {
                  "$ref": "response.data.0.error.message"
                }
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "images": {
            "$map": {
              "from": {
                "$coalesce": [
                  {
                    "$ref": "response.data"
                  },
                  []
                ]
              },
              "as": "item",
              "in": {
                "url": {
                  "$omitEmpty": {
                    "$ref": "item.url"
                  }
                }
              }
            }
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
