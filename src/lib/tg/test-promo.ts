import { prisma } from "@/lib/db";
import { creditPeaches, getBalancePeaches } from "@/lib/tg/wallet";
import type { TgLocale } from "@/lib/tg/i18n";

export const TG_TEST_PROMO_CODE = "НАЧИСЛИ500";
export const TG_TEST_PROMO_AMOUNT = 500;
const LEDGER_REASON = "promo_nachisli500";

function normalizePromoInput(text: string): string {
  return text.trim().replace(/\s+/g, "").toUpperCase();
}

export function isTestPromoMessage(text: string): boolean {
  const norm = normalizePromoInput(text);
  return norm === normalizePromoInput(TG_TEST_PROMO_CODE);
}

/** Temporary test promo — one redemption per user. */
export async function redeemTestPromo(
  userId: string,
  locale: TgLocale = "ru",
): Promise<{ ok: true; balance: number } | { ok: false; message: string }> {
  const used = await prisma.ledgerEntry.findFirst({
    where: { userId, reason: LEDGER_REASON },
    select: { id: true },
  });
  if (used) {
    return {
      ok: false,
      message:
        locale === "en"
          ? "You already used this test code."
          : "Этот тестовый код уже использован.",
    };
  }

  await creditPeaches(userId, TG_TEST_PROMO_AMOUNT, LEDGER_REASON, {
    code: TG_TEST_PROMO_CODE,
  });
  const balance = await getBalancePeaches(userId);

  return { ok: true, balance };
}
