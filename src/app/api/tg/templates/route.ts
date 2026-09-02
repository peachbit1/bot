import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  listTgFeaturedPhotoTemplates,
  listTgFeaturedVideoTemplates,
  videoTemplatePricePeaches,
} from "@/lib/tg/tg-catalog";
import { normalizeLocale, type TgLocale } from "@/lib/tg/i18n";

function videoTitle(
  row: { title: string; titleEn?: string },
  locale: TgLocale,
) {
  return locale === "en" && row.titleEn?.trim() ? row.titleEn : row.title;
}

/** Templates feed for TG Mini App. */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "all";
  const localeParam = url.searchParams.get("locale");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const locale = normalizeLocale(localeParam || user?.locale);

  const [videoRaw, photo] = await Promise.all([
    kind === "photo" ? Promise.resolve([]) : listTgFeaturedVideoTemplates(userId),
    kind === "video" ? Promise.resolve([]) : listTgFeaturedPhotoTemplates(locale),
  ]);

  const video = videoRaw.map((t) => {
    const row = t as typeof t & { titleEn?: string; hasSpeech?: boolean };
    return {
      ...t,
      title: videoTitle(row, locale),
      pricePeaches: videoTemplatePricePeaches(t),
      hasSpeech: Boolean(row.hasSpeech),
    };
  });

  return NextResponse.json({ video, photo, locale });
}
