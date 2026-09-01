export type TgLocale = "ru" | "en";

export const TG_LOCALES: TgLocale[] = ["ru", "en"];

export function normalizeLocale(raw?: string | null): TgLocale {
  const s = (raw || "ru").toLowerCase().slice(0, 2);
  return s === "en" ? "en" : "ru";
}

type Dict = Record<string, { ru: string; en: string }>;

const M: Dict = {
  bot_name: { ru: "PeachBitch", en: "PeachBitch" },
  welcome_title: {
    ru: "AI-фото и видео с <b>твоей моделью</b>.",
    en: "AI photos & videos with <b>your model</b>.",
  },
  welcome_body: {
    ru: "Загрузи фото один раз — генерируй сколько угодно.",
    en: "Upload photos once — generate as much as you want.",
  },
  age_btn: { ru: "✅ Мне есть 18 лет", en: "✅ I am 18 or older" },
  rules_btn: { ru: "📋 Правила", en: "📋 Rules" },
  lang_btn: { ru: "🌐 English", en: "🌐 Русский" },
  menu_model: { ru: "👤 Моя модель", en: "👤 My model" },
  menu_templates: { ru: "🎬 Шаблоны", en: "🎬 Templates" },
  menu_balance: { ru: "💰 Баланс", en: "💰 Balance" },
  menu_topup: { ru: "💳 Пополнить", en: "💳 Top up" },
  menu_works: { ru: "📁 Мои работы", en: "📁 My creations" },
  menu_affiliate: { ru: "📊 Партнёрка", en: "📊 Affiliate stats" },
  templates_open: { ru: "🎬 Открыть ленту", en: "🎬 Open feed" },
  balance: { ru: "Баланс", en: "Balance" },
  peaches: { ru: "🍑", en: "peaches" },
  upload_photos: {
    ru: "Пришли 3–5 фото (лицо + тело) для модели.",
    en: "Send 3–5 photos (face + body) for your model.",
  },
  photo_received: {
    ru: "📸 Фото получено.",
    en: "📸 Photo received.",
  },
  speech_prompt: {
    ru: "🗣 Шаблон с речью. Напиши, что должна сказать модель:",
    en: "🗣 This template has speech. Type what your model should say:",
  },
  speech_confirm: {
    ru: "✅ Подтвердить и генерировать",
    en: "✅ Confirm and generate",
  },
  free_photo_left: {
    ru: "🎁 Доступно 1 бесплатное фото без ограничений.",
    en: "🎁 You have 1 free photo available.",
  },
  first_video_discount: {
    ru: "🎁 −20% на первое платное видео.",
    en: "🎁 −20% off your first paid video.",
  },
  coming_studio: {
    ru: "🔜 Peach Studio — скоро",
    en: "🔜 Peach Studio — coming soon",
  },
  welcome_full: {
    ru: `🍑 <b>PeachBitch</b>\n\nAI-фото и видео с <b>твоей моделью</b>.\nЗагрузи фото один раз — генерируй сколько угодно.\n\n🎁 1 бесплатное фото\n🎁 −20% на первое видео`,
    en: `🍑 <b>PeachBitch</b>\n\nAI photos & videos with <b>your model</b>.\nUpload once — generate forever.\n\n🎁 1 free photo\n🎁 −20% first video`,
  },
  age_ok: {
    ru: "Отлично! Пришли 3–5 фото для модели или открой шаблоны:",
    en: "Great! Send 3–5 photos for your model or open templates:",
  },
  templates_hint: {
    ru: "Лента шаблонов:",
    en: "Template feed:",
  },
  balance_fmt: {
    ru: "Баланс: <b>{n}</b> 🍑",
    en: "Balance: <b>{n}</b> peaches",
  },
  topup_packs: {
    ru: "Пакеты (🍑):\n• Try — 109\n• Hot — 329 (+10%)\n• Fire — 659 (+20%)\n• Pro — 1649 (+30%)\n\nОплата: crypto / СБП (скоро)",
    en: "Packs (🍑):\n• Try — 109\n• Hot — 329 (+10%)\n• Fire — 659 (+20%)\n• Pro — 1649 (+30%)\n\nPay: crypto / SBP (soon)",
  },
  model_status: {
    ru: "Модель: <b>{n}</b>/{max} фото{ready}",
    en: "Model: <b>{n}</b>/{max} photos{ready}",
  },
  model_ready_suffix: {
    ru: " — готова ✅",
    en: " — ready ✅",
  },
  photo_progress: {
    ru: "📸 Фото {n}/{max}. {hint}",
    en: "📸 Photo {n}/{max}. {hint}",
  },
  photo_need_more: {
    ru: "Нужно ещё {n} фото.",
    en: "Need {n} more photo(s).",
  },
  photo_max: {
    ru: "Максимум {max} фото. Открой шаблоны для генерации.",
    en: "Max {max} photos. Open templates to generate.",
  },
  need_age: {
    ru: "Сначала подтверди возраст (18+).",
    en: "Confirm your age (18+) first.",
  },
  need_photos: {
    ru: "Сначала загрузи минимум 3 фото модели.",
    en: "Upload at least 3 model photos first.",
  },
  template_selected: {
    ru: "Шаблон: <b>{title}</b> — {price} 🍑",
    en: "Template: <b>{title}</b> — {price} peaches",
  },
  speech_preview: {
    ru: "Реплика: «{line}»\n\nПодтверди или напиши заново.",
    en: "Line: «{line}»\n\nConfirm or type again.",
  },
  generating: {
    ru: "⏳ Генерация запущена… Результат пришлю сюда.",
    en: "⏳ Generation started… I'll send the result here.",
  },
  gen_error: {
    ru: "❌ Ошибка: {msg}",
    en: "❌ Error: {msg}",
  },
  gen_done_photo: {
    ru: "✅ Фото готово!",
    en: "✅ Photo ready!",
  },
  gen_done_video: {
    ru: "✅ Видео готово!",
    en: "✅ Video ready!",
  },
  aff_stats: {
    ru: "Партнёрка: 50% с оборота пополнений.\nВыплата USDT от 30.\n<i>Статистика — в Mini App</i>",
    en: "Affiliate: 50% of top-up revenue.\nPayout USDT from 30.\n<i>Stats in Mini App</i>",
  },
  works_empty: {
    ru: "Пока нет готовых работ. Сгенерируй из шаблонов!",
    en: "No creations yet. Generate from templates!",
  },
  discount_note: {
    ru: " (со скидкой −20%)",
    en: " (−20% discount)",
  },
  free_photo_note: {
    ru: " (бесплатно 🎁)",
    en: " (free 🎁)",
  },
};

export function t(key: keyof typeof M, locale: TgLocale): string {
  const row = M[key];
  return row?.[locale] ?? String(key);
}

export function tFormat(
  key: keyof typeof M,
  locale: TgLocale,
  vars: Record<string, string | number>,
): string {
  let s = t(key, locale);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, String(v));
  }
  return s;
}
