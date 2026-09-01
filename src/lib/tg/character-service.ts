import { prisma } from "@/lib/db";
import {
  ensureCharacterDirs,
  listCharacterPhotos,
  saveCharacterPhoto,
} from "@/lib/character-dataset";
import { emptyLookbook } from "@/lib/lookbook";

export const TG_MIN_CHARACTER_PHOTOS = 3;
export const TG_MAX_CHARACTER_PHOTOS = 5;

export async function getPrimaryTgCharacter(userId: string) {
  return prisma.character.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function ensureTgCharacter(userId: string, name?: string) {
  const existing = await getPrimaryTgCharacter(userId);
  if (existing) return existing;

  const character = await prisma.character.create({
    data: {
      userId,
      name: (name || "Model").slice(0, 40),
      gender: "female",
      consentGiven: true,
      photoCount: 0,
      status: "ready",
      loraStatus: "lookbook_ready",
      lookbookJson: JSON.stringify(emptyLookbook("female")),
    },
  });
  ensureCharacterDirs(character.id);
  return character;
}

export async function addCharacterPhotoFromBuffer(
  userId: string,
  characterId: string,
  buf: Buffer,
  fileName: string,
) {
  const ch = await prisma.character.findFirst({
    where: { id: characterId, userId },
  });
  if (!ch) throw new Error("character not found");

  const existing = listCharacterPhotos(characterId);
  if (existing.length >= TG_MAX_CHARACTER_PHOTOS) {
    throw new Error("max photos");
  }

  saveCharacterPhoto(characterId, fileName, buf, ch.triggerWord);
  const photos = listCharacterPhotos(characterId);
  await prisma.character.update({
    where: { id: characterId },
    data: { photoCount: photos.length },
  });
  return photos;
}

export function characterPhotoCount(characterId: string): number {
  return listCharacterPhotos(characterId).length;
}

export function characterReady(characterId: string): boolean {
  return characterPhotoCount(characterId) >= TG_MIN_CHARACTER_PHOTOS;
}
