/**
 * Quick video: labeled <Picture N> refs + optional pose video → MiniMax Ref2V.
 */
import { prisma } from "@/lib/db";
import { enqueueGpuJob } from "@/lib/gallery-jobs";
import { GALLERY_PLACEHOLDER_URL, parseGalleryMeta } from "@/lib/gallery-meta";
import { backupDatabase, saveGalleryBinary } from "@/lib/local-store";
import {
  MAX_TOTAL_IMAGE_REFS,
  resolveCharacterIdentityRefs,
} from "@/lib/character-ref-pack";
import { probeMediaBuffer } from "@/lib/ffmpeg-stitch";
import { localBytesFromResultUrl, runRef2VClip } from "@/lib/peach-lab";
import {
  composeQuickVideoPrompt,
  composeQuickVideoMultiShotPrompt,
  buildQuickVideoLegoContext,
  serializeQuickVideoShotsPlan,
  sumQuickVideoShotsSec,
  MAX_QUICK_VIDEO_PICTURES,
  type QuickVideoImageSlot,
  type QuickVideoSlotRole,
  type QuickVideoShotsPlan,
} from "@/lib/quick-video-prompt";
import { loadVideoLegoFile } from "@/lib/prompt-lego";
import { scheduleAfterResponse } from "@/lib/schedule-after";
import { clampDurationSec } from "@/lib/video-graphs";
import {
  minimaxOutputSize,
  normalizeVideoOrientation,
  type VideoOrientationId,
} from "@/lib/video-orientation";
import {
  filterDbCharacterIds,
  isCustomCharacterId,
} from "@/lib/quick-video-custom-character";

export type PublicQuickVideoRun = {
  id: string;
  title: string;
  status: string;
  prompt: string;
  composedPrompt: string;
  characterIds: string[];
  refImageUrls: string[];
  refVideoUrl: string;
  refSlots: QuickVideoImageSlot[];
  resultVideoUrl: string;
  width: number;
  height: number;
  durationSec: number;
  orientation: string;
  error: string | null;
  engine: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManualPictureSlotInput = {
  /** 1-based UI Picture index (may have gaps; compacted on assemble). */
  pictureIndex: number;
  role: QuickVideoSlotRole;
  label?: string;
  characterName?: string;
  bytes: Buffer;
  ext?: string;
};

export type AssembledQuickVideoRefs = {
  imageBuffers: Buffer[];
  imageExtensions: string[];
  imageSlots: QuickVideoImageSlot[];
  /** old UI Picture index → compact 1-based index after gaps removed */
  pictureRemap: Map<number, number>;
  refVideoBuffer: Buffer | null;
  refVideoName: string;
  refVideoUrl: string;
  refImageUrls: string[];
  characterIds: string[];
};

function parseJsonArray(raw: string): string[] {
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseRefSlots(raw: string): QuickVideoImageSlot[] {
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as QuickVideoImageSlot[]) : [];
  } catch {
    return [];
  }
}

function toPublic(row: {
  id: string;
  title: string;
  status: string;
  prompt: string;
  composedPrompt: string;
  characterIdsJson: string;
  refImageUrlsJson: string;
  refVideoUrl: string;
  refSlotsJson: string;
  resultVideoUrl: string;
  width: number;
  height: number;
  durationSec: number;
  orientation: string;
  error: string | null;
  engine: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicQuickVideoRun {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    prompt: row.prompt,
    composedPrompt: row.composedPrompt,
    characterIds: parseJsonArray(row.characterIdsJson),
    refImageUrls: parseJsonArray(row.refImageUrlsJson),
    refVideoUrl: row.refVideoUrl,
    refSlots: parseRefSlots(row.refSlotsJson),
    resultVideoUrl: row.resultVideoUrl,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    orientation: row.orientation,
    error: row.error,
    engine: row.engine,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function extFromName(name: string, fallback = "png") {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : fallback;
}

/** Merge manual <Picture N> slots and/or character identity refs. */
export async function assembleQuickVideoRefs(opts: {
  userId: string;
  characterIds?: string[];
  /** Preferred: explicit Picture slots from UI. */
  manualSlots?: ManualPictureSlotInput[];
  extraImageBuffers?: Buffer[];
  extraExtensions?: string[];
  extraLabels?: string[];
  poseVideoBuffer?: Buffer | null;
  poseVideoName?: string;
  savePoseVideo?: boolean;
}): Promise<AssembledQuickVideoRefs> {
  const characterIds = (opts.characterIds || []).filter(Boolean);
  const imageBuffers: Buffer[] = [];
  const imageExtensions: string[] = [];
  const imageSlots: QuickVideoImageSlot[] = [];
  const pictureRemap = new Map<number, number>();

  const manuals = [...(opts.manualSlots || [])]
    .filter((s) => s?.bytes?.length)
    .sort((a, b) => a.pictureIndex - b.pictureIndex)
    .slice(0, MAX_QUICK_VIDEO_PICTURES);

  if (manuals.length) {
    for (const slot of manuals) {
      if (imageBuffers.length >= MAX_TOTAL_IMAGE_REFS) break;
      const neu = imageBuffers.length + 1;
      pictureRemap.set(slot.pictureIndex, neu);
      imageBuffers.push(slot.bytes);
      imageExtensions.push(slot.ext || "png");
      imageSlots.push({
        kind: slot.role === "identity" ? "identity" : slot.role,
        role: slot.role,
        characterName: slot.characterName,
        label: slot.label,
        pictureIndex: slot.pictureIndex,
      });
    }
  } else {
    const identity = await resolveCharacterIdentityRefs(
      opts.userId,
      filterDbCharacterIds(characterIds),
    );
    const extras = (opts.extraImageBuffers || []).filter((b) => b?.length);
    const extraLabels = opts.extraLabels || [];

    for (const ref of identity) {
      if (imageBuffers.length >= MAX_TOTAL_IMAGE_REFS) break;
      const neu = imageBuffers.length + 1;
      const uiIndex = neu;
      pictureRemap.set(uiIndex, neu);
      imageBuffers.push(ref.bytes);
      imageExtensions.push(extFromName(ref.photoName, "png"));
      imageSlots.push({
        kind: "identity",
        role: "identity",
        characterName: ref.characterName,
        pictureIndex: uiIndex,
      });
    }

    for (let i = 0; i < extras.length; i++) {
      if (imageBuffers.length >= MAX_TOTAL_IMAGE_REFS) break;
      const neu = imageBuffers.length + 1;
      const uiIndex = neu;
      pictureRemap.set(uiIndex, neu);
      imageBuffers.push(extras[i]!);
      imageExtensions.push(opts.extraExtensions?.[i] || "png");
      imageSlots.push({
        kind: "extra",
        role: "other",
        label: extraLabels[i]?.trim() || "location or scene element",
        pictureIndex: neu,
      });
    }
  }

  if (!imageBuffers.length) {
    throw new Error(
      "Нужен хотя бы один референс: заполни слот <Picture 1> или выбери персонажа",
    );
  }

  const ts = Date.now();
  const refImageUrls: string[] = [];
  for (let i = 0; i < imageBuffers.length; i++) {
    const saved = saveGalleryBinary(
      opts.userId,
      imageExtensions[i] || "png",
      imageBuffers[i]!,
      `quick_ref_${ts}_${i}`,
    );
    refImageUrls.push(saved.publicUrl);
  }

  let refVideoUrl = "";
  let refVideoBuffer: Buffer | null = null;
  let refVideoName = opts.poseVideoName || "pose.mp4";
  if (opts.poseVideoBuffer?.length) {
    refVideoBuffer = opts.poseVideoBuffer;
    if (opts.savePoseVideo !== false) {
      const ext = extFromName(refVideoName, "mp4");
      const saved = saveGalleryBinary(
        opts.userId,
        ext,
        refVideoBuffer,
        `quick_pose_${ts}`,
      );
      refVideoUrl = saved.publicUrl;
    }
  }

  return {
    imageBuffers,
    imageExtensions,
    imageSlots,
    pictureRemap,
    refVideoBuffer,
    refVideoName,
    refVideoUrl,
    refImageUrls,
    characterIds,
  };
}

export async function listQuickVideoRuns(userId: string) {
  const rows = await prisma.quickVideoRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map(toPublic);
}

export async function getQuickVideoRun(userId: string, id: string) {
  const row = await prisma.quickVideoRun.findFirst({ where: { id, userId } });
  if (!row) throw new Error("run not found");
  return toPublic(row);
}

function scheduleGpu(fn: () => void) {
  scheduleAfterResponse(fn);
}

async function runQuickVideoJob(runId: string, userId: string) {
  const run = await prisma.quickVideoRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) return;

  const refUrls = parseJsonArray(run.refImageUrlsJson);
  const refBuffers: Buffer[] = [];
  for (const url of refUrls) {
    const b = localBytesFromResultUrl(url);
    if (b?.length) refBuffers.push(b);
  }
  if (!refBuffers.length) throw new Error("Нет файлов референсов");

  const imageSlots = parseRefSlots(run.refSlotsJson);
  const hasVideo = !!run.refVideoUrl;
  const composed =
    run.composedPrompt ||
    composeQuickVideoPrompt(run.prompt, imageSlots, hasVideo ? 1 : 0);

  let refVideoBuffer: Buffer | null = null;
  if (run.refVideoUrl) {
    refVideoBuffer = localBytesFromResultUrl(run.refVideoUrl);
  }

  const out = await runRef2VClip({
    refImageBuffers: refBuffers,
    refVideoBuffer,
    refVideoName: run.refVideoUrl ? "pose.mp4" : undefined,
    prompt: composed,
    width: run.width,
    height: run.height,
    durationSec: run.durationSec,
    filenamePrefix: `peach/quick_${runId}`,
  });

  const saved = saveGalleryBinary(userId, "mp4", out.bytes, `quick_${runId}`);
  const galleryData = {
    resultUrl: saved.publicUrl,
    width: out.size.width,
    height: out.size.height,
    prompt: composed,
    metaJson: JSON.stringify({
      status: "ready",
      engine: out.engine,
      quickVideoRunId: runId,
      refImageUrls: refUrls,
      refVideoUrl: run.refVideoUrl,
      characterIds: parseJsonArray(run.characterIdsJson),
      customCharacters: parseJsonArray(run.characterIdsJson)
        .filter(isCustomCharacterId)
        .map((id) => ({
          id,
          name:
            imageSlots.find((s) => s.role === "identity")?.characterName ||
            "Custom",
        })),
      orientation: run.orientation,
      durationSec: run.durationSec,
      shotsJson: run.prompt,
      refSlots: imageSlots,
    }),
  };

  let itemId = run.galleryItemId;
  if (itemId) {
    await prisma.galleryItem.update({
      where: { id: itemId },
      data: galleryData,
    });
  } else {
    const item = await prisma.galleryItem.create({
      data: {
        userId,
        kind: "video",
        title: run.title,
        ...galleryData,
      },
    });
    itemId = item.id;
  }

  await prisma.quickVideoRun.update({
    where: { id: runId },
    data: {
      status: "ready",
      resultVideoUrl: saved.publicUrl,
      galleryItemId: itemId,
      width: out.size.width,
      height: out.size.height,
      engine: out.engine,
      composedPrompt: composed,
      error: null,
    },
  });
  backupDatabase("quick-video");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.source === "telegram") {
    const { notifyTgVideoReady } = await import("@/lib/tg/generation-service");
    const charIds = JSON.parse(run.characterIdsJson || "[]") as string[];
    await notifyTgVideoReady(userId, saved.publicUrl, run.title, charIds[0]);
  }
}

function friendlyQuickVideoError(msg: string) {
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|8188/i.test(msg)
    ? "Comfy GPU временно недоступен (туннель переподключается). Подождите ~30 сек и запустите снова."
    : msg;
}

async function markQuickVideoRunError(
  runId: string,
  userId: string,
  rawMsg: string,
) {
  const friendly = friendlyQuickVideoError(rawMsg);
  const run = await prisma.quickVideoRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) return;

  await prisma.quickVideoRun.update({
    where: { id: runId },
    data: { status: "error", error: friendly },
  });

  if (!run.galleryItemId) return;
  let meta: Record<string, unknown> = {};
  try {
    const prev = await prisma.galleryItem.findUnique({
      where: { id: run.galleryItemId },
    });
    meta = JSON.parse(prev?.metaJson || "{}") as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  await prisma.galleryItem.update({
    where: { id: run.galleryItemId },
    data: {
      metaJson: JSON.stringify({
        ...meta,
        status: "error",
        error: friendly,
        quickVideoRunId: runId,
      }),
    },
  });
}

/** GPU queue entry — survives only while the Node process is alive. */
const activeQuickVideoJobs = new Set<string>();

export function enqueueQuickVideoJob(runId: string, userId: string) {
  if (activeQuickVideoJobs.has(runId)) return;
  activeQuickVideoJobs.add(runId);
  void enqueueGpuJob(async () => {
    try {
      const run = await prisma.quickVideoRun.findFirst({
        where: { id: runId, userId },
        select: { galleryItemId: true },
      });
      if (run?.galleryItemId) {
        const item = await prisma.galleryItem.findUnique({
          where: { id: run.galleryItemId },
        });
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(item?.metaJson || "{}") as Record<string, unknown>;
        } catch {
          /* ignore */
        }
        await prisma.galleryItem.update({
          where: { id: run.galleryItemId },
          data: {
            metaJson: JSON.stringify({
              ...meta,
              gpuEnqueuedAt: new Date().toISOString(),
            }),
          },
        });
      }
      await runQuickVideoJob(runId, userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[peach] quick video failed:", msg);
      await markQuickVideoRunError(runId, userId, msg);
    } finally {
      activeQuickVideoJobs.delete(runId);
    }
  });
}

/** Re-queue runs stuck in `busy` after a dev-server restart (in-memory GPU queue is lost). */
export async function resumeStuckQuickVideoRuns() {
  let comfyBusy = false;
  try {
    const { comfyBaseUrl } = await import("@/lib/metalnode-config");
    const res = await fetch(`${comfyBaseUrl()}/queue`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const q = (await res.json()) as {
        queue_running?: unknown[];
        queue_pending?: unknown[];
      };
      comfyBusy =
        (q.queue_running?.length || 0) + (q.queue_pending?.length || 0) > 0;
    }
  } catch {
    /* Comfy unreachable — safe to try resume */
  }

  const stuck = await prisma.quickVideoRun.findMany({
    where: { status: "busy" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      title: true,
      createdAt: true,
      galleryItemId: true,
    },
  });
  if (!stuck.length) return 0;

  const toResume = [];
  for (const run of stuck) {
    if (run.galleryItemId) {
      const item = await prisma.galleryItem.findUnique({
        where: { id: run.galleryItemId },
        select: { metaJson: true },
      });
      const meta = parseGalleryMeta(item?.metaJson);
      if (meta.gpuEnqueuedAt && comfyBusy) {
        console.log(
          `[peach] skip resume ${run.id} — Comfy busy, enqueued ${meta.gpuEnqueuedAt}`,
        );
        continue;
      }
    }
    toResume.push(run);
  }

  if (!toResume.length) return 0;
  console.log(
    `[peach] resuming ${toResume.length} stuck quick-video run(s):`,
    toResume.map((r) => r.id).join(", "),
  );
  for (const run of toResume) {
    enqueueQuickVideoJob(run.id, run.userId);
  }
  return toResume.length;
}

export async function retryQuickVideoRun(userId: string, runId: string) {
  const run = await prisma.quickVideoRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) throw new Error("run not found");
  if (run.status === "ready") throw new Error("Видео уже готово");
  await prisma.quickVideoRun.update({
    where: { id: runId },
    data: { status: "busy", error: null, updatedAt: new Date() },
  });
  if (run.galleryItemId) {
    let meta: Record<string, unknown> = {};
    try {
      const item = await prisma.galleryItem.findUnique({
        where: { id: run.galleryItemId },
      });
      meta = JSON.parse(item?.metaJson || "{}") as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    await prisma.galleryItem.update({
      where: { id: run.galleryItemId },
      data: {
        resultUrl: GALLERY_PLACEHOLDER_URL,
        metaJson: JSON.stringify({
          ...meta,
          status: "pending",
          error: undefined,
          quickVideoRunId: runId,
        }),
      },
    });
  }
  enqueueQuickVideoJob(runId, userId);
  return getQuickVideoRun(userId, runId);
}

export async function startQuickVideoRun(opts: {
  userId: string;
  title?: string;
  /** Legacy plain prompt */
  prompt?: string;
  /** Multi-shot lego plan */
  shotsPlan?: QuickVideoShotsPlan;
  characterIds?: string[];
  manualSlots?: ManualPictureSlotInput[];
  extraImageBuffers?: Buffer[];
  extraExtensions?: string[];
  extraLabels?: string[];
  poseVideoBuffer?: Buffer | null;
  poseVideoName?: string;
  orientation?: VideoOrientationId | string;
  durationSec?: number;
  customCharacters?: Array<{ id: string; name: string }>;
}) {
  const legacyPrompt = opts.prompt?.trim() || "";
  const hasShots = !!opts.shotsPlan?.shots?.some((s) => s.legoQuery.trim());
  if (!hasShots && legacyPrompt.length < 8) {
    throw new Error("Промпт слишком короткий");
  }

  const dbCharacterIds = filterDbCharacterIds(opts.characterIds || []);
  const characterRows = dbCharacterIds.length
    ? await prisma.character.findMany({
        where: { userId: opts.userId, id: { in: dbCharacterIds } },
        select: { id: true, name: true, gender: true, triggerWord: true },
      })
    : [];

  const customFromClient = (opts.customCharacters || []).filter(
    (c) => c?.id && c?.name && isCustomCharacterId(c.id),
  );
  const customFromIds = (opts.characterIds || [])
    .filter(isCustomCharacterId)
    .map((id) => {
      const hit = customFromClient.find((c) => c.id === id);
      const name =
        hit?.name ||
        opts.manualSlots?.find((s) => s.role === "identity")?.characterName ||
        "Custom";
      return { id, name };
    });
  const customCharacters =
    customFromClient.length > 0 ? customFromClient : customFromIds;

  const legoCtx = buildQuickVideoLegoContext({
    videoLego: loadVideoLegoFile(),
    characters: [
      ...characterRows.map((c) => ({
        id: c.id,
        name: c.name,
        gender: c.gender,
        triggerWord: c.triggerWord,
      })),
      ...customCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        gender: "female",
        triggerWord: null as string | null,
      })),
    ],
  });

  const assembled = await assembleQuickVideoRefs({
    userId: opts.userId,
    characterIds: opts.characterIds,
    manualSlots: opts.manualSlots,
    extraImageBuffers: opts.extraImageBuffers,
    extraExtensions: opts.extraExtensions,
    extraLabels: opts.extraLabels,
    poseVideoBuffer: opts.poseVideoBuffer,
    poseVideoName: opts.poseVideoName,
  });

  let durationSec = clampDurationSec(opts.durationSec);
  if (opts.shotsPlan) {
    const used = sumQuickVideoShotsSec(
      opts.shotsPlan.shots.filter((s) => s.legoQuery.trim()),
    );
    if (used >= 4) durationSec = clampDurationSec(used);
  }
  if (assembled.refVideoBuffer?.length) {
    try {
      const ext = extFromName(assembled.refVideoName, ".mp4");
      const probe = await probeMediaBuffer(assembled.refVideoBuffer, ext);
      if (probe.duration > 0.2) {
        durationSec = clampDurationSec(probe.duration);
      }
    } catch {
      /* keep user duration */
    }
  }

  const orientation = normalizeVideoOrientation(opts.orientation, "9_16");
  const size = minimaxOutputSize(orientation);
  const promptStored = opts.shotsPlan
    ? serializeQuickVideoShotsPlan(opts.shotsPlan)
    : legacyPrompt;
  const composed = opts.shotsPlan
    ? composeQuickVideoMultiShotPrompt(
        opts.shotsPlan,
        assembled.imageSlots,
        assembled.refVideoBuffer ? 1 : 0,
        legoCtx,
        { pictureRemap: assembled.pictureRemap },
      )
    : composeQuickVideoPrompt(
        legacyPrompt,
        assembled.imageSlots,
        assembled.refVideoBuffer ? 1 : 0,
        { pictureRemap: assembled.pictureRemap },
      );

  const run = await prisma.quickVideoRun.create({
    data: {
      userId: opts.userId,
      title: opts.title?.trim() || "Quick video",
      prompt: promptStored,
      composedPrompt: composed,
      characterIdsJson: JSON.stringify(assembled.characterIds),
      refImageUrlsJson: JSON.stringify(assembled.refImageUrls),
      refVideoUrl: assembled.refVideoUrl,
      refSlotsJson: JSON.stringify(assembled.imageSlots),
      orientation,
      durationSec,
      width: size.width,
      height: size.height,
      status: "busy",
    },
  });

  const pendingItem = await prisma.galleryItem.create({
    data: {
      userId: opts.userId,
      characterId: filterDbCharacterIds(assembled.characterIds)[0] || null,
      kind: "video",
      title: run.title,
      prompt: composed,
      resultUrl: GALLERY_PLACEHOLDER_URL,
      width: size.width,
      height: size.height,
      metaJson: JSON.stringify({
        status: "pending",
        jobAction: "quick_video",
        quickVideoRunId: run.id,
        characterIds: assembled.characterIds,
        customCharacters,
        orientation,
        durationSec,
        shotsJson: promptStored,
        refImageUrls: assembled.refImageUrls,
        refVideoUrl: assembled.refVideoUrl,
        refSlots: assembled.imageSlots,
      }),
    },
  });

  await prisma.quickVideoRun.update({
    where: { id: run.id },
    data: { galleryItemId: pendingItem.id },
  });
  backupDatabase("quick-video-pending");

  scheduleGpu(() => {
    enqueueQuickVideoJob(run.id, opts.userId);
  });

  return getQuickVideoRun(opts.userId, run.id);
}
