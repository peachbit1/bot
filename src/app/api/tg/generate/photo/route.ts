import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveTgApiUserId } from "@/lib/tg/resolve-api-user";
import { getStudioCast } from "@/lib/tg/studio-cast";
import { setActiveTgCharacter } from "@/lib/tg/character-service";
import { startTgPhotoGeneration } from "@/lib/tg/generation-service";
import { templatePriceLabel } from "@/lib/tg/generation-flow";
import { getPhotoTemplate } from "@/lib/photo-template";
import { normalizeLocale } from "@/lib/tg/i18n";
import { getBalancePeaches } from "@/lib/tg/wallet";
import { canUseStudioDailyFree } from "@/lib/tg/tg-promo";

async function tgPlatformUserId(userId: string): Promise<string | null> {
  const acc = await prisma.platformAccount.findFirst({
    where: { userId, platform: "telegram" },
    select: { platformUserId: true },
  });
  return acc?.platformUserId ?? null;
}

/** Start studio-cast photo generation from Mini App. */
export async function POST(req: Request) {
  const userId = await resolveTgApiUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    templateId?: string;
    castId?: string;
    locale?: string;
  };

  if (!body.templateId || !body.castId) {
    return NextResponse.json({ error: "templateId and castId required" }, { status: 400 });
  }

  const locale = normalizeLocale(body.locale);
  const cast = await getStudioCast(body.castId);
  if (!cast) {
    return NextResponse.json({ error: "Cast not found" }, { status: 404 });
  }

  const tpl = await getPhotoTemplate(body.templateId);
  if (!tpl) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const platformUserId = await tgPlatformUserId(userId);
  if (!platformUserId) {
    return NextResponse.json({ error: "No Telegram account" }, { status: 400 });
  }

  await setActiveTgCharacter(platformUserId, cast.id);

  const pricing = await templatePriceLabel({
    userId,
    kind: "photo",
    templateId: body.templateId,
    locale,
    character: cast,
  });

  if (pricing.price > 0) {
    const bal = await getBalancePeaches(userId);
    if (bal < pricing.price) {
      return NextResponse.json(
        { error: "insufficient_balance", need: pricing.price, balance: bal },
        { status: 402 },
      );
    }
  }

  const studioDaily =
    pricing.studioDaily || (await canUseStudioDailyFree(userId));

  try {
    await startTgPhotoGeneration({
      userId,
      platformUserId,
      templateId: body.templateId,
      characterId: cast.id,
      studioDaily: Boolean(studioDaily && pricing.freePhoto),
      loraWelcome: false,
    });
    return NextResponse.json({
      ok: true,
      message: locale === "en" ? "Generation started" : "Генерация запущена",
      price: pricing.price,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
