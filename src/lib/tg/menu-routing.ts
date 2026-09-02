import type { TgLocale } from "@/lib/tg/i18n";
import { isMenuText, t, tFormat } from "@/lib/tg/i18n";
import { sendMainMenuHub } from "@/lib/tg/menu";
import { sendGenerationKindPicker } from "@/lib/tg/onboarding-flow";
import { sendCharactersList } from "@/lib/tg/character-bot";
import { sendHelp } from "@/lib/tg/help-flow";
import { sendTopupPrompt } from "@/lib/tg/topup-flow";
import { setTgSession } from "@/lib/tg/session";
import { tgSendMessage } from "@/lib/tg/telegram-api";
import { getBalancePeaches } from "@/lib/tg/wallet";

/** Leave input states (topup, speech, etc.) and open hub. */
export async function goToMainMenu(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
) {
  await setTgSession(platformUserId, { chatState: "idle", clearPending: true });
  await sendMainMenuHub(chatId, userId, locale);
}

/** Bottom keyboard navigation — always wins over state handlers. */
export async function routeMenuText(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
  text: string,
): Promise<boolean> {
  if (!text) return false;

  if (isMenuText(text, "menu_main")) {
    await goToMainMenu(chatId, platformUserId, userId, locale);
    return true;
  }
  if (isMenuText(text, "menu_generation")) {
    await setTgSession(platformUserId, { chatState: "idle", clearPending: true });
    await sendGenerationKindPicker(chatId, locale);
    return true;
  }
  if (isMenuText(text, "menu_characters")) {
    await setTgSession(platformUserId, { chatState: "idle" });
    await sendCharactersList(chatId, userId, platformUserId, locale);
    return true;
  }
  if (isMenuText(text, "menu_balance")) {
    await setTgSession(platformUserId, { chatState: "idle" });
    const bal = await getBalancePeaches(userId);
    await tgSendMessage(chatId, tFormat("balance_with_topup_hint", locale, { n: bal }), {
      reply_markup: {
        inline_keyboard: [[{ text: t("topup_btn", locale), callback_data: "tu:open" }]],
      },
    });
    return true;
  }
  if (isMenuText(text, "menu_earn")) {
    await setTgSession(platformUserId, { chatState: "idle" });
    const { mainMenuExtra } = await import("@/lib/tg/menu");
    await tgSendMessage(chatId, t("earn_text", locale), mainMenuExtra(locale));
    return true;
  }
  if (isMenuText(text, "menu_help")) {
    await setTgSession(platformUserId, { chatState: "idle" });
    await sendHelp(chatId, locale);
    return true;
  }
  if (isMenuText(text, "topup_btn")) {
    await sendTopupPrompt(chatId, locale);
    return true;
  }

  return false;
}
