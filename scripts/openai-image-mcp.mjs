#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_NAME = "image-studio-mcp";
const SERVER_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_REQUEST_TIMEOUT_MS = 240000;
const SUPPORTED_OUTPUT_FORMATS = new Set(["png", "jpeg", "webp"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");

function normalizeBaseUrl(rawBaseUrl = DEFAULT_BASE_URL) {
  return rawBaseUrl.replace(/\/+$/, "");
}

function getRequestTimeoutMs() {
  const parsed = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return parsed;
}

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required. Set it in the MCP server environment before using Image Studio MCP."
    );
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL),
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL,
  };
}

function maybeSet(object, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    object[key] = value;
  }
}

function maybeAppend(formData, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    formData.append(key, String(value));
  }
}

function inferMimeType(filename) {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function inferExtension({ requestedFormat, contentType }) {
  if (requestedFormat && SUPPORTED_OUTPUT_FORMATS.has(requestedFormat)) {
    return requestedFormat === "jpeg" ? "jpg" : requestedFormat;
  }

  if (contentType) {
    if (contentType.includes("png")) {
      return "png";
    }
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      return "jpg";
    }
    if (contentType.includes("webp")) {
      return "webp";
    }
  }

  return "png";
}

function sanitizeFileStem(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || fallback;
}

function ensureAbsolutePath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(pluginRoot, inputPath);
}

async function ensureOutputDirectory(outputDir) {
  const absoluteDir = ensureAbsolutePath(outputDir);
  await mkdir(absoluteDir, { recursive: true });
  return absoluteDir;
}

async function loadFileInput(source, fallbackPrefix = "image") {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to download remote image: ${source} (${response.status})`);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const remoteName = path.basename(new URL(source).pathname) || `${fallbackPrefix}.bin`;
    const buffer = Buffer.from(await response.arrayBuffer());
    return new File([buffer], remoteName, { type: contentType });
  }

  if (/^data:/i.test(source)) {
    const [metadata, payload] = source.split(",", 2);
    if (!payload) {
      throw new Error("Invalid data URL provided for image input.");
    }

    const mimeMatch = metadata.match(/^data:([^;]+);base64$/i);
    const mimeType = mimeMatch?.[1] || "application/octet-stream";
    const extension = inferExtension({ contentType: mimeType });
    const buffer = Buffer.from(payload, "base64");
    return new File([buffer], `${fallbackPrefix}.${extension}`, { type: mimeType });
  }

  const absolutePath = ensureAbsolutePath(source);
  const buffer = await readFile(absolutePath);
  return new File([buffer], path.basename(absolutePath), {
    type: inferMimeType(absolutePath),
  });
}

async function callJsonImagesEndpoint(endpointPath, body) {
  const { apiKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(getRequestTimeoutMs()),
  });

  return parseApiResponse(response);
}

async function callMultipartImagesEndpoint(endpointPath, formData) {
  const { apiKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(getRequestTimeoutMs()),
  });

  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const rawText = await response.text();
  let payload = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `OpenAI image request failed with status ${response.status}`;
    throw new Error(enrichHttpErrorMessage(message, response.status, rawText));
  }

  return payload;
}

function enrichHttpErrorMessage(message, status, rawText) {
  if (!rawText) {
    return message;
  }

  if (status === 524) {
    return "Upstream gateway timed out with HTTP 524. The image job likely ran too long. Try a shorter prompt, lower quality, a smaller image size, or a longer OPENAI_IMAGE_TIMEOUT_MS value.";
  }

  const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet ? `${message}. Response preview: ${snippet}` : message;
}

async function persistImageOutput(item, { outputDir, fileStem, index, requestedFormat }) {
  const extension = inferExtension({
    requestedFormat,
    contentType: item?.mime_type,
  });
  const outputPath = path.join(outputDir, `${fileStem}-${index + 1}.${extension}`);

  if (item?.b64_json) {
    await writeFile(outputPath, Buffer.from(item.b64_json, "base64"));
    return outputPath;
  }

  if (item?.url) {
    const response = await fetch(item.url, {
      signal: AbortSignal.timeout(getRequestTimeoutMs()),
    });
    if (!response.ok) {
      throw new Error(`Failed to download generated image from ${item.url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, buffer);
    return outputPath;
  }

  throw new Error("The image response did not include b64_json or url data.");
}

function summarizeOutputs({ action, savedPaths, revisedPrompts, outputDir, model, baseUrl }) {
  const lines = [
    `${action} completed with model ${model}.`,
    `Base URL: ${baseUrl}`,
    `Output directory: ${outputDir}`,
    "Saved files:",
    ...savedPaths.map((savedPath) => `- ${savedPath}`),
  ];

  if (revisedPrompts.length > 0) {
    lines.push("Revised prompts:");
    lines.push(...revisedPrompts.map((prompt, index) => `- [${index + 1}] ${prompt}`));
  }

  return lines.join("\n");
}

async function saveResponseImages(payload, { action, outputDir, fileStem, requestedFormat }) {
  if (!Array.isArray(payload?.data) || payload.data.length === 0) {
    throw new Error("The image API response did not contain any image data.");
  }

  const savedPaths = [];
  const revisedPrompts = [];

  for (const [index, item] of payload.data.entries()) {
    savedPaths.push(
      await persistImageOutput(item, {
        outputDir,
        fileStem,
        index,
        requestedFormat,
      })
    );

    if (typeof item?.revised_prompt === "string" && item.revised_prompt.trim()) {
      revisedPrompts.push(item.revised_prompt.trim());
    }
  }

  const { baseUrl, model } = getConfig();

  return summarizeOutputs({
    action,
    savedPaths,
    revisedPrompts,
    outputDir,
    model,
    baseUrl,
  });
}

const generateImageSchema = {
  prompt: z.string().min(1),
  output_dir: z.string().min(1),
  filename_prefix: z.string().min(1).optional(),
  count: z.number().int().min(1).max(10).optional(),
  size: z.string().min(1).optional(),
  quality: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  moderation: z.string().min(1).optional(),
  output_format: z.enum(["png", "jpeg", "webp"]).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  user: z.string().min(1).optional(),
};

const editImageSchema = {
  prompt: z.string().min(1),
  input_images: z.array(z.string().min(1)).min(1),
  output_dir: z.string().min(1),
  mask_image: z.string().min(1).optional(),
  filename_prefix: z.string().min(1).optional(),
  count: z.number().int().min(1).max(10).optional(),
  size: z.string().min(1).optional(),
  quality: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  output_format: z.enum(["png", "jpeg", "webp"]).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  user: z.string().min(1).optional(),
};

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

server.registerTool(
  "generate_image",
  {
    description:
      "Generate one or more images from a prompt with an OpenAI-compatible image endpoint and save them to local files.",
    inputSchema: generateImageSchema,
  },
  async ({
    prompt,
    output_dir: outputDir,
    filename_prefix: filenamePrefix,
    count,
    size,
    quality,
    background,
    moderation,
    output_format: outputFormat,
    output_compression: outputCompression,
    user,
  }) => {
    const { model } = getConfig();
    const resolvedOutputDir = await ensureOutputDirectory(outputDir);
    const requestBody = {
      model,
      prompt,
    };

    maybeSet(requestBody, "n", count);
    maybeSet(requestBody, "size", size);
    maybeSet(requestBody, "quality", quality);
    maybeSet(requestBody, "background", background);
    maybeSet(requestBody, "moderation", moderation);
    maybeSet(requestBody, "output_format", outputFormat);
    maybeSet(requestBody, "output_compression", outputCompression);
    maybeSet(requestBody, "user", user);

    const payload = await callJsonImagesEndpoint("/images/generations", requestBody);
    const fileStem = sanitizeFileStem(filenamePrefix, "generated-image");

    return {
      content: [
        {
          type: "text",
          text: await saveResponseImages(payload, {
            action: "Image generation",
            outputDir: resolvedOutputDir,
            fileStem,
            requestedFormat: outputFormat,
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "edit_image",
  {
    description:
      "Edit one or more source images with a prompt, optionally using a mask, and save the results to local files.",
    inputSchema: editImageSchema,
  },
  async ({
    prompt,
    input_images: inputImages,
    output_dir: outputDir,
    mask_image: maskImage,
    filename_prefix: filenamePrefix,
    count,
    size,
    quality,
    background,
    output_format: outputFormat,
    output_compression: outputCompression,
    user,
  }) => {
    const { model } = getConfig();
    const resolvedOutputDir = await ensureOutputDirectory(outputDir);
    const formData = new FormData();

    formData.append("model", model);
    formData.append("prompt", prompt);

    for (const [index, image] of inputImages.entries()) {
      const file = await loadFileInput(image, `image-${index + 1}`);
      formData.append("image[]", file, file.name);
    }

    if (maskImage) {
      const file = await loadFileInput(maskImage, "mask");
      formData.append("mask", file, file.name);
    }

    maybeAppend(formData, "n", count);
    maybeAppend(formData, "size", size);
    maybeAppend(formData, "quality", quality);
    maybeAppend(formData, "background", background);
    maybeAppend(formData, "output_format", outputFormat);
    maybeAppend(formData, "output_compression", outputCompression);
    maybeAppend(formData, "user", user);

    const payload = await callMultipartImagesEndpoint("/images/edits", formData);
    const fileStem = sanitizeFileStem(filenamePrefix, "edited-image");

    return {
      content: [
        {
          type: "text",
          text: await saveResponseImages(payload, {
            action: "Image edit",
            outputDir: resolvedOutputDir,
            fileStem,
            requestedFormat: outputFormat,
          }),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
