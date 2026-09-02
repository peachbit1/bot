import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveTgApiUserId } from "@/lib/tg/resolve-api-user";
import {
  characterReadyForVideo,
  createVideoRefCharacter,
} from "@/lib/tg/character-service";
import {
  resolveTemplatePricePeaches,
  startTgVideoGeneration,
} from "@/lib/tg/generation-service";
import { getBalancePeaches } from "@/lib/tg/wallet";
import { normalizeLocale } from "@/lib/tg/i18n";

async function tgPlatformUserId(userId: string): Promise<string | null> {
  const acc = await prisma.platformAccount.findFirst({
    where: { userId, platform: "telegram" },
    select: { platformUserId: true },
  });
  return acc?.platformUserId ?? null;
}

/** Start video generation after ref photos uploaded (Mini App). */
export async function POST(req: Request) {
  const userId = await resolveTgApiUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    templateId?: string;
    characterId?: string;
    createNew?: boolean;
    locale?: string;
  };

  if (!body.templateId) {
    return NextResponse.json({ error: "templateId required" }, { status: 400 });
  }

  const locale = normalizeLocale(body.locale);
  const platformUserId = await tgPlatformUserId(userId);
  if (!platformUserId) {
    return NextResponse.json({ error: "No Telegram account" }, { status: 400 });
  }

  let characterId = body.characterId;
  if (!characterId && body.createNew) {
    const ch = await createVideoRefCharacter(userId, "Модель");
    characterId = ch.id;
  }
  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const ch = await prisma.character.findFirst({
    where: { id: characterId, userId, videoRefOnly: true },
  });
  if (!ch) {
    return NextResponse.json({ error: "Video ref not found" }, { status: 404 });
  }
  if (!characterReadyForVideo(characterId)) {
    return NextResponse.json({ error: "upload_photos_first" }, { status: 400 });
  }

  const price = await resolveTemplatePricePeaches({
    kind: "video",
    templateId: body.templateId,
    userId,
  });
  if (price > 0) {
    const bal = await getBalancePeaches(userId);
    if (bal < price) {
      return NextResponse.json(
        { error: "insufficient_balance", need: price, balance: bal },
        { status: 402 },
      );
    }
  }

  try {
    const result = await startTgVideoGeneration({
      userId,
      platformUserId,
      templateId: body.templateId,
      characterId,
    });
    return NextResponse.json({
      ok: true,
      galleryItemId: result.galleryItemId,
      runId: result.runId,
      message: locale === "en" ? "Video started" : "Видео генерируется",
      characterId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
