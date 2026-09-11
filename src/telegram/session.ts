import type { Recipe } from "../agents/types.js";

export interface ChatSession {
  recipe: Recipe;
  selected: boolean[];
  /** Set when the agent asked for a delivery address; next text message is the address. */
  awaitingAddress?: boolean;
  deliveryAddress?: string;
  /** Guards against a second "confirm" while a cart run is already in flight. */
  cartRunInProgress?: boolean;
}

const sessions = new Map<number, ChatSession>();

export const getSession = (chatId: number): ChatSession | undefined => sessions.get(chatId);
export const setSession = (chatId: number, session: ChatSession): void => {
  sessions.set(chatId, session);
};
export const clearSession = (chatId: number): void => {
  sessions.delete(chatId);
};
