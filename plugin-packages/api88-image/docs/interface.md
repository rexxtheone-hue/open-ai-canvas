# 88API 生图接口字段

插件 ID：`api88-image`，含 `api88-midjourney` 与 `api88-grok-image` 两个协议，鉴权都是 `bearer`（配置字段 `apiKey`），都同步返回。

## Grok Imagine（`api88-grok-image`）

- 文生图：`POST /v1/images/generations`；有参考图时：`POST /v1/images/edits`（JSON，`images` 数组，最多 3 张；88API 在 generations 里会忽略参考图）。
- 上游模型 ID：`grok-imagine-image-2.0`、`grok-imagine-image`、`grok-imagine-image-quality`。

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | 必填 |
| `aspectRatio` | `aspect_ratio` | 不用 `size`；为空或 `auto` 时不发送，编辑时输出跟随第一张参考图 |
| `resolution` | `resolution` | `1k` 或 `2k`，小写发送；不支持 4K |
| `images` | `images` | 参考图网址数组，最多 3 张，按顺序编号 |
| — | `n` | 固定 1：平台按任务计费，多张由界面拆成多个任务 |

- 校验：提示词必填；参考图超过 3 张、分辨率不是 1k / 2k 时发送前拒绝。
- 结果：`data[].url` 或 `data[].b64_json`（按 `mime_type` 拼 Data URL，1k 为 JPEG、2k 为 PNG）。
- 88API 按成功的张数计费，失败不扣费。

## Midjourney（`api88-midjourney`）

### 协议身份

- 协议 ID：`api88-midjourney`。
- 能力：`image`。
- 默认 Base URL：`https://api.88api.ai`。
- 鉴权驱动：`bearer`（`Authorization: Bearer sk-...`），配置字段 `apiKey`。
- 创建：`POST /v1/images/generations`（JSON），同步返回，不轮询。路径使用 `originPath`，从域名根开始拼接。

## 已适配模型

| 上游模型 ID | 说明 | 每次输出 |
| --- | --- | --- |
| `midjourney-v8.2` | 标准速度 | 4 张 |
| `midjourney-v8.2-fast` | Fast | 4 张 |
| `midjourney-v8.2-turbo` | Turbo | 4 张 |

## 统一字段映射

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| `model` | `model` | 上游模型 ID |
| `prompt` | `prompt` | 必填 |
| `aspectRatio` | `prompt` 末尾的 `--ar` | 为空或 `auto` 时不追加；提示词里已有 `--ar` 时不重复追加 |

88API 文档要求比例写在 `--ar`，不放 `size`，所以本插件不发送 `size`、`n`、`quality`、`output_format` 等 OpenAI 图片字段。其他参数（`--s`、`--c`、`--w`、`--iw`、`--seed`、`--q`、`--no`、`--raw`、`--hd`、`--tile`、`--draft`、`--stop`）由用户写在提示词末尾。

## 校验

- 提示词必填。
- 88API 文档只开放文生图，带参考图时发送前拒绝，不调用上游、不扣费。

## 结果解析

- 成功：`data[].url`，每次 4 张；兼容 `data[].b64_json`。
- 错误：`error.code`、`error.message`。
- 88API 结果链接为临时地址，宿主会在任务完成后转存。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "api88-image",
  "name": "88API 生图",
  "version": "1.1.0",
  "author": "Rexx",
  "description": "88API 生图协议插件：Midjourney V8.2（POST /v1/images/generations，同步返回 4 张图，画幅转成 --ar）与 Grok Imagine（文生图 / 最多 3 张参考图编辑，每次 1 张）。",
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
        "required": true,
        "description": "88API 令牌（sk- 开头），分组需开通 Midjourney。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "api88-midjourney",
        "label": "88API Midjourney",
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
        "baseUrl": "https://api.88api.ai",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": true,
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅比例",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "ratio",
            "values": [
              "1:1",
              "4:3",
              "3:4",
              "16:9",
              "9:16",
              "3:2",
              "2:3",
              "21:9"
            ],
            "default": "1:1"
          }
        ],
        "validations": [
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.prompt"
                        },
                        ""
                      ]
                    }
                  }
                },
                0
              ]
            },
            "message": "Midjourney 需要提示词。"
          },
          {
            "assert": {
              "$eq": [
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
            "message": "88API Midjourney 目前只支持文生图，请移除参考图。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "上游模型 ID：midjourney-v8.2、midjourney-v8.2-fast、midjourney-v8.2-turbo。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词，可在末尾写 Midjourney 参数。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "prompt 末尾的 --ar",
            "description": "画幅比例；为空或 auto 时不追加。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/images/generations",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$concat": [
                {
                  "$trim": {
                    "$coalesce": [
                      {
                        "$ref": "request.prompt"
                      },
                      ""
                    ]
                  }
                },
                {
                  "$if": {
                    "condition": {
                      "$or": [
                        {
                          "$in": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$coalesce": [
                                    {
                                      "$ref": "request.aspectRatio"
                                    },
                                    ""
                                  ]
                                }
                              }
                            },
                            [
                              "",
                              "auto"
                            ]
                          ]
                        },
                        {
                          "$gt": [
                            {
                              "$len": {
                                "$split": [
                                  {
                                    "$lower": {
                                      "$coalesce": [
                                        {
                                          "$ref": "request.prompt"
                                        },
                                        ""
                                      ]
                                    }
                                  },
                                  "--ar"
                                ]
                              }
                            },
                            1
                          ]
                        }
                      ]
                    },
                    "then": "",
                    "else": {
                      "$concat": [
                        " --ar ",
                        {
                          "$trim": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$map": {
              "from": {
                "$ref": "response.data"
              },
              "as": "item",
              "in": {
                "url": {
                  "$omitEmpty": {
                    "$ref": "item.url"
                  }
                },
                "dataUrl": {
                  "$if": {
                    "condition": {
                      "$ref": "item.b64_json"
                    },
                    "then": {
                      "$concat": [
                        "data:image/png;base64,",
                        {
                          "$ref": "item.b64_json"
                        }
                      ]
                    },
                    "else": null
                  }
                }
              }
            }
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
        }
      },
      {
        "id": "api88-grok-image",
        "label": "88API Grok Imagine 生图",
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
        "baseUrl": "https://api.88api.ai",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "requiresPublicMediaUrls": true,
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅比例",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "ratio",
            "values": [
              "1:1",
              "16:9",
              "9:16",
              "4:3",
              "3:4",
              "3:2",
              "2:3",
              "2:1",
              "1:2",
              "21:9"
            ],
            "default": "1:1"
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "binding": "resolution",
            "values": [
              "1k",
              "2k"
            ],
            "default": "1k"
          }
        ],
        "validations": [
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.prompt"
                        },
                        ""
                      ]
                    }
                  }
                },
                0
              ]
            },
            "message": "Grok Imagine 需要提示词。"
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
                3
              ]
            },
            "message": "Grok Imagine 最多支持 3 张参考图。"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.resolution"
                        },
                        ""
                      ]
                    }
                  }
                },
                [
                  "",
                  "1k",
                  "2k"
                ]
              ]
            },
            "message": "Grok Imagine 只支持 1K、2K 分辨率。"
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "上游模型 ID：grok-imagine-image-2.0、grok-imagine-image、grok-imagine-image-quality。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "图片描述；有参考图时可写「第一张图」「第二张图」。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "images",
            "description": "参考图，最多 3 张，有图时走 /v1/images/edits。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "aspect_ratio",
            "description": "画幅比例；为空或 auto 时不发送，编辑时跟随第一张参考图。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "1k 或 2k，小写发送。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/images/generations",
          "pathTemplate": {
            "$if": {
              "condition": {
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
              "then": "/v1/images/edits",
              "else": "/v1/images/generations"
            }
          },
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$trim": {
                "$coalesce": [
                  {
                    "$ref": "request.prompt"
                  },
                  ""
                ]
              }
            },
            "n": 1,
            "aspect_ratio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      [
                        "",
                        "auto"
                      ]
                    ]
                  },
                  "then": null,
                  "else": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.aspectRatio"
                        },
                        ""
                      ]
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
                        "$lower": {
                          "$trim": {
                            "$coalesce": [
                              {
                                "$ref": "request.resolution"
                              },
                              ""
                            ]
                          }
                        }
                      },
                      ""
                    ]
                  },
                  "then": null,
                  "else": {
                    "$lower": {
                      "$trim": {
                        "$coalesce": [
                          {
                            "$ref": "request.resolution"
                          },
                          ""
                        ]
                      }
                    }
                  }
                }
              }
            },
            "images": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
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
                  "then": {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
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
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$map": {
              "from": {
                "$ref": "response.data"
              },
              "as": "item",
              "in": {
                "url": {
                  "$omitEmpty": {
                    "$ref": "item.url"
                  }
                },
                "dataUrl": {
                  "$if": {
                    "condition": {
                      "$ref": "item.b64_json"
                    },
                    "then": {
                      "$concat": [
                        "data:",
                        {
                          "$coalesce": [
                            {
                              "$ref": "item.mime_type"
                            },
                            "image/png"
                          ]
                        },
                        ";base64,",
                        {
                          "$ref": "item.b64_json"
                        }
                      ]
                    },
                    "else": null
                  }
                }
              }
            }
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
