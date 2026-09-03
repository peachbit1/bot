import crypto from "crypto";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

/** Validate Telegram Mini App `initData` per official spec. */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
): Record<string, string> | null {
  if (!initData?.trim() || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  // First-party bot-token HMAC: exclude ONLY `hash`.
  // `signature` (Ed25519, Bot API 7.2+) MUST stay in the data-check-string —
  // excluding it makes every modern Telegram client fail validation.
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculated = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (calculated !== hash) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export function parseTelegramUser(
  fields: Record<string, string>,
): TelegramWebAppUser | null {
  const raw = fields.user;
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as TelegramWebAppUser;
    if (!u?.id) return null;
    return u;
  } catch {
    return null;
  }
}

export function telegramSyntheticEmail(platformUserId: string): string {
  return `tg_${platformUserId}@peachbitch.local`;
}
