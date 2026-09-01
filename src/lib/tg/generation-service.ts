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
import { localBytesFromResultUrl } from "@/lib/peach-lab";
import { useComfy } from "@/lib/metalnode-config";
import { GALLERY_PLACEHOLDER_URL } from "@/lib/gallery-meta";
import { saveGalleryBinary } from "@/lib/local-store";
import {
  TG_PHOTO_PEACHES,
  TG_PROMO,
  TG_VIDEO_PEACHES,
  applyFirstVideoDiscount,
} from "@/lib/tg-pricing";
import { getPhotoTemplate } from "@/lib/photo-template";
import { debitPeaches } from "@/lib/tg/wallet";
import { enqueueTgOutbox } from "@/lib/tg/session";
import {
  characterReady,
} from "@/lib/tg/character-service";

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

  if (!characterReady(opts.characterId)) {
    throw new Error("Нужно минимум 3 фото модели");
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

  return {
    runId: run.id,
    chargedPeaches: price,
    discountApplied: discounted.discountApplied,
  };
}

export async function startTgPhotoGeneration(opts: {
  userId: string;
  platformUserId: string;
  templateId: string;
  characterId: string;
}): Promise<TgGenerateResult> {
  const row = await getPhotoTemplate(opts.templateId);
  if (!row) throw new Error("Шаблон не найден");
  if (!characterReady(opts.characterId)) {
    throw new Error("Нужно минимум 3 фото модели");
  }

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error("user not found");

  let price =
    row.pricePeaches ||
    TG_PHOTO_PEACHES[row.tier === "pose" ? "pose" : "basic"];
  let freePhoto = false;

  if (!user.tgFreePhotoUsed && TG_PROMO.freePhotoCount > 0) {
    price = 0;
    freePhoto = true;
    await prisma.user.update({
      where: { id: user.id },
      data: { tgFreePhotoUsed: true },
    });
  } else if (price > 0) {
    const paid = await debitPeaches(opts.userId, price, "tg_photo", {
      templateId: opts.templateId,
    });
    if (!paid.ok) {
      throw new Error(`Недостаточно персиков (нужно ${price}, есть ${paid.balance})`);
    }
  }

  const item = await prisma.galleryItem.create({
    data: {
      userId: opts.userId,
      characterId: opts.characterId,
      kind: "photo",
      title: row.title,
      prompt: row.editPrompt,
      resultUrl: GALLERY_PLACEHOLDER_URL,
      metaJson: JSON.stringify({
        status: useComfy() ? "pending" : "ready",
        tgPhotoTemplateId: opts.templateId,
        mock: !useComfy(),
      }),
    },
  });

  if (!useComfy()) {
    const saved = saveGalleryBinary(
      opts.userId,
      "png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAHggJ/PdIqQQAAAABJRU5ErkJggg==",
        "base64",
      ),
      `tg_photo_${item.id}`,
    );
    await prisma.galleryItem.update({
      where: { id: item.id },
      data: {
        resultUrl: saved.publicUrl,
        metaJson: JSON.stringify({ status: "ready", mock: true }),
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
  }

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
}) {
  const saved = saveGalleryBinary(
    opts.userId,
    "mp4",
    Buffer.from("mock"),
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
      metaJson: JSON.stringify({ status: "ready", mock: true }),
    },
  });

  await prisma.quickVideoRun.update({
    where: { id: run.id },
    data: { galleryItemId: item.id },
  });

  await enqueueTgOutbox({
    platformUserId: opts.platformUserId,
    userId: opts.userId,
    kind: "video",
    payload: {
      url: saved.publicUrl,
      caption: opts.title,
      mock: true,
      successKind: "video",
      locale: (await prisma.user.findUnique({ where: { id: opts.userId } }))?.locale?.startsWith("en")
        ? "en"
        : "ru",
    },
  });

  return { runId: run.id, galleryItemId: item.id };
}

export async function notifyTgVideoReady(
  userId: string,
  videoUrl: string,
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
    kind: "video",
    payload: {
      url: videoUrl,
      caption: title,
      successKind: "video",
      locale: acc.user.locale?.startsWith("en") ? "en" : "ru",
    },
  });
}
