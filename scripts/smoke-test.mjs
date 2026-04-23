import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cwdUrl = new URL("..", import.meta.url);
const cwd =
  cwdUrl.pathname.startsWith("/") && process.platform === "win32"
    ? cwdUrl.pathname.slice(1)
    : cwdUrl.pathname;

const prompt = process.env.SMOKE_TEST_PROMPT || "a minimal teal square logo icon on a clean background";
const outputDir = process.env.SMOKE_TEST_OUTPUT_DIR || path.join(cwd, "output");
const size = process.env.SMOKE_TEST_SIZE || "1024x1024";
const quality = process.env.SMOKE_TEST_QUALITY;

await mkdir(outputDir, { recursive: true });

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["./scripts/openai-image-mcp.mjs"],
  cwd,
  stderr: "pipe",
  env: process.env,
});

const client = new Client({ name: "image-studio-mcp-smoke-test", version: "0.1.0" });

try {
  await client.connect(transport);
  const result = await client.callTool(
    {
      name: "generate_image",
      arguments: {
        prompt,
        output_dir: outputDir,
        filename_prefix: "smoke-test",
        count: 1,
        size,
        quality,
        output_format: "png",
      },
    },
    undefined,
    {
      timeout: Number(process.env.SMOKE_TEST_TIMEOUT_MS || 300000),
    }
  );

  if (result.isError) {
    console.error(JSON.stringify(result.content, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(result.content, null, 2));
  }
} finally {
  await transport.close();
}
