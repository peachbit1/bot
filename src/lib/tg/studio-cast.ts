import { prisma } from "@/lib/db";
import {
  pickCharacterCoverUrl,
  TG_STUDIO_CAST_NAMES,
} from "@/lib/tg/tg-catalog";

export { castsMiniAppUrl, tgMiniAppUrl } from "@/lib/tg/miniapp-url";

/** Real Krea LoRA on GPU — not lookbook-only and not mock. */
export function hasRealCharacterLora(ch: {
  loraStatus?: string;
  triggerWord?: string | null;
  loraPath?: string | null;
  name?: string;
}): boolean {
  if (ch.loraStatus !== "lora_ready" || !ch.triggerWord?.trim()) return false;
  const path = (ch.loraPath || "").trim();
  if (path && !path.startsWith("mock://")) return true;
  if (ch.name && TG_STUDIO_CAST_NAMES.includes(ch.name)) return true;
  return ch.triggerWord === "olh_person";
}

async function findStudioCastCandidates() {
  const rows = await prisma.character.findMany({
    where: {
      loraStatus: "lora_ready",
      OR: TG_STUDIO_CAST_NAMES.map((name) => ({ name })),
    },
    orderBy: { createdAt: "asc" },
  });
  const byName = new Map<string, (typeof rows)[number]>();
  for (const name of TG_STUDIO_CAST_NAMES) {
    const hit =
      rows.find((r) => r.name === name) ||
      rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (hit) byName.set(name, hit);
  }
  return TG_STUDIO_CAST_NAMES.map((n) => byName.get(n)).filter(Boolean) as typeof rows;
}

/** Mark house LoRA models; unmark everything else. */
export async function ensureStudioCasts(): Promise<void> {
  const candidates = await findStudioCastCandidates();
  const realIds = new Set<string>();

  for (const ch of candidates) {
    if (!hasRealCharacterLora(ch)) continue;
    realIds.add(ch.id);
    if (ch.loraPath?.startsWith("mock://") && ch.triggerWord === "olh_person") {
      await prisma.character.update({
        where: { id: ch.id },
        data: {
          loraPath: "krea2/olh_person_krea2.safetensors",
          isStudioCast: true,
        },
      });
    } else if (!ch.isStudioCast) {
      await prisma.character.update({
        where: { id: ch.id },
        data: { isStudioCast: true },
      });
    }
  }

  const stale = await prisma.character.findMany({
    where: { isStudioCast: true, id: { notIn: [...realIds] } },
  });
  for (const s of stale) {
    await prisma.character.update({
      where: { id: s.id },
      data: { isStudioCast: false },
    });
  }
}

export async function listStudioCasts(_locale: "ru" | "en" = "ru") {
  await ensureStudioCasts();
  const candidates = await findStudioCastCandidates();
  const out: Array<{ id: string; name: string; coverUrl: string | null }> = [];

  for (const ch of candidates) {
    if (!hasRealCharacterLora(ch)) continue;
    out.push({
      id: ch.id,
      name: ch.name,
      coverUrl: await pickCharacterCoverUrl(ch.id),
    });
  }

  return out;
}

export async function getStudioCast(characterId: string) {
  await ensureStudioCasts();
  const ch = await prisma.character.findFirst({
    where: {
      id: characterId,
      isStudioCast: true,
      loraStatus: "lora_ready",
    },
  });
  if (!ch || !hasRealCharacterLora(ch)) return null;
  return ch;
}

export function isStudioCastCharacter(ch: { isStudioCast?: boolean }): boolean {
  return Boolean(ch.isStudioCast);
}

export function characterUsesLoraPhoto(ch: {
  isStudioCast?: boolean;
  loraStatus?: string;
  triggerWord?: string | null;
  loraPath?: string | null;
  name?: string;
}): boolean {
  if (isStudioCastCharacter(ch)) return hasRealCharacterLora(ch);
  return ch.loraStatus === "lora_ready" && hasRealCharacterLora(ch);
}
