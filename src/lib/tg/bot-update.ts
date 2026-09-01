import { prisma } from "@/lib/db";
import { getQuickVideoTemplateDetail } from "@/lib/quick-video-template";
import { getPhotoTemplate } from "@/lib/photo-template";
import {
  addCharacterPhotoFromBuffer,
  characterPhotoCount,
  characterReady,
  ensureTgCharacter,
  getPrimaryTgCharacter,
  TG_MAX_CHARACTER_PHOTOS,
  TG_MIN_CHARACTER_PHOTOS,
} from "@/lib/tg/character-service";
import {
  resolveTemplatePricePeaches,
  startTgPhotoGeneration,
  startTgVideoGeneration,
} from "@/lib/tg/generation-service";
import { normalizeLocale, t, tFormat, type TgLocale } from "@/lib/tg/i18n";
import { tgRulesText } from "@/lib/tg/rules";
import {
  getTgSession,
  parsePending,
  setTgSession,
  listPendingTgOutbox,
  markTgOutboxSent,
  type TgPending,
} from "@/lib/tg/session";
import {
  tgDownloadFile,
  tgSendMessage,
  tgSendPhoto,
  tgSendVideo,
} from "@/lib/tg/telegram-api";
import { getBalancePeaches } from "@/lib/tg/wallet";
import {
  findOrCreateTelegramUserFromBot,
  type TelegramBotUser,
} from "@/lib/tg/user";

export type TgUpdateMessage = {
  message_id: number;
  chat: { id: number };
  from?: TelegramBotUser;
  text?: string;
  photo?: Array<{ file_id: string }>;
  web_app_data?: { data: string };
};

function localeFromUser(userLocale?: string | null): TgLocale {
  return normalizeLocale(userLocale);
}

function miniAppUrl(): string {
  return process.env.TELEGRAM_MINIAPP_URL || "http://localhost:3000/tg/templates";
}

function mainMenu(locale: TgLocale) {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: t("menu_model", locale) },
          { text: t("menu_templates", locale) },
        ],
        [
          { text: t("menu_balance", locale) },
          { text: t("menu_topup", locale) },
        ],
        [
          { text: t("menu_works", locale) },
          { text: t("menu_affiliate", locale) },
        ],
        [{ text: t("lang_btn", locale) }],
      ],
      resize_keyboard: true,
    },
  };
}

function ageKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: "✅ Мне есть 18 лет" },
          { text: "✅ I am 18+" },
        ],
        [
          { text: "📋 Правила" },
          { text: "📋 Rules" },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function templatesInline(locale: TgLocale) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t("templates_open", locale),
            web_app: { url: miniAppUrl() },
          },
        ],
      ],
    },
  };
}

function speechConfirmKeyboard(locale: TgLocale) {
  return {
    reply_markup: {
      keyboard: [[{ text: t("speech_confirm", locale) }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

async function handleStart(chatId: number, from: TelegramBotUser, payload?: string) {
  const user = await findOrCreateTelegramUserFromBot(from, payload);
  const locale = localeFromUser(user.locale);
  await tgSendMessage(chatId, t("welcome_full", locale), ageKeyboard());
}

async function confirmAge(chatId: number, userId: string, locale: TgLocale) {
  await prisma.user.update({
    where: { id: userId },
    data: { ageConfirmed: true },
  });
  const platformUserId = String(chatId);
  await setTgSession(platformUserId, { chatState: "awaiting_photos" });
  await tgSendMessage(chatId, t("age_ok", locale), mainMenu(locale));
}

async function handlePhoto(
  chatId: number,
  userId: string,
  locale: TgLocale,
  fileId: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.ageConfirmed) {
    await tgSendMessage(chatId, t("need_age", locale), ageKeyboard());
    return;
  }

  const character = await ensureTgCharacter(userId);
  const before = characterPhotoCount(character.id);
  if (before >= TG_MAX_CHARACTER_PHOTOS) {
    await tgSendMessage(chatId, tFormat("photo_max", locale, { max: TG_MAX_CHARACTER_PHOTOS }));
    return;
  }

  const buf = await tgDownloadFile(fileId);
  const ext = "jpg";
  await addCharacterPhotoFromBuffer(
    userId,
    character.id,
    buf,
    `tg_${Date.now()}.${ext}`,
  );
  const after = characterPhotoCount(character.id);
  const need = Math.max(0, TG_MIN_CHARACTER_PHOTOS - after);
  const hint =
    need > 0
      ? tFormat("photo_need_more", locale, { n: need })
      : t("templates_hint", locale);

  await tgSendMessage(
    chatId,
    tFormat("photo_progress", locale, {
      n: after,
      max: TG_MAX_CHARACTER_PHOTOS,
      hint,
    }),
    after >= TG_MIN_CHARACTER_PHOTOS ? templatesInline(locale) : undefined,
  );
}

async function loadTemplateMeta(
  userId: string,
  kind: "video" | "photo",
  templateId: string,
): Promise<{ title: string; hasSpeech: boolean; pricePeaches: number } | null> {
  if (kind === "photo") {
    const row = await getPhotoTemplate(templateId);
    if (!row) return null;
    const price = await resolveTemplatePricePeaches({
      kind: "photo",
      templateId,
      userId,
    });
    return {
      title: row.title,
      hasSpeech: row.hasSpeech,
      pricePeaches: price,
    };
  }
  const detail = await getQuickVideoTemplateDetail(userId, templateId);
  if (!detail) return null;
  const price = await resolveTemplatePricePeaches({
    kind: "video",
    templateId,
    userId,
  });
  const row = detail as typeof detail & { titleEn?: string; hasSpeech?: boolean };
  return {
    title: row.title,
    hasSpeech: Boolean(row.hasSpeech),
    pricePeaches: price,
  };
}

async function beginGeneration(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
  pending: TgPending,
) {
  const character = await getPrimaryTgCharacter(userId);
  if (!character || !characterReady(character.id)) {
    await tgSendMessage(chatId, t("need_photos", locale));
    return;
  }

  const kind = pending.templateKind || "video";
  const templateId = pending.templateId;
  if (!templateId) return;

  try {
    if (kind === "photo") {
      const res = await startTgPhotoGeneration({
        userId,
        platformUserId,
        templateId,
        characterId: character.id,
      });
      const note = res.freePhoto ? t("free_photo_note", locale) : "";
      await tgSendMessage(
        chatId,
        t("generating", locale) +
          (res.chargedPeaches === 0 ? note : ` (−${res.chargedPeaches} 🍑)`),
        mainMenu(locale),
      );
    } else {
      const res = await startTgVideoGeneration({
        userId,
        platformUserId,
        templateId,
        characterId: character.id,
        speechLine: pending.speechLine,
      });
      const note = res.discountApplied ? t("discount_note", locale) : "";
      await tgSendMessage(
        chatId,
        t("generating", locale) +
          ` (−${res.chargedPeaches} 🍑${note})`,
        mainMenu(locale),
      );
    }
    await setTgSession(platformUserId, { chatState: "idle", clearPending: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await tgSendMessage(chatId, tFormat("gen_error", locale, { msg }), mainMenu(locale));
    await setTgSession(platformUserId, { chatState: "idle", clearPending: true });
  }
}

async function handleWebAppData(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
  raw: string,
) {
  let data: {
    action?: string;
    kind?: "video" | "photo";
    templateId?: string;
    price?: number;
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return;
  }
  if (data.action !== "use_template" || !data.templateId || !data.kind) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.ageConfirmed) {
    await tgSendMessage(chatId, t("need_age", locale), ageKeyboard());
    return;
  }

  const meta = await loadTemplateMeta(userId, data.kind, data.templateId);
  if (!meta) {
    await tgSendMessage(chatId, tFormat("gen_error", locale, { msg: "template not found" }));
    return;
  }

  const pending: TgPending = {
    templateId: data.templateId,
    templateKind: data.kind,
    pricePeaches: meta.pricePeaches,
    title: meta.title,
    hasSpeech: meta.hasSpeech && data.kind === "video",
  };

  await tgSendMessage(
    chatId,
    tFormat("template_selected", locale, {
      title: meta.title,
      price: meta.pricePeaches,
    }),
  );

  if (pending.hasSpeech) {
    await setTgSession(platformUserId, {
      chatState: "awaiting_speech",
      pending,
    });
    await tgSendMessage(chatId, t("speech_prompt", locale));
    return;
  }

  await setTgSession(platformUserId, { chatState: "idle", pending });
  await beginGeneration(chatId, platformUserId, userId, locale, pending);
}

export async function handleTgMessage(msg: TgUpdateMessage) {
  const chatId = msg.chat.id;
  const platformUserId = String(chatId);
  const from = msg.from || { id: chatId };
  const text = msg.text?.trim() || "";

  let user = await findOrCreateTelegramUserFromBot(from);
  let locale = localeFromUser(user.locale);

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1];
    await handleStart(chatId, from, payload);
    return;
  }

  if (text === "✅ Мне есть 18 лет" || text === "✅ I am 18+") {
    if (text.includes("18+")) {
      locale = "en";
      await prisma.user.update({ where: { id: user.id }, data: { locale: "en" } });
    } else {
      locale = "ru";
      await prisma.user.update({ where: { id: user.id }, data: { locale: "ru" } });
    }
    await confirmAge(chatId, user.id, locale);
    return;
  }

  if (text === "📋 Правила" || text === "📋 Rules") {
    if (text.includes("Rules")) {
      locale = "en";
      await prisma.user.update({ where: { id: user.id }, data: { locale: "en" } });
    }
    await tgSendMessage(chatId, tgRulesText(locale));
    return;
  }

  if (text === t("lang_btn", locale) || text === "🌐 English" || text === "🌐 Русский") {
    const next: TgLocale = locale === "en" ? "ru" : "en";
    await prisma.user.update({ where: { id: user.id }, data: { locale: next } });
    locale = next;
    await tgSendMessage(chatId, t("welcome_full", locale), mainMenu(locale));
    return;
  }

  const session = await getTgSession(platformUserId);
  const pending = parsePending(session?.pendingJson || "{}");
  const chatState = session?.chatState || "idle";

  if (text === t("menu_templates", locale)) {
    await tgSendMessage(chatId, t("templates_hint", locale), templatesInline(locale));
    return;
  }

  if (text === t("menu_balance", locale)) {
    const bal = await getBalancePeaches(user.id);
    await tgSendMessage(chatId, tFormat("balance_fmt", locale, { n: bal }));
    return;
  }

  if (text === t("menu_topup", locale)) {
    await tgSendMessage(chatId, t("topup_packs", locale));
    return;
  }

  if (text === t("menu_affiliate", locale)) {
    await tgSendMessage(chatId, t("aff_stats", locale));
    return;
  }

  if (text === t("menu_model", locale)) {
    const ch = await getPrimaryTgCharacter(user.id);
    const n = ch ? characterPhotoCount(ch.id) : 0;
    const ready = ch && characterReady(ch.id);
    await tgSendMessage(
      chatId,
      tFormat("model_status", locale, {
        n,
        max: TG_MAX_CHARACTER_PHOTOS,
        ready: ready ? t("model_ready_suffix", locale) : "",
      }),
    );
    return;
  }

  if (text === t("menu_works", locale)) {
    const items = await prisma.galleryItem.findMany({
      where: { userId: user.id, NOT: { resultUrl: { contains: "placeholder" } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (!items.length) {
      await tgSendMessage(chatId, t("works_empty", locale));
      return;
    }
    for (const item of items) {
      if (!item.resultUrl) continue;
      const cap = item.title ?? undefined;
      if (item.kind === "video") {
        await tgSendVideo(chatId, item.resultUrl, cap);
      } else {
        await tgSendPhoto(chatId, item.resultUrl, cap);
      }
    }
    return;
  }

  if (msg.web_app_data?.data) {
    await handleWebAppData(chatId, platformUserId, user.id, locale, msg.web_app_data.data);
    return;
  }

  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1]!;
    await handlePhoto(chatId, user.id, locale, largest.file_id);
    return;
  }

  if (chatState === "awaiting_speech" && pending.templateId) {
    if (text === t("speech_confirm", locale)) {
      if (!pending.speechLine?.trim()) {
        await tgSendMessage(chatId, t("speech_prompt", locale));
        return;
      }
      await beginGeneration(chatId, platformUserId, user.id, locale, pending);
      return;
    }
    const line = text.slice(0, 500);
    const next = { ...pending, speechLine: line };
    await setTgSession(platformUserId, { chatState: "awaiting_speech", pending: next });
    await tgSendMessage(
      chatId,
      tFormat("speech_preview", locale, { line }),
      speechConfirmKeyboard(locale),
    );
    return;
  }

  await tgSendMessage(chatId, "👇", mainMenu(locale));
}

export async function flushTgOutbox() {
  const rows = await listPendingTgOutbox(15);
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payloadJson || "{}") as {
        url?: string;
        caption?: string;
        text?: string;
        mock?: boolean;
      };
      const chatId = Number(row.platformUserId);
      if (row.kind === "video" && payload.url) {
        await tgSendVideo(chatId, payload.url, payload.caption);
      } else if (row.kind === "photo" && payload.url) {
        await tgSendPhoto(chatId, payload.url, payload.caption);
      } else if (row.kind === "text" && payload.text) {
        await tgSendMessage(chatId, payload.text);
      } else if (row.kind === "error" && payload.text) {
        await tgSendMessage(chatId, payload.text);
      }
      await markTgOutboxSent(row.id);
    } catch (e) {
      console.error("[tg-outbox]", row.id, e);
    }
  }
}
