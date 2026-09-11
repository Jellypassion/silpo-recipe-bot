import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { logMcpBlocks } from "../logging/mcpLog.js";
import type { Ingredient } from "./types.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SILPO_MCP_SERVER_NAME = "silpo";

/**
 * Phase 2: Claude talks to the real Silpo MCP server (remote, over the
 * native MCP connector — Anthropic's servers make the tool calls, using the
 * user's own OAuth access token) to find matching products, prefer
 * promotional items, and add them to the user's cart.
 */
export async function addIngredientsToCart(
  accessToken: string,
  ingredients: Ingredient[],
): Promise<string> {
  const ingredientList = ingredients
    .map((i) => `- ${i.name} — ${i.quantity}${i.notes ? ` (${i.notes})` : ""}`)
    .join("\n");

  const system = `Ти асистент, який наповнює кошик покупок у Сільпо через MCP-інструменти. Тобі дано список
інгредієнтів з рецепта. Для кожного:
1. Знайди відповідні реальні товари в каталозі Сільпо (пошук товарів, батчем де можливо).
2. Серед знайдених варіантів пріоритетно обирай товари, що зараз беруть участь в акції
   (перевіряй ознаки акції/знижки у картці товару або через отримання акцій), якщо вони
   відповідають потрібному інгредієнту за якістю та кількістю. Якщо акційного варіанта нема —
   бери звичайний найбільш відповідний товар.
3. Переконайся, що в користувача є активний кошик (отримай існуючий або створи новий).
4. Додай обрані товари в кошик у кількості, що покриває потрібну кількість з рецепта
   (округляючи до доступних упаковок).
5. Після додавання перевір вміст кошика.

Наприкінці дай користувачу коротке підсумкове повідомлення українською (без зайвого
форматування, для Telegram): що саме додано в кошик, яка кількість/упаковка, чи це було
за акцією, орієнтовна сума, і що товари, яких не вдалося точно знайти, треба буде
додати вручну. Не проси користувача нічого підтверджувати — просто виконай додавання.`;

  const response = await client.beta.messages.create({
    model: config.claudeModel,
    max_tokens: 8000,
    betas: ["mcp-client-2025-11-20"],
    system,
    messages: [
      {
        role: "user",
        content: `Список інгредієнтів для рецепта:\n${ingredientList}`,
      },
    ],
    mcp_servers: [
      {
        type: "url",
        url: config.silpoMcpUrl,
        name: SILPO_MCP_SERVER_NAME,
        authorization_token: accessToken,
      },
    ],
    tools: [
      { type: "mcp_toolset", mcp_server_name: SILPO_MCP_SERVER_NAME },
    ],
  });

  await logMcpBlocks("cartAgent", response.content);

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "Товари обробляються, але фінального підсумку від агента не отримано.";
}
