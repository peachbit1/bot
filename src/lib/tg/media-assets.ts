import { tgSendAnimation, tgSendMessage, tgSendPhoto } from "@/lib/tg/telegram-api";

/** Bundled onboarding / top-up images in `public/tg/media/`. */
export type TgMediaSlot = "start" | "welcome" | "photo_upload" | "topup";

const ENV: Record<TgMediaSlot, string> = {
  start: "TG_GIF_START",
  welcome: "TG_GIF_WELCOME",
  photo_upload: "TG_GIF_PHOTO_UPLOAD",
  topup: "TG_GIF_TOPUP",
};

/** Default static files (override via env with file_id or URL). */
const BUNDLED: Record<TgMediaSlot, string> = {
  start: "/tg/media/onboard-1.jpg",
  welcome: "/tg/media/onboard-2.jpg",
  photo_upload: "/tg/media/onboard-3.jpg",
  topup: "/tg/media/topup.jpg",
};

export function tgSiteBaseUrl(): string {
  return (
    process.env.TELEGRAM_MINIAPP_URL?.replace(/\/tg\/templates\/?$/, "") ||
    process.env.TELEGRAM_BOT_SITE_URL ||
    "https://bot-production-c305.up.railway.app"
  );
}

export function tgAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = tgSiteBaseUrl().replace(/\/$/, "");
  return pathOrUrl.startsWith("/") ? `${base}${pathOrUrl}` : `${base}/${pathOrUrl}`;
}

export function tgMediaAsset(slot: TgMediaSlot): string {
  const fromEnv = process.env[ENV[slot]]?.trim();
  if (fromEnv) return fromEnv;
  return tgAbsoluteUrl(BUNDLED[slot]);
}

function isAnimationMedia(media: string): boolean {
  if (media.startsWith("Cg")) return true;
  return /\.gif(\?|$)/i.test(media);
}

/** Send text with bundled/env photo or GIF (file_id or URL). */
export async function tgSendMediaMessage(
  chatId: number,
  slot: TgMediaSlot,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const media = tgMediaAsset(slot);
  if (isAnimationMedia(media)) {
    return tgSendAnimation(chatId, media, {
      caption: text,
      parse_mode: "HTML",
      ...extra,
    });
  }
  return tgSendPhoto(chatId, media, text, extra);
}

/** Photo/video preview with caption (e.g. template confirm). */
export async function tgSendPreviewMessage(
  chatId: number,
  previewUrl: string | null | undefined,
  text: string,
  extra: Record<string, unknown> = {},
) {
  if (!previewUrl) {
    return tgSendMessage(chatId, text, extra);
  }
  const url = tgAbsoluteUrl(previewUrl);
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    const { tgSendVideo } = await import("@/lib/tg/telegram-api");
    await tgSendVideo(chatId, url, text);
    if (extra.reply_markup) {
      return tgSendMessage(chatId, "👇", extra);
    }
    return;
  }
  return tgSendPhoto(chatId, url, text, extra);
}
