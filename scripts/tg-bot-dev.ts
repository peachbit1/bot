/**
 * PeachBitch Telegram bot — long-polling dev runner.
 * Usage: TELEGRAM_BOT_TOKEN=... npm run tg:bot
 */
import "dotenv/config";
import { handleTgMessage, flushTgOutbox } from "../src/lib/tg/bot-update";
import { tgApi } from "../src/lib/tg/telegram-api";

type TgUpdate = {
  update_id: number;
  message?: Parameters<typeof handleTgMessage>[0];
};

async function poll() {
  let offset = 0;
  console.log("[tg-bot] polling…");
  setInterval(() => {
    void flushTgOutbox().catch((e) => console.error("[tg-outbox]", e));
  }, 4000);

  for (;;) {
    try {
      const updates = await tgApi<TgUpdate[]>("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) {
          try {
            await handleTgMessage(u.message);
          } catch (e) {
            console.error("[tg-bot] message error:", e);
          }
        }
      }
      await flushTgOutbox();
    } catch (e) {
      console.error("[tg-bot]", e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

void poll();
