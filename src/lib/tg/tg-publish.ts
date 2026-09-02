/**
 * Publish Peach templates & studio cast cards to Telegram bot + Mini App.
 */
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { localPathFromResultUrl } from "@/lib/local-store";
import { ensureTgCatalog } from "@/lib/tg/tg-catalog";

const CATALOG_DIR = path.join(process.cwd(), "public", "tg", "catalog");

function extFromUrl(url: string, fallback: string): string {
  const base = url.split("?")[0] || "";
  const ext = path.extname(base);
  return ext || fallback;
}

/** Copy gallery asset to stable public/tg/catalog URL. */
export function copyAssetToTgCatalog(
  srcUrl: string,
  destBaseName: string,
  fallbackExt: string,
): string {
  if (!srcUrl?.trim()) return "";
  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  const ext = extFromUrl(srcUrl, fallbackExt);
  const destName = `${destBaseName}${ext}`;
  const destPath = path.join(CATALOG_DIR, destName);
  const publicUrl = `/tg/catalog/${destName}`;

  const local = localPathFromResultUrl(srcUrl);
  if (local && fs.existsSync(local)) {
    fs.copyFileSync(local, destPath);
    return publicUrl;
  }

  if (srcUrl.startsWith("/tg/catalog/")) return srcUrl;
  if (srcUrl.startsWith("/") && fs.existsSync(path.join(process.cwd(), "public", srcUrl))) {
    fs.copyFileSync(path.join(process.cwd(), "public", srcUrl), destPath);
    return publicUrl;
  }

  return srcUrl;
}

export function tgTemplateDisplayTitle(row: {
  title: string;
  tgDisplayTitle?: string | null;
}): string {
  const custom = row.tgDisplayTitle?.trim();
  return custom || row.title;
}

export function tgCastDisplayName(row: {
  name: string;
  tgDisplayName?: string | null;
}): string {
  const custom = row.tgDisplayName?.trim();
  return custom || row.name;
}

export async function publishQuickVideoTemplateToTg(
  templateId: string,
  opts?: { displayTitle?: string },
) {
  const row = await prisma.quickVideoTemplate.findUnique({ where: { id: templateId } });
  if (!row) throw new Error("Шаблон не найден");

  const slug = `qv-${templateId.slice(0, 10)}`;
  const previewVideoUrl = copyAssetToTgCatalog(
    row.previewVideoUrl,
    `${slug}-preview`,
    ".mp4",
  );
  const previewPhotoUrl = copyAssetToTgCatalog(
    row.previewPhotoUrl,
    `${slug}-thumb`,
    ".jpg",
  );

  const displayTitle = opts?.displayTitle?.trim() ?? row.tgDisplayTitle;

  const updated = await prisma.quickVideoTemplate.update({
    where: { id: templateId },
    data: {
      tgPublished: true,
      published: true,
      tgDisplayTitle: displayTitle,
      previewVideoUrl: previewVideoUrl || row.previewVideoUrl,
      previewPhotoUrl: previewPhotoUrl || row.previewPhotoUrl,
      pricePeaches: row.pricePeaches || 0,
      isJuice: false,
      priceCredits: 0,
    },
  });

  await ensureTgCatalog();
  return updated;
}

export async function unpublishQuickVideoTemplateFromTg(templateId: string) {
  return prisma.quickVideoTemplate.update({
    where: { id: templateId },
    data: { tgPublished: false },
  });
}

export async function updateQuickVideoTemplateTgMeta(
  templateId: string,
  patch: { displayTitle?: string; sortOrder?: number },
) {
  const data: { tgDisplayTitle?: string; tgSortOrder?: number } = {};
  if (patch.displayTitle !== undefined) {
    data.tgDisplayTitle = patch.displayTitle.trim();
  }
  if (patch.sortOrder !== undefined) {
    data.tgSortOrder = patch.sortOrder;
  }
  return prisma.quickVideoTemplate.update({ where: { id: templateId }, data });
}

export async function publishPhotoTemplateToTg(
  templateId: string,
  opts?: { displayTitle?: string },
) {
  const row = await prisma.photoTemplate.findUnique({ where: { id: templateId } });
  if (!row) throw new Error("Шаблон не найден");

  const slug = `pt-${templateId.slice(0, 10)}`;
  const previewImageUrl = copyAssetToTgCatalog(
    row.previewImageUrl || row.sceneImageUrl,
    `${slug}-preview`,
    ".jpg",
  );
  const sceneImageUrl = copyAssetToTgCatalog(
    row.sceneImageUrl || row.previewImageUrl,
    `${slug}-scene`,
    ".jpg",
  );

  const displayTitle = opts?.displayTitle?.trim() ?? row.tgDisplayTitle;

  const updated = await prisma.photoTemplate.update({
    where: { id: templateId },
    data: {
      tgPublished: true,
      published: true,
      tgDisplayTitle: displayTitle,
      previewImageUrl: previewImageUrl || row.previewImageUrl,
      sceneImageUrl: sceneImageUrl || row.sceneImageUrl,
    },
  });

  await ensureTgCatalog();
  return updated;
}

export async function unpublishPhotoTemplateFromTg(templateId: string) {
  return prisma.photoTemplate.update({
    where: { id: templateId },
    data: { tgPublished: false },
  });
}

export async function updatePhotoTemplateTgMeta(
  templateId: string,
  patch: { displayTitle?: string; sortOrder?: number },
) {
  const data: { tgDisplayTitle?: string; sortOrder?: number } = {};
  if (patch.displayTitle !== undefined) {
    data.tgDisplayTitle = patch.displayTitle.trim();
  }
  if (patch.sortOrder !== undefined) {
    data.sortOrder = patch.sortOrder;
  }
  return prisma.photoTemplate.update({ where: { id: templateId }, data });
}

export async function updateStudioCastTgCard(
  characterId: string,
  patch: { displayName?: string; coverUrl?: string },
) {
  const ch = await prisma.character.findFirst({
    where: { id: characterId, isStudioCast: true },
  });
  if (!ch) throw new Error("Актриса студии не найдена");

  const data: { tgDisplayName?: string; tgCoverUrl?: string } = {};
  if (patch.displayName !== undefined) {
    data.tgDisplayName = patch.displayName.trim();
  }
  if (patch.coverUrl !== undefined) {
    if (patch.coverUrl.trim()) {
      const slug = `cast-${characterId.slice(0, 10)}`;
      data.tgCoverUrl = copyAssetToTgCatalog(patch.coverUrl.trim(), slug, ".jpg");
    } else {
      data.tgCoverUrl = "";
    }
  }

  return prisma.character.update({ where: { id: characterId }, data });
}
