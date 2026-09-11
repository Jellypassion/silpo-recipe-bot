import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const logPath = path.join(config.dataDir, "mcp-calls.jsonl");

/**
 * Persists every mcp_tool_use / mcp_tool_result block Claude produced while
 * talking to the Silpo MCP server — the hackathon rules ask for JSON-RPC
 * evidence that a real tool call happened.
 */
export async function logMcpBlocks(context: string, blocks: unknown[]): Promise<void> {
  const relevant = blocks.filter((b): b is { type: string } =>
    typeof b === "object" && b !== null && "type" in b &&
    ((b as { type: string }).type === "mcp_tool_use" ||
      (b as { type: string }).type === "mcp_tool_result"),
  );
  if (relevant.length === 0) return;

  console.log(`[mcp:${context}]`, JSON.stringify(relevant, null, 2));

  await fs.mkdir(config.dataDir, { recursive: true });
  const lines = relevant
    .map((b) => JSON.stringify({ at: new Date().toISOString(), context, block: b }))
    .join("\n") + "\n";
  await fs.appendFile(logPath, lines, "utf8");
}
