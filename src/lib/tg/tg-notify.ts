import { prisma } from "@/lib/db";
import { tgAbsoluteUrl } from "@/lib/tg/media-assets";
import { normalizeLocale } from "@/lib/tg/i18n";
import { enqueueTgOutbox } from "@/lib/tg/session";

export async function hasTelegramAccount(userId: string): Promise<{
  platformUserId: string;
  locale: "ru" | "en";
} | null> {
  const acc = await prisma.platformAccount.findFirst({
    where: { userId, platform: "telegram" },
    include: { user: true },
  });
  if (!acc) return null;
  return {
    platformUserId: acc.platformUserId,
    locale: acc.user.locale?.startsWith("en") ? "en" : "ru",
  };
}

export async function notifyTelegramMediaReady(opts: {
  userId: string;
  kind: "photo" | "video";
  mediaUrl: string;
  caption: string;
  offerSaveCharacterId?: string;
}) {
  const acc = await hasTelegramAccount(opts.userId);
  if (!acc) return;

  const url = tgAbsoluteUrl(opts.mediaUrl);
  await enqueueTgOutbox({
    platformUserId: acc.platformUserId,
    userId: opts.userId,
    kind: opts.kind,
    payload: {
      url,
      caption: opts.caption,
      successKind: opts.kind,
      locale: acc.locale,
      ...(opts.offerSaveCharacterId
        ? { offerSaveCharacterId: opts.offerSaveCharacterId }
        : {}),
    },
  });
}

export async function notifyTelegramGenerationError(
  userId: string,
  message: string,
) {
  const acc = await hasTelegramAccount(userId);
  if (!acc) return;
  const { tFormat } = await import("@/lib/tg/i18n");
  await enqueueTgOutbox({
    platformUserId: acc.platformUserId,
    userId,
    kind: "error",
    payload: {
      text: tFormat("gen_error", acc.locale, { msg: message }),
      locale: acc.locale,
    },
  });
}
