import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";

export interface UserOAuthRecord {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  /** Unix ms when `tokens` were issued; lets us skip needless refreshes. */
  tokensObtainedAt?: number;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
}

export type InvalidateScope = "all" | "client" | "tokens" | "verifier" | "discovery";

type StoreShape = Record<string, UserOAuthRecord>;

const storePath = path.join(config.dataDir, "oauth-store.json");
let cache: StoreShape | undefined;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<StoreShape> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(storePath, "utf8")) as StoreShape;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${storePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(tmp, storePath);
}

/** Serialises writes; a failed write is logged but never poisons the queue. */
function enqueueWrite(): Promise<void> {
  writeQueue = writeQueue
    .then(persist)
    .catch((err) => console.error("oauth-store write failed:", err));
  return writeQueue;
}

export async function getUserRecord(userId: string): Promise<UserOAuthRecord> {
  return (await load())[userId] ?? {};
}

export async function updateUserRecord(
  userId: string,
  patch: Partial<UserOAuthRecord>,
): Promise<void> {
  const store = await load();
  store[userId] = { ...store[userId], ...patch };
  await enqueueWrite();
}

export async function clearUserRecord(userId: string, scope: InvalidateScope): Promise<void> {
  const store = await load();
  const record = store[userId];
  if (!record) return;
  switch (scope) {
    case "all":
      delete store[userId];
      break;
    case "client":
      delete record.clientInformation;
      break;
    case "tokens":
      delete record.tokens;
      delete record.tokensObtainedAt;
      break;
    case "verifier":
      delete record.codeVerifier;
      break;
    case "discovery":
      delete record.discoveryState;
      break;
  }
  await enqueueWrite();
}
