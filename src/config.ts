import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  silpoMcpUrl: process.env.SILPO_MCP_URL ?? "https://mcp.silpo.ua/mcp",
  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/+$/, ""),
  port: Number(process.env.PORT ?? 3000),
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-opus-5",
  dataDir: process.env.DATA_DIR ?? "./data",
};

export const oauthCallbackPath = "/oauth/callback";
export const oauthRedirectUrl = `${config.publicBaseUrl}${oauthCallbackPath}`;
