import { randomUUID } from "node:crypto";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { oauthRedirectUrl } from "../config.js";
import {
  clearUserRecord,
  getUserRecord,
  updateUserRecord,
  type InvalidateScope,
} from "./oauthStore.js";
import { registerPendingState } from "./pendingAuth.js";

/**
 * One OAuthClientProvider per Telegram user, backed by the server-side store.
 * Implements the flow the Silpo docs describe: 401 → `.well-known` discovery →
 * Dynamic Client Registration (`POST /register`) → PKCE → `/authorize` in the
 * browser → token → `refresh_token`. The SDK's `auth()` drives all of it.
 */
export class SilpoOAuthProvider implements OAuthClientProvider {
  /** Set by `redirectToAuthorization`; the bot sends this URL to the user. */
  public lastAuthorizationUrl: URL | undefined;

  constructor(private readonly userId: string) {}

  get redirectUrl(): string {
    return oauthRedirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Silpo Recipe Bot",
      redirect_uris: [oauthRedirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state(): Promise<string> {
    const state = randomUUID();
    registerPendingState(state, this.userId);
    return state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return (await getUserRecord(this.userId)).clientInformation;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await updateUserRecord(this.userId, { clientInformation: info });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await getUserRecord(this.userId)).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await updateUserRecord(this.userId, { tokens, tokensObtainedAt: Date.now() });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.lastAuthorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await updateUserRecord(this.userId, { codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const verifier = (await getUserRecord(this.userId)).codeVerifier;
    if (!verifier) throw new Error(`No PKCE code verifier stored for user ${this.userId}`);
    return verifier;
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await updateUserRecord(this.userId, { discoveryState: state });
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return (await getUserRecord(this.userId)).discoveryState;
  }

  async invalidateCredentials(scope: InvalidateScope): Promise<void> {
    await clearUserRecord(this.userId, scope);
  }
}
