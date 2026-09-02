import { prisma } from "@/lib/db";
import {
  getQuickVideoTemplateDetail,
  userOwnsTemplate,
} from "@/lib/quick-video-template";
import {
  parseQuickVideoShotsPlan,
  type QuickVideoShotsPlan,
} from "@/lib/quick-video-prompt";
import {
  startQuickVideoRun,
  type ManualPictureSlotInput,
} from "@/lib/quick-video";
import { enqueuePhotoJob } from "@/lib/gallery-jobs";
import { localBytesFromResultUrl } from "@/lib/peach-lab";
import { useComfy } from "@/lib/metalnode-config";
import { GALLERY_PLACEHOLDER_URL } from "@/lib/gallery-meta";
import { saveGalleryBinary } from "@/lib/local-store";
import {
  TG_PHOTO_PEACHES,
  TG_VIDEO_PEACHES,
  applyFirstVideoDiscount,
} from "@/lib/tg-pricing";
import { getPhotoTemplate } from "@/lib/photo-template";
import { debitPeaches } from "@/lib/tg/wallet";
import { enqueueTgOutbox } from "@/lib/tg/session";
import {
  characterReadyForVideo,
} from "@/lib/tg/character-service";
import {
  isStudioCastCharacter,
  characterUsesLoraPhoto,
} from "@/lib/tg/studio-cast";
import {
  consumeLoraWelcomePhoto,
  consumeStudioDailyFree,
} from "@/lib/tg/tg-promo";

function injectSpeech(plan: QuickVideoShotsPlan, line: string): QuickVideoShotsPlan {
  const text = line.trim().slice(0, 500);
  if (!text || !plan.shots.length) return plan;
  const shots = [...plan.shots];
  const first = { ...shots[0]! };
  const tag = `voiceover: "${text.replace(/"/g, "'")}"`;
  first.legoQuery = first.legoQuery?.includes("voiceover:")
    ? first.legoQuery
    : `${first.legoQuery || ""} ${tag}`.trim();
  shots[0] = first;
  return { ...plan, shots };
}

export type TgGenerateResult = {
  runId?: string;
  galleryItemId?: string;
  chargedPeaches: number;
  discountApplied?: boolean;
  freePhoto?: boolean;
};

export async function resolveTemplatePricePeaches(opts: {
  kind: "video" | "photo";
  templateId: string;
  userId: string;
  tier?: "basic" | "pose";
}): Promise<number> {
  if (opts.kind === "photo") {
    const row = await getPhotoTemplate(opts.templateId);
    if (!row) throw new Error("template not found");
    return row.pricePeaches || TG_PHOTO_PEACHES.basic;
  }
  const detail = await getQuickVideoTemplateDetail(opts.userId, opts.templateId);
  if (!detail) throw new Error("template not found");
  const row = await prisma.quickVideoTemplate.findFirst({
    where: { id: opts.templateId },
    select: { pricePeaches: true },
  });
  if (row?.pricePeaches && row.pricePeaches > 0) return row.pricePeaches;
  if (detail.priceCredits > 0) return detail.priceCredits;
  return TG_VIDEO_PEACHES.basic5;
}

export async function startTgVideoGeneration(opts: {
  userId: string;
  platformUserId: string;
  templateId: string;
  characterId: string;
  speechLine?: string;
}): Promise<TgGenerateResult> {
  const detail = await getQuickVideoTemplateDetail(opts.userId, opts.templateId);
  if (!detail) throw new Error("Шаблон не найден");

  const owned = userOwnsTemplate({
    isAuthor: detail.isAuthor,
    isJuice: detail.isJuice,
    priceCredits: detail.priceCredits,
    purchased: detail.owned,
  });
  if (!owned) throw new Error("Сначала купите шаблон");

  if (!characterReadyForVideo(opts.characterId)) {
    throw new Error("Нужно минимум 1 фото модели");
  }

  let price = await resolveTemplatePricePeaches({
    kind: "video",
    templateId: opts.templateId,
    userId: opts.userId,
  });

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error("user not found");

  const discounted = applyFirstVideoDiscount(
    price,
    user.tgFirstVideoDiscountUsed,
  );
  price = discounted.peaches;

  if (price > 0) {
    const paid = await debitPeaches(opts.userId, price, "tg_video", {
      templateId: opts.templateId,
    });
    if (!paid.ok) {
      throw new Error(`Недостаточно персиков (нужно ${price}, есть ${paid.balance})`);
    }
  }

  if (discounted.discountApplied) {
    await prisma.user.update({
      where: { id: opts.userId },
      data: { tgFirstVideoDiscountUsed: true },
    });
  }

  let shotsPlan = parseQuickVideoShotsPlan(detail.shotsJson);
  if (!shotsPlan) throw new Error("Битый шаблон (shots)");

  if (opts.speechLine?.trim()) {
    shotsPlan = injectSpeech(shotsPlan, opts.speechLine);
  }

  const manualSlots: ManualPictureSlotInput[] = [];
  let pictureIndex = 1;
  for (const slot of detail.slotBlueprint) {
    if (slot.role === "identity") continue;
    if (!slot.bakedRefUrl) continue;
    const bytes = localBytesFromResultUrl(slot.bakedRefUrl);
    if (!bytes?.length) continue;
    manualSlots.push({
      pictureIndex: pictureIndex++,
      role: slot.role,
      label: slot.label,
      bytes,
      ext: slot.bakedRefUrl.split(".").pop() || "png",
    });
  }

  let poseVideoBuffer: Buffer | null = null;
  if (detail.refVideoUrl) {
    poseVideoBuffer = localBytesFromResultUrl(detail.refVideoUrl);
  }

  if (!useComfy()) {
    const mock = await mockCompleteVideoRun({
      userId: opts.userId,
      platformUserId: opts.platformUserId,
      title: detail.title,
      characterId: opts.characterId,
      previewVideoUrl: detail.previewVideoUrl || detail.previewPhotoUrl,
    });
    return {
      runId: mock.runId,
      galleryItemId: mock.galleryItemId,
      chargedPeaches: price,
      discountApplied: discounted.discountApplied,
    };
  }

  const run = await startQuickVideoRun({
    userId: opts.userId,
    title: detail.title,
    shotsPlan,
    characterIds: [opts.characterId],
    manualSlots: manualSlots.length ? manualSlots : undefined,
    poseVideoBuffer,
    orientation: detail.orientation,
    durationSec: detail.durationSec,
  });

  const linked = await prisma.quickVideoRun.findFirst({
    where: { id: run.id },
    select: { galleryItemId: true },
  });

  return {
    runId: run.id,
    galleryItemId: linked?.galleryItemId ?? undefined,
    chargedPeaches: price,
    discountApplied: discounted.discountApplied,
  };
}

export async function startTgPhotoGeneration(opts: {
  userId: string;
  platformUserId: string;
  templateId: string;
  characterId: string;
  studioDaily?: boolean;
  loraWelcome?: boolean;
}): Promise<TgGenerateResult> {
  const row = await getPhotoTemplate(opts.templateId);
  if (!row) throw new Error("Шаблон не найден");

  const character = await prisma.character.findFirst({
    where: { id: opts.characterId },
  });
  if (!character) throw new Error("Персонаж не найден");

  if (isStudioCastCharacter(character)) {
    // studio cast — no lora required
  } else if (character.loraStatus !== "lora_ready") {
    throw new Error("Для фото со своей моделью нужно завершить обучение");
  }

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error("user not found");

  let price =
    row.pricePeaches ||
    TG_PHOTO_PEACHES[row.tier === "pose" ? "pose" : "basic"];
  let freePhoto = false;

  if (opts.studioDaily) {
    price = 0;
    freePhoto = true;
    await consumeStudioDailyFree(opts.userId);
  } else if (opts.loraWelcome) {
    const w = await consumeLoraWelcomePhoto(opts.userId);
    if (!w.used) throw new Error("Подарочные генерации закончились");
    price = 0;
    freePhoto = true;
  } else if (price > 0) {
    const paid = await debitPeaches(opts.userId, price, "tg_photo", {
      templateId: opts.templateId,
    });
    if (!paid.ok) {
      throw new Error(`Недостаточно персиков (нужно ${price}, есть ${paid.balance})`);
    }
  }

  if (!useComfy()) {
    const previewUrl = row.previewImageUrl || row.sceneImageUrl || "/tg/catalog/photo-1.png";
    const previewBytes =
      localBytesFromResultUrl(previewUrl) ||
      localBytesFromResultUrl("/tg/catalog/photo-1.png");
    const mockItem = await prisma.galleryItem.create({
      data: {
        userId: opts.userId,
        characterId: opts.characterId,
        kind: "photo",
        title: row.title,
        prompt: row.editPrompt,
        resultUrl: GALLERY_PLACEHOLDER_URL,
        metaJson: JSON.stringify({ status: "pending", engine: "mock" }),
      },
    });
    const saved = saveGalleryBinary(
      opts.userId,
      "png",
      previewBytes?.length
        ? previewBytes
        : Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAHggJ/PdIqQQAAAABJRU5ErkJggg==",
            "base64",
          ),
      `tg_photo_${mockItem.id}`,
    );
    await prisma.galleryItem.update({
      where: { id: mockItem.id },
      data: {
        resultUrl: saved.publicUrl,
        metaJson: JSON.stringify({ status: "ready", engine: "mock" }),
      },
    });
    await enqueueTgOutbox({
      platformUserId: opts.platformUserId,
      userId: opts.userId,
      kind: "photo",
      payload: {
        url: saved.publicUrl,
        caption: row.title,
        successKind: "photo",
        locale: user.locale?.startsWith("en") ? "en" : "ru",
      },
    });
    return {
      galleryItemId: mockItem.id,
      chargedPeaches: price,
      freePhoto,
    };
  }

  const loraPhoto = characterUsesLoraPhoto(character);

  const item = await enqueuePhotoJob(opts.userId, {
    userId: opts.userId,
    tgPhotoTemplateId: opts.templateId,
    characterIds: [opts.characterId],
    characterId: opts.characterId,
    composedPrompt: row.editPrompt,
    useIdentityDualRef: !loraPhoto,
    studioCastLora: loraPhoto,
    title: row.title,
    width: 888,
    height: 1176,
  });

  return {
    galleryItemId: item.id,
    chargedPeaches: price,
    freePhoto,
  };
}

async function mockCompleteVideoRun(opts: {
  userId: string;
  platformUserId: string;
  title: string;
  characterId: string;
  previewVideoUrl?: string;
}) {
  const previewUrl = opts.previewVideoUrl || "/tg/catalog/video-1.mp4";
  const videoBytes =
    localBytesFromResultUrl(previewUrl) ||
    localBytesFromResultUrl("/tg/catalog/video-1.mp4");
  const saved = saveGalleryBinary(
    opts.userId,
    "mp4",
    videoBytes?.length ? videoBytes : Buffer.from("mock"),
    `tg_mock_video_${Date.now()}`,
  );

  const run = await prisma.quickVideoRun.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      prompt: '{"__qvShots":1}',
      composedPrompt: "mock",
      characterIdsJson: JSON.stringify([opts.characterId]),
      refImageUrlsJson: "[]",
      refVideoUrl: "",
      refSlotsJson: "[]",
      resultVideoUrl: saved.publicUrl,
      width: 720,
      height: 1280,
      durationSec: 6,
      orientation: "9_16",
      status: "ready",
      engine: "mock",
    },
  });

  const item = await prisma.galleryItem.create({
    data: {
      userId: opts.userId,
      characterId: opts.characterId,
      kind: "video",
      title: opts.title,
      resultUrl: saved.publicUrl,
      metaJson: JSON.stringify({ status: "ready", engine: "mock" }),
    },
  });

  await prisma.quickVideoRun.update({
    where: { id: run.id },
    data: { galleryItemId: item.id },
  });

  await notifyTgVideoReady(
    opts.userId,
    saved.publicUrl,
    opts.title,
    opts.characterId,
  );

  return { runId: run.id, galleryItemId: item.id };
}

export async function notifyTgPhotoReady(
  userId: string,
  photoUrl: string,
  title: string,
) {
  const acc = await prisma.platformAccount.findFirst({
    where: { userId, platform: "telegram" },
    include: { user: true },
  });
  if (!acc) return;

  await enqueueTgOutbox({
    platformUserId: acc.platformUserId,
    userId,
    kind: "photo",
    payload: {
      url: photoUrl,
      caption: title,
      successKind: "photo",
      locale: acc.user.locale?.startsWith("en") ? "en" : "ru",
    },
  });
}

export async function notifyTgVideoReady(
  userId: string,
  videoUrl: string,
  title: string,
  characterId?: string,
) {
  const acc = await prisma.platformAccount.findFirst({
    where: { userId, platform: "telegram" },
    include: { user: true },
  });
  if (!acc) return;

  let offerSaveCharacterId: string | undefined;
  if (characterId) {
    const ch = await prisma.character.findFirst({
      where: { id: characterId, userId, videoRefOnly: true },
    });
    if (ch && (ch.name === "Модель" || ch.name === "Model")) {
      offerSaveCharacterId = characterId;
    }
  }

  await enqueueTgOutbox({
    platformUserId: acc.platformUserId,
    userId,
    kind: "video",
    payload: {
      url: videoUrl,
      caption: title,
      successKind: "video",
      locale: acc.user.locale?.startsWith("en") ? "en" : "ru",
      offerSaveCharacterId,
    },
  });
}
