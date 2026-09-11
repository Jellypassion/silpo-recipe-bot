import { run } from "@grammyjs/runner";
import { bot } from "./telegram/bot.js";
import { startOAuthServer } from "./server/oauthCallback.js";

bot.catch((err) => {
  console.error("Unhandled bot error:", err.error);
});

startOAuthServer();

// Runner = concurrent update processing; a 1–2 min cart run for one user
// must not block everyone else (bot.start() would process sequentially).
const runner = run(bot);
const me = await bot.api.getMe();
console.log(`Telegram bot @${me.username} is running`);

const stop = () => {
  if (runner.isRunning()) runner.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
