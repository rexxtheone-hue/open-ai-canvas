# Replicate Predictions Video 接口字段

## 协议身份

- 插件 ID：`replicate-prediction-video`。
- Provider ID：`replicate-prediction-video`。
- 能力：`video`。
- 默认 Base URL：`https://api.replicate.com`。
- 鉴权驱动：`bearer`。
- 创建：`POST /v1/predictions`。
- 查询：`GET /v1/predictions/{{taskId}}`。
- 取消：`POST /v1/predictions/{{taskId}}/cancel`。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 视频模型 ID。 |
| `prompt` | string | 是 | `prompt/content/input` | 视频提示词。 |
| `images` | media[] | 否 | `first/last/reference image` | 显式 role 图片输入。 |
| `videos` | media[] | 否 | `reference video` | 参考视频。 |
| `audios` | media[] | 否 | `reference audio/voice` | 参考音频或音色。 |
| `duration` | integer | 否 | `duration/seconds` | 时长秒数。 |
| `aspectRatio` | string | 否 | `ratio/aspect_ratio/size` | 画幅比例或尺寸。 |
| `resolution` | string | 否 | `resolution` | 分辨率档位。 |
| `generateAudio` | boolean | 否 | `generate_audio` | 是否生成音频。 |
| `watermark` | boolean | 否 | `watermark` | 水印开关。 |
| `providerOptions` | object | 否 | `provider-specific fields` | 插件命名空间内的厂商扩展字段。 |

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/v1/predictions"` |
| `create.contentType` | `"application/json"` |
| `create.body.version` | `{"$omitEmpty":{"$ref":"request.providerOptions.replicate-prediction-video.version"}}` |
| `create.body.model` | `{"$omitEmpty":{"$coalesce":[{"$ref":"request.providerOptions.replicate-prediction-video.model"},{"$ref":"request.model"}]}}` |
| `create.body.input` | `{"$omitEmpty":{"$coalesce":[{"$ref":"request.providerOptions.replicate-prediction-video.input"},{"prompt":{"$ref":"request.prompt"},"images":{"$map":{"from":{"$ref":"request.images"},"as":"media","in":{"$ref":"media.value"}}},"videos":{"$map":{"from":{"$ref":"request.videos"},"as":"media","in":{"$ref":"media.value"}}},"audios":{"$map":{"from":{"$ref":"request.audios"},"as":"media","in":{"$ref":"media.value"}}}}]}}` |
| `create.body.prompt` | `{"$omitEmpty":{"$ref":"request.providerOptions.replicate-prediction-video.workflow"}}` |
| `create.body.client_id` | `{"$omitEmpty":{"$ref":"request.providerOptions.replicate-prediction-video.client_id"}}` |
| `create.body.webhook` | `{"$omitEmpty":{"$ref":"request.providerOptions.replicate-prediction-video.webhook"}}` |
| `create.body.webhook_events_filter` | `{"$omitEmpty":{"$ref":"request.providerOptions.replicate-prediction-video.webhook_events_filter"}}` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/v1/predictions/{{taskId}}"` |
| `poll.contentType` | `"application/json"` |
| `cancel.method` | `"POST"` |
| `cancel.path` | `"/v1/predictions/{{taskId}}/cancel"` |
| `cancel.contentType` | `"application/json"` |

## Provider 扩展键

- `providerOptions.replicate-prediction-video.client_id`
- `providerOptions.replicate-prediction-video.input`
- `providerOptions.replicate-prediction-video.model`
- `providerOptions.replicate-prediction-video.version`
- `providerOptions.replicate-prediction-video.webhook`
- `providerOptions.replicate-prediction-video.webhook_events_filter`
- `providerOptions.replicate-prediction-video.workflow`

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `{"$coalesce":[{"$ref":"response.id"},{"$ref":"response.request_id"},{"$ref":"response.prompt_id"},{"$ref":"taskId"}]}` |
| `response.status` | `{"$coalesce":[{"$ref":"response.status"},{"$ref":"response.state"},{"$ref":"response.data.status"},"pending"]}` |
| `response.message` | `{"$coalesce":[{"$ref":"response.error.message"},{"$ref":"response.message"},{"$ref":"response.fail_reason"}]}` |
| `response.videos` | `{"$ref":"response.output"}` |
| `response.errorPaths[0]` | `"error.code"` |
| `response.resultEphemeral` | `true` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

这是运行时/工作流协议，模型字段由 endpoint、version 或 workflow schema 决定。插件不伪造固定模型字段；providerOptions.input/workflow/prompt 是完整请求对象，并由 conformance fixture 锁定实际接入版本。

## 专用模型（官方模型接口 `POST /v1/models/{model}/predictions`）

查询、取消与结果解析和通用协议相同。三个专用协议都要求素材为公网链接。

### DreamActor M2.0 动作同步（Provider `replicate-dreamactor`）

- 模型填 `bytedance/dreamactor-m2.0`。
- `input.image` 取第一张参考图（主角），`input.video` 取第一段参考视频（动作），`cut_first_second` 固定为 `true`（去掉开头 1 秒过渡）。
- 官方按输出秒数计费：$0.05/秒。输出时长约等于动作视频时长。

### Kling 3.0 动作同步（Provider `replicate-kling-motion`）

- 模型填 `kwaivgi/kling-v3-motion-control`。
- `input.image`、`input.video` 同上，`prompt` 可选；分辨率 720p 时 `mode` 为 `std`，其它为 `pro`（1080p）。
- `character_orientation` 固定为 `video`（人物朝向跟随动作视频，动作视频最长 30 秒），`keep_original_sound` 为 `true`。
- 官方按输出秒数计费：std $0.07/秒，pro $0.12/秒。

### LTX 2.5 Fast 视频生成（Provider `replicate-ltx`）

- 模型填 `lightricks/ltx-2.5-fast`。
- `prompt` 必填；第一张参考图为 `image`（首帧），两张以上时最后一张为 `last_frame_image`（尾帧）。
- `duration` 2、3、4、5、6、8、10、12、14、16、18、20 秒；`aspect_ratio` 16:9 / 9:16；`resolution` 720p / 1080p / 2k / 4k；`fps` 固定 25；`generate_audio` 跟随请求。2K、4K 超过 10 秒在本地直接拒绝。
- 官方按输出秒数计费：720p $0.03、1080p $0.06、2k $0.12、4k $0.24 每秒。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "replicate-prediction-video",
  "name": "Replicate Predictions Video",
  "version": "2.1.0",
  "author": "Replicate / 影策",
  "description": "Replicate Predictions Video 独立请求协议插件。",
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
        "id": "replicate-prediction-video",
        "label": "Replicate Predictions Video",
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
        "baseUrl": "https://api.replicate.com",
        "requiresPublicMediaUrls": false,
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
        "create": {
          "method": "POST",
          "path": "/v1/predictions",
          "contentType": "application/json",
          "body": {
            "version": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.replicate-prediction-video.version"
              }
            },
            "model": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.replicate-prediction-video.model"
                  },
                  {
                    "$ref": "request.model"
                  }
                ]
              }
            },
            "input": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.replicate-prediction-video.input"
                  },
                  {
                    "prompt": {
                      "$ref": "request.prompt"
                    },
                    "images": {
                      "$map": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    },
                    "videos": {
                      "$map": {
                        "from": {
                          "$ref": "request.videos"
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    },
                    "audios": {
                      "$map": {
                        "from": {
                          "$ref": "request.audios"
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
            "prompt": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.replicate-prediction-video.workflow"
              }
            },
            "client_id": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.replicate-prediction-video.client_id"
              }
            },
            "webhook": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.replicate-prediction-video.webhook"
              }
            },
            "webhook_events_filter": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.replicate-prediction-video.webhook_events_filter"
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/predictions/{{taskId}}"
        },
        "cancel": {
          "method": "POST",
          "path": "/v1/predictions/{{taskId}}/cancel"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "response.prompt_id"
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
                "$ref": "response.state"
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
            "$ref": "response.output"
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true
        }
      },
      {
        "id": "replicate-dreamactor",
        "label": "Replicate DreamActor M2.0 动作同步",
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
        "baseUrl": "https://api.replicate.com",
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
            "description": "Replicate 模型：bytedance/dreamactor-m2.0。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "image",
            "description": "主角图片，取第一张；JPEG/PNG，4.7MB 以内，480x480–1920x1080。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": true,
            "mapping": "video",
            "description": "动作参考视频，取第一段；MP4/MOV/WebM，最长 30 秒。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/models/{{model}}/predictions",
          "contentType": "application/json",
          "body": {
            "input": {
              "image": {
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
              },
              "video": {
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
              "cut_first_second": true
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/predictions/{{taskId}}"
        },
        "cancel": {
          "method": "POST",
          "path": "/v1/predictions/{{taskId}}/cancel"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "response.prompt_id"
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
                "$ref": "response.state"
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
            "$ref": "response.output"
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true
        },
        "validations": [
          {
            "assert": {
              "$gte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                1
              ]
            },
            "message": "动作同步需要 1 张主角图片"
          },
          {
            "assert": {
              "$gte": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                1
              ]
            },
            "message": "动作同步需要 1 段动作参考视频"
          }
        ]
      },
      {
        "id": "replicate-kling-motion",
        "label": "Replicate Kling 3.0 动作同步",
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
        "baseUrl": "https://api.replicate.com",
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
            "description": "Replicate 模型：kwaivgi/kling-v3-motion-control。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "prompt",
            "description": "可选，补充画面元素或动作效果。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "image",
            "description": "主角图片，取第一张；JPG/PNG，10MB 以内，340–3850px。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": true,
            "mapping": "video",
            "description": "动作参考视频，取第一段；MP4/MOV，100MB 以内，3–30 秒。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "mode",
            "description": "720p 走 std，其它走 pro（1080p）。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/models/{{model}}/predictions",
          "contentType": "application/json",
          "body": {
            "input": {
              "image": {
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
              },
              "video": {
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
              "prompt": {
                "$omitEmpty": {
                  "$ref": "request.prompt"
                }
              },
              "mode": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.resolution"
                      },
                      "720p"
                    ]
                  },
                  "then": "std",
                  "else": "pro"
                }
              },
              "character_orientation": "video",
              "keep_original_sound": true
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/predictions/{{taskId}}"
        },
        "cancel": {
          "method": "POST",
          "path": "/v1/predictions/{{taskId}}/cancel"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "response.prompt_id"
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
                "$ref": "response.state"
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
            "$ref": "response.output"
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true
        },
        "validations": [
          {
            "assert": {
              "$gte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                1
              ]
            },
            "message": "动作同步需要 1 张主角图片"
          },
          {
            "assert": {
              "$gte": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                1
              ]
            },
            "message": "动作同步需要 1 段动作参考视频"
          }
        ]
      },
      {
        "id": "replicate-ltx",
        "label": "Replicate LTX 2.5 Fast 视频生成",
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
        "baseUrl": "https://api.replicate.com",
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
            "description": "Replicate 模型：lightricks/ltx-2.5-fast。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "视频描述。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image / last_frame_image",
            "description": "第一张为首帧，两张以上时最后一张为尾帧。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "2、3、4、5、6、8、10、12、14、16、18、20 秒；超过 10 秒只支持 720p / 1080p。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspect_ratio",
            "description": "16:9 或 9:16。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "720p、1080p、2k、4k。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio",
            "description": "是否生成同步音频。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/models/{{model}}/predictions",
          "contentType": "application/json",
          "body": {
            "input": {
              "prompt": {
                "$ref": "request.prompt"
              },
              "image": {
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
              "last_frame_image": {
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
              "fps": 25,
              "generate_audio": {
                "$ref": "request.generateAudio"
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/predictions/{{taskId}}"
        },
        "cancel": {
          "method": "POST",
          "path": "/v1/predictions/{{taskId}}/cancel"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "response.prompt_id"
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
                "$ref": "response.state"
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
            "$ref": "response.output"
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true
        },
        "validations": [
          {
            "assert": {
              "$not": {
                "$and": [
                  {
                    "$in": [
                      {
                        "$ref": "request.resolution"
                      },
                      [
                        "2k",
                        "4k"
                      ]
                    ]
                  },
                  {
                    "$gt": [
                      {
                        "$ref": "request.duration"
                      },
                      10
                    ]
                  }
                ]
              }
            },
            "message": "LTX 2.5 Fast 的 2K / 4K 最长 10 秒"
          }
        ]
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
