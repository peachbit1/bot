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
import { enqueuePhotoJob, enqueueGpuJob } from "@/lib/gallery-jobs";
import {
  generatePhotoBytes,
  localBytesFromResultUrl,
  runI2VFromStill,
} from "@/lib/peach-lab";
import { useComfy } from "@/lib/metalnode-config";
import { GALLERY_PLACEHOLDER_URL } from "@/lib/gallery-meta";
import { saveGalleryBinary } from "@/lib/local-store";
import { kreaStillSize } from "@/lib/video-orientation";
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

import {
  applySpeechFills,
  applySpeechFillsToShotsJson,
  normalizeFills,
  type SpeechSlotFill,
} from "@/lib/speech-slots";
import { resolveVideoTemplateSpeech } from "@/lib/tg/template-speech";

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
  const loraI2v = await prisma.loraI2vTemplate.findFirst({
    where: { id: opts.templateId, tgPublished: true },
    select: { pricePeaches: true },
  });
  if (loraI2v) {
    return loraI2v.pricePeaches > 0 ? loraI2v.pricePeaches : 180;
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

export async function startTgLoraI2vGeneration(opts: {
  userId: string;
  platformUserId: string;
  templateId: string;
  characterId: string;
  speechLine?: string;
  speechFills?: SpeechSlotFill[];
}): Promise<TgGenerateResult> {
  const tpl = await prisma.loraI2vTemplate.findFirst({
    where: { id: opts.templateId, tgPublished: true },
  });
  if (!tpl) throw new Error("Шаблон не найден");

  const { slots } = await resolveVideoTemplateSpeech(opts.templateId);
  let fills = normalizeFills(slots, opts.speechFills);
  if (!fills.length && opts.speechLine?.trim()) {
    fills = [{ id: "s1", text: opts.speechLine.trim(), lang: "en" }];
  }
  const i2vPrompt = slots.length
    ? applySpeechFills(tpl.i2vPrompt, slots, fills)
    : opts.speechLine?.trim()
      ? `${tpl.i2vPrompt}\n\nSpoken dialogue (perform clearly): "${opts.speechLine.trim().replace(/"/g, "'")}"`
      : tpl.i2vPrompt;

  const character = await prisma.character.findFirst({
    where: {
      id: opts.characterId,
      OR: [{ userId: opts.userId }, { isStudioCast: true }],
    },
  });
  if (!character) throw new Error("Персонаж не найден");
  if (character.loraStatus !== "lora_ready" || !character.triggerWord?.trim()) {
    throw new Error("Для этого шаблона нужна обученная LoRA");
  }
  const loraPath = character.loraPath || "";
  if (loraPath.startsWith("mock://") && character.triggerWord !== "olh_person") {
    throw new Error("LoRA ещё не готова на GPU");
  }

  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error("user not found");

  let price = tpl.pricePeaches > 0 ? tpl.pricePeaches : 180;
  const discounted = applyFirstVideoDiscount(
    price,
    user.tgFirstVideoDiscountUsed,
  );
  price = discounted.peaches;

  if (price > 0) {
    const paid = await debitPeaches(opts.userId, price, "tg_video", {
      templateId: opts.templateId,
      kind: "lora_i2v",
    });
    if (!paid.ok) {
      throw new Error(
        `Недостаточно персиков (нужно ${price}, есть ${paid.balance})`,
      );
    }
  }
  if (discounted.discountApplied) {
    await prisma.user.update({
      where: { id: opts.userId },
      data: { tgFirstVideoDiscountUsed: true },
    });
  }

  const title = tpl.tgDisplayTitle.trim() || tpl.title;
  const item = await prisma.galleryItem.create({
    data: {
      userId: opts.userId,
      characterId: character.id,
      kind: "video",
      title,
      prompt: i2vPrompt,
      resultUrl: GALLERY_PLACEHOLDER_URL,
      metaJson: JSON.stringify({
        status: "pending",
        jobAction: "lora_i2v",
        loraI2vTemplateId: tpl.id,
        stillPrompt: tpl.stillPrompt,
        durationSec: tpl.durationSec,
      }),
    },
  });

  void enqueueGpuJob(async () => {
    try {
      if (!useComfy()) {
        const previewUrl =
          tpl.previewVideoUrl || "/tg/catalog/video-1.mp4";
        const bytes =
          localBytesFromResultUrl(previewUrl) ||
          localBytesFromResultUrl("/tg/catalog/video-1.mp4");
        if (!bytes?.length) throw new Error("mock preview missing");
        const saved = saveGalleryBinary(
          opts.userId,
          "mp4",
          bytes,
          `tg_li2v_${item.id}`,
        );
        await prisma.galleryItem.update({
          where: { id: item.id },
          data: {
            resultUrl: saved.publicUrl,
            metaJson: JSON.stringify({
              status: "ready",
              engine: "mock",
              jobAction: "lora_i2v",
              loraI2vTemplateId: tpl.id,
            }),
          },
        });
        await notifyTgVideoReady(opts.userId, saved.publicUrl, title);
        return;
      }

      const trigger = character.triggerWord!.trim();
      let composed = tpl.stillPrompt.trim();
      const re = new RegExp(
        `\\b${trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      if (!re.test(composed)) composed = `${trigger}, ${composed}`;

      const orient = (tpl.orientation || "9_16") as "9_16" | "16_9" | "1_1";
      const size = kreaStillSize(orient);
      const still = await generatePhotoBytes({
        userId: opts.userId,
        characterId: character.id,
        characterIds: [character.id],
        useCharacterLora: true,
        usePreset: false,
        composedPrompt: composed,
        negativePrompt: tpl.negativePrompt || undefined,
        title: `LoRA→I2V · ${title}`,
        width: size.width,
        height: size.height,
        orientationId: orient,
      });

      const clip = await runI2VFromStill({
        stillBytes: still.bytes,
        prompt: i2vPrompt,
        width: still.width,
        height: still.height,
        filenamePrefix: "peach/li2v",
        durationSec: tpl.durationSec || 6,
        extraHints: [tpl.stillPrompt, i2vPrompt, still.prompt],
      });
      if (!clip.bytes?.length || clip.bytes.length < 100) {
        throw new Error("MiniMax вернул пустой клип");
      }

      const saved = saveGalleryBinary(
        opts.userId,
        "mp4",
        clip.bytes,
        `tg_li2v_${item.id}`,
      );
      await prisma.galleryItem.update({
        where: { id: item.id },
        data: {
          resultUrl: saved.publicUrl,
          width: still.width,
          height: still.height,
          prompt: i2vPrompt,
          metaJson: JSON.stringify({
            status: "ready",
            engine: clip.engine,
            jobAction: "lora_i2v",
            loraI2vTemplateId: tpl.id,
            localKey: saved.relKey,
          }),
        },
      });
      await notifyTgVideoReady(opts.userId, saved.publicUrl, title);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ошибка LoRA→I2V";
      console.error("[peach] lora_i2v job failed:", e);
      await prisma.galleryItem.update({
        where: { id: item.id },
        data: {
          metaJson: JSON.stringify({
            status: "error",
            error: msg,
            jobAction: "lora_i2v",
            loraI2vTemplateId: tpl.id,
          }),
        },
      });
      const { notifyTelegramGenerationError } = await import("@/lib/tg/tg-notify");
      await notifyTelegramGenerationError(opts.userId, msg).catch(() => undefined);
    }
  });

  return {
    galleryItemId: item.id,
    chargedPeaches: price,
    discountApplied: discounted.discountApplied,
  };
}

export async function startTgVideoGeneration(opts: {
  userId: string;
  platformUserId: string;
  templateId: string;
  characterId: string;
  speechLine?: string;
  speechFills?: SpeechSlotFill[];
}): Promise<TgGenerateResult> {
  const loraI2v = await prisma.loraI2vTemplate.findFirst({
    where: { id: opts.templateId, tgPublished: true },
  });
  if (loraI2v) {
    return startTgLoraI2vGeneration({
      userId: opts.userId,
      platformUserId: opts.platformUserId,
      templateId: opts.templateId,
      characterId: opts.characterId,
      speechLine: opts.speechLine,
      speechFills: opts.speechFills,
    });
  }

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
  const { parseStoryH3Template } = await import("@/lib/story-h3-prompt");
  let storyTpl = !shotsPlan ? parseStoryH3Template(detail.shotsJson) : null;
  if (!shotsPlan && !storyTpl) throw new Error("Битый шаблон (shots)");

  const { slots: speechSlots } = await resolveVideoTemplateSpeech(opts.templateId);
  let speechFills = normalizeFills(speechSlots, opts.speechFills);
  if (!speechFills.length && opts.speechLine?.trim()) {
    speechFills = [
      { id: speechSlots[0]?.id || "s1", text: opts.speechLine.trim(), lang: "en" },
    ];
  }

  const cast = await prisma.character.findFirst({
    where: { id: opts.characterId },
    select: { name: true },
  });
  const tplMeta = await prisma.quickVideoTemplate.findFirst({
    where: { id: opts.templateId },
    select: { userId: true, slotBlueprintJson: true },
  });
  const authorCasts = tplMeta?.userId
    ? await prisma.character.findMany({
        where: { userId: tplMeta.userId },
        select: { name: true },
      })
    : [];
  const foreignNames = [
    ...authorCasts.map((c) => c.name),
    ...detail.slotBlueprint.map((s) => s.label || ""),
  ];

  if (shotsPlan) {
    const { bindQuickVideoShotsToCharacter } = await import(
      "@/lib/quick-video-template"
    );
    let boundJson = bindQuickVideoShotsToCharacter(
      detail.shotsJson,
      cast?.name || "Subject",
      foreignNames,
    );
    if (speechSlots.length) {
      boundJson = applySpeechFillsToShotsJson(
        boundJson,
        speechSlots,
        speechFills,
      );
    }
    shotsPlan = parseQuickVideoShotsPlan(boundJson) || shotsPlan;

    if (!speechSlots.length && opts.speechLine?.trim()) {
      shotsPlan = injectSpeech(shotsPlan, opts.speechLine);
    }
  } else if (storyTpl && speechSlots.length) {
    const prompt = applySpeechFills(
      storyTpl.prompt,
      speechSlots,
      speechFills,
    );
    storyTpl = { ...storyTpl, prompt };
  } else if (storyTpl && opts.speechLine?.trim()) {
    storyTpl = {
      ...storyTpl,
      prompt: `${storyTpl.prompt}\n\nSpoken dialogue (perform clearly): "${opts.speechLine.trim().replace(/"/g, "'")}"`,
    };
  }

  const manualSlots: ManualPictureSlotInput[] = [];
  let fallbackPi =
    Math.max(
      1,
      detail.identityPersonCount,
      ...detail.slotBlueprint
        .filter((s) => s.role === "identity")
        .map((s) => s.pictureIndex || 0),
    ) + 1;
  for (const slot of detail.slotBlueprint) {
    if (slot.role === "identity") continue;
    if (!slot.bakedRefUrl) continue;
    const bytes = localBytesFromResultUrl(slot.bakedRefUrl);
    if (!bytes?.length) continue;
    const pictureIndex =
      typeof slot.pictureIndex === "number" && slot.pictureIndex >= 1
        ? slot.pictureIndex
        : fallbackPi++;
    manualSlots.push({
      pictureIndex,
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
      previewVideoUrl: detail.previewVideoUrl || "",
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
    shotsPlan: shotsPlan || undefined,
    prompt: storyTpl?.prompt,
    storyH3: Boolean(storyTpl),
    characterIds: [opts.characterId],
    manualSlots: manualSlots.length ? manualSlots : undefined,
    poseVideoBuffer,
    orientation: detail.orientation,
    durationSec: storyTpl?.totalDurationSec || detail.durationSec,
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
        url: (await import("@/lib/tg/media-assets")).tgAbsoluteUrl(saved.publicUrl),
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

  const { composePhotoTemplatePromptForCharacter } = await import(
    "@/lib/tg/template-prompt"
  );
  const composedPrompt = await composePhotoTemplatePromptForCharacter({
    templateEditPrompt: row.editPrompt,
    characterIds: [opts.characterId],
    // Dual-ref: person image carries identity. LoRA/T2I: inject lookbook+trigger.
    sceneOnly: !loraPhoto,
  });

  const item = await enqueuePhotoJob(opts.userId, {
    userId: opts.userId,
    tgPhotoTemplateId: opts.templateId,
    characterIds: [opts.characterId],
    characterId: opts.characterId,
    composedPrompt,
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
  const { notifyTelegramMediaReady } = await import("@/lib/tg/tg-notify");
  await notifyTelegramMediaReady({
    userId,
    kind: "photo",
    mediaUrl: photoUrl,
    caption: title,
  });
}

export async function notifyTgVideoReady(
  userId: string,
  videoUrl: string,
  title: string,
  characterId?: string,
) {
  let offerSaveCharacterId: string | undefined;
  if (characterId) {
    const ch = await prisma.character.findFirst({
      where: { id: characterId, userId, videoRefOnly: true },
    });
    if (ch && (ch.name === "Модель" || ch.name === "Model")) {
      offerSaveCharacterId = characterId;
    }
  }

  const { notifyTelegramMediaReady } = await import("@/lib/tg/tg-notify");
  await notifyTelegramMediaReady({
    userId,
    kind: "video",
    mediaUrl: videoUrl,
    caption: title,
    offerSaveCharacterId,
  });
}
