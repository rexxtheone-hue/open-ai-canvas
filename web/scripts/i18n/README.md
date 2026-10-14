# 中英双语（i18n）维护说明

源码保持中文不变。构建时 Vite 插件把中文文案替换成翻译函数调用，英文译文放在词典文件里。中文模式下行为与原版完全一致，所以合并上游更新不会产生冲突，只需要补新增文案的译文。

## 文件

| 文件 | 作用 |
| --- | --- |
| `src/locales/en.json` | 前端界面译文，键是中文原文 |
| `src/locales/en-server.json` | 后端返回的提示、错误、插件说明、内置技能名称的译文；`{0}` 对应 Go 的 `%s`、`%d` 等占位 |
| `src/locales/en-content.json` | 灵感库标题、简介、标签、分类名的译文（提示词正文不翻译） |
| `scripts/i18n/logic-overrides.json` | 参与逻辑判断、需要保留中文或改用后端词典的字面量 |
| `src/lib/i18n/runtime.ts` | 运行时：语言判断、查词典、后端文案翻译 |
| `src/lib/i18n/language-switch.tsx` | 中文 / English 切换控件 |

## 语言如何决定

1. 用户在账户菜单或登录页选过语言，就用选过的（存在浏览器 `localStorage` 的 `yingce:locale`）。
2. 没选过时看浏览器语言：中文浏览器默认中文，其他默认英文。

## 合并上游更新后

在 `web/` 目录执行：

```bash
bun scripts/i18n/extract.mjs           # 前端：列出缺失译文 -> ../.local/i18n/web-missing.json
bun scripts/i18n/extract-server.mjs    # 后端与插件、内置技能 -> ../.local/i18n/server-missing.json
bun scripts/i18n/extract-content.mjs   # 灵感库 -> ../.local/i18n/content-missing.json
```

把缺失文件里的键翻译成 `{ "中文": "English" }` 格式的 JSON，然后合并：

```bash
bun scripts/i18n/merge.mjs web     译文.json
bun scripts/i18n/merge.mjs server  译文.json
bun scripts/i18n/merge.mjs content 译文.json
bun scripts/i18n/extract.mjs --prune   # 删除已不再使用的前端译文
```

没有译文的文案会直接显示中文，不会报错。

再检查参与逻辑判断的中文字面量（比较、switch、includes 等），确认新增的位置是否需要写进 `logic-overrides.json`：

```bash
bun scripts/i18n/logic-sites.mjs
```

- 另一边是后端原样返回的中文数据、用户输入的中文、或旧数据：写进 `raw`，保留中文。
- 另一边是经请求层翻译过的后端文案：写进 `server`。
- 两边都是前端自己的文案：不用处理。

## 排除单个字面量

在语句或表达式前加注释 `// i18n-ignore` 或 `/* i18n-ignore */`，该处中文不会被翻译。
