# MCP 工作流沙盒（E2B 模板 omnimuse-drama-7）

sandbox_exec 跑在这个模板开出的 E2B 沙盒里：ffmpeg、ImageMagick、sox、python3（Pillow、numpy、faster-whisper small/medium、Demucs）、字幕字体、Node 和 Playwright Chromium（截网页），
工作流脚本在 `$HF_WORKFLOWS/<工作流>/scripts/`（/opt/workflows）。

构建：把工作流的 `scripts/` 放进 `ctx/workflows/<工作流>/scripts/`（工作流文件不进代码仓库），Dockerfile 和 omnimuse.sh 放进 `ctx/`，然后

```bash
npm i e2b tsx
E2B_API_KEY=... npx tsx build.mts
```

服务器环境变量：`E2B_API_KEY`（必填），`E2B_TEMPLATE`（默认 omnimuse-drama-7，含 short-drama 脚本；脚本或 Dockerfile 改了就把版本号加一，用户的旧沙盒会自动换新）。工作流手册放在后端数据目录 `/data/workflows/<工作流>/`。

字幕字体 Metropolis-ExtraBold.ttf（Unlicense，来自 github.com/dw5/Metropolis）要放进 `ctx/workflows/video-montage/scripts/fonts/`：Higgsfield 的字体文件是二进制，跟不过来，fetch_fonts.sh 也不下载它。
