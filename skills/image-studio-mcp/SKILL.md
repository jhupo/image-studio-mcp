---
name: image-studio-mcp
description: Use this skill when the user wants to generate new images or edit existing images through the local Image Studio MCP server, especially when they mention gpt-image-2, image prompts, masks, or saving image outputs into the workspace.
---

# Image Studio MCP

Use this skill when the task is image generation or image editing through the bundled MCP server.

## Quick start

- The MCP server reads configuration from environment variables:
  - `OPENAI_API_KEY` is required
  - `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`
  - `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2`
- Prefer absolute file paths for `output_dir`, `input_images`, and `mask_image`.
- Save outputs into the user's workspace so the files are easy to inspect and reuse.
- Before the first real image request in a session, prefer `image_studio_doctor` so the user gets a readiness check instead of learning through a failed generation call.

## Which tool to use

- Use `image_studio_doctor` first when:
  - the plugin was just installed
  - the user says the MCP tool is not showing up
  - the user is using a proxy or compatible gateway
  - the previous request failed with `401`, `404`, `429`, `524`, HTML, or account-capacity errors
- Use `image-studio-mcp.generate_image` for pure text-to-image requests.
- Use `image-studio-mcp.edit_image` when the user already has one or more source images, or asks for inpainting / masked edits.

## Tool guidance

### `image_studio_doctor`

Use it for:
- installation checks
- configuration checks
- proxy troubleshooting
- model discovery through `/models`
- confirming whether the current host can already reach the MCP server

Recommended arguments:
- no arguments for a free readiness check
- `probe_generation: true` only when the user wants a real billable end-to-end probe

Expected conclusions:
- whether the current host can reach the server
- whether `OPENAI_API_KEY` is present
- which `OPENAI_BASE_URL` is active
- which models the gateway reports
- whether the configured image model is listed

### `generate_image`

Use it for:
- concept art
- UI mockup inspiration
- marketing visuals
- cover images
- prompt-based image variations

Recommended arguments:
- `prompt`: specific and visual
- `output_dir`: absolute path inside the user's workspace
- `filename_prefix`: a short slug like `hero-banner`
- `count`: only when the user wants multiple variants
- `size`, `quality`, `background`, `output_format`: only when the request clearly benefits from them

### `edit_image`

Use it for:
- changing an existing image with a prompt
- combining multiple input images
- using a mask to limit the edited area
- keeping composition while changing style or details

Recommended arguments:
- `input_images`: one or more absolute paths
- `mask_image`: only for targeted edits
- `output_dir`: absolute path inside the workspace
- `filename_prefix`: a short slug like `product-retouch`

## Workflow

1. If this is the first image request in the session, or if setup sounds uncertain, call `image_studio_doctor`.
2. Decide whether the request is generation or editing.
3. Choose a workspace-local output directory and filename prefix.
4. Call the MCP tool.
5. Return the saved file paths to the user.
6. If the result is meant to be reviewed visually, show the saved local image in the response when helpful.

## Notes

- If the user mentions a proxy or compatible gateway, keep using this skill and point the server at that endpoint through `OPENAI_BASE_URL`.
- If the user mentions API authentication problems, check that `OPENAI_API_KEY` is available to the MCP server process.
- If this skill is present but the actual MCP tools are not callable, say that clearly: "I can see the skill instructions, but I do not currently have a live MCP tool handle for Image Studio MCP in this host." Do not pretend generation is callable when only the skill text is available.
- Plugin install and global MCP registration are not always the same thing. In Codex, a plugin-bundled `.mcp.json` may work even when the server does not appear in the global MCP settings list.
