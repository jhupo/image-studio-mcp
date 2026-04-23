# image-studio-mcp

中文：`image-studio-mcp` 是一个本地 MCP server，同时带有 Codex 插件与 skill，用来通过 OpenAI 兼容图片接口做生图和改图。

English: `image-studio-mcp` is a local MCP server with a Codex plugin and companion skill for image generation and image editing through OpenAI-compatible image APIs.

Repository:

- `https://github.com/jhupo/image-studio-mcp.git`

## 功能 Features

- 文生图 / Text-to-image with `generate_image`
- 改图 / Image editing with `edit_image`
- 支持多图输入 / Optional multi-image input
- 支持 mask 改图 / Optional mask-based editing
- 可配置 `OPENAI_BASE_URL`
- 可配置 `OPENAI_API_KEY`
- 可配置 `OPENAI_IMAGE_MODEL`
- 图片直接保存到本地文件 / Saves images directly to local files
- 自带 Codex 插件配置和 skill / Includes Codex plugin metadata and skill

## 环境要求 Requirements

- `Node.js 20+`
- 一个可用的 OpenAI 兼容图片接口 key / An API key for an OpenAI-compatible image endpoint

## 环境变量 Environment Variables

- `OPENAI_API_KEY`
  中文：必填，图片接口使用的 key。
  English: Required. API key used for the image endpoint.
- `OPENAI_BASE_URL`
  中文：可选，默认是 `https://dash.classicriver.cn/v1/`。
  English: Optional. Defaults to `https://dash.classicriver.cn/v1/`.
- `OPENAI_IMAGE_MODEL`
  中文：可选，默认是 `gpt-image-2`。
  English: Optional. Defaults to `gpt-image-2`.
- `OPENAI_IMAGE_TIMEOUT_MS`
  中文：可选，默认 `240000`，网关慢时可以调大。
  English: Optional. Defaults to `240000`. Increase this if your gateway or upstream image model is slow.

## 本地运行 Local Setup

```bash
npm install
node ./scripts/openai-image-mcp.mjs
```

开发时常用命令 / Helpful development commands:

```bash
npm run validate
npm run smoke:test
```

中文：这个 server 用的是 `stdio` transport，通常由 MCP 宿主拉起，不是手动常驻运行。

English: The server uses `stdio` transport and is normally launched by an MCP host instead of being run manually.

## 在 Codex 中安装 Install In Codex

这个仓库已经自带 Codex 需要的文件 / This repo already includes the Codex files:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `skills/image-studio-mcp/SKILL.md`

如果你要安装到别的 Codex 工作区 / If you want to install it into another Codex workspace:

1. 复制 `image-studio-mcp` 目录到目标工作区的 `plugins/` 目录。
   Copy the `image-studio-mcp` folder into the target workspace `plugins/` directory.
2. 在插件目录执行 `npm install`。
   Run `npm install` inside the plugin directory.
3. 在本地 MCP 配置里设置 `OPENAI_API_KEY`。
   Set `OPENAI_API_KEY` in the local MCP config.
4. 不要把真实 key 提交进仓库。
   Do not commit a real API key into the repository.
5. 按需修改 `OPENAI_BASE_URL` 和 `OPENAI_IMAGE_MODEL`。
   Optionally change `OPENAI_BASE_URL` and `OPENAI_IMAGE_MODEL`.
6. 确保 marketplace 指向 `./plugins/image-studio-mcp`。
   Make sure the marketplace points to `./plugins/image-studio-mcp`.

## 在其他 MCP 宿主中安装 Install In Any MCP Host

中文：只要宿主支持标准 MCP `stdio`，这个项目就能接入。

English: Any host that supports standard MCP `stdio` transport can use this project.

示例配置 / Example config:

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

可直接参考 / Copyable example:

- `mcp.config.example.json`

## 在 Codex 里怎么调用 How To Use It In Codex

中文：

- 你可以直接说“给我生成一张图片”。
- 更推荐明确描述需求，例如：
  - “用 image-studio-mcp 给我生成一张横版科技海报，输出到工作区。”
  - “帮我生成一张产品图，保存到 `C:\\...\\output`。”
  - “用这张图继续改图，保留主体，换成赛博朋克风格。”
- 如果插件和 skill 已加载，Codex 通常会自动选择 `generate_image` 或 `edit_image`。
- 最稳的说法是同时告诉它：
  - 目标内容
  - 输出目录
  - 是否要多张
  - 是否基于现有图片改图

English:

- You can simply say “generate an image for me”.
- It is better to be explicit, for example:
  - “Use image-studio-mcp to generate a wide tech poster and save it into the workspace.”
  - “Generate a product image and save it into `C:\\...\\output`.”
  - “Edit this image, keep the subject, and switch it to a cyberpunk style.”
- If the plugin and skill are loaded, Codex will usually choose `generate_image` or `edit_image` automatically.
- The most reliable prompt includes:
  - what to generate
  - where to save it
  - whether you want multiple variants
  - whether this is text-to-image or image editing

## 上下文会不会记住 Will Codex Remember The Context

中文：

- 会，但范围是“当前对话线程上下文”，不是永久记忆。
- 也就是说，在同一条对话里，你前面生成过什么图、用过什么提示词、输出到哪里，Codex 一般还能接着用。
- 如果你开了新对话，或者线程被清空、压缩、重启，这些上下文不一定还在。
- 最稳妥的方式是：
  - 让 Codex 把图片保存到明确路径
  - 后续继续说“基于刚才那张图继续改”，或者直接给文件路径
- 对图片本身，最可靠的引用方式仍然是“文件路径”或“重新附图”，不要只依赖口头描述。

English:

- Yes, but only within the current conversation context, not as permanent memory.
- In the same thread, Codex can usually continue from the previous image request, prompt, and output path.
- In a new thread, after context compaction, or after a restart, that context may not still be available.
- The safest workflow is:
  - save images to a clear path
  - refer to the previous result explicitly
  - pass the file path again when needed
- For image editing, file paths or re-attached images are more reliable than relying on conversational memory alone.

## 工具 Tools

### `generate_image`

中文：根据提示词生成一张或多张图片。

English: Generates one or more images from a prompt.

重要参数 / Important inputs:

- `prompt`
- `output_dir`
- `filename_prefix`
- `count`
- `size`
- `quality`
- `background`
- `output_format`

### `edit_image`

中文：基于一张或多张现有图片进行改图。

English: Edits one or more existing source images from a prompt.

重要参数 / Important inputs:

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

## 开源命名说明 Open-Source Naming Note

中文：公开发布时，`image-studio-mcp` 比 `openai-image-studio` 更安全，不容易被误解成官方项目。

English: For public distribution, `image-studio-mcp` is safer than `openai-image-studio` because it avoids looking like an official product.

## 验证 Validation

```bash
node --check ./scripts/openai-image-mcp.mjs
```

```bash
npm run validate
```

```bash
npm run smoke:test
```

中文：做真实接口验证时，建议从本地 shell 或宿主配置注入 `OPENAI_API_KEY`，不要把 key 写进 Git 跟踪文件。

English: For real API validation, inject `OPENAI_API_KEY` from your local shell or host config instead of storing it in tracked files.

skill 校验 / Skill validation:

```bash
python C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py ./skills/image-studio-mcp
```

## 故障排查 Troubleshooting

### `524` 超时 / HTTP 524 Timeout

中文：如果网关返回 `524`，通常说明上游图片任务执行太久。

English: If the gateway returns `524`, the upstream image job took too long.

可以尝试 / Try:

- 缩短提示词 / shorten the prompt
- 降低 `quality` / lower `quality`
- 降低 `size` / reduce `size`
- 增大 `OPENAI_IMAGE_TIMEOUT_MS` / increase `OPENAI_IMAGE_TIMEOUT_MS`
- 换一个负载更低的网关 / retry through a less overloaded gateway

### 返回 HTML 而不是 JSON / HTML Instead Of JSON

中文：如果 `OPENAI_BASE_URL` 指到了网页首页而不是 API 路径，服务端可能会收到 HTML。

English: If `OPENAI_BASE_URL` points to a dashboard homepage instead of an API path, the server may receive HTML instead of JSON.

正确示例 / Example:

- `https://dash.classicriver.cn/v1/`
