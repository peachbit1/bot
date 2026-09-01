import type { TgLocale } from "@/lib/tg/i18n";

/** Age gate + usage rules shown before first use. */
export function tgRulesText(locale: TgLocale): string {
  if (locale === "en") {
    return `<b>PeachBitch — rules</b>

• You must be <b>18+</b>.
• Upload only photos you own or have explicit consent to use.
• Do not create images of real people without their permission (no non-consensual deepfakes).
• Do not use the service for illegal content.
• AI-generated content may be imperfect — use reroll if needed.
• We may update these rules; continued use means acceptance.

By tapping «I am 18 or older» you confirm you agree.`;
  }

  return `<b>PeachBitch — правила</b>

• Тебе должно быть <b>18+</b>.
• Загружай только свои фото или фото с явного согласия модели.
• Не создавай изображения реальных людей без их разрешения (никаких deepfake без согласия).
• Не используй сервис для незаконного контента.
• AI может ошибаться — используй перегенерацию при необходимости.
• Правила могут обновляться; продолжая пользоваться, ты принимаешь их.

Нажимая «Мне есть 18 лет», ты подтверждаешь согласие.`;
}

export const TG_PAYMENT_NOTE = {
  ru: "Оплата: криптовалюта и СБП через наш платёжный сервис. Сумма также показывается в USDT для удобства.",
  en: "Pay with crypto or SBP via our payment provider. Amount is also shown in USDT for convenience.",
};

/** Explains affiliate «cookie» — first ref link wins forever. */
export const TG_AFFILIATE_ATTRIBUTION_NOTE = {
  ru: `«Куки» партнёрки: если юзер пришёл по ссылке <code>?start=ref_XXX</code>, мы <b>навсегда</b> привязываем его к этому партнёру. Все пополнения этого юзера дают партнёру 50% — даже через месяц с другого устройства (пока тот же Telegram-аккаунт).`,
  en: `Affiliate attribution: if a user arrives via <code>?start=ref_XXX</code>, we link them to that partner <b>for life</b> (same Telegram account). All their top-ups pay 50% to that partner.`,
};
