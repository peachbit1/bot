import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveTgApiUserId } from "@/lib/tg/resolve-api-user";
import { listTgCharacters } from "@/lib/tg/character-service";
import { listStudioCasts } from "@/lib/tg/studio-cast";
import { normalizeLocale } from "@/lib/tg/i18n";
import { TG_PROMO } from "@/lib/tg-pricing";

/** Mini App profile: balance, characters, studio cast, promos. */
export async function GET(req: Request) {
  const userId = await resolveTgApiUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const locale = normalizeLocale(url.searchParams.get("locale"));

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [characters, casts] = await Promise.all([
    listTgCharacters(userId),
    listStudioCasts(locale),
  ]);

  return NextResponse.json({
    balancePeaches: user.balancePeaches,
    locale: normalizeLocale(user.locale || locale),
    promos: {
      studioDailyFreeReady: user.tgStudioFreeReady,
      loraWelcomePhotosLeft: user.tgLoraWelcomePhotosLeft,
      firstVideoDiscountAvailable: !user.tgFirstVideoDiscountUsed,
      firstVideoDiscountPct: TG_PROMO.firstVideoDiscountPct,
    },
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      loraStatus: c.loraStatus,
      photoCount: c.photoCount,
      isStudioCast: c.isStudioCast,
    })),
    casts,
  });
}
