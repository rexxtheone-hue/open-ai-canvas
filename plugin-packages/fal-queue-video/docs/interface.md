# fal.ai Queue Video 接口说明

## 渠道配置

- Base URL：`https://queue.fal.run`
- API Key：fal 控制台生成的 Key。插件以 `Authorization: Key <API Key>` 发送。
- 模型名：填写完整的 fal 模型 ID，例如 `fal-ai/kling-video/v2.1/pro/image-to-video`。

## 提交任务

`POST /{model}`，请求体直接是模型输入（不包 `input`）：

- `prompt`
- `image_url`
- `end_image_url`
- `tail_image_url`
- `video_url`
- `audio_url`
- `duration`
- `aspect_ratio`
- `resolution`
- `generate_audio`
- `seed`

空值字段不会发送。`providerOptions.fal-queue-video.input` 中的字段会合并进请求体，并覆盖同名默认字段，用于模型特有参数。参考素材需要公网 URL，宿主会先把素材转存为公网链接。

响应示例：

```json
{"request_id": "764cabcf-...", "status": "IN_QUEUE", "status_url": "...", "response_url": "..."}
```

## 查询状态

`GET /{owner}/{app}/requests/{request_id}/status`。`owner/app` 取模型 ID 的前两段，例如 `fal-ai/flux/dev` 的状态地址在 `fal-ai/flux` 下。

状态 `IN_QUEUE`、`IN_PROGRESS`、`COMPLETED` 分别对应排队、处理中、完成。响应带 `error` 字段时任务视为失败。

## 获取结果

状态为 `COMPLETED` 后请求 `GET /{owner}/{app}/requests/{request_id}`，返回 JSON，视频从 `video` 字段读取：

```json
{"video": {"url": "https://v3.fal.media/files/...mp4"}}
```

结果链接是临时链接，宿主会转存。

## 取消

`PUT /{owner}/{app}/requests/{request_id}/cancel`。



## Mirelo 视频配音效（Provider `fal-mirelo-sfx`）

- 模型 ID 填 `mirelo-ai/sfx2.0/video-to-video`。
- 请求体：`video_url`（第一段参考视频）、`text_prompt`（提示词）、`negative_prompt` 固定为 `music`、`num_samples` 固定为 1（fal 按样本数计费，默认 2 会翻倍）。
- `preserve_speech` 读取 Studio 选项 `extra.specialtyOptions.keep`：为 `off` 时只生成音效、去掉原人声，其它情况保留原视频人声。
- 返回的是带新音轨的原视频（`video[].url`），画面不重新生成。时长等于输入视频，官方按输出秒数计费（$0.015/秒）。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "fal-queue-video",
  "name": "fal.ai Queue Video",
  "version": "3.0.1",
  "author": "fal.ai / 影策",
  "description": "fal.ai 队列接口（queue.fal.run）的视频生成协议插件：提交、查询状态、获取结果、取消。",
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
        "id": "fal-queue-video",
        "label": "fal.ai Queue Video",
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
        "baseUrl": "https://queue.fal.run",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey",
          "prefix": "Key "
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "fal 模型 ID，例如 fal-ai/nano-banana/edit、fal-ai/kling-video/v2.1/pro/image-to-video。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词，映射到 prompt。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "images",
            "description": "参考图：第一张映射 image_url，两张以上时最后一张映射 end_image_url / tail_image_url。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "videos",
            "description": "第一个参考视频映射 video_url。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audios",
            "description": "第一个参考音频映射 audio_url。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "时长（秒），以字符串发送到 duration。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspectRatio",
            "description": "画面比例，映射 aspect_ratio。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率，映射 resolution。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generateAudio",
            "description": "是否生成音频，映射 generate_audio。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "providerOptions",
            "description": "providerOptions.fal-queue-video.input 中的字段会原样合并进请求体，可覆盖默认字段；seed 映射 seed。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/{{model}}",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "prompt": {
                  "$ref": "request.prompt"
                },
                "image_url": {
                  "$omitEmpty": {
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
                },
                "end_image_url": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$gte": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          2
                        ]
                      },
                      "then": {
                        "$last": {
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
                      },
                      "else": null
                    }
                  }
                },
                "tail_image_url": {
                  "$omitEmpty": {
                    "$if": {
                      "condition": {
                        "$gte": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          2
                        ]
                      },
                      "then": {
                        "$last": {
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
                "aspect_ratio": {
                  "$omitEmpty": {
                    "$ref": "request.aspectRatio"
                  }
                },
                "resolution": {
                  "$omitEmpty": {
                    "$ref": "request.resolution"
                  }
                },
                "generate_audio": {
                  "$ref": "request.generateAudio"
                },
                "seed": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.fal-queue-video.seed"
                  }
                }
              },
              {
                "$ref": "request.providerOptions.fal-queue-video.input"
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              {
                "$concat": [
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      0
                    ]
                  },
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      1
                    ]
                  },
                  "/requests/{{taskId}}"
                ]
              },
              "/status"
            ]
          }
        },
        "result": {
          "method": "GET",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              "/",
              {
                "$at": [
                  {
                    "$split": [
                      {
                        "$ref": "request.model"
                      },
                      "/"
                    ]
                  },
                  0
                ]
              },
              "/",
              {
                "$at": [
                  {
                    "$split": [
                      {
                        "$ref": "request.model"
                      },
                      "/"
                    ]
                  },
                  1
                ]
              },
              "/requests/{{taskId}}"
            ]
          }
        },
        "cancel": {
          "method": "PUT",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              {
                "$concat": [
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      0
                    ]
                  },
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      1
                    ]
                  },
                  "/requests/{{taskId}}"
                ]
              },
              "/cancel"
            ]
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$ref": "response.error"
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
                "$ref": "response.error"
              },
              {
                "$ref": "response.detail"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.video"
              },
              {
                "$ref": "response.videos"
              }
            ]
          },
          "resultEphemeral": true,
          "resultJson": true
        }
      },
      {
        "id": "fal-mirelo-sfx",
        "label": "fal.ai Mirelo 视频配音效",
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
        "baseUrl": "https://queue.fal.run",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey",
          "prefix": "Key "
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "fal 模型 ID：mirelo-ai/sfx2.0/video-to-video。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "text_prompt",
            "description": "音效描述，可写画面外的声音或环境音。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": true,
            "mapping": "video_url",
            "description": "要配音效的视频，1 段。"
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
            "message": "视频配音效需要 1 段视频"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/{{model}}",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "video_url": {
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
            "text_prompt": {
              "$omitEmpty": {
                "$ref": "request.prompt"
              }
            },
            "negative_prompt": "music",
            "preserve_speech": {
              "$not": {
                "$eq": [
                  {
                    "$coalesce": [
                      {
                        "$omitEmpty": {
                          "$ref": "request.extra.specialtyOptions.keep"
                        }
                      },
                      ""
                    ]
                  },
                  "off"
                ]
              }
            },
            "num_samples": 1
          }
        },
        "poll": {
          "method": "GET",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              {
                "$concat": [
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      0
                    ]
                  },
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      1
                    ]
                  },
                  "/requests/{{taskId}}"
                ]
              },
              "/status"
            ]
          }
        },
        "result": {
          "method": "GET",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              "/",
              {
                "$at": [
                  {
                    "$split": [
                      {
                        "$ref": "request.model"
                      },
                      "/"
                    ]
                  },
                  0
                ]
              },
              "/",
              {
                "$at": [
                  {
                    "$split": [
                      {
                        "$ref": "request.model"
                      },
                      "/"
                    ]
                  },
                  1
                ]
              },
              "/requests/{{taskId}}"
            ]
          }
        },
        "cancel": {
          "method": "PUT",
          "path": "",
          "originPath": true,
          "pathTemplate": {
            "$concat": [
              {
                "$concat": [
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      0
                    ]
                  },
                  "/",
                  {
                    "$at": [
                      {
                        "$split": [
                          {
                            "$ref": "request.model"
                          },
                          "/"
                        ]
                      },
                      1
                    ]
                  },
                  "/requests/{{taskId}}"
                ]
              },
              "/cancel"
            ]
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$ref": "response.error"
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
                "$ref": "response.error"
              },
              {
                "$ref": "response.detail"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.video"
              },
              {
                "$ref": "response.videos"
              }
            ]
          },
          "resultEphemeral": true,
          "resultJson": true
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
