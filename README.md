# Silpo Recipe Bot

Telegram-бот для хакатону [ai-factory.silpo.ua](https://ai-factory.silpo.ua/docs/mcp): користувач
пише назву страви → бот генерує рецепт і список інгредієнтів → користувач обирає, що купити →
бот через офіційний MCP-сервер Сільпо (`https://mcp.silpo.ua/mcp`) знаходить товари (з
пріоритетом акційних) і додає їх у кошик користувача. Користувачу залишається відкрити
застосунок Сільпо й оформити замовлення.

## Архітектура

Один Node/TS-сервіс, два внутрішні кроки:

- **`src/agents/recipeAgent.ts`** — крок 1, звичайний виклик Claude (structured output через
  Zod-схему), без інструментів/MCP. Перетворює назву страви на рецепт + список інгредієнтів.
- **`src/agents/cartAgent.ts`** — крок 2, виклик Claude з підключеним **нативним MCP-конектором**
  Anthropic Messages API (`mcp_servers` + `tools: [{type: "mcp_toolset"}]`, beta
  `mcp-client-2025-11-20`). Anthropic сам виконує виклики MCP-інструментів Сільпо на своєму боці,
  використовуючи OAuth access token поточного користувача. Системний промпт повторює
  «Рекомендований сценарій наповнення кошика» з документації (get cart → create якщо нема →
  branchId/deliveryType з кошика → find_products_batch → add_or_update_cart_products → перевірка).
  Агент бачить лише allowlist з 15 tools — нічого, що видаляє/очищає кошик. Результат —
  структурований (Zod): що додано, що не знайдено, сума, `checkoutWebLink`.
- **`src/silpo/`** — OAuth 2.1 + PKCE клієнт до `mcp.silpo.ua` (discovery за
  `.well-known/oauth-authorization-server`, Dynamic Client Registration, PKCE, refresh) на основі
  офіційного `@modelcontextprotocol/sdk`. Токени зберігаються **лише на сервері**
  (`data/oauth-store.json`), у клієнта (Telegram) вони ніколи не з'являються — відповідає вимозі
  хакатону.
- **`src/telegram/`** — бот на [grammy](https://grammy.dev): recipe-картка з inline-кнопками
  (позначити інгредієнти), кнопка «Додати в кошик».
- **`src/server/oauthCallback.ts`** — маленький Express-сервер лише для OAuth redirect callback.

## Як це працює для користувача

1. `/start`, потім користувач пише назву страви, напр. «борщ».
2. Бот показує рецепт і список інгредієнтів з чекбоксами (усі позначені за замовчуванням).
3. Користувач знімає позначки з того, що вже є вдома, і тисне **«🛒 Додати в кошик»**.
4. Якщо це перший раз — бот дає одноразове посилання для входу в акаунт Сільпо (OAuth, у
   браузері). Після входу бот автоматично продовжує.
5. Якщо в Сільпо ще немає кошика і збереженої адреси — бот один раз питає адресу доставки
   (пошукові tools Сільпо вимагають контекст кошика: `branchId`/`deliveryType`).
6. Бот шукає товари через Silpo MCP, пріоритетно обирає акційні, додає в кошик, і присилає
   підсумок з кнопкою «Оформити замовлення в Сільпо» (`checkoutWebLink` з кошика).
7. Користувач оформлює замовлення у вебі або в застосунку «Сільпо».

Команди: `/cancel` — скинути рецепт, `/logout` — відв'язати акаунт Сільпо.

## Налаштування

### 1. Встанови залежності

```bash
npm install
```

### 2. Зроби копію `.env` і заповни

```bash
cp .env.example .env
```

- `TELEGRAM_BOT_TOKEN` — створи бота через [@BotFather](https://t.me/BotFather), команда
  `/newbot`.
- `ANTHROPIC_API_KEY` — з [console.anthropic.com](https://console.anthropic.com).
- `PUBLIC_BASE_URL` — публічна HTTPS-адреса цього сервера (потрібна для OAuth redirect_uri;
  Silpo має вміти достукатись до неї з браузера користувача). Локально піднімається тунелем:

  ```bash
  npx ngrok http 3000
  # або
  cloudflared tunnel --url http://localhost:3000
  ```

  Скопіюй видану https-адресу в `PUBLIC_BASE_URL`.

### 3. Запусти

```bash
npm run dev
```

Перевір типи без запуску: `npm run typecheck`. Продакшн-збірка: `npm run build && npm start`.

## Вимоги хакатону — де що перевірити

- Підключення лише до офіційного `https://mcp.silpo.ua/mcp` — `SILPO_MCP_URL` у `.env`,
  використовується і в OAuth-дискавері, і в MCP-конекторі (`src/agents/cartAgent.ts`).
- Реальний виклик tool із `tools/list` у робочому сценарії — кожен запуск `cartAgent` викликає
  `silpo_get_my_shopping_cart`, `silpo_find_products_batch`, `silpo_add_or_update_cart_products`
  тощо (порядок — як у документації).
- JSON-RPC докази — усі блоки `mcp_tool_use`/`mcp_tool_result` логуються в консоль і дописуються
  в `data/mcp-calls.jsonl` (`src/logging/mcpLog.ts`) — зручно для запису екрана або прикладення
  до заявки.
- Токени зберігаються серверно — `data/oauth-store.json`, ніколи не йдуть у Telegram-клієнт.
  Refresh робиться лише коли access token протермінований (з запасом 60 с); на `401` від MCP
  токени скидаються і користувача просять увійти знову.

## Ідеї для розширення (не зроблено навмисно, щоб встигнути на хакатоні)

- Персоналізація рецепта через `silpo_get_my_food_restrictions` / `silpo_get_my_family`
  (алергії, кількість порцій) — один додатковий tool-виклик перед кроком 1.
- «Що вже є вдома»: перед пошуком дивитись `silpo_get_my_offline_orders` за останній тиждень і
  знімати позначку з нещодавно куплених інгредієнтів.
- Окремий Telegram Mini App замість inline-кнопок для красивішого вибору кількості.
- Персистентна сесія рецепта (зараз — in-memory, зникає при рестарті процесу).
