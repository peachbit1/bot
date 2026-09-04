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
import { isSafeVideoTemplateThumb } from "@/lib/quick-video-preview-safe";

function videoTitle(
  row: { title: string; titleEn?: string },
  locale: TgLocale,
) {
  return locale === "en" && row.titleEn?.trim() ? row.titleEn : row.title;
}

function looksLikeVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || /preview/i.test(url);
}

/** Templates feed for TG Mini App. */
export async function GET(req: Request) {
  // One-shot scrub of leaked ref stills from video thumbs (safe to call often).
  void import("@/lib/tg/migrate-video-preview")
    .then((m) => m.migrateVideoTemplatePreviewHygiene())
    .catch((e) => console.error("[peach] video preview migrate:", e));

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
    const rawVideo = t.previewVideoUrl?.trim() || "";
    // Never promote previewPhotoUrl (often a leaked identity/ref still) to video.
    const previewVideo =
      (rawVideo && looksLikeVideoUrl(rawVideo) ? rawVideo : "") ||
      seedPrev?.previewVideoUrl ||
      "";
    const rawPhoto = t.previewPhotoUrl?.trim() || "";
    const previewPhoto = isSafeVideoTemplateThumb(rawPhoto)
      ? rawPhoto
      : isSafeVideoTemplateThumb(seedPrev?.previewPhotoUrl)
        ? seedPrev!.previewPhotoUrl
        : "";
    return {
      ...t,
      title: videoTitle(row, locale),
      pricePeaches: videoTemplatePricePeaches(t),
      hasSpeech: Boolean(row.hasSpeech),
      previewVideoUrl: previewVideo,
      previewPhotoUrl: previewPhoto,
      createdAt: (t as { createdAt?: string }).createdAt || new Date(0).toISOString(),
      updatedAt:
        (t as { updatedAt?: string }).updatedAt ||
        (t as { createdAt?: string }).createdAt ||
        new Date(0).toISOString(),
      identityKey: (t as { identityKey?: string }).identityKey || t.id,
    };
  });

  const photoMapped = photo.map((p) => ({
    ...p,
    previewImageUrl:
      p.previewImageUrl?.trim() ||
      seedPreviewForPhoto(p.title) ||
      "",
    createdAt: (p as { createdAt?: string }).createdAt || new Date(0).toISOString(),
    updatedAt:
      (p as { updatedAt?: string }).updatedAt ||
      (p as { createdAt?: string }).createdAt ||
      new Date(0).toISOString(),
    identityKey: (p as { identityKey?: string }).identityKey || p.id,
    sceneCategory: (p as { sceneCategory?: string }).sceneCategory || "",
  }));

  return NextResponse.json({ video, photo: photoMapped, locale });
}
