export type TgLocale = "ru" | "en";

export const TG_LOCALES: TgLocale[] = ["ru", "en"];

export const LANG_PICK_RU = "🇷🇺 Русский";
export const LANG_PICK_EN = "🇺🇸 English";

export function isLangPick(text: string): text is typeof LANG_PICK_RU | typeof LANG_PICK_EN {
  return text === LANG_PICK_RU || text === LANG_PICK_EN;
}

export function localeFromLangPick(text: string): TgLocale {
  return text === LANG_PICK_EN ? "en" : "ru";
}

export function normalizeLocale(raw?: string | null): TgLocale {
  const s = (raw || "ru").toLowerCase().slice(0, 2);
  return s === "en" ? "en" : "ru";
}

type Dict = Record<string, { ru: string; en: string }>;

const M: Dict = {
  bot_name: { ru: "PeachBitch", en: "PeachBitch" },

  /** Start pitch — always shown in Russian first (PDF). */
  start_pitch: {
    ru: `🍑<b>С Peachbitch ты воплотишь все свои фантазии</b>. Без ограничений, без цензуры, с тотальной защитой конфиденциальности!

Просто загружаешь фотографию своего персонажа и творишь с ним всё, на что хватит фантазии и смелости 🤯💦

— Реалистичные фото и видео 18+
— Маркетплейс готовых шаблонов на любой вкус
— Высочайшее качество, как будто сняли вживую

<b>Для начала, выбери язык 👇</b>
<b>(Select a language)</b>`,
    en: `🍑<b>With Peachbitch you can bring every fantasy to life</b>. No limits, no censorship, total privacy!

Just upload a photo of your character and create anything your imagination dares 🤯💦

— Realistic 18+ photos & videos
— Marketplace of ready-made templates
— Top quality, as if shot live

<b>Choose your language 👇</b>
<b>(Select a language)</b>`,
  },

  rules_step: {
    ru: `<b>⚠️ Дальше ты можешь устраивать настоящую грязь!</b>

А для этого нужно, чтобы ты принял <a href="{rulesUrl}">правила пользования ботом</a> и ознакомился с оффертой, а также подтвердил, что тебе исполнилось 18 лет. Просто нажми на кнопку ниже`,
    en: `<b>⚠️ Things are about to get dirty!</b>

Please accept our <a href="{rulesUrl}">Terms of Service</a> and confirm you are 18+. Tap the button below`,
  },

  rules_agree_btn: {
    ru: "✅ Принимаю правила и оферту",
    en: "✅ I accept the rules & offer",
  },

  welcome_after_rules: {
    ru: `<b>Добро пожаловать в PeachBitch</b> - место, после которого ты забудешь адреса всех сайтов 🔞🍓⬛️🟧 и будешь создавать творения из одной фотографии!

Что можно в этом боте?

<i>1. Создать реалистичную фотографию с твоим персонажем</i>
<i>2. Оживить созданные фотографии</i>
<i>3. Сделать видео с нуля с сюжетами, позами, диалогами</i>

Тебе достаточно один раз загрузить фотографию своего персонажа, выбрать шаблон в нашем персиковом маркетплейсе и готово!

Кстати, тебе доступна 1 пробная генерация фото с твоим персонажем и -20% скидка на генерацию первого видео.

<b>Для начала, добавь своего персонажа девушку, чтобы она всегда была у тебя под рукой 👇</b>`,
    en: `<b>Welcome to PeachBitch</b> — the place that makes you forget every other site 🔞🍓⬛️🟧 and create masterpieces from a single photo!

What can you do here?

<i>1. Create realistic photos with your character</i>
<i>2. Animate your photos</i>
<i>3. Make videos from scratch with plots, poses & dialogue</i>

Upload your character once, pick a template in our peach marketplace — done!

You get 1 free trial photo and −20% off your first video.

<b>First, add your girl character so she's always at hand 👇</b>`,
  },

  onboard_upload_char_btn: {
    ru: "👤 Загрузить первого персонажа",
    en: "👤 Upload first character",
  },

  onboard_name_prompt: {
    ru: "<b>Как ты назовёшь своего персонажа?</b>\n\nВведи имя, чтобы потом не путаться в списке",
    en: "<b>What will you name your character?</b>\n\nEnter a name so you won't mix them up later",
  },

  onboard_photo_prompt: {
    ru: `<b>Отлично! Отправь фотографии своего персонажа (минимум 3).</b>

Рекомендации:
+ Фотография в хорошем качестве
+ Отчётливо видно лицо, взгляд в камеру, прямой ракурс
+ Нет посторонних предметов, загораживающих лицо`,
    en: `<b>Great! Send photos of your character (minimum 3).</b>

Tips:
+ Good quality photos
+ Face clearly visible, looking at camera, straight angle
+ No objects blocking the face`,
  },

  onboard_back_name_btn: {
    ru: "↩️ Вернуться и изменить",
    en: "↩️ Go back and change",
  },

  onboard_photo_progress: {
    ru: "📸 Фото {n}/{min}. {hint}",
    en: "📸 Photo {n}/{min}. {hint}",
  },

  onboard_photo_need_more: {
    ru: "Нужно ещё {n} фото.",
    en: "Need {n} more photo(s).",
  },

  onboard_character_saved: {
    ru: `<b>✅ Персонаж сохранён!</b>

Он будет в разделе "Персонажи" в нижнем меню, чтобы ты всегда мог отредактировать параметры тела, чтобы улучшить результат, а также добавить новых персонажей и переключаться между ними.

<i>Выбери, что ты хочешь сгенерировать? Фото или видео? 👇</i>`,
    en: `<b>✅ Character saved!</b>

Find her in "Characters" in the bottom menu — edit body settings, add more characters, switch between them.

<i>What do you want to generate? Photo or video? 👇</i>`,
  },

  gen_kind_photo_btn: { ru: "Фото 🔞", en: "Photo 🔞" },
  gen_kind_video_btn: { ru: "Видео 🍓", en: "Video 🍓" },

  gen_pick_template: {
    ru: `Теперь выбери первую позу и сюжет, который хочешь увидеть на фотографии <u>(или на видео, если выбрал видео)</u>. Ты можешь кликнуть, посмотреть пример и принять решение. А ещё можешь перейти в раздел "Маркетплейс", чтобы наглядно пролистать ленту шаблонов и выбрать тот, что тебе понравится.`,
    en: `Pick the first pose and scene you want on your photo <u>(or video, if you chose video)</u>. Tap to preview and decide. Or open the Marketplace to scroll the template feed and pick what you like.`,
  },

  gen_kind_photo_label: { ru: "фотографии", en: "the photo" },
  gen_kind_video_label: { ru: "видео", en: "the video" },

  marketplace_btn: { ru: "🍑 Маркетплейс", en: "🍑 Marketplace" },
  gen_page_prev: { ru: "◀️", en: "◀️" },
  gen_page_next: { ru: "▶️", en: "▶️" },

  gen_confirm_pose: {
    ru: `Выбранная поза: <b>{title}</b>

Стоимость генерации: {price}

Начинаю генерацию {kind} с моделью по имени «{name}»?`,
    en: `Selected pose: <b>{title}</b>

Generation cost: {price}

Start {kind} generation with model «{name}»?`,
  },

  gen_confirm_free: {
    ru: "0 🍑 (первое фото бесплатно)",
    en: "0 🍑 (first photo free)",
  },

  gen_confirm_discount: {
    ru: "{price} 🍑 (применена скидка −20%)",
    en: "{price} 🍑 (−20% discount applied)",
  },

  gen_confirm_price: {
    ru: "{price} 🍑",
    en: "{price} 🍑",
  },

  gen_confirm_btn: { ru: "✅ Сгенерировать", en: "✅ Generate" },
  gen_other_poses_btn: { ru: "◀️ Другие позы", en: "◀️ Other poses" },

  gen_starting: {
    ru: "Начинаю генерацию! Пока можешь расслабиться и насладиться генерациями, которые делает наша команда",
    en: "Starting generation! Sit back and enjoy what our team creates",
  },

  gen_success: {
    ru: "<b>😍 {kind} готово!</b>\n\nХочешь попробовать сгенерировать ещё что-то?",
    en: "<b>😍 {kind} is ready!</b>\n\nWant to generate something else?",
  },

  gen_success_photo: { ru: "Фото", en: "Photo" },
  gen_success_video: { ru: "Видео", en: "Video" },

  gen_again_photo_btn: { ru: "Сгенерировать фото", en: "Generate photo" },
  gen_again_video_btn: { ru: "Сгенерировать видео", en: "Generate video" },
  gen_to_hub_btn: { ru: "В главное меню", en: "Main menu" },

  gen_insufficient: {
    ru: `Эх, PeachBitch такой битч, что без персиков не работает 😢

Генерация стоит {need}🍑
У тебя на балансе: {balance}🍑

Чтобы пополнить баланс, нажми на кнопку ниже 👇`,
    en: `PeachBitch is such a bitch — no peaches, no magic 😢

Generation costs {need}🍑
Your balance: {balance}🍑

Tap below to top up 👇`,
  },

  topup_prompt: {
    ru: `<b>Сколько персиков хочешь приобрести?</b>

🍑 1 персик = 1 рубль ({usdt}$ по актуальному курсу)

Выбери по кнопке или введи число в чате 👇`,
    en: `<b>How many peaches do you want?</b>

🍑 1 peach = 1 RUB ({usdt}$ at current rate)

Pick a button or type a number 👇`,
  },

  topup_min_error: {
    ru: "Минимальная сумма для пополнения — 100 🍑 ({usdt}$). Введи число от 100.",
    en: "Minimum top-up is 100 🍑 ({usdt}$). Enter 100 or more.",
  },

  topup_btn: { ru: "Пополнить баланс 💳", en: "Top up balance 💳" },

  topup_stub: {
    ru: "Оплата скоро будет подключена. Выбрано: {n} 🍑",
    en: "Payments coming soon. Selected: {n} 🍑",
  },

  hub_main: {
    ru: `Ну что, пофантазируем? 😏💦

У тебя на балансе: {balance}🍑

📹 <b>Нажми на кнопку "Генерация",</b> чтобы сгенерировать фото или видео

🟠 <b>Нажми на кнопку "Персонажи",</b> чтобы выбрать из списка того персонажа, с которым хочешь сделать следующее фото/видео или добавить нового. Там же есть более тонкие настройки персонажа, чтобы скорректировать его вес, внешний вид тела и т.д, чтобы в следующей генерации было более похоже.

💳 <b>Нажми на кнопку "Баланс", </b>чтобы проверить или пополнить удобным способом`,
    en: `Ready to fantasize? 😏💦

Your balance: {balance}🍑

📹 <b>Tap "Generation"</b> to create a photo or video

🟠 <b>Tap "Characters"</b> to pick who to generate with or add a new one. Fine-tune body settings there.

💳 <b>Tap "Balance"</b> to check or top up`,
  },

  menu_generation: { ru: "📹 Генерация", en: "📹 Generation" },
  menu_characters: { ru: "🟠 Персонажи", en: "🟠 Characters" },
  menu_balance: { ru: "💳 Баланс", en: "💳 Balance" },
  menu_earn: { ru: "💰 Заработать", en: "💰 Earn" },
  menu_help: { ru: "❓ Помощь", en: "❓ Help" },
  menu_main: { ru: "🏠 Главное меню", en: "🏠 Main menu" },

  help_title: {
    ru: `<b>Помощь</b>

📩 Поддержка: {support}
🔗 Резервы: {reserves}

Язык интерфейса можно сменить кнопкой ниже 👇`,
    en: `<b>Help</b>

📩 Support: {support}
🔗 Backups: {reserves}

Change language with the button below 👇`,
  },

  help_lang_btn: { ru: "🌐 Сменить язык", en: "🌐 Change language" },

  pick_lang_switch: {
    ru: "🌐 Выбери язык:",
    en: "🌐 Choose language:",
  },

  lang_switched: {
    ru: "Язык: русский 🇷🇺",
    en: "Language: English 🇺🇸",
  },

  balance_fmt: {
    ru: "Баланс: <b>{n}</b> 🍑",
    en: "Balance: <b>{n}</b> 🍑",
  },

  balance_with_topup_hint: {
    ru: "Баланс: <b>{n}</b> 🍑\n\nНажми «Пополнить баланс 💳» чтобы пополнить.",
    en: "Balance: <b>{n}</b> 🍑\n\nTap «Top up balance 💳» to add peaches.",
  },

  earn_text: {
    ru: "💰 <b>Заработать</b>\n\n50% с оборота пополнений приглашённых пользователей.\nВыплата USDT от 30.\n\n<i>Статистика — в Mini App (скоро)</i>",
    en: "💰 <b>Earn</b>\n\n50% of top-ups from users you refer.\nPayout from 30 USDT.\n\n<i>Stats in Mini App (soon)</i>",
  },

  gen_pick_kind: {
    ru: "Что сгенерировать?",
    en: "What to generate?",
  },

  welcome_back: {
    ru: "С возвращением! 👇",
    en: "Welcome back! 👇",
  },

  upload_photos: {
    ru: "Пришли 3–5 фото (лицо + тело) для модели.",
    en: "Send 3–5 photos (face + body) for your model.",
  },

  speech_prompt: {
    ru: "🗣 Шаблон с речью. Напиши, что должна сказать модель:",
    en: "🗣 This template has speech. Type what your model should say:",
  },

  speech_confirm: {
    ru: "✅ Подтвердить и генерировать",
    en: "✅ Confirm and generate",
  },

  need_photos: {
    ru: "Сначала загрузи минимум 3 фото модели в разделе «Персонажи».",
    en: "Upload at least 3 model photos in «Characters» first.",
  },

  speech_preview: {
    ru: "Реплика: «{line}»\n\nПодтверди или напиши заново.",
    en: "Line: «{line}»\n\nConfirm or type again.",
  },

  generating: {
    ru: "⏳ Генерация запущена…",
    en: "⏳ Generation started…",
  },

  gen_error: {
    ru: "❌ Ошибка: {msg}",
    en: "❌ Error: {msg}",
  },

  discount_note: {
    ru: " (со скидкой −20%)",
    en: " (−20% discount)",
  },

  free_photo_note: {
    ru: " (бесплатно 🎁)",
    en: " (free 🎁)",
  },

  char_list_title: {
    ru: "<b>Персонажи</b>\n\nВыбери модель или создай новую:",
    en: "<b>Characters</b>\n\nPick a model or create a new one:",
  },

  char_new_btn: { ru: "➕ Новый персонаж", en: "➕ New character" },
  char_back_btn: { ru: "◀️ Назад", en: "◀️ Back" },
  char_add_photos_btn: { ru: "📸 Добавить фото", en: "📸 Add photos" },
  char_rename_btn: { ru: "✏️ Переименовать", en: "✏️ Rename" },
  char_lookbook_btn: { ru: "⚙️ Настройки тела", en: "⚙️ Body settings" },

  char_name_prompt: {
    ru: "Как назвать персонажа? (до 40 символов)",
    en: "Character name? (up to 40 chars)",
  },

  char_rename_prompt: {
    ru: "Новое имя персонажа:",
    en: "New character name:",
  },

  char_created: {
    ru: "Персонаж <b>{name}</b> создан ✅",
    en: "Character <b>{name}</b> created ✅",
  },

  char_not_found: {
    ru: "Персонаж не найден.",
    en: "Character not found.",
  },

  char_detail: {
    ru: "👤 <b>{name}</b>\n📸 {n}/{max} фото{ready}\n\nМинимум {min} фото для генерации.",
    en: "👤 <b>{name}</b>\n📸 {n}/{max} photos{ready}\n\nAt least {min} photos to generate.",
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
    ru: "Максимум {max} фото.",
    en: "Max {max} photos.",
  },

  lb_title: {
    ru: "⚙️ <b>Настройки тела</b> — {name}\n\n{field}: <b>{value}</b>\n\nВыбери параметр:",
    en: "⚙️ <b>Body settings</b> — {name}\n\n{field}: <b>{value}</b>\n\nPick a parameter:",
  },

  lb_pick_field: {
    ru: "⚙️ <b>Настройки тела</b> — {name}\n\nВыбери параметр для тонкой настройки:",
    en: "⚙️ <b>Body settings</b> — {name}\n\nPick a parameter to fine-tune:",
  },

  lb_saved: {
    ru: "✅ Сохранено: {field} → {value}",
    en: "✅ Saved: {field} → {value}",
  },

  lb_custom_prompt: {
    ru: "Введи своё значение для «{field}» (на английском для лучшего результата):",
    en: "Enter custom value for «{field}» (English works best):",
  },

  lb_back_btn: { ru: "◀️ К персонажу", en: "◀️ Back to character" },

  templates_empty: {
    ru: "Шаблоны скоро появятся. Пока открой маркетплейс 👇",
    en: "Templates coming soon. Open the marketplace 👇",
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

/** Match any locale variant of a menu / action button. */
export function isMenuText(text: string, key: keyof typeof M): boolean {
  return text === t(key, "ru") || text === t(key, "en");
}
