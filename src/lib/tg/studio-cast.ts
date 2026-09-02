import { prisma } from "@/lib/db";
import { ensureCharacterDirs } from "@/lib/character-dataset";
import { suggestedLookbook } from "@/lib/lookbook";

const STUDIO_USER_EMAIL = "studio-cast@peachbitch.internal";

/** LoRA triggers of house models (comma-separated). Add new actresses here after train. */
function configuredTriggers(): string[] {
  const raw = process.env.TG_STUDIO_CAST_TRIGGERS?.trim() || "olh_person";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Optional display names in Mini App (fallback = Character.name). */
const DISPLAY_NAMES: Record<string, { ru: string; en: string }> = {
  olh_person: { ru: "Оля", en: "Olya" },
};

/** Real Krea LoRA on GPU — not lookbook-only and not mock. */
export function hasRealCharacterLora(ch: {
  loraStatus?: string;
  triggerWord?: string | null;
  loraPath?: string | null;
}): boolean {
  if (ch.loraStatus !== "lora_ready" || !ch.triggerWord?.trim()) return false;
  const path = (ch.loraPath || "").trim();
  if (path && !path.startsWith("mock://")) return true;
  return ch.triggerWord === "olh_person";
}

export function castsMiniAppUrl(): string {
  const base =
    process.env.TELEGRAM_MINIAPP_URL?.replace(/\/tg\/templates\/?$/, "") ||
    process.env.TELEGRAM_BOT_SITE_URL ||
    "https://bot-production-c305.up.railway.app";
  return `${base.replace(/\/$/, "")}/tg/casts`;
}

async function ensureStudioUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: STUDIO_USER_EMAIL },
  });
  if (existing) return existing.id;

  const user = await prisma.user.create({
    data: {
      email: STUDIO_USER_EMAIL,
      passwordHash: "studio",
      name: "PeachBitch Studio",
      ageConfirmed: true,
      source: "system",
    },
  });
  return user.id;
}

async function ensureOlhPersonCast(studioUserId: string) {
  const existing = await prisma.character.findFirst({
    where: { triggerWord: "olh_person", loraStatus: "lora_ready" },
  });
  if (existing) return existing;

  const ch = await prisma.character.create({
    data: {
      userId: studioUserId,
      name: DISPLAY_NAMES.olh_person?.ru || "Оля",
      gender: "female",
      consentGiven: true,
      status: "ready",
      photoCount: 25,
      isStudioCast: true,
      loraStatus: "lora_ready",
      triggerWord: "olh_person",
      loraPath: "krea2/olh_person_krea2.safetensors",
      lookbookJson: JSON.stringify(suggestedLookbook("female", "olh")),
    },
  });
  ensureCharacterDirs(ch.id);
  return ch;
}

/**
 * Sync studio cast list: only LoRA-trained house models.
 * Unmarks lookbook placeholders (Алиса/Мила/Софи etc.).
 */
export async function ensureStudioCasts(): Promise<void> {
  const triggers = configuredTriggers();
  const studioUserId = await ensureStudioUserId();

  if (triggers.includes("olh_person")) {
    await ensureOlhPersonCast(studioUserId);
  }

  const candidates = await prisma.character.findMany({
    where: {
      triggerWord: { in: triggers },
      loraStatus: "lora_ready",
    },
    orderBy: { createdAt: "asc" },
  });

  const realIds = new Set<string>();
  for (const ch of candidates) {
    if (!hasRealCharacterLora(ch)) continue;
    realIds.add(ch.id);
    if (!ch.isStudioCast) {
      await prisma.character.update({
        where: { id: ch.id },
        data: { isStudioCast: true },
      });
    }
  }

  const stale = await prisma.character.findMany({
    where: {
      isStudioCast: true,
      id: { notIn: [...realIds] },
    },
  });
  for (const s of stale) {
    await prisma.character.update({
      where: { id: s.id },
      data: { isStudioCast: false },
    });
  }
}

export async function listStudioCasts(locale: "ru" | "en" = "ru") {
  await ensureStudioCasts();
  const triggers = configuredTriggers();
  const rows = await prisma.character.findMany({
    where: {
      isStudioCast: true,
      loraStatus: "lora_ready",
    },
    orderBy: { createdAt: "asc" },
  });

  const ordered = triggers
    .map((tw) => rows.find((r) => r.triggerWord === tw))
    .filter(Boolean) as typeof rows;

  return ordered
    .filter((r) => hasRealCharacterLora(r))
    .map((r) => {
      const d = r.triggerWord ? DISPLAY_NAMES[r.triggerWord] : undefined;
      return {
        id: r.id,
        name: locale === "en" ? d?.en || r.name : d?.ru || r.name,
      };
    });
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
