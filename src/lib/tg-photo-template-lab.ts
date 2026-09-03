/**
 * TG-style photo templates (PhotoTemplate table) — face ref + scene preview, no LoRA.
 */
import { prisma } from "@/lib/db";
import { localBytesFromResultUrl } from "@/lib/peach-lab";
import { saveGalleryBinary } from "@/lib/local-store";
import type { TgPhotoTier } from "@/lib/tg-pricing";

export type TgPhotoTemplateRow = {
  id: string;
  title: string;
  notes: string;
  tier: TgPhotoTier;
  editPrompt: string;
  previewImageUrl: string;
  sceneImageUrl: string;
  published: boolean;
  sortOrder: number;
  tgPublished: boolean;
  tgDisplayTitle: string;
};

const usablePhotoWhere = {
  OR: [{ published: true }, { tgPublished: true }],
} as const;

export async function listTgPhotoTemplatesForLab(): Promise<TgPhotoTemplateRow[]> {
  const rows = await prisma.photoTemplate.findMany({
    where: usablePhotoWhere,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    tier: (r.tier === "pose" ? "pose" : "basic") as TgPhotoTier,
    editPrompt: r.editPrompt,
    previewImageUrl: r.previewImageUrl || r.sceneImageUrl,
    sceneImageUrl: r.sceneImageUrl || r.previewImageUrl,
    published: r.published,
    sortOrder: r.sortOrder,
    tgPublished: r.tgPublished,
    tgDisplayTitle: r.tgDisplayTitle,
  }));
}

export async function getTgPhotoTemplateForGeneration(
  templateId: string,
): Promise<TgPhotoTemplateRow | null> {
  const row = await prisma.photoTemplate.findFirst({
    where: { id: templateId, ...usablePhotoWhere },
  });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    tier: (row.tier === "pose" ? "pose" : "basic") as TgPhotoTier,
    editPrompt: row.editPrompt,
    previewImageUrl: row.previewImageUrl || row.sceneImageUrl,
    sceneImageUrl: row.sceneImageUrl || row.previewImageUrl,
    published: row.published,
    sortOrder: row.sortOrder,
    tgPublished: row.tgPublished,
    tgDisplayTitle: row.tgDisplayTitle,
  };
}

export async function resolveTgPhotoTemplateSceneBuffer(
  templateId: string,
): Promise<Buffer | null> {
  const tpl = await getTgPhotoTemplateForGeneration(templateId);
  if (!tpl) return null;
  const url = tpl.sceneImageUrl || tpl.previewImageUrl;
  if (!url) return null;
  return localBytesFromResultUrl(url) || null;
}

export async function createTgPhotoTemplateFromUpload(opts: {
  userId: string;
  title: string;
  editPrompt: string;
  notes?: string;
  tier?: TgPhotoTier;
  sceneBytes: Buffer;
  sceneExt?: string;
}) {
  const saved = saveGalleryBinary(
    opts.userId,
    opts.sceneExt || "png",
    opts.sceneBytes,
    "tg_photo_tpl",
  );
  const row = await prisma.photoTemplate.create({
    data: {
      title: opts.title.trim().slice(0, 120) || "Photo template",
      notes: (opts.notes || "").trim().slice(0, 500),
      tier: opts.tier === "pose" ? "pose" : "basic",
      editPrompt: opts.editPrompt.trim(),
      sceneImageUrl: saved.publicUrl,
      previewImageUrl: saved.publicUrl,
      published: true,
      // Ready for lab test immediately; admin still toggles TG catalog explicitly.
      tgPublished: false,
    },
  });
  return getTgPhotoTemplateForGeneration(row.id);
}
