import {
  TG_MIN_TOPUP_PEACHES,
  TG_QUICK_TOPUP_AMOUNTS,
  peachesToUsdt,
} from "@/lib/tg-pricing";
import type { TgLocale } from "@/lib/tg/i18n";
import { t, tFormat } from "@/lib/tg/i18n";
import { TOPUP_CB } from "@/lib/tg/generation-flow";
import { setTgSession } from "@/lib/tg/session";
import { tgSendMessage } from "@/lib/tg/telegram-api";
import { tgSendMediaMessage } from "@/lib/tg/media-assets";

export function topupInlineKeyboard(locale: TgLocale) {
  const rows = TG_QUICK_TOPUP_AMOUNTS.map((n) => [
    { text: `🍑 ${n}`, callback_data: TOPUP_CB.amount(n) },
  ]);
  return { inline_keyboard: rows };
}

export async function sendTopupPrompt(chatId: number, locale: TgLocale) {
  const usdt = peachesToUsdt(100);
  await setTgSession(String(chatId), { chatState: "awaiting_topup_amount" });
  await tgSendMediaMessage(chatId, "topup", tFormat("topup_prompt", locale, { usdt }), {
    reply_markup: topupInlineKeyboard(locale),
  });
}

export async function handleTopupAmount(
  chatId: number,
  platformUserId: string,
  locale: TgLocale,
  amount: number,
) {
  if (amount < TG_MIN_TOPUP_PEACHES) {
    const usdt = peachesToUsdt(TG_MIN_TOPUP_PEACHES);
    await tgSendMessage(chatId, tFormat("topup_min_error", locale, { usdt }), {
      reply_markup: topupInlineKeyboard(locale),
    });
    return;
  }
  await setTgSession(platformUserId, { chatState: "idle" });
  await tgSendMessage(chatId, tFormat("topup_stub", locale, { n: amount }));
}

export async function sendInsufficientBalance(
  chatId: number,
  locale: TgLocale,
  need: number,
  balance: number,
) {
  await tgSendMessage(chatId, tFormat("gen_insufficient", locale, { need, balance }), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t("topup_btn", locale), callback_data: "tu:open" }],
      ],
    },
  });
}
