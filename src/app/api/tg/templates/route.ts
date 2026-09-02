import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveTgApiUserId } from "@/lib/tg/resolve-api-user";
import {
  listTgFeaturedPhotoTemplates,
  listTgFeaturedVideoTemplates,
  videoTemplatePricePeaches,
} from "@/lib/tg/tg-catalog";
import { normalizeLocale, type TgLocale } from "@/lib/tg/i18n";
import { seedPreviewForPhoto, seedPreviewForVideo } from "@/lib/tg/tg-catalog-seed";

function videoTitle(
  row: { title: string; titleEn?: string },
  locale: TgLocale,
) {
  return locale === "en" && row.titleEn?.trim() ? row.titleEn : row.title;
}

/** Templates feed for TG Mini App. */
export async function GET(req: Request) {
  const userId = await resolveTgApiUserId(req);
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

  const video = videoRaw.map((t, i) => {
    const row = t as typeof t & { titleEn?: string; hasSpeech?: boolean };
    const seedPrev = seedPreviewForVideo(row.title, i);
    const previewVideo =
      t.previewVideoUrl?.trim() ||
      t.previewPhotoUrl?.trim() ||
      seedPrev?.previewVideoUrl ||
      "";
    const previewPhoto =
      t.previewPhotoUrl?.trim() ||
      seedPrev?.previewPhotoUrl ||
      previewVideo;
    return {
      ...t,
      title: videoTitle(row, locale),
      pricePeaches: videoTemplatePricePeaches(t),
      hasSpeech: Boolean(row.hasSpeech),
      previewVideoUrl: previewVideo,
      previewPhotoUrl: previewPhoto,
    };
  });

  const photoMapped = photo.map((p) => ({
    ...p,
    previewImageUrl:
      p.previewImageUrl?.trim() ||
      seedPreviewForPhoto(p.title) ||
      "",
  }));

  return NextResponse.json({ video, photo: photoMapped, locale });
}
