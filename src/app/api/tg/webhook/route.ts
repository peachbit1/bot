import { NextResponse } from "next/server";
import { handleTgMessage, flushTgOutbox } from "@/lib/tg/bot-update";

/** Telegram webhook (production). Same handlers as `npm run tg:bot`. */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const update = (await req.json().catch(() => null)) as {
    update_id?: number;
    message?: Parameters<typeof handleTgMessage>[0];
  } | null;
  if (!update) {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  if (update.message) {
    try {
      await handleTgMessage(update.message);
      await flushTgOutbox();
    } catch (e) {
      console.error("[tg/webhook]", e);
    }
  }

  return NextResponse.json({ ok: true });
}
