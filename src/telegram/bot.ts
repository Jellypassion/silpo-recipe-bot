import { Bot } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { config } from "../config.js";
import { generateRecipe } from "../agents/recipeAgent.js";
import { addIngredientsToCart } from "../agents/cartAgent.js";
import { ensureAuthorized, forgetTokens } from "../silpo/ensureAuthorized.js";
import { formatCartResult, formatRecipe } from "./format.js";
import { authRequiredKeyboard, checkoutKeyboard, ingredientsKeyboard } from "./keyboards.js";
import { clearSession, getSession, setSession } from "./session.js";

export const bot = new Bot(config.telegramBotToken);

// Must be the first middleware: the runner processes chats concurrently, this
// keeps each chat's own updates in order (e.g. toggle, toggle, confirm).
bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));

// The bot is a personal shopping assistant — ignore groups/channels entirely.
bot.use(async (ctx, next) => {
  if (ctx.chat?.type === "private") await next();
});

bot.command("start", (ctx) =>
  ctx.reply(
    "Привіт! Напиши назву страви (наприклад «борщ» або «сирники»), і я:\n" +
      "1. Складу покроковий рецепт\n" +
      "2. Визначу інгредієнти й кількість\n" +
      "3. За твоїм підтвердженням додам товари в кошик Сільпо (пріоритет — акційним)\n\n" +
      "Тобі залишиться тільки оплатити замовлення.\n\n" +
      "/cancel — скинути поточний рецепт\n/logout — відв'язати акаунт Сільпо",
  ),
);

bot.command("cancel", async (ctx) => {
  clearSession(ctx.chat.id);
  await ctx.reply("Скинуто. Напиши назву іншої страви.");
});

bot.command("logout", async (ctx) => {
  await forgetTokens(String(ctx.chat.id));
  await ctx.reply("Акаунт Сільпо відв'язано. При наступному додаванні в кошик попрошу увійти знову.");
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;
  const chatId = ctx.chat.id;

  const session = getSession(chatId);
  if (session?.awaitingAddress) {
    session.awaitingAddress = false;
    session.deliveryAddress = text;
    await runCartFlow(chatId);
    return;
  }

  const statusMsg = await ctx.reply("👩‍🍳 Готую рецепт…");
  try {
    const recipe = await generateRecipe(text);
    const newSession = { recipe, selected: recipe.ingredients.map(() => true) };
    setSession(chatId, newSession);
    await ctx.reply(formatRecipe(recipe), { reply_markup: ingredientsKeyboard(newSession) });
  } catch (err) {
    console.error("generateRecipe failed:", err);
    await ctx.reply("Не вдалося скласти рецепт. Спробуй ще раз або сформулюй інакше.");
  } finally {
    await ctx.api.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
  }
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return ctx.answerCallbackQuery();

  if (data.startsWith("toggle:")) {
    const index = Number(data.slice("toggle:".length));
    const session = getSession(chatId);
    if (session && index >= 0 && index < session.selected.length) {
      session.selected[index] = !session.selected[index];
      await ctx.editMessageReplyMarkup({ reply_markup: ingredientsKeyboard(session) }).catch(() => {});
    }
    return ctx.answerCallbackQuery();
  }

  if (data === "cancel") {
    clearSession(chatId);
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.answerCallbackQuery();
    return ctx.reply("Скасовано. Напиши назву іншої страви, коли будеш готовий.");
  }

  if (data === "confirm") {
    await ctx.answerCallbackQuery();
    await runCartFlow(chatId);
    return;
  }

  return ctx.answerCallbackQuery();
});

/**
 * Checks/refreshes Silpo auth for this chat and either asks the user to log
 * in once, or fills the cart with the selected ingredients. Shared by the
 * "confirm" button, the address reply, and the OAuth callback auto-resume.
 */
export async function runCartFlow(chatId: number): Promise<void> {
  const session = getSession(chatId);
  if (!session) {
    await bot.api.sendMessage(chatId, "Спочатку напиши назву страви.");
    return;
  }
  if (session.cartRunInProgress) {
    await bot.api.sendMessage(chatId, "Вже наповнюю кошик, зачекай трохи…");
    return;
  }

  const ingredients = session.recipe.ingredients.filter((_, i) => session.selected[i]);
  if (ingredients.length === 0) {
    await bot.api.sendMessage(chatId, "Обери хоча б один інгредієнт перед додаванням у кошик.");
    return;
  }

  const userId = String(chatId);
  const auth = await ensureAuthorized(userId);
  if (auth.status === "action_required") {
    await bot.api.sendMessage(
      chatId,
      "Щоб я міг додати товари в твій кошик, увійди в акаунт Сільпо (один раз, у браузері) — " +
        "натисни кнопку нижче. Після входу я продовжу автоматично.",
      { reply_markup: authRequiredKeyboard(auth.authorizationUrl) },
    );
    return;
  }

  session.cartRunInProgress = true;
  const progressMsg = await bot.api.sendMessage(chatId, "🛒 Шукаю товари й наповнюю кошик…");
  try {
    const result = await addIngredientsToCart(auth.accessToken, {
      ingredients,
      deliveryAddress: session.deliveryAddress,
    });

    switch (result.status) {
      case "done":
        await bot.api.sendMessage(chatId, formatCartResult(result), {
          reply_markup: checkoutKeyboard(result.checkoutWebLink),
        });
        await bot.api.sendMessage(
          chatId,
          "Відкрий застосунок «Сільпо», перевір кошик і оплати замовлення 🎉",
        );
        break;
      case "address_required":
        session.awaitingAddress = true;
        await bot.api.sendMessage(
          chatId,
          "У тебе ще немає кошика й збереженої адреси в Сільпо. Напиши адресу доставки " +
            "(місто, вулиця, будинок) — і я створю кошик та додам товари.",
        );
        break;
      case "auth_error":
        await forgetTokens(userId);
        await bot.api.sendMessage(
          chatId,
          "Сільпо не прийняв токен доступу. Натисни «Додати в кошик» ще раз — попрошу увійти знову.",
        );
        break;
      case "failed":
        await bot.api.sendMessage(chatId, `Не вдалося наповнити кошик: ${result.message}`);
        break;
    }
  } catch (err) {
    console.error("addIngredientsToCart failed:", err);
    await bot.api.sendMessage(
      chatId,
      "Щось пішло не так під час наповнення кошика. Спробуй ще раз кнопкою «Додати в кошик».",
    );
  } finally {
    session.cartRunInProgress = false;
    await bot.api.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
  }
}
