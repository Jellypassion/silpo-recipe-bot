import express from "express";
import { config, oauthCallbackPath } from "../config.js";
import { completeAuthorization } from "../silpo/ensureAuthorized.js";
import { resolvePendingState } from "../silpo/pendingAuth.js";
import { runCartFlow } from "../telegram/bot.js";

export function startOAuthServer(): void {
  const app = express();

  app.get("/health", (_req, res) => res.send("ok"));

  app.get(oauthCallbackPath, async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;

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
      res.status(400).send("Невідомий або протермінований запит авторизації. Спробуйте ще раз у боті.");
      return;
    }

    try {
      await completeAuthorization(userId, code);
      res.send(
        "Готово! Акаунт Сільпо підключено. Можеш повернутися в Telegram — бот продовжить наповнювати кошик.",
      );
      await runCartFlow(Number(userId));
    } catch (err) {
      console.error("OAuth callback error:", err);
      res.status(500).send("Не вдалося завершити авторизацію. Спробуйте ще раз у боті.");
    }
  });

  app.listen(config.port, () => {
    console.log(`OAuth callback server listening on port ${config.port}`);
    console.log(`Redirect URL: ${config.publicBaseUrl}${oauthCallbackPath}`);
  });
}
