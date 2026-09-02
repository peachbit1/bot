/** PeachBitch TG — pricing in 🍑 персиках (1 персик = 1 ₽ номинал). */

export const PEACH_RUB = 1;

export const TG_PHOTO_PEACHES = {
  basic: 54,
  pose: 87,
} as const;

export const TG_VIDEO_PEACHES = {
  basic5: 142,
  popular: 197,
  premium: 274,
  ultra: 384,
} as const;

/** Quick top-up buttons in bot (1 🍑 = 1 ₽). Template prices are separate. */
export const TG_QUICK_TOPUP_AMOUNTS = [100, 300, 1000, 4000] as const;
export const TG_MIN_TOPUP_PEACHES = 100;

export const TG_TOP_UP_PACKS = [
  { id: "try", label: { ru: "Try", en: "Try" }, peaches: 109, bonusPct: 0 },
  { id: "hot", label: { ru: "Hot", en: "Hot" }, peaches: 329, bonusPct: 10 },
  { id: "fire", label: { ru: "Fire", en: "Fire" }, peaches: 659, bonusPct: 20 },
  { id: "pro", label: { ru: "Pro", en: "Pro" }, peaches: 1649, bonusPct: 30 },
] as const;

export const TG_PREMIUM = {
  loraTrainPeaches: 1000,
} as const;

export const TG_AFFILIATE = {
  commissionPct: 50,
  minPayoutUsdt: 30,
} as const;

/** Promos (approved 2026-09-01). */
export const TG_PROMO = {
  loraWelcomePhotos: 5,
  loraBonusWindowMin: 30,
  studioDailyFreePhotos: 1,
  firstVideoDiscountPct: 30,
} as const;

export type TgVideoTier = keyof typeof TG_VIDEO_PEACHES;
export type TgPhotoTier = keyof typeof TG_PHOTO_PEACHES;

export function tgVideoPeaches(tier: TgVideoTier): number {
  return TG_VIDEO_PEACHES[tier];
}

export function tgPhotoPeaches(tier: TgPhotoTier): number {
  return TG_PHOTO_PEACHES[tier];
}

/** First paid video: −30% once per account. */
export function applyFirstVideoDiscount(
  peaches: number,
  alreadyUsed: boolean,
): { peaches: number; discountApplied: boolean } {
  if (alreadyUsed || peaches <= 0) {
    return { peaches, discountApplied: false };
  }
  const discounted = Math.max(
    1,
    Math.round(peaches * (1 - TG_PROMO.firstVideoDiscountPct / 100)),
  );
  return { peaches: discounted, discountApplied: true };
}

/** Display helpers for crypto / Stars checkout (rate from env or default). */
export function peachesToRub(peaches: number): number {
  return peaches * PEACH_RUB;
}

export function peachesToUsdt(
  peaches: number,
  rubPerUsdt = Number(process.env.TG_RUB_PER_USDT || 80),
): number {
  if (rubPerUsdt <= 0) return 0;
  return Math.round((peaches / rubPerUsdt) * 100) / 100;
}

/** Telegram Stars — approximate; override via TG_STARS_PER_PEACH env. */
export function peachesToStars(
  peaches: number,
  starsPerPeach = Number(process.env.TG_STARS_PER_PEACH || 0.77),
): number {
  return Math.max(1, Math.ceil(peaches * starsPerPeach));
}

export function formatPeachPrice(peaches: number, locale: "ru" | "en"): string {
  const n = peaches.toLocaleString(locale === "ru" ? "ru-RU" : "en-US");
  return locale === "ru" ? `${n} 🍑` : `${n} peaches`;
}

/** @deprecated use balancePeaches */
export function rubToPeaches(rub: number): number {
  return Math.round(rub);
}
