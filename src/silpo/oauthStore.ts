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
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
}

type StoreShape = Record<string, UserOAuthRecord>;

const storePath = path.join(config.dataDir, "oauth-store.json");
let cache: StoreShape | undefined;
let writeQueue: Promise<unknown> = Promise.resolve();

async function load(): Promise<StoreShape> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(storePath, "utf8");
    cache = JSON.parse(raw) as StoreShape;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(cache, null, 2), "utf8");
}

function enqueueWrite(): Promise<void> {
  writeQueue = writeQueue.then(persist);
  return writeQueue as Promise<void>;
}

export async function getUserRecord(userId: string): Promise<UserOAuthRecord> {
  const store = await load();
  return store[userId] ?? {};
}

export async function updateUserRecord(
  userId: string,
  patch: Partial<UserOAuthRecord>,
): Promise<void> {
  const store = await load();
  store[userId] = { ...store[userId], ...patch };
  await enqueueWrite();
}

export async function clearUserRecord(
  userId: string,
  scope: "all" | "client" | "tokens" | "verifier" | "discovery",
): Promise<void> {
  const store = await load();
  const record = store[userId];
  if (!record) return;
  if (scope === "all") {
    delete store[userId];
  } else if (scope === "client") {
    delete record.clientInformation;
  } else if (scope === "tokens") {
    delete record.tokens;
  } else if (scope === "verifier") {
    delete record.codeVerifier;
  } else if (scope === "discovery") {
    delete record.discoveryState;
  }
  await enqueueWrite();
}
