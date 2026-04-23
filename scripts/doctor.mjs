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
  env: process.env,
});

const client = new Client({ name: "image-studio-mcp-doctor", version: "0.2.0" });

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "image_studio_doctor",
    arguments: {
      probe_generation: process.env.IMAGE_STUDIO_DOCTOR_PROBE === "1",
      probe_prompt: process.env.IMAGE_STUDIO_DOCTOR_PROMPT,
    },
  });

  if (result.isError) {
    console.error(JSON.stringify(result.content, null, 2));
    process.exitCode = 1;
  } else {
    for (const item of result.content) {
      if (item.type === "text") {
        console.log(item.text);
      }
    }
  }
} finally {
  await transport.close();
}
