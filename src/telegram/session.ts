import type { Recipe } from "../agents/types.js";

export interface ChatSession {
  recipe: Recipe;
  selected: boolean[];
  /** Message id of the recipe card, so we can edit its keyboard in place. */
  recipeMessageId?: number;
}

const sessions = new Map<number, ChatSession>();

export function setSession(chatId: number, session: ChatSession): void {
  sessions.set(chatId, session);
}

export function getSession(chatId: number): ChatSession | undefined {
  return sessions.get(chatId);
}

export function clearSession(chatId: number): void {
  sessions.delete(chatId);
}
