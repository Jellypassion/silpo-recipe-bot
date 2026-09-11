/**
 * In-memory map of OAuth `state` -> Telegram userId, alive only for the
 * duration of one authorization round-trip (browser tab open -> callback).
 * Not persisted: if the process restarts mid-flow the user just retries.
 */
const pending = new Map<string, string>();

export function registerPendingState(state: string, userId: string): void {
  pending.set(state, userId);
}

export function resolvePendingState(state: string): string | undefined {
  const userId = pending.get(state);
  if (userId) pending.delete(state);
  return userId;
}
