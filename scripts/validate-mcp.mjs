import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cwdUrl = new URL("..", import.meta.url);
const cwd =
  cwdUrl.pathname.startsWith("/") && process.platform === "win32"
    ? cwdUrl.pathname.slice(1)
    : cwdUrl.pathname;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["./scripts/openai-image-mcp.mjs"],
  cwd,
  stderr: "pipe",
});

const client = new Client({ name: "image-studio-mcp-validator", version: "0.1.0" });

try {
  await client.connect(transport);
  const result = await client.listTools();
  const toolNames = result.tools.map((tool) => tool.name).sort();

  if (!toolNames.includes("generate_image") || !toolNames.includes("edit_image")) {
    throw new Error(`Expected generate_image and edit_image, got: ${toolNames.join(", ")}`);
  }

  console.log(`Validated tools: ${toolNames.join(", ")}`);
} finally {
  await transport.close();
}
