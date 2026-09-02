import { prisma } from "@/lib/db";
import { listCharacterPhotos } from "@/lib/character-dataset";
import { useComfy } from "@/lib/metalnode-config";
import { TG_PREMIUM } from "@/lib/tg-pricing";
import { debitPeaches, getBalancePeaches } from "@/lib/tg/wallet";
import {
  grantLoraWelcomePhotos,
  loraBonusActive,
} from "@/lib/tg/tg-promo";
import { enqueueTgOutbox } from "@/lib/tg/session";
import type { TgLocale } from "@/lib/tg/i18n";
import { t, tFormat } from "@/lib/tg/i18n";
import { tgSendMessage } from "@/lib/tg/telegram-api";
import { mainMenuExtra } from "@/lib/tg/menu";
import { GEN_CB } from "@/lib/tg/generation-flow";
import { tgMiniAppUrl } from "@/lib/tg/miniapp-url";

export async function tryStartLoraTraining(opts: {
  chatId: number;
  platformUserId: string;
  userId: string;
  locale: TgLocale;
  characterId: string;
}): Promise<boolean> {
  const ch = await prisma.character.findFirst({
    where: { id: opts.characterId, userId: opts.userId },
  });
  if (!ch) return false;
  if (ch.loraStatus === "lora_training" || ch.loraStatus === "lora_ready") {
    return false;
  }

  const photos = listCharacterPhotos(opts.characterId);
  if (photos.length < 5) return false;

  const price = TG_PREMIUM.loraTrainPeaches;
  const bal = await getBalancePeaches(opts.userId);
  if (bal < price) {
    await tgSendMessage(
      opts.chatId,
      tFormat("onboard_lora_price", opts.locale, { price, balance: bal }),
      {
        reply_markup: {
          inline_keyboard: [[{ text: t("topup_btn", opts.locale), callback_data: "tu:open" }]],
        },
      },
    );
    return false;
  }

  const paid = await debitPeaches(opts.userId, price, "tg_lora_train", {
    characterId: opts.characterId,
  });
  if (!paid.ok) return false;

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (user && loraBonusActive(user.tgLoraBonusExpiresAt)) {
    await grantLoraWelcomePhotos(opts.userId);
  }

  await prisma.character.update({
    where: { id: opts.characterId },
    data: { loraStatus: "lora_training" },
  });

  await tgSendMessage(
    opts.chatId,
    tFormat("onboard_lora_started", opts.locale, { price }),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: t("gen_video_now_btn", opts.locale), callback_data: GEN_CB.againVideo }],
        ],
      },
    },
  );

  if (!useComfy()) {
    await completeLoraTrainingMock({
      userId: opts.userId,
      platformUserId: opts.platformUserId,
      characterId: opts.characterId,
      locale: opts.locale,
    });
  } else {
    try {
      const { startKreaLoraTrain } = await import("@/lib/krea-lora-train");
      await startKreaLoraTrain({
        userId: opts.userId,
        characterId: opts.characterId,
      });
    } catch (e) {
      console.error("[tg] lora train start failed:", e);
      await completeLoraTrainingMock({
        userId: opts.userId,
        platformUserId: opts.platformUserId,
        characterId: opts.characterId,
        locale: opts.locale,
      });
    }
  }

  return true;
}

export async function completeLoraTrainingMock(opts: {
  userId: string;
  platformUserId: string;
  characterId: string;
  locale: TgLocale;
}) {
  const ch = await prisma.character.update({
    where: { id: opts.characterId },
    data: { loraStatus: "lora_ready", triggerWord: `tg_${opts.characterId.slice(0, 8)}` },
  });

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  let body = tFormat("onboard_lora_ready", opts.locale, { name: ch.name });
  if ((user?.tgLoraWelcomePhotosLeft ?? 0) > 0) {
    body += t("onboard_lora_welcome_bonus", opts.locale);
  }

  await enqueueTgOutbox({
    platformUserId: opts.platformUserId,
    userId: opts.userId,
    kind: "text",
    payload: {
      text: body,
      reply_markup: {
        inline_keyboard: [
          [{ text: t("gen_lora_photo_btn", opts.locale), callback_data: GEN_CB.againPhoto }],
          [
            {
              text: t("marketplace_btn", opts.locale),
              web_app: { url: tgMiniAppUrl() },
            },
          ],
        ],
      },
    },
  });
}
