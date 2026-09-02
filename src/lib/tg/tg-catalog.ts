/**
 * TG bot + Mini App featured catalog (templates & studio cast sync).
 */
import { prisma } from "@/lib/db";
import type { TgLocale } from "@/lib/tg/i18n";
import { listPublicPhotoTemplates } from "@/lib/photo-template";
import {
  listPublishedQuickVideoTemplates,
  type PublicQuickVideoTemplate,
} from "@/lib/quick-video-template";
import { TG_VIDEO_PEACHES } from "@/lib/tg-pricing";

/** Launch video templates (Ref2V — user supplies face photos). */
export const TG_FEATURED_VIDEO_TITLES = [
  "Сосёт + кончает на лицо #1",
  "Снимает верхнюю одежду",
] as const;

/** LoRA-only photo template (studio cast or trained user model). */
export const TG_FEATURED_PHOTO_TITLES = ["Член во рту #1"] as const;

export const TG_STUDIO_CAST_NAMES = (
  process.env.TG_STUDIO_CAST_NAMES?.trim() ||
  "Daisy Shtorm,Маша,Лора"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let catalogEnsured = false;

/** Idempotent DB fixes: rename photo tpl, publish featured videos. */
export async function ensureTgCatalog(): Promise<void> {
  if (catalogEnsured) return;

  for (const title of TG_FEATURED_VIDEO_TITLES) {
    await prisma.quickVideoTemplate.updateMany({
      where: { title },
      data: {
        published: true,
        isJuice: false,
        pricePeaches: 0,
        priceCredits: 0,
      },
    });
  }

  const photoFeatured = await prisma.photoTemplate.findFirst({
    where: { title: { in: [...TG_FEATURED_PHOTO_TITLES] } },
  });
  if (!photoFeatured) {
    const legacy = await prisma.photoTemplate.findFirst({
      where: {
        OR: [
          { title: "2" },
          { editPrompt: { contains: "titjob" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    if (legacy) {
      await prisma.photoTemplate.update({
        where: { id: legacy.id },
        data: {
          title: TG_FEATURED_PHOTO_TITLES[0]!,
          published: true,
          sortOrder: 0,
        },
      });
    }
  } else {
    await prisma.photoTemplate.update({
      where: { id: photoFeatured.id },
      data: { published: true, sortOrder: 0 },
    });
  }

  catalogEnsured = true;
}

function orderByTitles<T extends { title: string }>(
  rows: T[],
  titles: readonly string[],
): T[] {
  const out: T[] = [];
  for (const t of titles) {
    const row = rows.find((r) => r.title === t);
    if (row) out.push(row);
  }
  return out;
}

export async function listTgFeaturedVideoTemplates(
  userId: string,
): Promise<PublicQuickVideoTemplate[]> {
  await ensureTgCatalog();
  const envIds = process.env.TG_BOT_INLINE_TEMPLATE_IDS?.trim();
  if (envIds) {
    const ids = envIds.split(",").map((s) => s.trim()).filter(Boolean);
    const all = await listPublishedQuickVideoTemplates(userId);
    return all.filter((t) => ids.includes(t.id));
  }
  const all = await listPublishedQuickVideoTemplates(userId);
  return orderByTitles(all, TG_FEATURED_VIDEO_TITLES);
}

export async function listTgFeaturedPhotoTemplates(locale: TgLocale = "ru") {
  await ensureTgCatalog();
  const all = await listPublicPhotoTemplates(locale);
  return orderByTitles(all, TG_FEATURED_PHOTO_TITLES);
}

export function videoTemplatePricePeaches(t: PublicQuickVideoTemplate): number {
  const row = t as PublicQuickVideoTemplate & { pricePeaches?: number };
  if (row.pricePeaches && row.pricePeaches > 0) return row.pricePeaches;
  if (t.priceCredits > 0) return t.priceCredits;
  return TG_VIDEO_PEACHES.basic5;
}

/** Random gallery still for studio cast card cover. */
export async function pickCharacterCoverUrl(
  characterId: string,
): Promise<string | null> {
  const rows = await prisma.galleryItem.findMany({
    where: {
      characterId,
      kind: "photo",
      resultUrl: { not: "" },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: { resultUrl: true },
  });
  if (!rows.length) return null;
  const pick = rows[Math.floor(Math.random() * rows.length)]!;
  return pick.resultUrl;
}
