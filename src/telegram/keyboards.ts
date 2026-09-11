import { InlineKeyboard } from "grammy";
import type { ChatSession } from "./session.js";

export function ingredientsKeyboard(session: ChatSession): InlineKeyboard {
  const kb = new InlineKeyboard();
  session.recipe.ingredients.forEach((ingredient, index) => {
    const checked = session.selected[index] ? "✅" : "⬜";
    kb.text(`${checked} ${ingredient.name} — ${ingredient.quantity}`, `toggle:${index}`).row();
  });
  return kb.text("🛒 Додати в кошик", "confirm").row().text("❌ Скасувати", "cancel");
}

export function authRequiredKeyboard(authUrl: string): InlineKeyboard {
  return new InlineKeyboard()
    .url("🔐 Увійти в Сільпо", authUrl)
    .row()
    .text("✅ Я авторизувався, продовжити", "confirm");
}

export function checkoutKeyboard(webLink?: string): InlineKeyboard | undefined {
  return webLink ? new InlineKeyboard().url("🛒 Оформи замовлення в Сільпо", webLink) : undefined;
}
