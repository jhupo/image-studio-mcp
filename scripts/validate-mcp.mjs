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

const client = new Client({ name: "image-studio-mcp-validator", version: "0.2.0" });

try {
  await client.connect(transport);
  const result = await client.listTools();
  const toolNames = result.tools.map((tool) => tool.name).sort();

  const requiredTools = ["image_studio_doctor", "generate_image", "edit_image"];
  const missingTools = requiredTools.filter((toolName) => !toolNames.includes(toolName));

  if (missingTools.length > 0) {
    throw new Error(`Expected ${requiredTools.join(", ")}, got: ${toolNames.join(", ")}`);
  }

  console.log(`Validated tools: ${toolNames.join(", ")}`);
} finally {
  await transport.close();
}
