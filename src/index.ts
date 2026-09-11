import { bot } from "./telegram/bot.js";
import { startOAuthServer } from "./server/oauthCallback.js";

startOAuthServer();

bot.catch((err) => {
  console.error("Unhandled bot error:", err);
});

await bot.start({
  onStart: (info) => console.log(`Telegram bot @${info.username} is running`),
});
