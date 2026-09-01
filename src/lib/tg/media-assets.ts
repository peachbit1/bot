import { tgSendAnimation, tgSendMessage } from "@/lib/tg/telegram-api";

/** GIF / photo slots from PDF flow. Set via env when assets are ready. */
export type TgMediaSlot =
  | "start"
  | "welcome"
  | "photo_upload"
  | "character_saved"
  | "pose_confirm"
  | "insufficient_balance";

const ENV: Record<TgMediaSlot, string> = {
  start: "TG_GIF_START",
  welcome: "TG_GIF_WELCOME",
  photo_upload: "TG_GIF_PHOTO_UPLOAD",
  character_saved: "TG_GIF_CHARACTER_SAVED",
  pose_confirm: "TG_GIF_POSE_CONFIRM",
  insufficient_balance: "TG_GIF_INSUFFICIENT_BALANCE",
};

export function tgMediaAsset(slot: TgMediaSlot): string | undefined {
  const v = process.env[ENV[slot]]?.trim();
  return v || undefined;
}

/** Send text with optional GIF/photo attachment (file_id or URL). */
export async function tgSendMediaMessage(
  chatId: number,
  slot: TgMediaSlot,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const media = tgMediaAsset(slot);
  if (media) {
    return tgSendAnimation(chatId, media, {
      caption: text,
      parse_mode: "HTML",
      ...extra,
    });
  }
  return tgSendMessage(chatId, text, extra);
}
