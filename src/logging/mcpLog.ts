import fs from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const logPath = path.join(config.dataDir, "mcp-calls.jsonl");

type McpBlock = Anthropic.Beta.BetaMCPToolUseBlock | Anthropic.Beta.BetaMCPToolResultBlock;

function isMcpBlock(block: Anthropic.Beta.BetaContentBlock): block is McpBlock {
  return block.type === "mcp_tool_use" || block.type === "mcp_tool_result";
}

/**
 * Persists every MCP tool call/result Claude made against the Silpo server —
 * the hackathon asks for JSON-RPC-level evidence that real tools were called.
 */
export async function logMcpBlocks(
  context: string,
  blocks: Anthropic.Beta.BetaContentBlock[],
): Promise<void> {
  const relevant = blocks.filter(isMcpBlock);
  if (relevant.length === 0) {
    console.warn(`[mcp:${context}] no MCP tool calls in this response`);
    return;
  }

  for (const block of relevant) {
    if (block.type === "mcp_tool_use") {
      console.log(`[mcp:${context}] → ${block.name}`, JSON.stringify(block.input));
    } else {
      const preview = typeof block.content === "string"
        ? block.content
        : block.content.map((c) => c.text).join("");
      console.log(
        `[mcp:${context}] ← ${block.tool_use_id}${block.is_error ? " ERROR" : ""}`,
        preview.slice(0, 300),
      );
    }
  }

  await fs.mkdir(config.dataDir, { recursive: true });
  const at = new Date().toISOString();
  const lines = relevant.map((block) => JSON.stringify({ at, context, block })).join("\n");
  await fs.appendFile(logPath, lines + "\n", "utf8");
}
