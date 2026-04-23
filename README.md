# image-studio-mcp

A local MCP server and Codex plugin for image generation and image editing through OpenAI-compatible image APIs.

This project is suitable for open-source distribution because the package name is generic. It is not presented as an official OpenAI plugin. It simply works with OpenAI-compatible image endpoints.

Repository:

- `https://github.com/jhupo/image-studio-mcp.git`

## Features

- Text-to-image with `generate_image`
- Image editing with `edit_image`
- Optional multi-image input for edits
- Optional mask-based editing
- Configurable `OPENAI_BASE_URL`
- Configurable `OPENAI_API_KEY`
- Configurable `OPENAI_IMAGE_MODEL`
- Saves output images directly to local files
- Includes a Codex plugin manifest and a companion skill

## Requirements

- Node.js 20+
- An API key for an OpenAI-compatible image endpoint

## Environment variables

- `OPENAI_API_KEY`
  Required. API key used for the image endpoint.
- `OPENAI_BASE_URL`
  Optional. Defaults to `https://dash.classicriver.cn/v1/`.
- `OPENAI_IMAGE_MODEL`
  Optional. Defaults to `gpt-image-2`.
- `OPENAI_IMAGE_TIMEOUT_MS`
  Optional. Defaults to `240000`. Increase this if your gateway or upstream image model is slow.

## Local setup

```bash
npm install
node ./scripts/openai-image-mcp.mjs
```

Helpful development commands:

```bash
npm run validate
npm run smoke:test
```

The server uses stdio transport, so it is normally launched by an MCP host instead of manually.

## Install in Codex

This repo already includes the Codex plugin files:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `skills/image-studio-mcp/SKILL.md`

If you are installing it into another Codex workspace:

1. Copy the `image-studio-mcp` folder into that workspace's `plugins/` directory.
2. Run `npm install` inside the plugin directory.
3. Set `OPENAI_API_KEY` in the plugin's local MCP config.
4. Do not commit a real API key into the repository.
5. Optionally change `OPENAI_BASE_URL` and `OPENAI_IMAGE_MODEL`.
6. Make sure the workspace marketplace points to `./plugins/image-studio-mcp`.

## Install in any MCP-compatible host

Any host that supports MCP stdio transport can install this server.

Use the same structure shown below, adapted to your host's config format:

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

A copyable example file is included here:

- `mcp.config.example.json`

## Tools

### `generate_image`

Creates one or more images from a prompt.

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

Edits one or more source images from a prompt.

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

## Open-source naming note

For public distribution, `image-studio-mcp` is safer than `openai-image-studio` because it avoids looking like an official product name while still making the purpose clear.

## Validation

```bash
node --check ./scripts/openai-image-mcp.mjs
```

For real API validation, inject `OPENAI_API_KEY` from your local shell or host config instead of storing it in tracked files.

You can also validate the skill:

```bash
python C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py ./skills/image-studio-mcp
```

## Troubleshooting

### HTTP 524 from Cloudflare or another gateway

If your gateway returns `524`, the upstream image request took too long.

Try these fixes:

- shorten the prompt
- lower `quality`
- reduce `size`
- increase `OPENAI_IMAGE_TIMEOUT_MS`
- retry through a less overloaded gateway

### HTML page instead of JSON API response

If `OPENAI_BASE_URL` points at a dashboard homepage instead of an API path, the server may receive HTML instead of JSON.

Use an API base URL such as:

- `https://dash.classicriver.cn/v1/`
