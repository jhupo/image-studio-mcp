# image-studio-mcp

中文：`image-studio-mcp` 是一个本地 `stdio` MCP server，带 Codex 插件元数据和配套 skill，用来调用 OpenAI 兼容图片接口，完成生图和改图。  
English: `image-studio-mcp` is a local `stdio` MCP server with Codex plugin metadata and a companion skill for image generation and image editing through OpenAI-compatible image APIs.

Repository:

- [https://github.com/jhupo/image-studio-mcp.git](https://github.com/jhupo/image-studio-mcp.git)

## Features

- `generate_image` for text-to-image
- `edit_image` for image edits, multi-image edits, and optional mask edits
- `image_studio_doctor` for connectivity and configuration checks
- Configurable `OPENAI_BASE_URL`
- Configurable `OPENAI_API_KEY`
- Configurable `OPENAI_IMAGE_MODEL`
- Local file output
- Codex plugin metadata plus skill

## Requirements

- `Node.js 20+`
- An API key for an OpenAI-compatible image endpoint

## Environment Variables

- `OPENAI_API_KEY`
  中文：必填，图片接口用到的 key。  
  English: Required. API key for the image endpoint.
- `OPENAI_BASE_URL`
  中文：可选，默认是 `https://api.openai.com/v1`。  
  English: Optional. Defaults to `https://api.openai.com/v1`.
- `OPENAI_IMAGE_MODEL`
  中文：可选，默认是 `gpt-image-2`。  
  English: Optional. Defaults to `gpt-image-2`.
- `OPENAI_IMAGE_TIMEOUT_MS`
  中文：可选，默认 `240000`，代理慢或上游慢时可以调大。  
  English: Optional. Defaults to `240000`. Increase it if your gateway or upstream image model is slow.

## Local Setup

```bash
npm install
npm run validate
```

```bash
node ./scripts/openai-image-mcp.mjs
```

Helpful commands:

```bash
npm run doctor
```

```bash
npm run smoke:test
```

中文：这个 server 用的是 `stdio` transport，通常由 MCP 宿主拉起，不是手工常驻运行。  
English: This server uses `stdio` transport and is normally launched by an MCP host instead of being run manually.

## What `image_studio_doctor` Checks

中文：

- 当前宿主是否已经能调用这个 MCP server
- 当前 server 进程是否拿到了 `OPENAI_API_KEY`
- 当前 `OPENAI_BASE_URL`
- 当前 `OPENAI_IMAGE_MODEL`
- `/models` 是否可达
- 网关返回了哪些模型
- 配置中的模型是否出现在 `/models` 结果里

English:

- whether the current host can already call this MCP server
- whether the server process can see `OPENAI_API_KEY`
- which `OPENAI_BASE_URL` is active
- which `OPENAI_IMAGE_MODEL` is configured
- whether `/models` is reachable
- which models the gateway reports
- whether the configured model appears in `/models`

中文：如果你想做一次真实、计费的端到端探测，可以在调用 `image_studio_doctor` 时传 `probe_generation=true`。  
English: If you want a real billable end-to-end probe, call `image_studio_doctor` with `probe_generation=true`.

## Install In Codex

This repo already includes:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `skills/image-studio-mcp/SKILL.md`

To install into another Codex workspace:

1. Copy the `image-studio-mcp` folder into the target workspace `plugins/` directory.
2. Run `npm install` inside that plugin directory.
3. Set `OPENAI_API_KEY` in the local MCP configuration.
4. Optionally adjust `OPENAI_BASE_URL` and `OPENAI_IMAGE_MODEL`.
5. Make sure the marketplace entry points to `./plugins/image-studio-mcp`.
6. Restart Codex if the plugin was added while the app was already open.

## Why It May Not Show In Codex MCP Settings

中文：Codex 里“设置 -> MCP 服务器”通常看的是全局 `~/.codex/config.toml` 里的 `[mcp_servers.*]`，不一定会显示插件目录里的 `.mcp.json`。  
English: In Codex, “Settings -> MCP servers” usually reflects global `[mcp_servers.*]` entries from `~/.codex/config.toml`, not necessarily plugin-local `.mcp.json` files.

中文：所以“插件能加载”不等于“它会出现在全局 MCP 列表里”。  
English: That means “plugin installed” is not always the same as “visible in the global MCP settings list”.

## Install In Any MCP Host

Any host that supports standard MCP `stdio` transport can use this project.

Example config:

```json
{
  "mcpServers": {
    "image-studio-mcp": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/image-studio-mcp/scripts/openai-image-mcp.mjs"
      ],
      "cwd": "C:/absolute/path/to/image-studio-mcp",
      "env": {
        "OPENAI_API_KEY": "your_api_key_here",
        "OPENAI_BASE_URL": "https://dash.classicriver.cn/v1/",
        "OPENAI_IMAGE_MODEL": "gpt-image-2"
      }
    }
  }
}
```

Copyable example:

- `mcp.config.example.json`

## Minimal Usage Examples

### Official OpenAI-Compatible Example

```json
{
  "prompt": "a glossy orange sports car under studio lights",
  "output_dir": "C:/workspace/output",
  "filename_prefix": "sports-car",
  "count": 1,
  "size": "1024x1024",
  "output_format": "png"
}
```

### Compatible Proxy Example

```json
{
  "prompt": "a cyberpunk city girl with neon signs and rainy streets",
  "output_dir": "C:/workspace/output",
  "filename_prefix": "cyberpunk-girl",
  "count": 1,
  "size": "1024x1024",
  "quality": "medium",
  "output_format": "png"
}
```

### Edit Example

```json
{
  "prompt": "keep the subject, change the clothes to silver sci-fi armor",
  "input_images": [
    "C:/workspace/input/original.png"
  ],
  "output_dir": "C:/workspace/output",
  "filename_prefix": "armor-edit",
  "output_format": "png"
}
```

## How To Use It In Codex

中文：

- 可以直接说“给我生成一张图”。
- 更稳的说法是同时告诉它：
  - 生成什么
  - 输出到哪里
  - 要不要多张
  - 是生图还是改图
- 如果是第一次装好、第一次调用、或者刚切换代理，先让它跑 `image_studio_doctor`。
- 如果当前宿主只有 skill 文本、没有真实 MCP 工具入口，模型应该明确告诉你“只检测到 skill，没有检测到可调用工具”，而不是假装自己能直接出图。

English:

- You can simply say “generate an image for me”.
- It is more reliable to also specify:
  - what to generate
  - where to save it
  - whether you want multiple variants
  - whether this is text-to-image or image editing
- If this is the first call after installation, the first call after switching proxies, or a previously failed setup, run `image_studio_doctor` first.
- If the host only loaded the skill text but did not expose the actual MCP tools, the model should say that clearly instead of pretending image generation is callable.

## Context Memory In Codex

中文：

- 会记住，但主要是当前对话线程里的上下文，不是永久记忆。
- 新对话、上下文压缩、重启后，之前的图片任务细节可能不在。
- 最稳的做法是让图片保存到明确路径，并在后续继续引用那个路径。

English:

- Yes, but mostly within the current conversation thread, not as permanent memory.
- After a new thread, context compaction, or a restart, earlier image-task details may no longer be available.
- The safest pattern is to save outputs to a clear path and refer to that path again later.

## Tools

### `image_studio_doctor`

中文：做安装后自检、配置排查、代理排查。  
English: Runs installation, configuration, and proxy troubleshooting checks.

Important inputs:

- `probe_generation`
- `probe_prompt`
- `models_preview_limit`

### `generate_image`

中文：根据提示词生成一张或多张图片。  
English: Generates one or more images from a prompt.

Important inputs:

- `prompt`
- `output_dir`
- `filename_prefix`
- `count`
- `size`
- `quality`
- `background`
- `output_format`

### `edit_image`

中文：基于一张或多张已有图片进行改图。  
English: Edits one or more existing source images from a prompt.

Important inputs:

- `prompt`
- `input_images`
- `mask_image`
- `output_dir`
- `filename_prefix`
- `count`
- `size`
- `quality`
- `background`
- `output_format`

## Error Guide

- `401 invalid_api_key`
  中文：认证失败，通常是 key 不对、key 对这个代理不可用、或者上游没有授权。  
  English: Authentication failed. The key is wrong, not valid for this gateway, or lacks upstream access.
- `404`
  中文：路径大概率不对，常见原因是 `OPENAI_BASE_URL` 没写到 `/v1`。  
  English: Usually a path problem. A common cause is `OPENAI_BASE_URL` not ending at `/v1`.
- `429`
  中文：代理或上游限流了。  
  English: The proxy or upstream account is rate-limited.
- `524`
  中文：代理等上游太久超时了。  
  English: The proxy timed out while waiting for the upstream image job.
- `No available compatible accounts`
  中文：代理当前没有可用的图像账号资源。  
  English: The proxy currently has no available upstream image accounts.
- HTML instead of JSON
  中文：通常说明 `OPENAI_BASE_URL` 指到了网页，不是 API。  
  English: Usually means `OPENAI_BASE_URL` points to a dashboard page, not an API endpoint.

## Security Note

中文：不要把真实 key 提交进 Git，也不要到处手填进命令历史。优先通过 MCP 宿主的环境变量或本地私有配置注入。  
English: Do not commit a real key into Git and avoid pasting it into shell history. Prefer environment variables or private local host configuration.

## Validation

```bash
node --check ./scripts/openai-image-mcp.mjs
```

```bash
npm run validate
```

```bash
npm run doctor
```

```bash
npm run smoke:test
```

Skill validation:

```bash
python C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py ./skills/image-studio-mcp
```
