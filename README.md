# Silpo Recipe Bot

Telegram-бот для хакатону [ai-factory.silpo.ua](https://ai-factory.silpo.ua/docs/mcp): користувач
пише назву страви → бот генерує рецепт і список інгредієнтів → користувач обирає, що купити →
бот через офіційний MCP-сервер Сільпо знаходить товари (з пріоритетом акційних) і додає їх у
кошик користувача. Користувачу залишається відкрити застосунок Сільпо й оформити замовлення.

Побудовано на Node/TypeScript, [grammy](https://grammy.dev) та Claude (Anthropic Messages API) з
нативним MCP-конектором.

## Встановлення

```bash
npm install
```

Зроби копію `.env` і заповни змінні:

```bash
cp .env.example .env
```

- `TELEGRAM_BOT_TOKEN` — створи бота через [@BotFather](https://t.me/BotFather), команда
  `/newbot`.
- `ANTHROPIC_API_KEY` — з [console.anthropic.com](https://console.anthropic.com).
- `PUBLIC_BASE_URL` — публічна HTTPS-адреса цього сервера (потрібна для OAuth redirect_uri).
  Локально піднімається тунелем:

  ```bash
  npx ngrok http 3000
  # або
  cloudflared tunnel --url http://localhost:3000
  ```

  Скопіюй видану https-адресу в `PUBLIC_BASE_URL`.

## Запуск

```bash
npm run dev
```

Перевір типи без запуску: `npm run typecheck`. Продакшн-збірка: `npm run build && npm start`.
