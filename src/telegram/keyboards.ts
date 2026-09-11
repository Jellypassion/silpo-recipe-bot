import { InlineKeyboard } from "grammy";
import type { ChatSession } from "./session.js";

export function ingredientsKeyboard(session: ChatSession): InlineKeyboard {
  const kb = new InlineKeyboard();
  session.recipe.ingredients.forEach((ingredient, index) => {
    const checked = session.selected[index] ? "✅" : "⬜";
    kb.text(`${checked} ${ingredient.name} — ${ingredient.quantity}`, `toggle:${index}`).row();
  });
  kb.text("🛒 Додати в кошик", "confirm").row();
  kb.text("❌ Скасувати", "cancel");
  return kb;
}

export function authRequiredKeyboard(authUrl: string): InlineKeyboard {
  return new InlineKeyboard()
    .url("🔐 Увійти в Сільпо", authUrl)
    .row()
    .text("✅ Я авторизувався, продовжити", "confirm");
}
