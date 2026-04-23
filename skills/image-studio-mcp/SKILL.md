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

## Which tool to use

- Use `image-studio-mcp.generate_image` for pure text-to-image requests.
- Use `image-studio-mcp.edit_image` when the user already has one or more source images, or asks for inpainting / masked edits.

## Tool guidance

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

1. Decide whether the request is generation or editing.
2. Choose a workspace-local output directory and filename prefix.
3. Call the MCP tool.
4. Return the saved file paths to the user.
5. If the result is meant to be reviewed visually, show the saved local image in the response when helpful.

## Notes

- If the user mentions a proxy or compatible gateway, keep using this skill and point the server at that endpoint through `OPENAI_BASE_URL`.
- If the user mentions API authentication problems, check that `OPENAI_API_KEY` is available to the MCP server process.
