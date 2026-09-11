import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { config } from "../config.js";
import { SilpoOAuthProvider } from "./oauthProvider.js";

export type AuthCheckResult =
  | { status: "authorized"; accessToken: string }
  | { status: "action_required"; authorizationUrl: string };

/**
 * Ensures the given Telegram user has a valid Silpo MCP access token,
 * refreshing it if possible. If the user has never authorized (or the
 * refresh token is dead), returns a browser URL the user must open once.
 */
export async function ensureAuthorized(userId: string): Promise<AuthCheckResult> {
  const provider = new SilpoOAuthProvider(userId);
  const result = await auth(provider, { serverUrl: config.silpoMcpUrl });

  if (result === "REDIRECT") {
    if (!provider.lastAuthorizationUrl) {
      throw new Error("OAuth redirect requested but no authorization URL was captured");
    }
    return {
      status: "action_required",
      authorizationUrl: provider.lastAuthorizationUrl.toString(),
    };
  }

  const tokens = await provider.tokens();
  if (!tokens?.access_token) {
    throw new Error("auth() returned AUTHORIZED but no access token is stored");
  }
  return { status: "authorized", accessToken: tokens.access_token };
}

/** Completes the flow after the user comes back from the Silpo login page. */
export async function completeAuthorization(
  userId: string,
  authorizationCode: string,
): Promise<void> {
  const provider = new SilpoOAuthProvider(userId);
  const result = await auth(provider, {
    serverUrl: config.silpoMcpUrl,
    authorizationCode,
  });
  if (result !== "AUTHORIZED") {
    throw new Error(`Expected AUTHORIZED after code exchange, got ${result}`);
  }
}
