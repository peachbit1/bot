import { prisma } from "@/lib/db";
import {
  pickCharacterCoverUrl,
  TG_STUDIO_CAST_SPEC,
  TG_STUDIO_CAST_NAMES,
  TG_STUDIO_CAST_TRIGGERS,
} from "@/lib/tg/tg-catalog";
import { ensureTgBootstrap } from "@/lib/tg/tg-bootstrap";

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
  if (ch.triggerWord && TG_STUDIO_CAST_TRIGGERS.includes(ch.triggerWord)) return true;
  return ch.triggerWord === "olh_person";
}

async function findStudioCastCandidates() {
  const rows = await prisma.character.findMany({
    where: {
      loraStatus: "lora_ready",
      OR: [
        { name: { in: TG_STUDIO_CAST_NAMES } },
        ...TG_STUDIO_CAST_SPEC.flatMap((s) =>
          s.names.map((name) => ({ name: { contains: name } })),
        ),
        { triggerWord: { in: TG_STUDIO_CAST_TRIGGERS } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const out: typeof rows = [];
  for (const spec of TG_STUDIO_CAST_SPEC) {
    const hit =
      rows.find((r) => spec.names.includes(r.name)) ||
      rows.find((r) =>
        spec.names.some((n) => r.name.toLowerCase().includes(n.toLowerCase())),
      ) ||
      rows.find(
        (r) => r.triggerWord && spec.triggers.includes(r.triggerWord),
      );
    if (hit && !out.some((x) => x.id === hit.id)) out.push(hit);
  }
  return out;
}

/** Mark house LoRA models; unmark everything else. */
export async function ensureStudioCasts(): Promise<void> {
  await ensureTgBootstrap();
  const candidates = await findStudioCastCandidates();
  const realIds = new Set<string>();

  for (const ch of candidates) {
    if (!hasRealCharacterLora(ch)) continue;
    realIds.add(ch.id);
    const patch: { isStudioCast: boolean; loraPath?: string } = {
      isStudioCast: true,
    };
    if (ch.loraPath?.startsWith("mock://") && ch.triggerWord === "olh_person") {
      patch.loraPath = "krea2/olh_person_krea2.safetensors";
    }
    if (!ch.isStudioCast || patch.loraPath) {
      await prisma.character.update({ where: { id: ch.id }, data: patch });
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
    const spec = TG_STUDIO_CAST_SPEC.find(
      (s) =>
        s.names.includes(ch.name) ||
        (ch.triggerWord && s.triggers.includes(ch.triggerWord)),
    );
    out.push({
      id: ch.id,
      name: spec?.displayName || ch.name,
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
