import { prisma } from "@/lib/db";
import { ensureCharacterDirs } from "@/lib/character-dataset";

const STUDIO_USER_EMAIL = "studio-cast@peachbitch.internal";

const DEFAULT_CASTS = [
  { name: "Алиса", nameEn: "Alice" },
  { name: "Мила", nameEn: "Mila" },
  { name: "Софи", nameEn: "Sophie" },
];

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

/** Ensure shared studio LoRA-ready characters exist. */
export async function ensureStudioCasts(): Promise<void> {
  const studioUserId = await ensureStudioUserId();
  const count = await prisma.character.count({
    where: { userId: studioUserId, isStudioCast: true },
  });
  if (count >= DEFAULT_CASTS.length) return;

  for (const cast of DEFAULT_CASTS) {
    const found = await prisma.character.findFirst({
      where: { userId: studioUserId, name: cast.name, isStudioCast: true },
    });
    if (found) continue;
    const ch = await prisma.character.create({
      data: {
        userId: studioUserId,
        name: cast.name,
        gender: "female",
        consentGiven: true,
        status: "ready",
        photoCount: 0,
        isStudioCast: true,
        loraStatus: "lora_ready",
        triggerWord: cast.name.toLowerCase(),
      },
    });
    ensureCharacterDirs(ch.id);
  }
}

export async function listStudioCasts(locale: "ru" | "en" = "ru") {
  await ensureStudioCasts();
  const studioUserId = await ensureStudioUserId();
  const rows = await prisma.character.findMany({
    where: { userId: studioUserId, isStudioCast: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r, i) => ({
    id: r.id,
    name:
      locale === "en" && DEFAULT_CASTS[i]?.nameEn
        ? DEFAULT_CASTS[i]!.nameEn
        : r.name,
  }));
}

export async function getStudioCast(characterId: string) {
  const studioUserId = await ensureStudioUserId();
  return prisma.character.findFirst({
    where: { id: characterId, userId: studioUserId, isStudioCast: true },
  });
}

export function isStudioCastCharacter(ch: { isStudioCast?: boolean }): boolean {
  return Boolean(ch.isStudioCast);
}
