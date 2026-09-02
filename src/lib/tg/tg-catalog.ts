/**
 * TG bot + Mini App featured catalog (templates & studio cast sync).
 */
import { prisma } from "@/lib/db";
import type { TgLocale } from "@/lib/tg/i18n";
import { ensureTgBootstrap } from "@/lib/tg/tg-bootstrap";
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

/** Match by trigger if name differs on prod. */
export const TG_STUDIO_CAST_TRIGGERS = (
  process.env.TG_STUDIO_CAST_TRIGGERS?.trim() ||
  "daisysh,masha1,olh_person"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Per-slot: display name + ways to find character in DB. */
export const TG_STUDIO_CAST_SPEC: Array<{
  displayName: string;
  names: string[];
  triggers: string[];
}> = [
  {
    displayName: "Daisy Shtorm",
    names: ["Daisy Shtorm", "Daisy"],
    triggers: ["daisysh"],
  },
  { displayName: "Маша", names: ["Маша", "Masha"], triggers: ["masha1"] },
  { displayName: "Лора", names: ["Лора", "Lora"], triggers: ["olh_person"] },
];

function envIds(key: "TG_FEATURED_VIDEO_IDS" | "TG_FEATURED_PHOTO_IDS"): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Idempotent DB fixes: rename photo tpl, publish featured videos. */
export async function ensureTgCatalog(): Promise<void> {
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
        OR: [{ title: "2" }, { editPrompt: { contains: "titjob" } }],
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
}

function orderByTitles<T extends { title: string; id?: string }>(
  rows: T[],
  titles: readonly string[],
): T[] {
  const out: T[] = [];
  for (const title of titles) {
    const row = rows.find((r) => r.title === title);
    if (row) out.push(row);
  }
  return out;
}

function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  return ids
    .map((id) => rows.find((r) => r.id === id))
    .filter(Boolean) as T[];
}

export async function listTgFeaturedVideoTemplates(
  userId: string,
): Promise<PublicQuickVideoTemplate[]> {
  await ensureTgBootstrap();
  await ensureTgCatalog();
  const all = await listPublishedQuickVideoTemplates(userId);

  const byEnv = envIds("TG_FEATURED_VIDEO_IDS");
  if (byEnv.length) {
    const picked = orderByIds(all, byEnv);
    if (picked.length) return picked;
  }

  const botIds = process.env.TG_BOT_INLINE_TEMPLATE_IDS?.trim();
  if (botIds) {
    const ids = botIds.split(",").map((s) => s.trim()).filter(Boolean);
    const picked = orderByIds(all, ids);
    if (picked.length) return picked;
  }

  const byTitle = orderByTitles(all, TG_FEATURED_VIDEO_TITLES);
  if (byTitle.length) return byTitle;

  const fuzzy = all.filter(
    (t) =>
      /сосёт|кончает/i.test(t.title) ||
      /снимает.*одежд|верхн.*одежд/i.test(t.title),
  );
  if (fuzzy.length) return fuzzy.slice(0, 2);

  return all.slice(0, 2);
}

export async function listTgFeaturedPhotoTemplates(locale: TgLocale = "ru") {
  await ensureTgBootstrap();
  await ensureTgCatalog();
  const all = await listPublicPhotoTemplates(locale);

  const byEnv = envIds("TG_FEATURED_PHOTO_IDS");
  if (byEnv.length) {
    const picked = orderByIds(all, byEnv);
    if (picked.length) return picked;
  }

  const byTitle = orderByTitles(all, TG_FEATURED_PHOTO_TITLES);
  if (byTitle.length) return byTitle;

  const fuzzy = all.filter((t) => /член.*рту|во рту/i.test(t.title));
  if (fuzzy.length) return fuzzy.slice(0, 1);

  return all.slice(0, 1);
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
