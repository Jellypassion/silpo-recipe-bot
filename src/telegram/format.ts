import type { CartResult, Recipe } from "../agents/types.js";

export function formatRecipe(recipe: Recipe): string {
  const steps = recipe.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return (
    `🍽 ${recipe.title} (${recipe.servings})\n\n${steps}\n\n` +
    "Познач інгредієнти, які треба купити (усі обрані за замовчуванням), " +
    "і натисни «Додати в кошик»."
  );
}

export function formatCartResult(result: CartResult): string {
  const lines: string[] = [];
  if (result.added.length > 0) {
    lines.push("🛒 Додано в кошик:");
    for (const item of result.added) {
      const price = item.price !== undefined ? ` — ${item.price} грн` : "";
      lines.push(`${item.isPromo ? "🔥" : "•"} ${item.product} × ${item.quantity}${price}`);
    }
  }
  if (result.notFound.length > 0) {
    lines.push("", "⚠️ Не знайшов, додай вручну: " + result.notFound.join(", "));
  }
  if (result.totalPrice !== undefined) {
    lines.push("", `Сума кошика: ~${result.totalPrice} грн`);
  }
  if (result.message) lines.push("", result.message);
  lines.push("", "🔥 — товар за акцією");
  return lines.join("\n");
}
