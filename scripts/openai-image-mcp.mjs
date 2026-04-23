#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_NAME = "image-studio-mcp";
const SERVER_VERSION = "0.2.0";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_REQUEST_TIMEOUT_MS = 240000;
const DEFAULT_MODELS_PREVIEW_LIMIT = 8;
const DOCTOR_PROBE_PROMPT = "a minimal cyan square icon on a dark background";
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

function readConfig() {
  return {
    apiKey: String(process.env.OPENAI_API_KEY || "").trim(),
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL),
    model: String(process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    timeoutMs: getRequestTimeoutMs(),
  };
}

function getConfig() {
  const config = readConfig();

  if (!config.apiKey) {
    throw new Error(
      "Configuration problem: OPENAI_API_KEY is missing. Set it in the MCP server environment before using Image Studio MCP."
    );
  }

  return config;
}

function maskSecret(secret) {
  if (!secret) {
    return "missing";
  }

  if (secret.length <= 8) {
    return `${secret[0]}***${secret.at(-1)}`;
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
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

function looksLikeHtml(rawText) {
  return /^\s*</.test(rawText) && /html|doctype/i.test(rawText.slice(0, 200));
}

function formatTransportError(error) {
  const message = String(error?.message || error);

  if (error?.name === "TimeoutError" || /timed out|aborted/i.test(message)) {
    return "Upstream timeout: the request exceeded OPENAI_IMAGE_TIMEOUT_MS before the gateway returned. Try a shorter prompt, lower quality, a smaller size, or raise OPENAI_IMAGE_TIMEOUT_MS.";
  }

  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(message)) {
    return "Connectivity problem: the image gateway could not be reached. Check OPENAI_BASE_URL, local network access, and whether the proxy is online.";
  }

  return `Transport problem: ${message}`;
}

function classifyErrorMessage({ status, message, rawText }) {
  if (status === 524) {
    return "Proxy timeout (524): the gateway timed out while waiting for the upstream image job. Try a shorter prompt, lower quality, a smaller size, or a larger OPENAI_IMAGE_TIMEOUT_MS value.";
  }

  if (looksLikeHtml(rawText)) {
    return "Base URL problem: the server returned HTML instead of JSON. OPENAI_BASE_URL probably points to a dashboard page instead of an API prefix such as https://host/v1.";
  }

  if (status === 401 || /invalid_api_key|unauthorized/i.test(message)) {
    return `Authentication problem (${status}): ${message}. Check that OPENAI_API_KEY belongs to this gateway and still has access.`;
  }

  if (status === 404) {
    return `Endpoint problem (404): ${message}. Check that OPENAI_BASE_URL ends with an API prefix like /v1 and that the gateway exposes the image endpoints.`;
  }

  if (status === 429) {
    return `Capacity problem (429): ${message}. The gateway or upstream account is rate-limited or overloaded.`;
  }

  if (/No available compatible accounts/i.test(message)) {
    return "Proxy resource problem: the gateway reported no available compatible image accounts. This is not a prompt bug; the proxy currently has no usable upstream image capacity.";
  }

  const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet ? `${message}. Response preview: ${snippet}` : message;
}

async function performApiFetch(endpointPath, init = {}) {
  const { apiKey, baseUrl } = getConfig();
  const { headers, timeoutMs, ...rest } = init;

  try {
    return await fetch(`${baseUrl}${endpointPath}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs || getRequestTimeoutMs()),
    });
  } catch (error) {
    throw new Error(formatTransportError(error));
  }
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
    throw new Error(classifyErrorMessage({ status: response.status, message, rawText }));
  }

  return payload;
}

async function callJsonImagesEndpoint(endpointPath, body) {
  const response = await performApiFetch(endpointPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseApiResponse(response);
}

async function callMultipartImagesEndpoint(endpointPath, formData) {
  const response = await performApiFetch(endpointPath, {
    method: "POST",
    body: formData,
  });

  return parseApiResponse(response);
}

async function callModelsEndpoint() {
  const response = await performApiFetch("/models", {
    method: "GET",
    timeoutMs: Math.min(getRequestTimeoutMs(), 60000),
  });

  return parseApiResponse(response);
}

async function loadFileInput(source, fallbackPrefix = "image") {
  if (/^https?:\/\//i.test(source)) {
    let response;

    try {
      response = await fetch(source, {
        signal: AbortSignal.timeout(getRequestTimeoutMs()),
      });
    } catch (error) {
      throw new Error(formatTransportError(error));
    }

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
    let response;

    try {
      response = await fetch(item.url, {
        signal: AbortSignal.timeout(getRequestTimeoutMs()),
      });
    } catch (error) {
      throw new Error(formatTransportError(error));
    }

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

async function buildDoctorReport({
  probe_generation: probeGeneration,
  probe_prompt: probePrompt,
  models_preview_limit: modelsPreviewLimit,
} = {}) {
  const config = readConfig();
  const previewLimit =
    Number.isInteger(modelsPreviewLimit) && modelsPreviewLimit > 0
      ? modelsPreviewLimit
      : DEFAULT_MODELS_PREVIEW_LIMIT;
  const lines = [
    "Image Studio Doctor",
    "MCP transport: reachable. If you can run this tool, the stdio server is already registered enough for the current host to call it.",
    `Base URL: ${config.baseUrl}`,
    `Configured model: ${config.model}`,
    `API key: ${config.apiKey ? `present (${maskSecret(config.apiKey)})` : "missing"}`,
    `Timeout: ${config.timeoutMs} ms`,
  ];

  if (!/\/v\d+$/.test(config.baseUrl)) {
    lines.push("Warning: OPENAI_BASE_URL does not end with /v1. That is often a sign the value points to a dashboard page instead of an API prefix.");
  }

  if (!config.apiKey) {
    lines.push("Summary: not ready.");
    lines.push("Next step: set OPENAI_API_KEY in the MCP server environment, then rerun image_studio_doctor.");
    return lines.join("\n");
  }

  try {
    const payload = await callModelsEndpoint();
    const modelIds = Array.isArray(payload?.data)
      ? payload.data.map((item) => item?.id).filter(Boolean).sort()
      : [];
    const imageModelIds = modelIds.filter((id) => /image|dall-e/i.test(id));

    lines.push(`Models endpoint: ok (${modelIds.length} models returned)`);
    lines.push(
      `Models preview: ${modelIds.slice(0, previewLimit).join(", ") || "(none returned by gateway)"}`
    );
    lines.push(
      `Image-like models: ${imageModelIds.slice(0, previewLimit).join(", ") || "(none detected by name)"}`
    );
    lines.push(
      modelIds.includes(config.model)
        ? `Configured model status: found (${config.model})`
        : `Configured model status: not listed by /models (${config.model})`
    );
  } catch (error) {
    lines.push("Models endpoint: failed");
    lines.push(`Diagnosis: ${error.message}`);
    lines.push("Summary: partially configured, but the gateway checks did not pass.");
    return lines.join("\n");
  }

  if (probeGeneration) {
    try {
      const payload = await callJsonImagesEndpoint("/images/generations", {
        model: config.model,
        prompt: probePrompt || DOCTOR_PROBE_PROMPT,
        n: 1,
        size: "1024x1024",
      });
      const revisedPrompt =
        Array.isArray(payload?.data) && payload.data[0]?.revised_prompt
          ? payload.data[0].revised_prompt
          : null;

      lines.push("Generation probe: ok (the gateway accepted a real billable image generation request)");
      if (revisedPrompt) {
        lines.push(`Generation probe revised prompt: ${revisedPrompt}`);
      }
      lines.push("Summary: ready.");
      return lines.join("\n");
    } catch (error) {
      lines.push("Generation probe: failed");
      lines.push(`Diagnosis: ${error.message}`);
      lines.push("Summary: configuration exists, but a real image job still failed.");
      return lines.join("\n");
    }
  }

  lines.push("Generation probe: skipped (set probe_generation=true when you want a billable end-to-end test)");
  lines.push("Summary: likely ready. Run a real generation or enable probe_generation to confirm the full path.");
  return lines.join("\n");
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

const doctorSchema = {
  probe_generation: z.boolean().optional(),
  probe_prompt: z.string().min(1).optional(),
  models_preview_limit: z.number().int().min(1).max(20).optional(),
};

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

server.registerTool(
  "image_studio_doctor",
  {
    description:
      "Run a connectivity and configuration check for Image Studio MCP. This verifies that the current host can reach the MCP server, reports whether OPENAI_API_KEY is present, checks the configured base URL, queries /models, and can optionally run a billable generation probe.",
    inputSchema: doctorSchema,
  },
  async (args) => ({
    content: [
      {
        type: "text",
        text: await buildDoctorReport(args),
      },
    ],
  })
);

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
