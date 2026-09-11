import express from "express";
import { config, oauthCallbackPath } from "../config.js";
import { completeAuthorization } from "../silpo/ensureAuthorized.js";
import { resolvePendingState } from "../silpo/pendingAuth.js";
import { runCartFlow } from "../telegram/bot.js";

export function startOAuthServer(): void {
  const app = express();

  app.get("/health", (_req, res) => {
    res.send("ok");
  });

  app.get(oauthCallbackPath, async (req, res) => {
    const { code, state, error } = req.query;

    if (typeof error === "string") {
      res.status(400).send(`Авторизація Сільпо не вдалася: ${error}`);
      return;
    }
    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).send("Відсутній code або state у запиті.");
      return;
    }

    const userId = resolvePendingState(state);
    if (!userId) {
      res.status(400).send("Невідомий або протермінований запит авторизації. Спробуй ще раз у боті.");
      return;
    }

    try {
      await completeAuthorization(userId, code);
    } catch (err) {
      console.error("OAuth code exchange failed:", err);
      res.status(500).send("Не вдалося завершити авторизацію. Спробуй ще раз у боті.");
      return;
    }

    res.send("Готово! Акаунт Сільпо підключено. Повертайся в Telegram — бот уже наповнює кошик.");

    // Resume the interrupted cart flow; the HTTP response is already sent,
    // so any failure here must be reported through Telegram, not HTTP.
    runCartFlow(Number(userId)).catch((err) =>
      console.error("runCartFlow after OAuth failed:", err),
    );
  });

  app.listen(config.port, () => {
    console.log(`OAuth callback server listening on port ${config.port}`);
    console.log(`Redirect URL: ${config.publicBaseUrl}${oauthCallbackPath}`);
  });
}
