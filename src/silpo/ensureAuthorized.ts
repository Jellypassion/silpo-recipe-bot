import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { config } from "../config.js";
import { SilpoOAuthProvider } from "./oauthProvider.js";
import { clearUserRecord, getUserRecord } from "./oauthStore.js";

export type AuthCheckResult =
  | { status: "authorized"; accessToken: string }
  | { status: "action_required"; authorizationUrl: string };

/** Treat a token as expired this many seconds before its real expiry. */
const EXPIRY_MARGIN_SEC = 60;

async function validStoredToken(userId: string): Promise<string | undefined> {
  const { tokens, tokensObtainedAt } = await getUserRecord(userId);
  if (!tokens?.access_token) return undefined;
  // No expiry info → we can't tell; let auth() refresh to be safe.
  if (tokens.expires_in === undefined || tokensObtainedAt === undefined) return undefined;
  const expiresAt = tokensObtainedAt + (tokens.expires_in - EXPIRY_MARGIN_SEC) * 1000;
  return Date.now() < expiresAt ? tokens.access_token : undefined;
}

/**
 * Returns a usable Silpo MCP access token for the user, refreshing only when
 * the stored one is (about to be) expired. If the user never authorised, or
 * the refresh token is dead, returns the one-time browser URL instead.
 */
export async function ensureAuthorized(userId: string): Promise<AuthCheckResult> {
  const cached = await validStoredToken(userId);
  if (cached) return { status: "authorized", accessToken: cached };

  const provider = new SilpoOAuthProvider(userId);
  const result = await auth(provider, { serverUrl: config.silpoMcpUrl });

  if (result === "REDIRECT") {
    if (!provider.lastAuthorizationUrl) {
      throw new Error("OAuth redirect requested but no authorization URL was captured");
    }
    return { status: "action_required", authorizationUrl: provider.lastAuthorizationUrl.toString() };
  }

  const tokens = await provider.tokens();
  if (!tokens?.access_token) {
    throw new Error("auth() returned AUTHORIZED but no access token is stored");
  }
  return { status: "authorized", accessToken: tokens.access_token };
}

/** Second half of the flow: exchange the `code` from the browser redirect. */
export async function completeAuthorization(userId: string, authorizationCode: string): Promise<void> {
  const provider = new SilpoOAuthProvider(userId);
  const result = await auth(provider, { serverUrl: config.silpoMcpUrl, authorizationCode });
  if (result !== "AUTHORIZED") {
    throw new Error(`Expected AUTHORIZED after code exchange, got ${result}`);
  }
}

/** Drops the stored tokens (e.g. after the MCP server answered 401, or /logout). */
export async function forgetTokens(userId: string): Promise<void> {
  await clearUserRecord(userId, "tokens");
}
