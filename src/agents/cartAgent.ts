import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "../config.js";
import { logMcpBlocks } from "../logging/mcpLog.js";
import { CartResultSchema, type CartResult, type Ingredient } from "./types.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SILPO_MCP_SERVER_NAME = "silpo";

/**
 * Allowlist of Silpo MCP tools the agent may use. Everything destructive
 * (clear cart, remove products, favourites, certificates, update delivery)
 * stays disabled so the agent can only *add* to the user's cart.
 */
const ALLOWED_TOOLS = [
  // cart context
  "silpo_get_my_shopping_cart",
  "silpo_create_shopping_cart",
  "silpo_get_shopping_cart_by_id",
  "silpo_add_or_update_cart_products",
  // address / delivery, needed only when no cart exists yet
  "silpo_get_my_delivery_addresses",
  "silpo_find_address",
  "silpo_get_available_delivery_types",
  "silpo_list_branches",
  "silpo_get_time_slots",
  // products
  "silpo_find_products_batch",
  "silpo_get_products",
  "silpo_get_product_details",
  "silpo_get_similar_products",
  "silpo_get_replacements",
  "silpo_get_promotions",
];

// Mirrors the "Рекомендований сценарій наповнення кошика" from the Silpo docs.
const SYSTEM_PROMPT = `Ти агент, який наповнює кошик покупок у «Сільпо» через MCP-інструменти.
Тобі дано інгредієнти з рецепта. Дій строго за сценарієм:

1. silpo_get_my_shopping_cart → shoppingCartId або exists:false.
2. Якщо exists:false — кошик треба створити:
   a. Спочатку silpo_get_my_delivery_addresses. Якщо є збережена адреса — бери її
      (координати, city/street/house, addressType).
   b. Якщо збережених адрес нема, але користувач передав адресу текстом —
      silpo_find_address(текст) → lat/lng.
   c. Якщо адреси нема взагалі — НЕ створюй кошик; заверши зі status "address_required".
   d. silpo_get_available_delivery_types(lat, lng) → deliveryType, branchId
      (якщо branchId null — silpo_list_branches). Надавай перевагу DeliveryHome.
   e. silpo_get_time_slots(branchId, deliveryType) → перший доступний слот.
   f. silpo_create_shopping_cart з усіма обов'язковими параметрами.
3. silpo_get_shopping_cart_by_id → branchId, deliveryType, timeslot — це контекст для
   пошуку товарів. Не забудь, що вже наявні в кошику товари треба залишити.
4. silpo_find_products_batch(усі назви інгредієнтів одним викликом, до 30) з branchId
   та deliveryType з кошика → productId, companyId, branchId, ціна, наявність, акційність.
   Якщо для інгредієнта нічого не знайдено або товар відсутній — спробуй іншу назву,
   silpo_get_products або silpo_get_replacements; якщо все одно нема — додай у notFound.
5. Вибір товару для кожного інгредієнта:
   - пріоритет — товару, що зараз за акцією (ознака знижки у видачі пошуку або
     silpo_get_promotions для цього branchId/deliveryType), якщо він відповідає інгредієнту;
   - інакше — найбільш відповідний за назвою/типом, не найдорожчий преміум-варіант;
   - кількість: покрити потрібну кількість з рецепта, округляючи вгору до цілих упаковок;
     вагові товари — у кг (може бути дробове число).
6. silpo_add_or_update_cart_products одним викликом: масив {productId, companyId, branchId,
   quantity} — усі чотири поля обов'язкові, значення з результату пошуку.
7. silpo_get_shopping_cart_by_id → перевір, що товари в кошику; візьми суму, validations[],
   checkoutWebLink, checkoutMobileLink.

Правила:
- Нічого не видаляй і не очищай з кошика.
- Нічого не питай у користувача і не проси підтвердження — виконуй.
- Якщо інструменти повертають 401/403 — status "auth_error".
- Якщо 429 — трохи зачекай і повтори виклик.
- У полі message стисло скажи, скільки додано, чи були акційні, що не знайдено.`;

export interface CartAgentInput {
  ingredients: Ingredient[];
  /** Free-text delivery address if the user has no saved one (2nd attempt). */
  deliveryAddress?: string;
}

/**
 * Phase 2: Claude + native MCP connector to the official Silpo MCP server.
 * Anthropic's side executes the tool calls with the user's OAuth token; this
 * function returns the parsed structured summary.
 */
export async function addIngredientsToCart(
  accessToken: string,
  input: CartAgentInput,
): Promise<CartResult> {
  const ingredientList = input.ingredients
    .map((i) => `- ${i.name} — ${i.quantity}${i.notes ? ` (${i.notes})` : ""}`)
    .join("\n");
  const addressLine = input.deliveryAddress
    ? `\n\nАдреса доставки від користувача: ${input.deliveryAddress}`
    : "";

  const stream = client.beta.messages.stream({
    model: config.claudeCartModel,
    max_tokens: 16000,
    betas: ["mcp-client-2025-11-20"],
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: `Інгредієнти:\n${ingredientList}${addressLine}` },
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
      {
        type: "mcp_toolset",
        mcp_server_name: SILPO_MCP_SERVER_NAME,
        default_config: { enabled: false },
        configs: Object.fromEntries(ALLOWED_TOOLS.map((name) => [name, { enabled: true }])),
      },
    ],
    output_config: { format: betaZodOutputFormat(CartResultSchema) },
  });

  const response = await stream.finalMessage();
  await logMcpBlocks("cartAgent", response.content);

  if (response.stop_reason === "refusal") {
    return failed("Модель відмовилась виконувати запит.");
  }
  if (response.stop_reason === "max_tokens") {
    return failed("Агент не встиг завершити роботу (ліміт токенів). Спробуй ще раз.");
  }
  if (!response.parsed_output) {
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return failed(text || "Агент не повернув структурований результат.");
  }
  return response.parsed_output;
}

function failed(message: string): CartResult {
  return { status: "failed", added: [], notFound: [], message };
}
