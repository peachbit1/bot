import { prisma } from "@/lib/db";
import {
  characterPhotoCount,
  createTgCharacter,
  renameTgCharacter,
  setActiveTgCharacter,
  TG_MIN_CHARACTER_PHOTOS,
} from "@/lib/tg/character-service";
import {
  genKindInlineKeyboard,
  OB_CB,
  onboardKindInlineKeyboard,
  sendTemplatePicker,
} from "@/lib/tg/generation-flow";
import type { TgLocale } from "@/lib/tg/i18n";
import { t, tFormat } from "@/lib/tg/i18n";
import { mainMenuExtra } from "@/lib/tg/menu";
import { tgSendMediaMessage } from "@/lib/tg/media-assets";
import { tgRulesShortMessage } from "@/lib/tg/rules";
import { langInlineKeyboard } from "@/lib/tg/character-bot";
import { setTgSession } from "@/lib/tg/session";
import { tgSendMessage } from "@/lib/tg/telegram-api";

export async function sendStartPitch(chatId: number) {
  await tgSendMediaMessage(chatId, "start", t("start_pitch", "ru"), {
    reply_markup: langInlineKeyboard(),
  });
}

export async function sendRulesStep(chatId: number, locale: TgLocale) {
  const body = `${t("rules_step", locale)}\n\n${tgRulesShortMessage(locale)}`;
  await tgSendMessage(chatId, body, {
    link_preview_options: { is_disabled: false },
    reply_markup: {
      inline_keyboard: [
        [{ text: t("rules_agree_btn", locale), callback_data: "rules:agree" }],
      ],
    },
  });
}

export async function onLanguagePicked(
  chatId: number,
  userId: string,
  locale: TgLocale,
) {
  await prisma.user.update({ where: { id: userId }, data: { locale } });
  const platformUserId = String(chatId);
  await setTgSession(platformUserId, { chatState: "awaiting_rules" });
  await sendRulesStep(chatId, locale);
}

export async function sendWelcomeAfterRules(
  chatId: number,
  platformUserId: string,
  locale: TgLocale,
) {
  await setTgSession(platformUserId, {
    chatState: "onboarding_awaiting_upload",
    clearPending: true,
  });
  await tgSendMediaMessage(chatId, "welcome", t("welcome_after_rules", locale), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t("onboard_upload_char_btn", locale), callback_data: OB_CB.uploadChar }],
      ],
    },
  });
}

export async function startOnboardCharacter(
  chatId: number,
  platformUserId: string,
  locale: TgLocale,
) {
  await setTgSession(platformUserId, { chatState: "onboarding_awaiting_name" });
  await tgSendMessage(chatId, t("onboard_name_prompt", locale));
}

export async function onOnboardNameEntered(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
  name: string,
  existingCharacterId?: string,
) {
  let characterId = existingCharacterId;
  if (characterId) {
    await renameOnboardingCharacter(userId, characterId, name);
  } else {
    const ch = await createTgCharacter(userId, name);
    characterId = ch.id;
  }
  await setActiveTgCharacter(platformUserId, characterId);
  await setTgSession(platformUserId, {
    chatState: "onboarding_awaiting_photos",
    pending: { onboardingCharacterId: characterId },
  });
  await tgSendMediaMessage(chatId, "photo_upload", t("onboard_photo_prompt", locale), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t("onboard_back_name_btn", locale), callback_data: OB_CB.backName }],
      ],
    },
  });
}

export async function onOnboardBackToName(
  chatId: number,
  platformUserId: string,
  locale: TgLocale,
  characterId?: string,
) {
  await setTgSession(platformUserId, {
    chatState: "onboarding_awaiting_name",
    pending: characterId ? { onboardingCharacterId: characterId } : {},
  });
  await tgSendMessage(chatId, t("onboard_name_prompt", locale));
}

export async function onOnboardPhotoReceived(
  chatId: number,
  platformUserId: string,
  locale: TgLocale,
  characterId: string,
) {
  const n = characterPhotoCount(characterId);
  const need = Math.max(0, TG_MIN_CHARACTER_PHOTOS - n);

  if (need > 0) {
    await tgSendMessage(
      chatId,
      tFormat("onboard_photo_progress", locale, {
        n,
        min: TG_MIN_CHARACTER_PHOTOS,
        hint: tFormat("onboard_photo_need_more", locale, { n: need }),
      }),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: t("onboard_back_name_btn", locale), callback_data: OB_CB.backName }],
          ],
        },
      },
    );
    return;
  }

  await setTgSession(platformUserId, { chatState: "idle" });
  await tgSendMediaMessage(
    chatId,
    "character_saved",
    t("onboard_character_saved", locale),
    { reply_markup: onboardKindInlineKeyboard(locale) },
  );
  await tgSendMessage(chatId, "👇", mainMenuExtra(locale));
}

export async function onOnboardKindPicked(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
  kind: "photo" | "video",
) {
  await setTgSession(platformUserId, {
    chatState: "idle",
    pending: { templateKind: kind, templatePage: 0 },
  });
  const { templates } = await sendTemplatePicker(chatId, userId, locale, kind, 0);
  await setTgSession(platformUserId, {
    pending: {
      templateKind: kind,
      templatePage: 0,
      templateIds: templates.map((x) => x.id),
    },
  });
}

export async function confirmRulesAndWelcome(
  chatId: number,
  platformUserId: string,
  userId: string,
  locale: TgLocale,
) {
  await prisma.user.update({
    where: { id: userId },
    data: { ageConfirmed: true, locale },
  });
  await sendWelcomeAfterRules(chatId, platformUserId, locale);
}

export async function sendGenerationKindPicker(chatId: number, locale: TgLocale) {
  await tgSendMessage(chatId, t("gen_pick_kind", locale), {
    reply_markup: genKindInlineKeyboard(locale),
  });
}

export async function renameOnboardingCharacter(
  userId: string,
  characterId: string,
  name: string,
) {
  await renameTgCharacter(userId, characterId, name);
}
