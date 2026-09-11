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
  // claudeModel: process.env.CLAUDE_MODEL ?? "claude-opus-5",
  claudeRecipeModel: process.env.CLAUDE_RECIPE_MODEL ?? "claude-haiku-4.5",
  claudeCartModel: process.env.CLAUDE_CART_MODEL ?? "claude-sonnet-5",
  dataDir: process.env.DATA_DIR ?? "./data",
};

if (!config.publicBaseUrl.startsWith("https://")) {
  throw new Error("PUBLIC_BASE_URL must be an https:// URL — Silpo's OAuth redirect_uri requires it");
}

export const oauthCallbackPath = "/oauth/callback";
export const oauthRedirectUrl = `${config.publicBaseUrl}${oauthCallbackPath}`;
