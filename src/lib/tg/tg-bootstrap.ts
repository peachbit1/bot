/**
 * Idempotent TG launch catalog seed — creates studio casts + featured templates
 * when prod DB is empty (ensureTgCatalog alone only updates existing rows).
 */
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { suggestedLookbook } from "@/lib/lookbook";
import {
  TG_FEATURED_PHOTO_TITLES,
  TG_FEATURED_VIDEO_TITLES,
  TG_STUDIO_CAST_SPEC,
} from "@/lib/tg/tg-launch-constants";

const STUDIO_OWNER_EMAIL = "tg-studio@peachbitch.internal";

const BOOTSTRAP_VIDEOS = [
  {
    title: TG_FEATURED_VIDEO_TITLES[0]!,
    durationSec: 10,
    shotsJson:
      '{"__qvShots":1,"totalDurationSec":10,"shots":[{"id":"shot-1","durationSec":5,"legoQuery":"[location:in the evening, in the bedroom][Аня]without clothes, completely naked[Минет + eye contact (явный акцент взгляда)][Oral: приглушённый стон/hum на члене]"},{"id":"shot-2-mtiusskr","durationSec":2,"legoQuery":"[Аня][location:in the evening, in the bedroom][Аня]without clothes, completely naked[Handjob, вид сбоку][Дуэт: она стонет + он дышит/grunt тише]"},{"id":"shot-3-mtiustir","durationSec":3,"legoQuery":"[Аня][location:in the evening, in the bedroom][Аня]without clothes, completely naked[Кончает на лицо (facial, POV вниз)]"}]}',
    slotBlueprintJson:
      '[{"role":"identity","label":"Аня"},{"role":"identity","label":"Аня"},{"role":"identity","label":"Аня"}]',
    identityPersonCount: 1,
  },
  {
    title: TG_FEATURED_VIDEO_TITLES[1]!,
    durationSec: 6,
    shotsJson:
      '{"__qvShots":1,"totalDurationSec":6,"shots":[{"id":"shot-1","durationSec":6,"legoQuery":"[location:bedroom][Рейчел][Снимает верх (side)][Тихое дыхание удовольствия (soft breath only)]"}]}',
    slotBlueprintJson:
      '[{"role":"identity","label":"Рейчел"},{"role":"identity","label":"Рейчел"},{"role":"identity","label":"Рейчел"}]',
    identityPersonCount: 1,
  },
] as const;

const BOOTSTRAP_PHOTO = {
  title: TG_FEATURED_PHOTO_TITLES[0]!,
  tier: "pose" as const,
  editPrompt:
    "amateur handheld first-person POV looking down, woman presses her breasts around his thick cock and strokes a titjob, looking up at camera. on-camera direct flash, harsh frontal flash, hard shadows, high contrast, clinical cold-white light, glossy skin specular hits, 35mm snapshot look, f/8, deep focus, raw unflattering flash aesthetic",
};

let bootstrapPromise: Promise<void> | null = null;

async function ensureStudioOwnerUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: STUDIO_OWNER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  return prisma.user
    .create({
      data: {
        email: STUDIO_OWNER_EMAIL,
        passwordHash: await hashPassword(`studio-${process.env.AUTH_SECRET || "internal"}`),
        name: "PeachBitch Studio",
        source: "web",
        ageConfirmed: true,
      },
      select: { id: true },
    })
    .then((u) => u.id);
}

async function ensureStudioCastCharacters(): Promise<void> {
  const ownerId = await ensureStudioOwnerUserId();

  for (const spec of TG_STUDIO_CAST_SPEC) {
    const hit =
      (await prisma.character.findFirst({
        where: { triggerWord: { in: spec.triggers } },
      })) ||
      (await prisma.character.findFirst({
        where: { OR: spec.names.map((name) => ({ name })) },
      }));

    const loraPath =
      spec.triggers[0] === "olh_person"
        ? "krea2/olh_person_krea2.safetensors"
        : spec.triggers[0] === "masha1"
          ? "krea2/masha1_krea2.safetensors"
          : spec.triggers[0] === "daisysh"
            ? "krea2/daisysh_krea2.safetensors"
            : null;

    if (hit) {
      const patch: {
        name?: string;
        loraStatus?: string;
        triggerWord?: string;
        loraPath?: string;
        isStudioCast?: boolean;
        photoCount?: number;
      } = {
        isStudioCast: true,
        loraStatus: "lora_ready",
      };
      if (!hit.triggerWord && spec.triggers[0]) {
        patch.triggerWord = spec.triggers[0];
      }
      if (loraPath && (!hit.loraPath || hit.loraPath.startsWith("mock://"))) {
        patch.loraPath = loraPath;
      }
      if (hit.name !== spec.displayName) patch.name = spec.displayName;
      if (hit.loraStatus !== "lora_ready") patch.loraStatus = "lora_ready";
      if (hit.photoCount < 10) patch.photoCount = 25;
      await prisma.character.update({ where: { id: hit.id }, data: patch });
      continue;
    }

    await prisma.character.create({
      data: {
        userId: ownerId,
        name: spec.displayName,
        gender: "female",
        consentGiven: true,
        photoCount: 25,
        status: "ready",
        loraStatus: "lora_ready",
        triggerWord: spec.triggers[0]!,
        loraPath,
        isStudioCast: true,
        lookbookJson: JSON.stringify(
          suggestedLookbook("female", spec.triggers[0] || "olh"),
        ),
      },
    });
  }
}

async function ensureFeaturedTemplates(): Promise<void> {
  const ownerId = await ensureStudioOwnerUserId();

  for (const tpl of BOOTSTRAP_VIDEOS) {
    const existing = await prisma.quickVideoTemplate.findFirst({
      where: { title: tpl.title },
    });
    if (existing) {
      if (!existing.published) {
        await prisma.quickVideoTemplate.update({
          where: { id: existing.id },
          data: { published: true, pricePeaches: 0, priceCredits: 0 },
        });
      }
      continue;
    }

    await prisma.quickVideoTemplate.create({
      data: {
        userId: ownerId,
        title: tpl.title,
        category: "bitch",
        published: true,
        pricePeaches: 0,
        priceCredits: 0,
        isJuice: false,
        shotsJson: tpl.shotsJson,
        slotBlueprintJson: tpl.slotBlueprintJson,
        identityPersonCount: tpl.identityPersonCount,
        durationSec: tpl.durationSec,
        orientation: "9_16",
      },
    });
  }

  const photoTitle = BOOTSTRAP_PHOTO.title;
  const photoExisting = await prisma.photoTemplate.findFirst({
    where: {
      OR: [
        { title: photoTitle },
        { title: "2" },
        { editPrompt: { contains: "titjob" } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (photoExisting) {
    await prisma.photoTemplate.update({
      where: { id: photoExisting.id },
      data: {
        title: photoTitle,
        published: true,
        sortOrder: 0,
        editPrompt: photoExisting.editPrompt || BOOTSTRAP_PHOTO.editPrompt,
      },
    });
    return;
  }

  await prisma.photoTemplate.create({
    data: {
      title: photoTitle,
      tier: BOOTSTRAP_PHOTO.tier,
      editPrompt: BOOTSTRAP_PHOTO.editPrompt,
      published: true,
      sortOrder: 0,
      pricePeaches: 54,
    },
  });
}

/** Creates missing launch catalog rows once per process (safe to call often). */
export function ensureTgBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        await ensureStudioCastCharacters();
        await ensureFeaturedTemplates();
      } catch (e) {
        bootstrapPromise = null;
        console.error("[tg/bootstrap]", e);
        throw e;
      }
    })();
  }
  return bootstrapPromise;
}

export async function runTgBootstrapNow(): Promise<{
  videos: number;
  photos: number;
  casts: number;
}> {
  bootstrapPromise = null;
  await ensureTgBootstrap();
  const [videos, photos, casts] = await Promise.all([
    prisma.quickVideoTemplate.count({ where: { published: true } }),
    prisma.photoTemplate.count({ where: { published: true } }),
    prisma.character.count({
      where: { isStudioCast: true, loraStatus: "lora_ready" },
    }),
  ]);
  return { videos, photos, casts };
}
