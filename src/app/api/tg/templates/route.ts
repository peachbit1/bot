import { NextResponse } from "next/server";
import { listPublishedQuickVideoTemplates } from "@/lib/quick-video-template";
import { listPublicPhotoTemplates } from "@/lib/photo-template";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TG_VIDEO_PEACHES } from "@/lib/tg-pricing";
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
    kind === "photo" ? Promise.resolve([]) : listPublishedQuickVideoTemplates(userId),
    kind === "video" ? Promise.resolve([]) : listPublicPhotoTemplates(locale),
  ]);

  const video = videoRaw.map((t) => {
    const row = t as typeof t & { titleEn?: string; pricePeaches?: number; hasSpeech?: boolean };
    return {
      ...t,
      title: videoTitle(row, locale),
      pricePeaches:
        row.pricePeaches && row.pricePeaches > 0
          ? row.pricePeaches
          : row.priceCredits > 0
            ? row.priceCredits
            : TG_VIDEO_PEACHES.basic5,
      hasSpeech: Boolean(row.hasSpeech),
    };
  });

  return NextResponse.json({ video, photo, locale });
}
