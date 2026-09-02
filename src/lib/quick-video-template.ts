/**
 * Quick video templates: one-time purchase, unlimited use (generation billed separately).
 */
import { prisma } from "@/lib/db";
import {
  parseQuickVideoShotsPlan,
  type QuickVideoImageSlot,
  type QuickVideoSlotRole,
} from "@/lib/quick-video-prompt";
import { filterDbCharacterIds } from "@/lib/quick-video-custom-character";

export type TemplateCategory = "peach" | "bitch";

export type TemplateSlotBlueprint = {
  role: QuickVideoSlotRole;
  label?: string;
  /** Baked into template (location default, anatomy, pose, …). */
  bakedRefUrl?: string;
};

export type PublicQuickVideoTemplate = {
  id: string;
  title: string;
  notes: string;
  category: TemplateCategory;
  isJuice: boolean;
  priceCredits: number;
  identityPersonCount: number;
  hasLocationSlot: boolean;
  previewVideoUrl: string;
  previewPhotoUrl: string;
  orientation: string;
  durationSec: number;
  owned: boolean;
  isAuthor: boolean;
  tgPublished?: boolean;
  tgDisplayTitle?: string;
};

export type QuickVideoTemplateDetail = PublicQuickVideoTemplate & {
  shotsJson: string;
  slotBlueprint: TemplateSlotBlueprint[];
  defaultLocationUrl: string;
  refVideoUrl: string;
};

function parseBlueprint(raw: string): TemplateSlotBlueprint[] {
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.filter((row) => row && typeof row.role === "string");
  } catch {
    return [];
  }
}

function slotRoleOf(
  slot: QuickVideoImageSlot | undefined,
): QuickVideoSlotRole {
  const r = slot?.role || slot?.kind;
  if (r === "identity" || r === "extra") {
    return r === "identity" ? "identity" : "other";
  }
  return (r || "other") as QuickVideoSlotRole;
}

function buildBlueprintFromRun(
  refSlots: QuickVideoImageSlot[],
  refImageUrls: string[],
): TemplateSlotBlueprint[] {
  const blueprint: TemplateSlotBlueprint[] = [];
  for (let i = 0; i < refSlots.length; i++) {
    const slot = refSlots[i]!;
    const role = slotRoleOf(slot);
    const url = refImageUrls[i] || "";
    if (role === "identity") {
      blueprint.push({
        role: "identity",
        label: slot.characterName || slot.label,
      });
      continue;
    }
    blueprint.push({
      role,
      label: slot.label,
      bakedRefUrl: url || undefined,
    });
  }
  return blueprint;
}

function identityPersonCountFromRun(characterIds: string[]): number {
  const n = characterIds.filter(Boolean).length;
  return Math.max(1, Math.min(4, n || 1));
}

export function userOwnsTemplate(opts: {
  isAuthor: boolean;
  isJuice: boolean;
  priceCredits: number;
  purchased: boolean;
}): boolean {
  if (opts.isAuthor) return true;
  if (!opts.isJuice || opts.priceCredits <= 0) return true;
  return opts.purchased;
}

function toPublic(
  row: {
    id: string;
    userId: string;
    title: string;
    notes: string;
    category: string;
    isJuice: boolean;
    priceCredits: number;
    identityPersonCount: number;
    hasLocationSlot: boolean;
    previewVideoUrl: string;
    previewPhotoUrl: string;
    orientation: string;
    durationSec: number;
    tgPublished?: boolean;
    tgDisplayTitle?: string;
  },
  viewerUserId: string,
  purchased: boolean,
): PublicQuickVideoTemplate {
  const isAuthor = row.userId === viewerUserId;
  const owned = userOwnsTemplate({
    isAuthor,
    isJuice: row.isJuice,
    priceCredits: row.priceCredits,
    purchased,
  });
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    category: row.category as TemplateCategory,
    isJuice: row.isJuice,
    priceCredits: row.priceCredits,
    identityPersonCount: row.identityPersonCount,
    hasLocationSlot: row.hasLocationSlot,
    previewVideoUrl: row.previewVideoUrl,
    previewPhotoUrl: row.previewPhotoUrl,
    orientation: row.orientation,
    durationSec: row.durationSec,
    owned,
    isAuthor,
    tgPublished: row.tgPublished,
    tgDisplayTitle: row.tgDisplayTitle,
  };
}

export async function listPublishedQuickVideoTemplates(
  userId: string,
  category?: TemplateCategory,
) {
  const rows = await prisma.quickVideoTemplate.findMany({
    where: {
      published: true,
      ...(category ? { category } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  const ids = rows.map((r) => r.id);
  const purchases = ids.length
    ? await prisma.quickVideoTemplatePurchase.findMany({
        where: { userId, templateId: { in: ids } },
        select: { templateId: true },
      })
    : [];
  const ownedSet = new Set(purchases.map((p) => p.templateId));
  return rows.map((r) =>
    toPublic(r, userId, ownedSet.has(r.id)),
  );
}

export async function getQuickVideoTemplateDetail(
  userId: string,
  templateId: string,
): Promise<QuickVideoTemplateDetail | null> {
  const row = await prisma.quickVideoTemplate.findFirst({
    where: { id: templateId, published: true },
  });
  if (!row) return null;
  const purchase = await prisma.quickVideoTemplatePurchase.findUnique({
    where: { userId_templateId: { userId, templateId } },
  });
  const pub = toPublic(row, userId, !!purchase);
  if (!pub.owned) {
    return {
      ...pub,
      shotsJson: "",
      slotBlueprint: [],
      defaultLocationUrl: "",
      refVideoUrl: "",
    };
  }
  return {
    ...pub,
    shotsJson: row.shotsJson,
    slotBlueprint: parseBlueprint(row.slotBlueprintJson),
    defaultLocationUrl: row.defaultLocationUrl,
    refVideoUrl: row.refVideoUrl,
  };
}

export async function createQuickVideoTemplateFromRun(opts: {
  userId: string;
  sourceRunId: string;
  title: string;
  notes?: string;
  category: TemplateCategory;
  isJuice: boolean;
  priceCredits: number;
  published?: boolean;
  /** Admin: save from another user's run */
  allowForeignRun?: boolean;
}) {
  const run = await prisma.quickVideoRun.findFirst({
    where: { id: opts.sourceRunId },
  });
  if (!run) throw new Error("Run not found");
  if (run.userId !== opts.userId && !opts.allowForeignRun) {
    throw new Error("Можно сохранять только свои успешные генерации");
  }
  if (run.status !== "ready") {
    throw new Error("Сохраняй шаблон только после успешной генерации");
  }
  if (!parseQuickVideoShotsPlan(run.prompt)) {
    throw new Error("В run нет плана шотов");
  }

  let refSlots: QuickVideoImageSlot[] = [];
  let refImageUrls: string[] = [];
  try {
    refSlots = JSON.parse(run.refSlotsJson) as QuickVideoImageSlot[];
  } catch {
    refSlots = [];
  }
  try {
    refImageUrls = JSON.parse(run.refImageUrlsJson) as string[];
  } catch {
    refImageUrls = [];
  }

  let characterIds: string[] = [];
  try {
    characterIds = JSON.parse(run.characterIdsJson) as string[];
  } catch {
    characterIds = [];
  }

  const blueprint = buildBlueprintFromRun(refSlots, refImageUrls);
  const locationSlot = blueprint.find((s) => s.role === "location");
  const priceCredits = opts.isJuice
    ? Math.max(0, Math.min(500, Math.floor(opts.priceCredits)))
    : 0;

  const tpl = await prisma.quickVideoTemplate.create({
    data: {
      userId: opts.userId,
      title: opts.title.trim().slice(0, 120) || run.title,
      notes: (opts.notes || "").trim().slice(0, 500),
      category: opts.category,
      isJuice: opts.isJuice,
      priceCredits,
      published: opts.published !== false,
      sourceRunId: run.id,
      shotsJson: run.prompt,
      slotBlueprintJson: JSON.stringify(blueprint),
      identityPersonCount: identityPersonCountFromRun(characterIds),
      hasLocationSlot: !!locationSlot,
      defaultLocationUrl: locationSlot?.bakedRefUrl || "",
      refVideoUrl: run.refVideoUrl || "",
      previewVideoUrl: run.resultVideoUrl || "",
      previewPhotoUrl: refImageUrls.find((_, i) => slotRoleOf(refSlots[i]) === "identity") || refImageUrls[0] || "",
      orientation: run.orientation,
      durationSec: run.durationSec,
    },
  });

  return getQuickVideoTemplateDetail(opts.userId, tpl.id);
}

export async function purchaseQuickVideoTemplate(
  userId: string,
  templateId: string,
) {
  const row = await prisma.quickVideoTemplate.findFirst({
    where: { id: templateId, published: true },
  });
  if (!row) throw new Error("Шаблон не найден");

  const existing = await prisma.quickVideoTemplatePurchase.findUnique({
    where: { userId_templateId: { userId, templateId } },
  });
  if (existing || row.userId === userId) {
    return getQuickVideoTemplateDetail(userId, templateId);
  }

  const price = row.isJuice ? Math.max(0, row.priceCredits) : 0;
  if (price <= 0) {
    await prisma.quickVideoTemplatePurchase.create({
      data: { userId, templateId, paidCredits: 0 },
    });
    return getQuickVideoTemplateDetail(userId, templateId);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("auth");
  if (user.credits < price) {
    throw new Error(
      `Нужно ${price} кредитов для покупки шаблона, у вас ${user.credits}`,
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: price } },
    }),
    prisma.quickVideoTemplatePurchase.create({
      data: { userId, templateId, paidCredits: price },
    }),
    prisma.ledgerEntry.create({
      data: {
        userId,
        amount: -price,
        reason: "quick_video_template_purchase",
        metaJson: JSON.stringify({ templateId, title: row.title }),
      },
    }),
  ]);

  return getQuickVideoTemplateDetail(userId, templateId);
}

export type QuickVideoTemplateApplyPayload = {
  templateId: string;
  title: string;
  shotsJson: string;
  orientation: string;
  durationSec: number;
  slotBlueprint: TemplateSlotBlueprint[];
  defaultLocationUrl: string;
  refVideoUrl: string;
  identityPersonCount: number;
  hasLocationSlot: boolean;
};

export function buildTemplateApplyPayload(
  detail: QuickVideoTemplateDetail,
): QuickVideoTemplateApplyPayload {
  return {
    templateId: detail.id,
    title: detail.title,
    shotsJson: detail.shotsJson,
    orientation: detail.orientation,
    durationSec: detail.durationSec,
    slotBlueprint: detail.slotBlueprint,
    defaultLocationUrl: detail.defaultLocationUrl,
    refVideoUrl: detail.refVideoUrl,
    identityPersonCount: detail.identityPersonCount,
    hasLocationSlot: detail.hasLocationSlot,
  };
}

/** Count db character ids saved on run — for display only. */
export { filterDbCharacterIds };
