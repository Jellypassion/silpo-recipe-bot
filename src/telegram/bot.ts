import { Bot } from "grammy";
import { config } from "../config.js";
import { generateRecipe } from "../agents/recipeAgent.js";
import { addIngredientsToCart } from "../agents/cartAgent.js";
import { ensureAuthorized } from "../silpo/ensureAuthorized.js";
import { authRequiredKeyboard, ingredientsKeyboard } from "./keyboards.js";
import { clearSession, getSession, setSession, type ChatSession } from "./session.js";
import type { Recipe } from "../agents/types.js";

export const bot = new Bot(config.telegramBotToken);

function formatRecipe(recipe: Recipe): string {
  const steps = recipe.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return (
    `🍽 ${recipe.title} (${recipe.servings})\n\n` +
    `${steps}\n\n` +
    `Познач інгредієнти, які треба купити (усі обрані за замовчуванням), ` +
    `і натисни «Додати в кошик».`
  );
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привіт! Напиши назву страви (наприклад «борщ» або «сирники»), і я:\n" +
      "1. Складу покроковий рецепт\n" +
      "2. Визначу інгредієнти й кількість\n" +
      "3. За твоїм підтвердженням додам потрібні товари в кошик Сільпо " +
      "(пріоритет — товарам за акцією)\n\n" +
      "Тобі залишиться тільки відкрити застосунок і оплатити замовлення.",
  );
});

bot.on("message:text", async (ctx) => {
  const dishName = ctx.message.text.trim();
  if (dishName.startsWith("/")) return;

  const statusMsg = await ctx.reply("👩‍🍳 Готую рецепт…");
  try {
    const recipe = await generateRecipe(dishName);
    const session: ChatSession = {
      recipe,
      selected: recipe.ingredients.map(() => true),
    };
    setSession(ctx.chat.id, session);

    const sent = await ctx.reply(formatRecipe(recipe), {
      reply_markup: ingredientsKeyboard(session),
    });
    session.recipeMessageId = sent.message_id;
  } catch (err) {
    console.error("generateRecipe failed:", err);
    await ctx.reply("Не вдалося скласти рецепт. Спробуй ще раз або сформулюй інакше.");
  } finally {
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  }
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;

  if (data.startsWith("toggle:")) {
    const index = Number(data.slice("toggle:".length));
    const session = getSession(chatId);
    if (!session || Number.isNaN(index)) {
      await ctx.answerCallbackQuery();
      return;
    }
    session.selected[index] = !session.selected[index];
    await ctx.editMessageReplyMarkup({ reply_markup: ingredientsKeyboard(session) });
    await ctx.answerCallbackQuery();
    return;
  }

  if (data === "cancel") {
    clearSession(chatId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply("Скасовано. Напиши назву іншої страви, коли будеш готовий.");
    return;
  }

  if (data === "confirm") {
    await ctx.answerCallbackQuery();
    await runCartFlow(chatId);
    return;
  }

  await ctx.answerCallbackQuery();
});

/**
 * Checks/refreshes Silpo auth for this chat and either asks the user to log
 * in once, or fills the cart with the currently selected ingredients.
 * Shared by the "confirm" button and by the OAuth callback auto-resume.
 */
export async function runCartFlow(chatId: number): Promise<void> {
  const session = getSession(chatId);
  if (!session) {
    await bot.api.sendMessage(chatId, "Спочатку напиши назву страви.");
    return;
  }

  const selectedIngredients = session.recipe.ingredients.filter(
    (_, i) => session.selected[i],
  );
  if (selectedIngredients.length === 0) {
    await bot.api.sendMessage(chatId, "Обери хоча б один інгредієнт перед додаванням у кошик.");
    return;
  }

  const auth = await ensureAuthorized(String(chatId));
  if (auth.status === "action_required") {
    await bot.api.sendMessage(
      chatId,
      "Щоб я міг додати товари в твій кошик, авторизуйся в Сільпо (один раз, у браузері) — " +
        "натисни кнопку нижче, увійди, і повернись сюди.",
      { reply_markup: authRequiredKeyboard(auth.authorizationUrl) },
    );
    return;
  }

  const progressMsg = await bot.api.sendMessage(chatId, "🛒 Шукаю товари й наповнюю кошик…");
  try {
    const summary = await addIngredientsToCart(auth.accessToken, selectedIngredients);
    await bot.api.sendMessage(
      chatId,
      `${summary}\n\nВідкрий застосунок «Сільпо», перевір кошик і оплати замовлення 🎉`,
    );
  } catch (err) {
    console.error("addIngredientsToCart failed:", err);
    await bot.api.sendMessage(
      chatId,
      "Щось пішло не так під час наповнення кошика. Спробуй ще раз командою «Додати в кошик».",
    );
  } finally {
    await bot.api.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
  }
}
