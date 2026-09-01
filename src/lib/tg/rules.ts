import type { TgLocale } from "@/lib/tg/i18n";

const DEFAULT_SITE =
  process.env.TELEGRAM_MINIAPP_URL?.replace(/\/tg\/templates\/?$/, "") ||
  "https://bot-production-c305.up.railway.app";

/** Long-read rules (Telegram article / Instant View). */
export function tgRulesArticleUrl(locale: TgLocale): string {
  if (locale === "en") {
    return (
      process.env.TELEGRAM_RULES_ARTICLE_URL_EN ||
      `${DEFAULT_SITE}/tg/rules?lang=en`
    );
  }
  return (
    process.env.TELEGRAM_RULES_ARTICLE_URL_RU ||
    `${DEFAULT_SITE}/tg/rules?lang=ru`
  );
}

/** Short rules blurb with link — full text lives in the article page. */
export function tgRulesShortMessage(locale: TgLocale): string {
  const url = tgRulesArticleUrl(locale);
  if (locale === "en") {
    return `You must be <b>18+</b>. By continuing you accept our <a href="${url}">Terms &amp; Rules</a>.`;
  }
  return `Тебе должно быть <b>18+</b>. Продолжая, ты принимаешь <a href="${url}">правила сервиса</a>.`;
}

export const TG_PAYMENT_NOTE = {